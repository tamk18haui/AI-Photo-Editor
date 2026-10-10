package com.aiphotoeditor.job;

import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.project.ProjectAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.aiphotoeditor.job.AiJobDtos.*;

/** Job state is owned by AI Local; N5 owns the HTTP job Controller and SSE adapter. */
@Service
public class AiJobService {
    private final AiJobRepository repository;
    private final ProjectAccessService access;
    private final AssetService assets;
    private final ApplicationEventPublisher events;

    public AiJobService(AiJobRepository repository, ProjectAccessService access,
                        AssetService assets, ApplicationEventPublisher events) {
        this.repository = repository;
        this.access = access;
        this.assets = assets;
        this.events = events;
    }

    /** Function: Enqueue an operation only after verifying project and source asset ownership. */
    @Transactional
    public AiJobResponse create(long projectId, long assetId, AiJobType type, JsonNode params) {
        access.requireMine(projectId);
        assets.requireMine(projectId, assetId);
        validateSecondaryAsset(projectId, params, "maskAssetId");
        validateSecondaryAsset(projectId, params, "backgroundAssetId");

        AiJob job = new AiJob();
        job.projectId = projectId;
        job.createdByUserId = access.currentUserId();
        job.inputAssetId = assetId;
        job.type = type.name();
        job.provider = "LOCAL";
        job.status = AiJobStatus.QUEUED;
        job.stage = "QUEUED";
        job.paramsJson = params;
        job = repository.saveAndFlush(job);
        publish(job);
        return receipt(job);
    }

    /** Function: Protect secondary images/masks from cross-project IDOR attacks. */
    private void validateSecondaryAsset(long projectId, JsonNode params, String field) {
        if (params == null || !params.hasNonNull(field)) return;
        JsonNode value = params.get(field);
        if (!value.canConvertToLong() || value.asLong() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid " + field);
        }
        assets.requireMine(projectId, value.asLong());
    }

    /** Function: Load a job only if the logged-in user owns the project. */
    @Transactional(readOnly = true)
    public AiJob mine(long jobId) {
        AiJob job = repository.findById(jobId).orElseThrow(this::notFound);
        if (job.createdByUserId == null || job.createdByUserId != access.currentUserId()) {
            throw notFound();
        }
        access.requireMine(job.projectId);
        return job;
    }

    /** Function: Provide one job DTO to the API/SSE owner. */
    @Transactional(readOnly = true)
    public AiJobView get(long jobId) {
        return view(mine(jobId));
    }

    /** Function: List only the authenticated user's jobs. */
    @Transactional(readOnly = true)
    public List<AiJobView> list(Long projectId, AiJobStatus status) {
        long userId = access.currentUserId();
        if (projectId != null) access.requireMine(projectId);
        var found = projectId == null
            ? repository.findByCreatedByUserIdOrderByCreatedAtDesc(userId)
            : repository.findByCreatedByUserIdAndProjectIdOrderByCreatedAtDesc(userId, projectId);
        return found.stream().filter(j -> status == null || j.status == status).map(AiJobDtos::view).toList();
    }

    /** Function: Request cancellation; an already completed job is not modified. */
    @Transactional
    public AiJobView cancel(long jobId) {
        AiJob job = mine(jobId);
        if (job.status != AiJobStatus.QUEUED && job.status != AiJobStatus.RUNNING) throw invalidState();
        job.status = AiJobStatus.CANCELLED;
        job.stage = "CANCELLED";
        job.finishedAt = Instant.now();
        repository.saveAndFlush(job);
        publish(job);
        return view(job);
    }

    /** Function: Retry only terminal unsuccessful jobs by creating a new job. */
    @Transactional
    public AiJobResponse retry(long jobId) {
        AiJob job = mine(jobId);
        if (job.status != AiJobStatus.FAILED && job.status != AiJobStatus.CANCELLED) throw invalidState();
        if (job.inputAssetId == null) throw invalidState();
        return create(job.projectId, job.inputAssetId, AiJobType.valueOf(job.type), job.paramsJson);
    }

    /** Function: Atomically claim the oldest queued local job for one worker. */
    @Transactional
    public Optional<AiJob> claim() {
        var candidate = repository.findFirstByStatusAndProviderOrderByCreatedAtAsc(AiJobStatus.QUEUED, "LOCAL");
        if (candidate.isEmpty()) return Optional.empty();
        AiJob job = candidate.get();
        job.status = AiJobStatus.RUNNING;
        job.stage = "PROCESSING";
        job.startedAt = Instant.now();
        job.attemptCount++;
        repository.saveAndFlush(job);
        publish(job);
        return Optional.of(job);
    }

    /** Function: Inspect worker-owned job without relying on the web security context. */
    @Transactional(readOnly = true)
    public AiJob loadWorker(long jobId) {
        return repository.findById(jobId).orElseThrow(this::notFound);
    }

    /** Function: Attach persisted AI output to a successful job. */
    @Transactional
    public boolean complete(long jobId, Asset result) {
        AiJob job = loadWorker(jobId);
        if (job.status != AiJobStatus.RUNNING) return false;
        job.status = AiJobStatus.COMPLETED;
        job.stage = "COMPLETED";
        job.progress = 100;
        job.resultAssetId = result.id;
        job.resultUrl = result.secureUrl;
        job.finishedAt = Instant.now();
        repository.saveAndFlush(job);
        publish(job);
        return true;
    }

    /** Function: Record an actionable error code without exposing secrets or stack traces. */
    @Transactional
    public void fail(long jobId, String code, String message) {
        AiJob job = loadWorker(jobId);
        if (job.status != AiJobStatus.RUNNING) return;
        job.status = AiJobStatus.FAILED;
        job.stage = "FAILED";
        job.errorCode = code;
        job.errorMessage = message == null ? "Image processing failed" :
                message.substring(0, Math.min(500, message.length()));
        job.finishedAt = Instant.now();
        repository.saveAndFlush(job);
        publish(job);
    }

    /** Function: Requeue unfinished local work after a server restart. */
    @Transactional
    public int recover() {
        int count = 0;
        for (AiJob job : repository.findByStatus(AiJobStatus.RUNNING)) {
            if (!"LOCAL".equals(job.provider)) continue;
            job.status = AiJobStatus.QUEUED;
            job.stage = "RECOVERED";
            repository.save(job);
            count++;
        }
        return count;
    }

    /** Function: Notify N5's optional event listener, without owning the SSE endpoint. */
    private void publish(AiJob job) {
        events.publishEvent(AiJobDtos.event(job));
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Job not found");
    }

    private ApiException invalidState() {
        return new ApiException(HttpStatus.CONFLICT, "AI_JOB_INVALID_STATE", "Invalid job state");
    }
}
