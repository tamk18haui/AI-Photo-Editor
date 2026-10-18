package com.aiphotoeditor.layer;

import com.aiphotoeditor.layer.AiResultLayerDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** N3 endpoint consumed by N1/N2 after N4 reports a COMPLETED AI job. */
@RestController
@RequestMapping("/api/projects/{projectId}/layers")
public class AiResultLayerController {
    private final AiResultLayerService service;

    public AiResultLayerController(AiResultLayerService service) {
        this.service = service;
    }

    @PostMapping("/from-ai-job")
    public ResponseEntity<AttachAiJobResultResponse> attach(
            @PathVariable long projectId,
            @Valid @RequestBody AttachAiJobResultRequest request) {
        AttachAiJobResultResponse result = service.attach(projectId, request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result);
    }
}
