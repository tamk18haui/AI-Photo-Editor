package com.aiphotoeditor.history;

import com.aiphotoeditor.history.HistoryDtos.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Optional API Contract endpoints: persistent edit log + project versions. */
@RestController
@RequestMapping("/api/projects/{projectId}")
public class HistoryController {
    private final HistoryService service;

    public HistoryController(HistoryService service) {
        this.service = service;
    }

    @GetMapping("/history")
    public List<EditHistoryItem> history(@PathVariable long projectId) {
        return service.history(projectId);
    }

    @PostMapping("/history")
    public ResponseEntity<EditHistoryItem> append(@PathVariable long projectId,
            @Valid @RequestBody CreateHistoryItemRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.append(projectId, request));
    }

    @GetMapping("/versions")
    public List<ProjectVersion> versions(@PathVariable long projectId) {
        return service.versions(projectId);
    }

    @PostMapping("/versions")
    public ResponseEntity<ProjectVersion> snapshot(@PathVariable long projectId,
            @Valid @RequestBody(required = false) CreateVersionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.snapshot(projectId, request));
    }

    @PostMapping("/versions/{versionId}/restore")
    public JsonNode restore(@PathVariable long projectId, @PathVariable long versionId) {
        return service.restore(projectId, versionId);
    }
}
