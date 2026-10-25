package com.aiphotoeditor.naturaledit;

import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.*;
import com.aiphotoeditor.project.EditorStateRepository;
import com.aiphotoeditor.project.ProjectAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persistent mixed-executor state machine built on the SINGLE shared AI_JOBS table. */
@Service
public class NaturalEditService {
    public record PlanResponse(long projectId, long inputAssetId, long baseStateVersion,
                               String prompt, JsonNode plan, String plannerSource) {}
    public record RunResponse(long runId, AiJobStatus status, int completedSteps, int totalSteps,
                              String stage, EditPlanValidator.Step nextStep,
                              Long pendingJobId, Long currentAssetId, Long resultAssetId) {}

    private final GeminiPlanClient planner;
    private final LocalCommandPlanner localPlanner;
    private final EditPlanValidator validator;
    private final ProjectAccessService access;
    private final EditorStateRepository states;
    private final AssetService assets;
    private final CloudinaryService cloudinary;
    private final AiJobService jobs;
    private final AiJobRepository repository;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher events;

    public NaturalEditService(GeminiPlanClient planner, LocalCommandPlanner localPlanner,
                              EditPlanValidator validator,
                              ProjectAccessService access, EditorStateRepository states,
                              AssetService assets, CloudinaryService cloudinary,
                              AiJobService jobs, AiJobRepository repository,
                              ObjectMapper mapper, ApplicationEventPublisher events) {
        this.planner = planner; this.localPlanner = localPlanner;
        this.validator = validator; this.access = access; this.states = states;
        this.assets = assets; this.cloudinary = cloudinary; this.jobs = jobs; this.repository = repository;
        this.mapper = mapper; this.events = events;
    }

    public PlanResponse plan(long projectId, long assetId, long stateVersion, String prompt) {
        checkSource(projectId, assetId, stateVersion);
        if (prompt == null || prompt.isBlank() || prompt.length() > 1500) throw new ApiException(
                HttpStatus.BAD_REQUEST, "INVALID_PROMPT", "Prompt must contain 1-1500 characters");
        JsonNode proposed = localPlanner.plan(prompt.trim());
        String source = "BUILT_IN_TOOLS";
        if (proposed == null) {
            // Complex/ambiguous commands use Gemini TEXT for routing, never image generation here.
            Asset current = assets.requireMine(projectId, assetId);
            proposed = planner.plan(prompt.trim(), cloudinary.download(current), current.mimeType);
            source = "GEMINI_TEXT";
        }
        List<EditPlanValidator.Step> steps = validator.validate(proposed);
        ObjectNode canonical = mapper.createObjectNode();
        canonical.set("steps", mapper.valueToTree(steps));
        return new PlanResponse(projectId, assetId, stateVersion, prompt.trim(), canonical, source);
    }

