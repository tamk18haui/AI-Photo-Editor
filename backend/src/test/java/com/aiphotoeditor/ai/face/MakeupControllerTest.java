package com.aiphotoeditor.ai.face;

import com.aiphotoeditor.ai.LocalImageService;
import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.job.AiJobType;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;

class MakeupControllerTest {
  private final LocalImageService images=mock(LocalImageService.class);
  private final AiRunnerClient runner=mock(AiRunnerClient.class);
  private final ObjectMapper mapper=new ObjectMapper();
  private final MakeupController service=new MakeupController(images,runner,mapper);
  private JsonNode effect(String code, double intensity) {
    var e=mapper.createObjectNode();e.put("effect",code);e.put("intensity",intensity);return e;
  }
  @Test void acceptsTypedEffectsAndCallsSharedJobCore() {
    var req=new MakeupController.MakeupRequest(1L,2L,33L,0,List.of(effect("LIPSTICK",.6)),null,"FINAL");
    assertEquals(202,service.makeup(req).getStatusCode().value());
    verify(images).submit(eq(1L),eq(2L),eq(AiJobType.MAKEUP),argThat(p->
        p.path("faceIndex").asInt()==0 && p.path("baseRevisionId").asLong()==33 &&
        p.path("outputMode").asText().equals("FINAL") && p.path("effects").size()==1));
  }
  @Test void rejectsUnknownEffectWithoutJob() {
    var req=new MakeupController.MakeupRequest(1L,2L,null,0,List.of(effect("BAD",.5)),null,null);
    assertThrows(ApiException.class,()->service.makeup(req));
    verifyNoInteractions(images);
  }
  @Test void rejectsOutOfRangeIntensity() {
    var req=new MakeupController.MakeupRequest(1L,2L,null,0,List.of(effect("BLUSH",1.2)),null,null);
    assertThrows(ApiException.class,()->service.makeup(req));
  }
  @Test void neverAcceptsUnverifiedCustomMaskIds() {
    var req=new MakeupController.MakeupRequest(1L,2L,null,0,List.of(effect("LIPSTICK",.2)),List.of(9L),null);
    assertThrows(ApiException.class,()->service.makeup(req));
  }
  @Test void proxiesCapabilitiesFromTokenGuardedRunner() {
    var response=mapper.createObjectNode().put("readyPolicy","never invent");
    when(runner.capabilitiesV3()).thenReturn(response);
    assertEquals(response,service.capabilities());
  }
}
