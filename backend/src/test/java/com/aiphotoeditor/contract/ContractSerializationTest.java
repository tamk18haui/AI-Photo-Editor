package com.aiphotoeditor.contract;
import static org.junit.jupiter.api.Assertions.*;
import com.aiphotoeditor.auth.AuthDtos;
import com.aiphotoeditor.project.ProjectDtos;
import com.aiphotoeditor.common.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import org.junit.jupiter.api.Test;
class ContractSerializationTest {
 private final ObjectMapper json=new ObjectMapper().registerModule(new JavaTimeModule());
 @Test void authHasTopLevelCamelCaseFields() throws Exception {
  var node=json.readTree(json.writeValueAsString(new AuthDtos.AuthResponse("access","refresh",900L,"Bearer",4L,"Lumina")));
  assertEquals("access",node.get("accessToken").asText());
  assertEquals("Bearer",node.get("tokenType").asText());
  assertEquals(4,node.get("userId").asLong());
  assertFalse(node.has("data"));
 }
 @Test void projectMatchesRequiredOpenApiFields() throws Exception {
  var now=Instant.parse("2026-10-09T05:00:00Z");
  var node=json.readTree(json.writeValueAsString(new ProjectDtos.ProjectResponse(1L,"Lumina",2L,1280,720,null,now,now)));
  for(var key:new String[]{"id","name","ownerId","canvasWidth","canvasHeight","createdAt","updatedAt"})
   assertTrue(node.has(key),"Missing ProjectResponse field "+key);
 }
 @Test void failuresContainCodeAndStatus() throws Exception {
  var node=json.readTree(json.writeValueAsString(ErrorResponse.of(401,"AUTH_TOKEN_EXPIRED","Expired")));
  for(var key:new String[]{"timestamp","status","code","message"})
   assertTrue(node.has(key),"Missing ErrorResponse field "+key);
 }
}
