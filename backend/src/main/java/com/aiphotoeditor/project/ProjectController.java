package com.aiphotoeditor.project;

import com.aiphotoeditor.project.ProjectDtos.*;
import com.aiphotoeditor.lifecycle.ProjectLifecycleService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/projects")
public class ProjectController {
 private final ProjectService service;
 private final ProjectLifecycleService lifecycle;
 public ProjectController(ProjectService service,ProjectLifecycleService lifecycle){this.service=service;this.lifecycle=lifecycle;}
 @GetMapping public ProjectPageResponse list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
  @RequestParam(required=false) String search,@RequestParam(defaultValue="UPDATED_DESC") String sort){return service.list(page,size,search,sort);}
 @PostMapping public ResponseEntity<ProjectResponse> create(@Valid @RequestBody CreateProjectRequest r){return ResponseEntity.status(201).body(service.create(r));}
 @GetMapping("/{projectId}") public ProjectResponse get(@PathVariable long projectId){return service.get(projectId);}
 @PatchMapping("/{projectId}") public ProjectResponse update(@PathVariable long projectId,@Valid @RequestBody UpdateProjectRequest r){return service.update(projectId,r);}
 @DeleteMapping("/{projectId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable long projectId){lifecycle.delete(projectId);}
 @PostMapping("/{projectId}/duplicate") public ResponseEntity<ProjectResponse> duplicate(@PathVariable long projectId,
  @Valid @RequestBody(required=false) DuplicateProjectRequest r){return ResponseEntity.status(201).body(lifecycle.duplicate(projectId,r));}
 @GetMapping("/{projectId}/state") public JsonNode loadState(@PathVariable long projectId){return service.getState(projectId);}
 @PutMapping("/{projectId}/state") public SaveStateResponse saveState(@PathVariable long projectId,
  @RequestBody JsonNode state,@RequestParam(required=false) Long expectedStateVersion){
  return service.saveState(projectId,state,expectedStateVersion);
 }
}
