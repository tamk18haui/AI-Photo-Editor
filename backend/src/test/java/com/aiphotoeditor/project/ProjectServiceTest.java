package com.aiphotoeditor.project;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.project.ProjectDtos.*;
import com.aiphotoeditor.user.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
class ProjectServiceTest {
 @Test void cannotSaveMalformedState(){
   var repo=mock(ProjectRepository.class);var states=mock(EditorStateRepository.class);
   var access=mock(ProjectAccessService.class);var userRepo=mock(UserRepository.class);
   var resolver=mock(AssetReferenceResolver.class);var mapper=new ObjectMapper();
   var p=new Project();p.id=10L;when(access.requireMine(10L)).thenReturn(p);
   var service=new ProjectService(repo,states,userRepo,access,resolver,mapper);
   assertEquals("VALIDATION_ERROR",assertThrows(ApiException.class,()->service.saveState(10L,mapper.createObjectNode())).getCode());
 }
}
