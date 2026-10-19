package com.aiphotoeditor.layer;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** N3 editor-only additive API for attaching an existing N4 AI result asset. */
public final class AiResultLayerDtos {
    private AiResultLayerDtos() {}

    public record AttachAiJobResultRequest(
            @NotNull @Positive Long jobId,
            @Size(max = 120) String name,
            Boolean visible,
            @DecimalMin("0.0") @DecimalMax("1.0") Double opacity) {}

    /** created=false means this AI job was already attached; retries are safe. */
    public record AttachAiJobResultResponse(
            Long projectId, String layerId, Long assetId, Long jobId,
            boolean created, Long stateVersion,
            Long beforeVersionId, Long afterVersionId,
            JsonNode layer) {}
}
