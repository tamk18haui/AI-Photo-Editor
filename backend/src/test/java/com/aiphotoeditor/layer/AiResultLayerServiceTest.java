package com.aiphotoeditor.layer;

import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.HistoryDtos.*;
import com.aiphotoeditor.history.HistoryService;
import com.aiphotoeditor.job.AiJob;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobStatus;
import com.aiphotoeditor.layer.AiResultLayerDtos.*;
import com.aiphotoeditor.project.EditorStateEntity;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectDtos.SaveStateResponse;
import com.aiphotoeditor.project.ProjectService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiResultLayerServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProjectAccessService access = mock(ProjectAccessService.class);
    private final ProjectService projects = mock(ProjectService.class);
    private final AiJobService jobs = mock(AiJobService.class);
    private final AssetService assets = mock(AssetService.class);
    private final HistoryService history = mock(HistoryService.class);
    private final EntityManager em = mock(EntityManager.class);
    private final AiResultLayerService service =
            new AiResultLayerService(access, projects, jobs, assets, history, em, mapper);

    private AiJob completedJob() {
        var job = new AiJob();
        job.id = 90L;
        job.projectId = 77L;
        job.createdByUserId = 4L;
        job.type = "REMOVE_BACKGROUND";
        job.status = AiJobStatus.COMPLETED;
        job.inputAssetId = 24L;
        job.resultAssetId = 25L;
        return job;
    }

    private Asset resultAsset() {
        var asset = new Asset();
        asset.id = 25L;
        asset.projectId = 77L;
        asset.assetType = AssetType.AI_OUTPUT;
        asset.secureUrl = "https://res.cloudinary.com/demo/image/upload/output.png";
        asset.width = 640;
        asset.height = 480;
        return asset;
    }

    private JsonNode baseState() throws Exception {
        return mapper.readTree("""
            {"schemaVersion":1,"canvas":{"width":800,"height":600},
             "objects":[{"id":"background","type":"image","assetId":11,"visible":true},
                        {"id":"subject","type":"image","assetId":24,"opacity":0.5}],
             "activeFilters":[],"customMetadata":{"keep":"unchanged"}}
            """);
    }

    @Test
    void completedJobAddsOneIndependentLayerAndTwoSnapshots() throws Exception {
        JsonNode oldState = baseState();
        var row = new EditorStateEntity();
        row.stateVersion = 2L;
        when(jobs.mine(90L)).thenReturn(completedJob());
        when(assets.requireMine(77L,25L)).thenReturn(resultAsset());
        when(em.find(EditorStateEntity.class, 77L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(row);
        when(projects.getState(77L)).thenReturn(oldState);
        when(history.snapshot(eq(77L), any(CreateVersionRequest.class)))
                .thenReturn(new ProjectVersion(1L,77L,"before",Instant.now()),
                            new ProjectVersion(2L,77L,"after",Instant.now()));
        when(projects.saveState(eq(77L), any(JsonNode.class)))
                .thenReturn(new SaveStateResponse(77L,Instant.now(),3L));

        var response = service.attach(77L,
                new AttachAiJobResultRequest(90L,"No background",true,0.75));

        assertTrue(response.created());
        assertEquals("ai-job-90", response.layerId());
        assertEquals(3L, response.stateVersion());
        assertEquals(1L, response.beforeVersionId());
        assertEquals(2L, response.afterVersionId());
        assertEquals(25L,response.layer().path("assetId").asLong());
        assertEquals(24L,response.layer().path("sourceAssetId").asLong());
        assertEquals(0.75,response.layer().path("opacity").asDouble());
        assertEquals("https://res.cloudinary.com/demo/image/upload/output.png",
                     response.layer().path("src").asText());
        var saved = ArgumentCaptor.forClass(JsonNode.class);
        verify(projects).saveState(eq(77L), saved.capture());
        assertEquals(3, saved.getValue().path("objects").size());
        assertEquals("background", saved.getValue().path("objects").get(0).path("id").asText());
        assertEquals("subject", saved.getValue().path("objects").get(1).path("id").asText());
        assertEquals("unchanged", saved.getValue().path("customMetadata").path("keep").asText());
        assertEquals(2, oldState.path("objects").size(),"Must not mutate source state");
        var audit = ArgumentCaptor.forClass(CreateHistoryItemRequest.class);
        verify(history).append(eq(77L), audit.capture());
        assertEquals("AI_RESULT_ADD_LAYER", audit.getValue().actionType());
        assertEquals("1", audit.getValue().beforeStateRef());
        assertEquals("2", audit.getValue().afterStateRef());
    }

    @Test
    void applyingNaturalEditHidesPreviousImageLayersButPreservesThemForUndo() throws Exception {
        AiJob job = completedJob();
        job.provider = "GEMINI";
        job.type = "NATURAL_EDIT";
        JsonNode original = mapper.readTree("""
            {"objects":[{"id":"original","type":"image","visible":true},
                        {"id":"caption","type":"textbox","visible":true}],
             "n1Composition":{"version":1,"layers":[
               {"id":"photo-1","assetId":24,"url":"https://example.test/photo.png","visible":true,"rotation":90},
               {"id":"photo-2","assetId":44,"url":"https://example.test/overlay.png","visible":true}],
               "creative":[{"id":"text-1","kind":"text","value":"Keep me"}],
               "background":{"type":"transparent"}},
             "n1Editor":{"activeAssetId":24,"edits":{"zoom":100}}}
            """);
        var row = new EditorStateEntity();
        row.stateVersion = 2L;
        when(jobs.mine(90L)).thenReturn(job);
        when(assets.requireMine(77L,25L)).thenReturn(resultAsset());
        when(em.find(EditorStateEntity.class, 77L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(row);
        when(projects.getState(77L)).thenReturn(original);
        when(history.snapshot(eq(77L), any(CreateVersionRequest.class)))
                .thenReturn(new ProjectVersion(1L,77L,"before",Instant.now()),
                            new ProjectVersion(2L,77L,"after",Instant.now()));
        when(projects.saveState(eq(77L), any(JsonNode.class)))
                .thenReturn(new SaveStateResponse(77L,Instant.now(),3L));

        service.attach(77L, new AttachAiJobResultRequest(90L,"Gemini NATURAL_EDIT",true,1.0));

        var saved = ArgumentCaptor.forClass(JsonNode.class);
        verify(projects).saveState(eq(77L), saved.capture());
        JsonNode updated = saved.getValue();
        assertFalse(updated.path("objects").get(0).path("visible").asBoolean());
        assertTrue(updated.path("objects").get(1).path("visible").asBoolean());
        assertTrue(updated.path("objects").get(2).path("visible").asBoolean());
        JsonNode layers = updated.path("n1Composition").path("layers");
        assertEquals(3, layers.size());
        assertFalse(layers.get(0).path("visible").asBoolean());
        assertFalse(layers.get(1).path("visible").asBoolean());
        assertTrue(layers.get(2).path("visible").asBoolean());
        assertEquals(90, layers.get(0).path("rotation").asInt(), "Keep original transform for Undo");
        assertEquals(25, layers.get(2).path("assetId").asInt());
        assertEquals("Keep me", updated.path("n1Composition").path("creative").get(0).path("value").asText());
        assertEquals("transparent", updated.path("n1Composition").path("background").path("type").asText());
        assertEquals(25, updated.path("n1Composition").path("primaryAssetId").asInt());
        assertEquals(25, updated.path("n1Editor").path("activeAssetId").asInt());
        assertEquals(100, updated.path("n1Editor").path("edits").path("zoom").asInt());
        assertTrue(original.path("n1Composition").path("layers").get(0).path("visible").asBoolean(),
                "Source snapshot must remain unchanged");
    }

    @Test
    void repeatedRequestDoesNotDuplicateLayerOrHistory() throws Exception {
        var row = new EditorStateEntity();
        row.stateVersion = 9L;
        JsonNode oldState = mapper.readTree("""
            {"schemaVersion":1,"canvas":{"width":800,"height":600},
             "objects":[{"id":"ai-job-90","type":"image","assetId":25,"sourceJobId":90}]}
            """);
        when(jobs.mine(90L)).thenReturn(completedJob());
        when(assets.requireMine(77L,25L)).thenReturn(resultAsset());
        when(em.find(EditorStateEntity.class, 77L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(row);
        when(projects.getState(77L)).thenReturn(oldState);

        var response = service.attach(77L, new AttachAiJobResultRequest(90L,null,null,null));
        assertFalse(response.created());
        assertEquals(9L,response.stateVersion());
        verify(projects,never()).saveState(anyLong(),any());
        verifyNoInteractions(history);
    }

    @Test
    void refusesJobFromDifferentProjectBeforeAnyMutation() {
        AiJob other = completedJob();
        other.projectId = 78L;
        when(jobs.mine(90L)).thenReturn(other);
        ApiException error = assertThrows(ApiException.class, () ->
                service.attach(77L,new AttachAiJobResultRequest(90L,null,null,null)));
        assertEquals("AI_JOB_NOT_FOUND",error.getCode());
        verifyNoInteractions(assets,history,em);
        verify(projects,never()).saveState(anyLong(),any());
    }

    @Test
    void refusesIncompleteJob() {
        AiJob pending = completedJob();
        pending.status = AiJobStatus.RUNNING;
        when(jobs.mine(90L)).thenReturn(pending);
        ApiException error = assertThrows(ApiException.class, () ->
                service.attach(77L,new AttachAiJobResultRequest(90L,null,null,null)));
        assertEquals("AI_JOB_NOT_COMPLETED",error.getCode());
        verifyNoInteractions(assets,history,em);
    }

    @Test
    void refusesMaskAsRenderedImageLayer() {
        Asset mask = resultAsset();
        mask.assetType = AssetType.MASK;
        when(jobs.mine(90L)).thenReturn(completedJob());
        when(assets.requireMine(77L,25L)).thenReturn(mask);
        ApiException error = assertThrows(ApiException.class, () ->
                service.attach(77L,new AttachAiJobResultRequest(90L,null,null,null)));
        assertEquals("VALIDATION_ERROR",error.getCode());
        verifyNoInteractions(history,em);
    }
}
