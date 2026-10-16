package com.aiphotoeditor.undo;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.EditHistoryEntity;
import com.aiphotoeditor.history.EditHistoryRepository;
import com.aiphotoeditor.history.ProjectVersionEntity;
import com.aiphotoeditor.history.ProjectVersionRepository;
import com.aiphotoeditor.project.EditorStateEntity;
import com.aiphotoeditor.project.EditorStateRepository;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectRepository;
import com.aiphotoeditor.undo.UndoRedoDtos.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistent, non-destructive Undo/Redo over EditorState JSON.
 * Each successful, changed PUT /state is one undo step, including AI layer additions
 * and restoring a version. Asset binaries and AI jobs are never modified.
 *
 * Locking invariant: all writers acquire editor_states row first, then cursor row.
 * ProjectService.saveState is responsible for taking the same editor_states lock.
 */
@Service
public class UndoRedoService {
    private static final int MAX_STEPS = 30;

    private final ProjectAccessService access;
    private final ProjectRepository projects;
    private final EditorStateRepository states;
    private final UndoRedoRepository cursors;
    private final ProjectVersionRepository versions;
    private final EditHistoryRepository histories;
    private final ObjectMapper mapper;

    public UndoRedoService(ProjectAccessService access, ProjectRepository projects,
                           EditorStateRepository states, UndoRedoRepository cursors,
                           ProjectVersionRepository versions, EditHistoryRepository histories,
                           ObjectMapper mapper) {
        this.access = access;
        this.projects = projects;
        this.states = states;
        this.cursors = cursors;
        this.versions = versions;
        this.histories = histories;
        this.mapper = mapper;
    }

    /** Called in the SAME transaction as ProjectService.saveState, with state row locked. */
    @Transactional
    public void recordBeforeSave(long projectId, JsonNode current) {
        if (current == null) return;
        // Ownership already checked by saveState; also check here against future callers.
        access.requireMine(projectId);
        var cursor = cursors.findByProjectId(projectId).orElseGet(() -> fresh(projectId));
        var undo = stack(cursor.undoStack);
        long versionId = snapshot(projectId, current, "Undo checkpoint");
        appendLimited(undo, versionId);
        cursor.undoStack = undo;
        // A new edit invalidates the entire redo branch.
        cursor.redoStack = mapper.createArrayNode();
        cursors.saveAndFlush(cursor);
    }

    @Transactional(readOnly = true)
    public UndoRedoStatus status(long projectId) {
        access.requireMine(projectId);
        EditorStateEntity current = states.findById(projectId).orElseThrow(this::missingState);
        var cursor = cursors.findById(projectId).orElse(null);
        int u = cursor == null ? 0 : stack(cursor.undoStack).size();
        int r = cursor == null ? 0 : stack(cursor.redoStack).size();
        return new UndoRedoStatus(projectId, u > 0, r > 0, u, r, current.stateVersion);
    }

    @Transactional
    public UndoRedoResult undo(long projectId) { return move(projectId, true); }

    @Transactional
    public UndoRedoResult redo(long projectId) { return move(projectId, false); }

    private UndoRedoResult move(long projectId, boolean isUndo) {
        var project = access.requireMine(projectId);
        // One lock serializes PUT /state, AI-result layer attach, Undo, and Redo.
        EditorStateEntity current = states.findLockedByProjectId(projectId)
                .orElseThrow(this::missingState);
        var cursor = cursors.findByProjectId(projectId).orElse(null);
        if (cursor == null) throw empty(isUndo);

        ArrayNode undo = stack(cursor.undoStack);
        ArrayNode redo = stack(cursor.redoStack);
        ArrayNode source = isUndo ? undo : redo;
        ArrayNode destination = isUndo ? redo : undo;
        if (source.isEmpty()) throw empty(isUndo);

        JsonNode idNode = source.remove(source.size() - 1);
        if (idNode == null || !idNode.canConvertToLong() || idNode.asLong() < 1) {
            throw corruptCursor();
        }
        long targetVersionId = idNode.asLong();
        ProjectVersionEntity previous = versions.findByIdAndProjectId(targetVersionId, projectId)
                .orElseThrow(this::corruptCursor);
        if (previous.stateJson == null || !previous.stateJson.isObject()) throw corruptCursor();

        // Save the state we are leaving, so the inverse button can restore it.
        long leaveVersionId = snapshot(projectId, current.stateJson,
                isUndo ? "Redo checkpoint" : "Undo checkpoint");
        appendLimited(destination, leaveVersionId);

        JsonNode restored = previous.stateJson.deepCopy();
        current.stateJson = restored;
        current.schemaVersion = restored.path("schemaVersion").asInt(1);
        current.stateVersion = current.stateVersion + 1;
        current.updatedAt = Instant.now();
        states.saveAndFlush(current);
        project.updatedAt = Instant.now();
        projects.save(project);

        cursor.undoStack = undo;
        cursor.redoStack = redo;
        cursors.saveAndFlush(cursor);

        String action = isUndo ? "UNDO" : "REDO";
        ObjectNode payload = mapper.createObjectNode();
        payload.put("restoredVersionId", targetVersionId);
        payload.put("leavingVersionId", leaveVersionId);
        var history = new EditHistoryEntity();
        history.projectId = projectId;
        history.userId = access.currentUserId();
        history.actionType = action;
        history.payloadJson = payload;
        history.beforeStateRef = Long.toString(leaveVersionId);
        history.afterStateRef = Long.toString(targetVersionId);
        histories.saveAndFlush(history);
        return new UndoRedoResult(projectId, action, restored.deepCopy(),
                current.stateVersion, undo.size(), redo.size());
    }

    private long snapshot(long projectId, JsonNode state, String label) {
        var version = new ProjectVersionEntity();
        version.projectId = projectId;
        version.createdByUserId = access.currentUserId();
        version.label = label;
        version.stateJson = state.deepCopy();
        var saved = versions.saveAndFlush(version);
        if (saved.id == null) throw new IllegalStateException("Snapshot has no ID");
        return saved.id;
    }

    private UndoRedoCursor fresh(long projectId) {
        var cursor = new UndoRedoCursor();
        cursor.projectId = projectId;
        cursor.undoStack = mapper.createArrayNode();
        cursor.redoStack = mapper.createArrayNode();
        return cursor;
    }

    private ArrayNode stack(JsonNode data) {
        if (data == null) return mapper.createArrayNode();
        if (!data.isArray()) throw corruptCursor();
        return (ArrayNode) data.deepCopy();
    }

    private void appendLimited(ArrayNode stack, long id) {
        stack.add(id);
        while (stack.size() > MAX_STEPS) stack.remove(0);
    }

    private ApiException empty(boolean undo) {
        return new ApiException(HttpStatus.CONFLICT, undo ? "UNDO_EMPTY" : "REDO_EMPTY",
                undo ? "There is no edit to undo" : "There is no edit to redo");
    }

    private ApiException missingState() {
        return new ApiException(HttpStatus.NOT_FOUND, "EDITOR_STATE_NOT_FOUND", "Editor state not found");
    }

    private ApiException corruptCursor() {
        return new ApiException(HttpStatus.CONFLICT, "UNDO_REDO_CORRUPT",
                "Undo/Redo checkpoint is missing or invalid");
    }
}
