package com.aiphotoeditor.ai.controller;

import com.aiphotoeditor.ai.LocalImageService;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobType;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.Arrays;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Authenticated project-image AI endpoints. Never accepts arbitrary image URLs. */
@RestController
@RequestMapping("/api/ai")
public class LocalAiController {
    private final LocalImageService images;
    private final AiJobService jobs;

    public LocalAiController(LocalImageService images, AiJobService jobs) {
        this.images = images;
        this.jobs = jobs;
    }

    /** A selected image is identified by the server-side asset ID, never by URL. */
    public record ImageRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId) {}
    public record UpscaleRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                 @NotNull @Min(2) @Max(4) Integer scale, @Min(0) @Max(2048) Integer tileSize) {}
    public record RemoveBackgroundRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                          String outputMode, String backgroundColor) {}
    public record DenoiseRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                 String strength) {}
    public record AutoEnhanceRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                     String mode, Boolean previewOnly) {}
    public record FaceRestoreRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                     Double fidelity) {}
    public record OperationRequest(@NotNull @Min(1) Long projectId, @NotNull @Min(1) Long assetId,
                                   JsonNode params) {}

    /** POST /api/ai/upscale -> contract receipt (202/jobId). */
    @PostMapping("/upscale")
    public ResponseEntity<AiJobDtos.AiJobResponse> upscale(@Valid @RequestBody UpscaleRequest request) {
        return accepted(images.upscale(request.projectId(), request.assetId(), request.scale(), request.tileSize()));
    }

    /** POST /api/ai/remove-background -> source-preserving BiRefNet job. */
    @PostMapping("/remove-background")
    public ResponseEntity<AiJobDtos.AiJobResponse> removeBackground(@Valid @RequestBody RemoveBackgroundRequest request) {
        return accepted(images.removeBackground(request.projectId(), request.assetId(),
                                               request.outputMode(), request.backgroundColor()));
    }

    /** POST /api/ai/denoise -> bounded OpenCV denoise job. */
    @PostMapping("/denoise")
    public ResponseEntity<AiJobDtos.AiJobResponse> denoise(@Valid @RequestBody DenoiseRequest request) {
        return accepted(images.denoise(request.projectId(), request.assetId(), request.strength()));
    }

    /** POST /api/ai/auto-enhance -> image enhancement job. */
    @PostMapping("/auto-enhance")
    public ResponseEntity<AiJobDtos.AiJobResponse> autoEnhance(@Valid @RequestBody AutoEnhanceRequest request) {
        return accepted(images.autoEnhance(request.projectId(), request.assetId(), request.mode(), request.previewOnly()));
    }

    /** POST /api/ai/face-restore -> restored face result asset. */
    @PostMapping("/face-restore")
    public ResponseEntity<AiJobDtos.AiJobResponse> faceRestore(@Valid @RequestBody FaceRestoreRequest request) {
        return accepted(images.faceRestore(request.projectId(), request.assetId(),
                                          request.fidelity() == null ? 0.7 : request.fidelity()));
    }

    /** POST /api/ai/analyze-quality -> synchronous contract JSON. */
    @PostMapping("/analyze-quality")
    public JsonNode analyze(@Valid @RequestBody ImageRequest request) {
        return images.analyze(request.projectId(), request.assetId());
    }

    /** Extra local operations are namespaced to avoid overriding Gemini/Natural Edit routes. */
    @PostMapping("/local/operations/{operation}")
    public ResponseEntity<AiJobDtos.AiJobResponse> operation(@PathVariable String operation,
                                                               @Valid @RequestBody OperationRequest request) {
        AiJobType type = Arrays.stream(AiJobType.values())
                .filter(candidate -> candidate.runnerOperation().equals(operation))
                .findFirst().orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                        "UNSUPPORTED_OPERATION", "AI operation not supported"));
        return accepted(images.submit(request.projectId(), request.assetId(), type, request.params()));
    }

    /** Local-only polling avoids dependency on the separate shared Job SSE controller. */
    @GetMapping("/local/jobs/{jobId}")
    public AiJobDtos.AiJobView localJob(@PathVariable long jobId) {
        return jobs.get(jobId);
    }

    /** Return normalized facial landmarks from the project-owned image. */
    @PostMapping("/local/face-landmarks")
    public JsonNode faceLandmarks(@Valid @RequestBody ImageRequest request) {
        return images.landmarks(request.projectId(), request.assetId());
    }

    private ResponseEntity<AiJobDtos.AiJobResponse> accepted(AiJobDtos.AiJobResponse job) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(job);
    }
}
