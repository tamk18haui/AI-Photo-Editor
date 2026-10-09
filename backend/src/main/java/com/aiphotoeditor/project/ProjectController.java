package com.aiphotoeditor.project;
import com.aiphotoeditor.project.ProjectDtos.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/projects")
public class ProjectController {
 private final ProjectService service;
 public ProjectController(ProjectService service){this.service=service;}
 @GetMapping public ProjectPageResponse list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
    @RequestParam(required=false) String search,@RequestParam(defaultValue="UPDATED_DESC") String sort){return service.list(page,size,search,sort);}
 @PostMapping public ResponseEntity<ProjectResponse> create(@Valid @RequestBody CreateProjectRequest r){return ResponseEntity.status(201).body(service.create(r));}
 @GetMapping("/{projectId}") public ProjectResponse get(@PathVariable long projectId){return service.get(projectId);}
 @PatchMapping("/{projectId}") public ProjectResponse update(@PathVariable long projectId,@Valid @RequestBody UpdateProjectRequest r){return service.update(projectId,r);}
 @DeleteMapping("/{projectId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable long projectId){service.delete(projectId);}
 @PostMapping("/{projectId}/duplicate") public ResponseEntity<ProjectResponse> duplicate(@PathVariable long projectId,@Valid @RequestBody(required=false) DuplicateProjectRequest r){return ResponseEntity.status(201).body(service.duplicate(projectId,r));}
 @GetMapping("/{projectId}/state") public JsonNode loadState(@PathVariable long projectId){return service.getState(projectId);}
 @PutMapping("/{projectId}/state") public SaveStateResponse saveState(@PathVariable long projectId,@RequestBody JsonNode state){return service.saveState(projectId,state);}
}
