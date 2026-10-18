package com.aiphotoeditor.history;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.HistoryDtos.*;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Backend-owned edit history and snapshot lifecycle within the SAME Project. */
@Service
public class HistoryService {
    private static final int MAX_HISTORY_PAYLOAD_BYTES = 128_000;
    private static final int MAX_SNAPSHOT_BYTES = 2_000_000;

    private final ProjectAccessService access;
    private final ProjectService projects;
    private final EditHistoryRepository histories;
    private final ProjectVersionRepository versions;
    private final ObjectMapper mapper;

    public HistoryService(ProjectAccessService access, ProjectService projects,
                          EditHistoryRepository histories, ProjectVersionRepository versions,
                          ObjectMapper mapper) {
        this.access = access;
        this.projects = projects;
        this.histories = histories;
        this.versions = versions;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<EditHistoryItem> history(long projectId) {
        access.requireMine(projectId);
        return histories.findByProjectIdOrderByCreatedAtDescIdDesc(projectId)
                .stream().map(this::historyItem).toList();
    }

    @Transactional
    public EditHistoryItem append(long projectId, CreateHistoryItemRequest input) {
        access.requireMine(projectId);
        if (input == null || input.actionType() == null || input.actionType().isBlank()) {
            throw invalid("Action type is required");
        }
        String action = input.actionType().strip();
        if (action.length() > 64 || !action.matches("[A-Za-z][A-Za-z0-9_:-]*")) {
            throw invalid("Invalid action type");
        }
        return historyItem(saveHistory(projectId, action, input.payload(),
                input.beforeStateRef(), input.afterStateRef()));
    }

    @Transactional(readOnly = true)
    public List<ProjectVersion> versions(long projectId) {
        access.requireMine(projectId);
        return versions.findByProjectIdOrderByCreatedAtDescIdDesc(projectId)
                .stream().map(this::versionItem).toList();
    }

    @Transactional
    public ProjectVersion snapshot(long projectId, CreateVersionRequest request) {
        access.requireMine(projectId);
        String label = request == null ? null : request.label();
        if (label != null && label.length() > 150) throw invalid("Version label too long");
        return versionItem(storeSnapshot(projectId, label, projects.getState(projectId)));
    }

    /** Restores an older layer graph WITHOUT modifying the original snapshot or AI assets.
     * A safety snapshot is created first, so the user can restore the pre-restore state.
     * Server-side undo/redo cursor is a separate future contract, not implied here.
     */
    @Transactional
    public JsonNode restore(long projectId, long versionId) {
        access.requireMine(projectId);
        var selected = versions.findByIdAndProjectId(versionId, projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        "VERSION_NOT_FOUND", "Project version not found"));
        JsonNode current = projects.getState(projectId);
        var safety = storeSnapshot(projectId, "Before restoring version " + versionId, current);
        JsonNode restored = selected.stateJson.deepCopy();
        projects.saveState(projectId, restored);
        ObjectNode payload = mapper.createObjectNode();
        payload.put("versionId", versionId);
        saveHistory(projectId, "RESTORE_VERSION", payload,
                safety.id.toString(), selected.id.toString());
        return restored;
    }

    private ProjectVersionEntity storeSnapshot(long projectId, String label, JsonNode state) {
        validateJsonLength(state, MAX_SNAPSHOT_BYTES);
        var version = new ProjectVersionEntity();
        version.projectId = projectId;
        version.createdByUserId = access.currentUserId();
        version.label = label;
        version.stateJson = state.deepCopy();
        return versions.saveAndFlush(version);
    }

    private EditHistoryEntity saveHistory(long projectId, String action, JsonNode payload,
                                          String before, String after) {
        validateJsonLength(payload, MAX_HISTORY_PAYLOAD_BYTES);
        if (before != null && before.length() > 255) throw invalid("Invalid beforeStateRef");
        if (after != null && after.length() > 255) throw invalid("Invalid afterStateRef");
        var entry = new EditHistoryEntity();
        entry.projectId = projectId;
        entry.userId = access.currentUserId();
        entry.actionType = action;
        entry.payloadJson = payload == null ? null : payload.deepCopy();
        entry.beforeStateRef = before;
        entry.afterStateRef = after;
        return histories.saveAndFlush(entry);
    }

    private void validateJsonLength(JsonNode json, int maxBytes) {
        if (json == null) return;
        try {
            if (mapper.writeValueAsBytes(json).length > maxBytes) {
                throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                        "FILE_TOO_LARGE", "Snapshot or action payload is too large");
            }
        } catch (JsonProcessingException exception) {
            throw invalid("Malformed editor JSON");
        }
    }

    private EditHistoryItem historyItem(EditHistoryEntity e) {
        return new EditHistoryItem(e.id, e.actionType,
                e.payloadJson == null ? null : e.payloadJson.deepCopy(),
                e.beforeStateRef, e.afterStateRef, e.createdAt);
    }

    private ProjectVersion versionItem(ProjectVersionEntity v) {
        return new ProjectVersion(v.id, v.projectId, v.label, v.createdAt);
    }

    private ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", detail);
    }
}
