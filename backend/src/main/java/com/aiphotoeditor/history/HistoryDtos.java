package com.aiphotoeditor.history;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** Exact optional History/Versions DTO shapes from 07_API_CONTRACT. */
public final class HistoryDtos {
    private HistoryDtos() {}

    public record CreateHistoryItemRequest(
            @NotBlank @Size(max = 64) String actionType,
            JsonNode payload,
            @Size(max = 255) String beforeStateRef,
            @Size(max = 255) String afterStateRef) {}

    public record EditHistoryItem(
            Long id,
            String actionType,
            JsonNode payload,
            String beforeStateRef,
            String afterStateRef,
            Instant createdAt) {}

    public record CreateVersionRequest(@Size(max = 150) String label) {}

    public record ProjectVersion(Long versionId, Long projectId, String label, Instant createdAt) {}
}
