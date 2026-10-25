package com.aiphotoeditor.gemini;

import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.layer.AiResultLayerDtos.*;
import com.aiphotoeditor.layer.AiResultLayerService;
import com.aiphotoeditor.project.EditorStateRepository;
import com.aiphotoeditor.project.ProjectAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Async Gemini operations and explicit atomic Apply via N3's existing History engine. */
@RestController
@RequestMapping("/api/ai/gemini")
public class GeminiOperationsController {
    public static final java.util.Set<String> OPERATIONS = java.util.Set.of(
            "GENERATIVE_EDIT", "REMOVE", "REPLACE", "BACKGROUND", "FILL", "EXPAND", "RELIGHT", "HAIRSTYLE", "TEXT_TO_IMAGE");
    private final AiJobService jobs;
    private final AssetService assets;
    private final ProjectAccessService access;
    private final EditorStateRepository states;
    private final AiResultLayerService layers;
    private final ObjectMapper mapper;

    public GeminiOperationsController(AiJobService jobs, AssetService assets, ProjectAccessService access,
                                      EditorStateRepository states, AiResultLayerService layers, ObjectMapper mapper) {
        this.jobs = jobs; this.assets = assets; this.access = access;
        this.states = states; this.layers = layers; this.mapper = mapper;
    }

    public record OperationRequest(
            @NotNull @Positive Long projectId,
            @NotNull @Positive Long inputAssetId,
            @NotBlank @Size(max = 1500) String prompt,
            @NotBlank String operation,
            @Positive Long maskAssetId,
            @PositiveOrZero Long baseStateVersion,
            @Size(max = 120) String idempotencyKey,
            boolean paidOperationConfirmed) {}

    public record TextToImageRequest(
            @NotNull @Positive Long projectId,
            @NotBlank @Size(max = 1500) String prompt,
            @PositiveOrZero Long baseStateVersion,
            @Size(max = 120) String idempotencyKey,
            boolean paidOperationConfirmed) {}

    public record ApplyRequest(@NotNull @Positive Long projectId,
                               @NotNull @Positive Long expectedStateVersion) {}

    public record ProjectContext(long projectId, long stateVersion) {}

    /** Exposes an authoritative state version without changing N3's existing state API. */
    @GetMapping("/projects/{projectId}/context")
    public ProjectContext context(@PathVariable long projectId) {
        access.requireMine(projectId);
        long version = states.findById(projectId).map(s -> s.stateVersion).orElse(0L);
        return new ProjectContext(projectId, version);
    }

    @PostMapping("/operations")
    public ResponseEntity<AiJobDtos.AiJobResponse> submit(@Valid @RequestBody OperationRequest request) {
        requirePaidConsent(request.paidOperationConfirmed());
        if (!OPERATIONS.contains(request.operation()) || "TEXT_TO_IMAGE".equals(request.operation())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_OPERATION", "Unsupported Gemini operation");
        }
        assets.requireMine(request.projectId(), request.inputAssetId());
        if (request.maskAssetId() != null) assets.requireMine(request.projectId(), request.maskAssetId());
        requireStateVersion(request.projectId(), request.baseStateVersion());
        ObjectNode params = mapper.createObjectNode().put("prompt", request.prompt().trim());
        if (request.maskAssetId() != null) params.put("maskAssetId", request.maskAssetId());
        if (request.baseStateVersion() != null) params.put("baseStateVersion", request.baseStateVersion());
        return ResponseEntity.accepted().body(jobs.createGemini(request.projectId(),
                request.inputAssetId(), request.operation(), params, request.idempotencyKey()));
    }

    @PostMapping("/text-to-image")
    public ResponseEntity<AiJobDtos.AiJobResponse> textToImage(@Valid @RequestBody TextToImageRequest request) {
        requirePaidConsent(request.paidOperationConfirmed());
        requireStateVersion(request.projectId(), request.baseStateVersion());
        ObjectNode params = mapper.createObjectNode().put("prompt", request.prompt().trim());
        if (request.baseStateVersion() != null) params.put("baseStateVersion", request.baseStateVersion());
        return ResponseEntity.accepted().body(jobs.createGemini(request.projectId(), null,
                "TEXT_TO_IMAGE", params, request.idempotencyKey()));
    }

    /** Never called automatically by the Gemini worker; rejected if a tab changed the state. */
    @Transactional
    @PostMapping("/jobs/{jobId}/apply")
    public AttachAiJobResultResponse apply(@PathVariable long jobId, @Valid @RequestBody ApplyRequest request) {
        access.requireMine(request.projectId());
        var job = jobs.mine(jobId);
        if (!"GEMINI".equals(job.provider) || !job.projectId.equals(request.projectId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "Gemini job not found");
        }
        var current = states.findLockedByProjectId(request.projectId()).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "EDITOR_STATE_NOT_FOUND", "Editor State not found"));
        if (current.stateJson != null && current.stateJson.path("objects").isArray()) {
            for (var layer : current.stateJson.path("objects")) {
                if (layer.path("sourceJobId").asLong(-1) == jobId) {
                    // A repeated Apply request must return the existing History result.
                    return layers.attach(request.projectId(), new AttachAiJobResultRequest(
                            jobId, "Gemini " + job.type, true, 1.0));
                }
            }
        }
        if (current.stateVersion == null || !current.stateVersion.equals(request.expectedStateVersion())
                || (job.paramsJson != null && job.paramsJson.has("baseStateVersion")
                && job.paramsJson.path("baseStateVersion").asLong(-1) != current.stateVersion)) {
            throw new ApiException(HttpStatus.CONFLICT, "STALE_AI_RESULT", "Project has changed; reload before applying Gemini result");
        }
        return layers.attach(request.projectId(), new AttachAiJobResultRequest(
                jobId, "Gemini " + job.type, true, 1.0));
    }

    private void requireStateVersion(long projectId, Long expected) {
        access.requireMine(projectId);
        if (expected == null) return;
        long stateVersion = states.findById(projectId).map(s -> s.stateVersion).orElse(0L);
        if (stateVersion != expected) {
            throw new ApiException(HttpStatus.CONFLICT, "STATE_VERSION_CONFLICT", "Editor State changed; refresh source image");
        }
    }

    private void requirePaidConsent(boolean confirmed) {
        if (!confirmed) throw new ApiException(HttpStatus.PAYMENT_REQUIRED,
                "GEMINI_IMAGE_CONFIRMATION_REQUIRED",
                "Gemini image operation may incur charges; explicit confirmation is required");
    }
}
