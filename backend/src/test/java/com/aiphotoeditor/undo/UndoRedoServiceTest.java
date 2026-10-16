package com.aiphotoeditor.undo;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.EditHistoryEntity;
import com.aiphotoeditor.history.EditHistoryRepository;
import com.aiphotoeditor.history.ProjectVersionEntity;
import com.aiphotoeditor.history.ProjectVersionRepository;
import com.aiphotoeditor.project.EditorStateEntity;
import com.aiphotoeditor.project.EditorStateRepository;
import com.aiphotoeditor.project.Project;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UndoRedoServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final EditorStateRepository states = mock(EditorStateRepository.class);
    private final UndoRedoRepository cursors = mock(UndoRedoRepository.class);
    private final ProjectVersionRepository versions = mock(ProjectVersionRepository.class);
    private final EditHistoryRepository histories = mock(EditHistoryRepository.class);
    private final UndoRedoService service = new UndoRedoService(
            access, projects, states, cursors, versions, histories, mapper);

    private JsonNode json(String layers) throws Exception {
        return mapper.readTree("{\"schemaVersion\":1,\"canvas\":{\"width\":800,\"height\":600},"
                + "\"objects\":" + layers + ",\"activeFilters\":[]}");
    }

    private void mockSnapshots(long initialId) {
        var next = new AtomicLong(initialId);
        when(versions.saveAndFlush(any(ProjectVersionEntity.class))).thenAnswer(call -> {
            ProjectVersionEntity version = call.getArgument(0);
            version.id = next.getAndIncrement();
            return version;
        });
    }

    private UndoRedoCursor cursor(String undo, String redo) throws Exception {
        var cursor = new UndoRedoCursor();
        cursor.projectId = 7L;
        cursor.undoStack = mapper.readTree(undo);
        cursor.redoStack = mapper.readTree(redo);
        return cursor;
    }

    private void mockEditor(JsonNode state) {
        var p = new Project(); p.id = 7L;
        var row = new EditorStateEntity();
        row.project = p; row.projectId = 7L; row.stateJson = state;
        row.schemaVersion = 1; row.stateVersion = 4L;
        when(access.requireMine(7L)).thenReturn(p);
        when(access.currentUserId()).thenReturn(11L);
        when(states.findLockedByProjectId(7L)).thenReturn(Optional.of(row));
    }

    @Test
    void savingNewEditorStateRecordsUndoAndClearsRedo() throws Exception {
        var old = json("[{\"id\":\"original\",\"assetId\":12}]");
        var cursor = cursor("[10]", "[20,21]");
        when(cursors.findByProjectId(7L)).thenReturn(Optional.of(cursor));
        mockSnapshots(99L);
        service.recordBeforeSave(7L, old);
        assertEquals(2, cursor.undoStack.size());
        assertEquals(99L, cursor.undoStack.get(1).asLong());
        assertEquals(0, cursor.redoStack.size());
        verify(cursors).saveAndFlush(cursor);
        verify(versions).saveAndFlush(argThat(v -> v.stateJson.equals(old)));
    }

    @Test
    void undoRestoresPreviousLayerGraphAndKeepsCurrentForRedo() throws Exception {
        var latest = json("[{\"id\":\"original\",\"assetId\":12},{\"id\":\"ai\",\"assetId\":30}]");
        var beforeAi = json("[{\"id\":\"original\",\"assetId\":12}]");
        mockEditor(latest);
        var cursor = cursor("[80]", "[]");
        when(cursors.findByProjectId(7L)).thenReturn(Optional.of(cursor));
        var oldVersion = new ProjectVersionEntity();
        oldVersion.id = 80L; oldVersion.projectId = 7L; oldVersion.stateJson = beforeAi;
        when(versions.findByIdAndProjectId(80L, 7L)).thenReturn(Optional.of(oldVersion));
        mockSnapshots(100L);
        var result = service.undo(7L);
        assertEquals("UNDO", result.actionType());
        assertEquals(1, result.state().path("objects").size());
        assertEquals(5L, result.stateVersion());
        assertEquals(0, result.undoCount());
        assertEquals(1, result.redoCount());
        assertEquals(100L, cursor.redoStack.get(0).asLong());
        verify(histories).saveAndFlush(argThat(e -> "UNDO".equals(e.actionType)
                && "100".equals(e.beforeStateRef) && "80".equals(e.afterStateRef)));
    }

    @Test
    void redoReappliesAiLayerWithoutEditingOriginalAsset() throws Exception {
        var original = json("[{\"id\":\"original\",\"assetId\":12}]");
        var withAi = json("[{\"id\":\"original\",\"assetId\":12},{\"id\":\"ai\",\"assetId\":30}]");
        mockEditor(original);
        var cursor = cursor("[]", "[90]");
        when(cursors.findByProjectId(7L)).thenReturn(Optional.of(cursor));
        var redoVersion = new ProjectVersionEntity();
        redoVersion.id = 90L; redoVersion.projectId = 7L; redoVersion.stateJson = withAi;
        when(versions.findByIdAndProjectId(90L, 7L)).thenReturn(Optional.of(redoVersion));
        mockSnapshots(101L);
        var result = service.redo(7L);
        assertEquals("REDO", result.actionType());
        assertEquals(2, result.state().path("objects").size());
        assertEquals(1, result.undoCount());
        assertEquals(0, result.redoCount());
        verify(histories).saveAndFlush(argThat(e -> "REDO".equals(e.actionType)));
    }

    @Test
    void undoWhenStackIsEmptyReturns409WithoutChangingState() throws Exception {
        mockEditor(json("[]"));
        when(cursors.findByProjectId(7L)).thenReturn(Optional.of(cursor("[]", "[]")));
        var error = assertThrows(ApiException.class, () -> service.undo(7L));
        assertEquals("UNDO_EMPTY", error.getCode());
        verify(states, never()).saveAndFlush(any());
        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    void statusReflectsPersistentUndoAndRedoStacks() throws Exception {
        mockEditor(json("[]"));
        when(states.findById(7L)).thenAnswer(invocation -> states.findLockedByProjectId(7L));
        when(cursors.findById(7L)).thenReturn(Optional.of(cursor("[3,4]", "[5]")));
        var result = service.status(7L);
        assertTrue(result.canUndo());
        assertTrue(result.canRedo());
        assertEquals(2, result.undoCount());
        assertEquals(1, result.redoCount());
        assertEquals(4, result.stateVersion());
    }
}
