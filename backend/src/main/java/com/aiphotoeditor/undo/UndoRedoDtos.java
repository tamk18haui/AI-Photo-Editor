package com.aiphotoeditor.undo;

import com.fasterxml.jackson.databind.JsonNode;

public final class UndoRedoDtos {
    private UndoRedoDtos() {}

    public record UndoRedoStatus(long projectId, boolean canUndo, boolean canRedo,
                                 int undoCount, int redoCount, long stateVersion) {}

    public record UndoRedoResult(long projectId, String actionType, JsonNode state,
                                 long stateVersion, int undoCount, int redoCount) {}
}
