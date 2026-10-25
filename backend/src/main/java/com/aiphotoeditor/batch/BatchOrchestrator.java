package com.aiphotoeditor.batch;

import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.gemini.GeminiOperationsController;
import com.aiphotoeditor.job.*;
import com.aiphotoeditor.project.ProjectAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Durable batch metadata in shared AI_JOBS, never an independent batch queue/table. */
@Service
public class BatchOrchestrator {
    public record Item(long inputAssetId, String operation, String prompt) {}
    public record BatchView(long batchId, long projectId, AiJobStatus status,
                            int completed, int failed, int total, List<AiJobDtos.AiJobView> jobs) {}
    private final ProjectAccessService access;
    private final AssetService assets;
    private final AiJobService jobs;
    private final AiJobRepository repository;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher events;

    public BatchOrchestrator(ProjectAccessService access, AssetService assets, AiJobService jobs,
                             AiJobRepository repository, ObjectMapper mapper, ApplicationEventPublisher events) {
        this.access = access; this.assets = assets; this.jobs = jobs;
        this.repository = repository; this.mapper = mapper; this.events = events;
    }

    @Transactional
    public BatchView create(long projectId, String batchKey, List<Item> items) {
        access.requireMine(projectId);
        if (items == null || items.isEmpty() || items.size() > 8) throw bad("Batch must have 1-8 inputs");
        if (batchKey == null || !batchKey.matches("[a-zA-Z0-9._:-]{8,100}")) throw bad("Invalid batch request key");
        for (Item item : items) {
            if (item == null || item.inputAssetId() <= 0
                    || !GeminiOperationsController.OPERATIONS.contains(item.operation())
                    || "TEXT_TO_IMAGE".equals(item.operation())
                    || item.prompt() == null || item.prompt().isBlank() || item.prompt().length() > 1400) {
                throw bad("Invalid batch item");
            }
            assets.requireMine(projectId, item.inputAssetId());
        }
        String idempotency = "batch:" + batchKey;
        var previous = repository.findByCreatedByUserIdAndProjectIdAndIdempotencyKey(
                access.currentUserId(), projectId, idempotency);
        if (previous.isPresent()) {
            AiJob existing = previous.get();
            if (!"BATCH".equals(existing.type)
                    || !Objects.equals(existing.paramsJson.path("items"), mapper.valueToTree(items))) {
                throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Batch key reused with different items");
            }
            return status(existing.id);
        }
        AiJob parent = new AiJob();
        parent.projectId = projectId;
        parent.createdByUserId = access.currentUserId();
        parent.idempotencyKey = idempotency;
        parent.type = "BATCH";
        parent.provider = "GEMINI";
        parent.status = AiJobStatus.RUNNING;
        parent.stage = "RUNNING";
        parent.progress = 0;
        parent.startedAt = Instant.now();
        ObjectNode params = mapper.createObjectNode();
        params.set("items", mapper.valueToTree(items));
        parent.paramsJson = params;
        parent = repository.saveAndFlush(parent);
        ArrayNode childIds = params.putArray("childJobIds");
        for (int index = 0; index < items.size(); index++) {
            Item item = items.get(index);
            ObjectNode arguments = mapper.createObjectNode().put("prompt", item.prompt().trim());
            AiJobDtos.AiJobResponse child = jobs.createGemini(projectId, item.inputAssetId(), item.operation(),
                    arguments, "batch-" + parent.id + "-" + index);
            childIds.add(child.jobId());
        }
        parent.paramsJson = params;
        repository.saveAndFlush(parent);
        events.publishEvent(AiJobDtos.event(parent));
        return status(parent.id);
    }

    @Transactional
    public BatchView status(long batchId) {
        AiJob parent = authorized(batchId);
        var items = childViews(parent);
        int completed = (int) items.stream().filter(j -> j.status() == AiJobStatus.COMPLETED).count();
        int failed = (int) items.stream().filter(j -> j.status() == AiJobStatus.FAILED).count();
        int cancelled = (int) items.stream().filter(j -> j.status() == AiJobStatus.CANCELLED).count();
        if (parent.status == AiJobStatus.RUNNING) {
            parent.progress = (completed + failed + cancelled) * 100 / items.size();
            if (completed + failed + cancelled == items.size()) {
                parent.status = failed > 0 ? AiJobStatus.FAILED : cancelled > 0 ? AiJobStatus.CANCELLED : AiJobStatus.COMPLETED;
                parent.stage = parent.status.name();
                parent.finishedAt = Instant.now();
            }
            repository.saveAndFlush(parent);
            events.publishEvent(AiJobDtos.event(parent));
        }
        return new BatchView(parent.id, parent.projectId, parent.status, completed, failed, items.size(), items);
    }

    @Transactional
    public BatchView cancel(long batchId) {
        AiJob parent = authorized(batchId);
        if (parent.status == AiJobStatus.RUNNING) {
            for (var child : childViews(parent)) {
                if (child.status() == AiJobStatus.QUEUED || child.status() == AiJobStatus.RUNNING)
                    jobs.cancel(child.jobId());
            }
            parent.status = AiJobStatus.CANCELLED;
            parent.stage = "CANCELLED";
            parent.finishedAt = Instant.now();
            repository.saveAndFlush(parent);
            events.publishEvent(AiJobDtos.event(parent));
        }
        return status(batchId);
    }

    private AiJob authorized(long batchId) {
        AiJob parent = jobs.mine(batchId);
        if (!"GEMINI".equals(parent.provider) || !"BATCH".equals(parent.type))
            throw new ApiException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Batch not found");
        return parent;
    }

    private List<AiJobDtos.AiJobView> childViews(AiJob parent) {
        JsonNode ids = parent.paramsJson.path("childJobIds");
        if (!ids.isArray() || ids.isEmpty()) throw new ApiException(HttpStatus.CONFLICT,
                "BATCH_INVALID_STATE", "Batch has no child jobs");
        List<AiJobDtos.AiJobView> views = new ArrayList<>();
        for (JsonNode id : ids) {
            AiJobDtos.AiJobView child = jobs.get(id.asLong());
            if (child.projectId() != parent.projectId) throw new ApiException(HttpStatus.CONFLICT,
                    "BATCH_INVALID_STATE", "Batch project mismatch");
            views.add(child);
        }
        return List.copyOf(views);
    }

    private static ApiException bad(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BATCH", message);
    }
}
