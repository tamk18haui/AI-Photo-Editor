package com.aiphotoeditor.layerops;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.layerops.LayerDtos.*;
import com.aiphotoeditor.project.*;
import com.aiphotoeditor.project.ProjectDtos.SaveStateResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LayerServiceTest {
 private final ProjectAccessService access=mock(ProjectAccessService.class);
 private final EditorStateRepository states=mock(EditorStateRepository.class);
 private final ProjectService projects=mock(ProjectService.class);
 private final LayerService layers=new LayerService(access,states,projects);
 private final ObjectMapper mapper=new ObjectMapper();

 private EditorStateEntity init() throws Exception {
  var s=new EditorStateEntity();s.stateVersion=3L;
  s.stateJson=mapper.readTree("""
     {"schemaVersion":1,"canvas":{"width":100,"height":100},
      "objects":[{"id":"base","type":"image","locked":true,"opacity":1},
                 {"id":"ai","type":"image","assetId":12,"opacity":0.8,"visible":true}],
      "activeFilters":[],"custom":{"keepMe":true}}
     """);
  when(states.findLockedByProjectId(8L)).thenReturn(Optional.of(s));
  when(projects.saveState(eq(8L),any(),eq(3L)))
   .thenReturn(new SaveStateResponse(8L,Instant.now(),4L));
  return s;
 }
 @Test void changeOpacityKeepsOtherLayersAndCustomProperties() throws Exception {
  init();
  LayerResult r=layers.patch(8L,"ai",new LayerPatch("AI output",false,null,0.35,3L));
  assertEquals(4L,r.stateVersion());
  var captured=org.mockito.ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);
  verify(projects).saveState(eq(8L),captured.capture(),eq(3L));
  var state=captured.getValue();
  assertEquals("base",state.path("objects").get(0).path("id").asText());
  assertEquals(0.35,state.path("objects").get(1).path("opacity").asDouble(),0.0001);
  assertTrue(state.path("custom").path("keepMe").asBoolean());
 }
 @Test void lockedLayerCannotBeDeleted() throws Exception {
  init();
  ApiException ex=assertThrows(ApiException.class,()->layers.delete(8L,"base",3L));
  assertEquals("LAYER_LOCKED",ex.getCode());
  verify(projects,never()).saveState(anyLong(),any(),any());
 }
 @Test void reorderRequiresExactlySameLayerIds() throws Exception {
  init();
  assertEquals("VALIDATION_ERROR",assertThrows(ApiException.class,()->
   layers.reorder(8L,new LayerOrder(List.of("ai","ai"),3L))).getCode());
  verify(projects,never()).saveState(anyLong(),any(),any());
 }
 @Test void reorderPreservesLayerObjects() throws Exception {
  init();
  LayerResult result=layers.reorder(8L,new LayerOrder(List.of("ai","base"),3L));
  assertEquals(2,result.layerCount());
  var capture=org.mockito.ArgumentCaptor.forClass(com.fasterxml.jackson.databind.JsonNode.class);
  verify(projects).saveState(eq(8L),capture.capture(),eq(3L));
  assertEquals("ai",capture.getValue().path("objects").get(0).path("id").asText());
  assertEquals(12,capture.getValue().path("objects").get(0).path("assetId").asInt());
 }
 @Test void staleVersionRejected() throws Exception {
  init();
  assertEquals("STATE_VERSION_CONFLICT",assertThrows(ApiException.class,()->
   layers.patch(8L,"ai",new LayerPatch(null,null,null,0.4,2L))).getCode());
  verify(projects,never()).saveState(anyLong(),any(),any());
 }
}
