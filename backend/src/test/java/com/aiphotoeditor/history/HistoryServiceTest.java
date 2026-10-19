package com.aiphotoeditor.history;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.HistoryDtos.*;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HistoryServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectService projects = mock(ProjectService.class);
    private final EditHistoryRepository histories = mock(EditHistoryRepository.class);
    private final ProjectVersionRepository versions = mock(ProjectVersionRepository.class);
    private final HistoryService service = new HistoryService(access, projects, histories, versions, mapper);

    @Test
    void snapshotsPreserveMultipleIndependentLayersAndAiAssets() throws Exception {
        var state = mapper.readTree("""
            {"schemaVersion":1,"canvas":{"width":1920,"height":1080},
             "objects":[{"id":"background","assetId":11,"visible":true,"locked":true},
                        {"id":"subject","assetId":12,"opacity":0.8,"visible":true},
                        {"id":"ai-mask","assetId":13,"visible":false}],
             "activeFilters":[{"type":"brightness","value":20}],
             "customFabricProperty":{"blendMode":"multiply"}}
            """);
        when(projects.getState(40L)).thenReturn(state);
        when(access.currentUserId()).thenReturn(6L);
        when(versions.saveAndFlush(any(ProjectVersionEntity.class))).thenAnswer(call -> {
            var item = (ProjectVersionEntity) call.getArgument(0);
            item.id = 18L;
            return item;
        });

        var response = service.snapshot(40L, new CreateVersionRequest("Before AI"));
        assertEquals(18L, response.versionId());
        var captor = org.mockito.ArgumentCaptor.forClass(ProjectVersionEntity.class);
        verify(versions).saveAndFlush(captor.capture());
        var saved = captor.getValue().stateJson;
        assertEquals(3, saved.path("objects").size());
        assertEquals(12, saved.path("objects").get(1).path("assetId").asInt());
        assertFalse(saved.path("objects").get(2).path("visible").asBoolean());
        assertEquals("multiply", saved.path("customFabricProperty").path("blendMode").asText());
        assertNotSame(state, saved);
    }

    @Test
    void restoreRejectsVersionFromOtherProjectWithoutChangingState() {
        when(versions.findByIdAndProjectId(91L, 40L)).thenReturn(Optional.empty());
        var failure = assertThrows(ApiException.class, () -> service.restore(40L, 91L));
        assertEquals("VERSION_NOT_FOUND", failure.getCode());
        verify(projects, never()).saveState(anyLong(), any());
    }

    @Test
    void restoreWritesSafetySnapshotAndAppendOnlyHistory() throws Exception {
        var before = mapper.readTree("""
            {"schemaVersion":1,"canvas":{"width":100,"height":100},"objects":[{"id":"new"}]}
            """);
        var after = mapper.readTree("""
            {"schemaVersion":1,"canvas":{"width":100,"height":100},"objects":[{"id":"old"}]}
            """);
        var version = new ProjectVersionEntity();
        version.id = 7L;
        version.projectId = 40L;
        version.stateJson = after;
        when(versions.findByIdAndProjectId(7L, 40L)).thenReturn(Optional.of(version));
        when(projects.getState(40L)).thenReturn(before);
        when(access.currentUserId()).thenReturn(6L);
        when(versions.saveAndFlush(any(ProjectVersionEntity.class))).thenAnswer(call -> {
            var item = (ProjectVersionEntity) call.getArgument(0);
            item.id = 8L;
            return item;
        });
        when(histories.saveAndFlush(any(EditHistoryEntity.class))).thenAnswer(call -> call.getArgument(0));
        var result = service.restore(40L, 7L);
        assertEquals("old", result.path("objects").get(0).path("id").asText());
        verify(projects).saveState(eq(40L), eq(after));
        var entry = org.mockito.ArgumentCaptor.forClass(EditHistoryEntity.class);
        verify(histories).saveAndFlush(entry.capture());
        assertEquals("RESTORE_VERSION", entry.getValue().actionType);
        assertEquals("8", entry.getValue().beforeStateRef);
        assertEquals("7", entry.getValue().afterStateRef);
    }
}
