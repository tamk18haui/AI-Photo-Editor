package com.aiphotoeditor.project;
import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
/** Shared by N4 Asset services and N5 AI services to prevent IDOR across projects. */
@Service
public class ProjectAccessService {
 private final ProjectRepository projects;private final CurrentUser current;
 public ProjectAccessService(ProjectRepository projects,CurrentUser current){this.projects=projects;this.current=current;}
 @Transactional(readOnly=true)
 public Project requireMine(long projectId){return requireOwned(projectId,current.id());}
 @Transactional(readOnly=true)
 public Project requireOwned(long projectId,long userId){
  return projects.findByIdAndOwnerId(projectId,userId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"PROJECT_NOT_FOUND","Project not found"));
 }
 public long currentUserId(){return current.id();}
}
