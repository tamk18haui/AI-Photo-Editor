package com.aiphotoeditor.project;
import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.common.ApiException;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class ProjectAccessServiceTest {
 @Test void deniesReadingOtherPeoplesProjects(){
  var repo=mock(ProjectRepository.class);var current=mock(CurrentUser.class);
  when(current.id()).thenReturn(10L);
  when(repo.findByIdAndOwnerId(99L,10L)).thenReturn(Optional.empty());
  var guard=new ProjectAccessService(repo,current);
  var ex=assertThrows(ApiException.class,()->guard.requireMine(99L));
  assertEquals("PROJECT_NOT_FOUND",ex.getCode());
  verify(repo).findByIdAndOwnerId(99L,10L);
 }
}
