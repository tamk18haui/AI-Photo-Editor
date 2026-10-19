package com.aiphotoeditor.ai.face;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contract V3: project-owned Face Detect and per-face Mask Assets. */
@RestController
@RequestMapping("/api/ai/local")
public class FaceStudioController {
    private final FaceStudioService service;

    public FaceStudioController(FaceStudioService service) {
        this.service = service;
    }

    public record DetectRequest(@NotNull @Positive Long projectId,
                                @NotNull @Positive Long assetId,
                                Long baseRevisionId) {}

    public record RegionRequest(@NotNull @Positive Long projectId,
                                @NotNull @Positive Long assetId,
                                @NotNull @Min(0) Integer faceIndex,
                                @NotEmpty List<String> regions,
                                Long baseRevisionId,
                                String outputMode) {}

    @PostMapping("/face-detect")
    public FaceStudioService.FaceAnalysisResponse detect(@Valid @RequestBody DetectRequest request) {
        return service.detect(request.projectId(), request.assetId());
    }

    @PostMapping("/face-regions")
    public FaceStudioService.FaceRegionMaskResponse regions(@Valid @RequestBody RegionRequest request) {
        return service.regions(request);
    }
}
