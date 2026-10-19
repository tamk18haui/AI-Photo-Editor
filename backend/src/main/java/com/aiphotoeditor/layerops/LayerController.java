package com.aiphotoeditor.layerops;

import com.aiphotoeditor.layerops.LayerDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projects/{projectId}/layers")
public class LayerController {
 private final LayerService service;
 public LayerController(LayerService service){this.service=service;}
 @PatchMapping("/{layerId}")
 public LayerResult patch(@PathVariable long projectId,@PathVariable String layerId,@Valid @RequestBody LayerPatch request){
  return service.patch(projectId,layerId,request);
 }
 @DeleteMapping("/{layerId}")
 public LayerResult delete(@PathVariable long projectId,@PathVariable String layerId,
  @RequestParam(required=false) Long expectedStateVersion){
  return service.delete(projectId,layerId,expectedStateVersion);
 }
 @PutMapping("/order")
 public LayerResult reorder(@PathVariable long projectId,@Valid @RequestBody LayerOrder request){
  return service.reorder(projectId,request);
 }
}