    /** Called only after the browser displays and the user explicitly confirms the plan. */
    @Transactional
    public RunResponse execute(long projectId, long assetId, long stateVersion, JsonNode plan,
                               boolean confirmed, boolean paidOperationConfirmed, String requestKey) {
        if (!confirmed) throw new ApiException(HttpStatus.BAD_REQUEST, "PLAN_NOT_CONFIRMED", "Confirm plan before execution");
        checkSource(projectId, assetId, stateVersion);
        List<EditPlanValidator.Step> steps = validator.validate(plan);
        if (!paidOperationConfirmed && steps.stream().anyMatch(s -> "GEMINI_IMAGE".equals(s.executor()))) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "GEMINI_IMAGE_CONFIRMATION_REQUIRED",
                    "Gemini image operations require explicit separate cost consent");
        }
        if (requestKey == null || !requestKey.matches("[a-zA-Z0-9._:-]{8,100}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_IDEMPOTENCY_KEY", "Natural Edit requires a request key");
        }
        String key = "natural:" + requestKey;
        var existing = repository.findByCreatedByUserIdAndProjectIdAndIdempotencyKey(
                access.currentUserId(), projectId, key);
        if (existing.isPresent()) {
            AiJob previous = existing.get();
            if (!"NATURAL_EDIT".equals(previous.type) || previous.inputAssetId != assetId
                    || previous.paramsJson.path("baseStateVersion").asLong(-1) != stateVersion
                    || !previous.paramsJson.path("plan").equals(mapper.valueToTree(steps))) {
                throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Natural Edit key already used");
            }
            return response(previous);
        }
        ObjectNode params = mapper.createObjectNode();
        params.set("plan", mapper.valueToTree(steps));
        params.put("paidOperationConfirmed", paidOperationConfirmed);
        params.put("baseStateVersion", stateVersion);
        params.put("currentAssetId", assetId);
        params.put("nextStep", 0);
        AiJob run = new AiJob();
        run.projectId = projectId;
        run.createdByUserId = access.currentUserId();
        run.inputAssetId = assetId;
        run.provider = "GEMINI";
        run.type = "NATURAL_EDIT";
        run.idempotencyKey = key;
        run.status = AiJobStatus.RUNNING;
        run.stage = "PLAN_CONFIRMED";
        run.startedAt = Instant.now();
        run.progress = 0;
        run.paramsJson = params;
        run = repository.saveAndFlush(run);
        return scheduleNext(run, params, steps);
    }

    @Transactional(readOnly = true)
    public RunResponse status(long runId) {
        AiJob run = jobs.mine(runId);
        validateRun(run);
        return response(run);
    }

    /** Stop the parent run and any pending child. Never discard already saved source/history. */
    @Transactional
    public RunResponse cancel(long runId) {
        AiJob ownership=jobs.mine(runId);
        validateRun(ownership);
        AiJob run=repository.findLockedById(runId).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Natural Edit run missing"));
        if(run.status!=AiJobStatus.RUNNING)return response(run);
        long pending=run.paramsJson.path("pendingJobId").asLong(0);
        if(pending>0){
            AiJob child=jobs.mine(pending);
            if(child.projectId.equals(run.projectId)
                    && (child.status==AiJobStatus.QUEUED||child.status==AiJobStatus.RUNNING)){
                jobs.cancel(pending);
            }
        }
        run.status=AiJobStatus.CANCELLED;
        run.stage="CANCELLED";
        run.finishedAt=Instant.now();
        repository.saveAndFlush(run);
        events.publishEvent(AiJobDtos.event(run));
        return response(run);
    }

    /** Advance only after an authorized child job completes or frontend uploads a rendered asset. */
    @Transactional
    public RunResponse advance(long runId, int expectedStep, Long completedAssetId) {
        AiJob ownership = jobs.mine(runId);
        validateRun(ownership);
        AiJob run = repository.findLockedById(runId).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Natural Edit run missing"));
        if (run.status != AiJobStatus.RUNNING) return response(run);
        ObjectNode params = (ObjectNode) run.paramsJson.deepCopy();
        List<EditPlanValidator.Step> steps = validator.validate(wrapper(params.path("plan")));
        int index = params.path("nextStep").asInt();
        if (index + 1 != expectedStep) throw new ApiException(HttpStatus.CONFLICT,
                "NATURAL_EDIT_STEP_CONFLICT", "Another request already advanced this plan");
        if (index >= steps.size()) return response(run);
        EditPlanValidator.Step step = steps.get(index);
        long currentAsset = params.path("currentAssetId").asLong();
        long resultId;
        if ("FRONTEND".equals(step.executor())) {
            if (completedAssetId == null) return response(run);
            Asset next = assets.requireMine(run.projectId, completedAssetId);
            if (next.id == currentAsset) throw new ApiException(HttpStatus.CONFLICT,
                    "NATURAL_EDIT_SOURCE_UNCHANGED", "Frontend action must upload a new rendered asset");
            resultId = next.id;
        } else {
            long pending = params.path("pendingJobId").asLong(0);
            if (pending < 1) throw new ApiException(HttpStatus.CONFLICT, "NATURAL_EDIT_NO_JOB", "No pending AI step");
            AiJob child = jobs.mine(pending);
            if (!child.projectId.equals(run.projectId) || child.inputAssetId == null
                    || child.inputAssetId != currentAsset) throw new ApiException(HttpStatus.CONFLICT,
                    "NATURAL_EDIT_JOB_MISMATCH", "Pending job belongs to another image");
            if (child.status == AiJobStatus.FAILED || child.status == AiJobStatus.CANCELLED) {
                run.status = AiJobStatus.FAILED;
                run.stage = "FAILED";
                run.errorCode = child.errorCode == null ? "NATURAL_EDIT_STEP_FAILED" : child.errorCode;
                run.errorMessage = "Natural Edit stopped at step " + (index + 1);
                run.finishedAt = Instant.now();
                repository.saveAndFlush(run); events.publishEvent(AiJobDtos.event(run));
                return response(run);
            }
            if (child.status != AiJobStatus.COMPLETED || child.resultAssetId == null) return response(run);
            resultId = assets.requireMine(run.projectId, child.resultAssetId).id;
        }
        params.put("currentAssetId", resultId);
        params.put("nextStep", index + 1);
        params.remove("pendingJobId");
        return scheduleNext(run, params, steps);
    }

    private RunResponse scheduleNext(AiJob run, ObjectNode params, List<EditPlanValidator.Step> steps) {
        int index = params.path("nextStep").asInt();
        run.progress = index * 100 / steps.size();
        if (index == steps.size()) {
            Asset result = assets.requireMine(run.projectId, params.path("currentAssetId").asLong());
            run.resultAssetId = result.id;
            run.resultUrl = result.secureUrl;
            run.status = AiJobStatus.COMPLETED;
            run.stage = "PREVIEW_READY";
            run.finishedAt = Instant.now();
        } else {
            EditPlanValidator.Step step = steps.get(index);
            if ("FRONTEND".equals(step.executor())) {
                run.stage = "WAITING_FRONTEND";
            } else {
                long assetId = params.path("currentAssetId").asLong();
                AiJobDtos.AiJobResponse child;
                if ("LOCAL_AI".equals(step.executor())) {
                    AiJobType type = switch (step.tool()) {
                        case "REMOVE_OBJECT" -> AiJobType.REMOVE_OBJECT;
                        case "REMOVE_BACKGROUND" -> AiJobType.REMOVE_BACKGROUND;
                        case "UPSCALE" -> AiJobType.UPSCALE;
                        case "DENOISE" -> AiJobType.DENOISE;
                        case "AUTO_ENHANCE" -> AiJobType.AUTO_ENHANCE;
                        case "FACE_RESTORE" -> AiJobType.FACE_RESTORE;
                        case "MAKEUP" -> AiJobType.MAKEUP;
                        default -> throw new IllegalStateException("Invalid Local tool");
                    };
                    JsonNode localArguments=step.arguments();
                    if(type==AiJobType.MAKEUP){
                        ObjectNode converted=mapper.createObjectNode();
                        converted.put("faceIndex",step.arguments().path("faceIndex").asInt(0));
                        converted.put("outputMode","FINAL");
                        ObjectNode effect=converted.putArray("effects").addObject();
                        effect.put("effect",step.arguments().path("effect").asText());
                        effect.put("intensity",step.arguments().path("intensity").asDouble(.65));
                        effect.put("feather",step.arguments().path("feather").asDouble(.2));
                        if(step.arguments().has("color"))
                            effect.put("color",step.arguments().path("color").asText());
                        localArguments=converted;
                    }
                    child = jobs.create(run.projectId, assetId, type, localArguments);
                } else {
                    ObjectNode geminiArgs = (ObjectNode) step.arguments().deepCopy();
                    geminiArgs.put("baseStateVersion", params.path("baseStateVersion").asLong());
                    child = jobs.createGemini(run.projectId, assetId, step.tool(), geminiArgs,
                            "natural-" + run.id + "-" + index);
                }
                params.put("pendingJobId", child.jobId());
                run.stage = "WAITING_AI";
            }
        }
        run.paramsJson = params;
        repository.saveAndFlush(run);
        events.publishEvent(AiJobDtos.event(run));
        return response(run);
    }

    private RunResponse response(AiJob run) {
        JsonNode params = run.paramsJson;
        List<EditPlanValidator.Step> steps = validator.validate(wrapper(params.path("plan")));
        int index = params.path("nextStep").asInt();
        return new RunResponse(run.id, run.status, index, steps.size(), run.stage,
                index < steps.size() ? steps.get(index) : null,
                params.has("pendingJobId") ? params.path("pendingJobId").asLong() : null,
                params.path("currentAssetId").asLong(), run.resultAssetId);
    }

    private ObjectNode wrapper(JsonNode steps) {
        ObjectNode root = mapper.createObjectNode();
        root.set("steps", steps);
        return root;
    }

    private void validateRun(AiJob run) {
        if (!"GEMINI".equals(run.provider) || !"NATURAL_EDIT".equals(run.type)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Natural Edit run not found");
        }
    }

    private void checkSource(long projectId, long assetId, long stateVersion) {
        access.requireMine(projectId);
        assets.requireMine(projectId, assetId);
        long actual = states.findById(projectId).map(s -> s.stateVersion).orElse(0L);
        if (actual != stateVersion) throw new ApiException(HttpStatus.CONFLICT,
                "STATE_VERSION_CONFLICT", "Editor changed; prepare plan from the current image");
    }
}
