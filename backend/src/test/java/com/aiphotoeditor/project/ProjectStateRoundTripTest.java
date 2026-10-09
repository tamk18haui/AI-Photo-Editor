package com.aiphotoeditor.project;

import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import com.aiphotoeditor.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectStateRoundTripTest {
    @Test
    void loadingStoredEditorStateReturnsJsonNodeInsteadOfErasingObjects() throws Exception {
        var projects = mock(ProjectRepository.class);
        var states = mock(EditorStateRepository.class);
        var users = mock(UserRepository.class);
        var access = mock(ProjectAccessService.class);
        var assets = mock(AssetReferenceResolver.class);
        var mapper = new ObjectMapper();
        var project = new Project();
        project.id = 25L;
        var saved = new EditorStateEntity();
        saved.project = project;
        saved.stateJson = mapper.readTree("{\"schemaVersion\":1,\"canvas\":{\"width\":900,\"height\":600},\"objects\":[{\"type\":\"rect\"}],\"activeFilters\":[]}");
        when(access.requireMine(25L)).thenReturn(project);
        when(states.findById(25L)).thenReturn(Optional.of(saved));
        var service = new ProjectService(projects, states, users, access, assets, mapper);
        var result = service.getState(25L);
        assertEquals("rect", result.path("objects").get(0).path("type").asText());
        assertEquals(900, result.path("canvas").path("width").asInt());
        assertNotSame(saved.stateJson, result, "Return a snapshot, not the JPA managed tree");
    }
}
