package com.aiphotoeditor.layerops;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.layerops.LayerDtos.*;
import com.aiphotoeditor.project.EditorStateEntity;
import com.aiphotoeditor.project.EditorStateRepository;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectDtos.SaveStateResponse;
import com.aiphotoeditor.project.ProjectService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Atomic N3 layer operations; never flattens images or mutates N4 assets. */
@Service
public class LayerService {
 private final ProjectAccessService access;
 private final EditorStateRepository states;
 private final ProjectService projects;
 public LayerService(ProjectAccessService access,EditorStateRepository states,ProjectService projects){
  this.access=access;this.states=states;this.projects=projects;
 }
 @Transactional
 public LayerResult patch(long projectId,String layerId,LayerPatch request){
  if(request==null)throw bad("Layer patch is required");
  EditorStateEntity row=locked(projectId);
  verifyExpected(row,request.expectedStateVersion());
  ObjectNode next=copy(row);
  ArrayNode objects=(ArrayNode)next.path("objects");
  ObjectNode layer=find(objects,layerId);
  if(request.name()==null&&request.visible()==null&&request.locked()==null&&request.opacity()==null)throw bad("No layer changes supplied");
  if(layer.path("locked").asBoolean(false) && (request.name()!=null||request.visible()!=null||request.opacity()!=null))
   throw new ApiException(HttpStatus.CONFLICT,"LAYER_LOCKED","Unlock layer before editing");
  if(request.name()!=null){
   String name=request.name().strip();
   if(name.isBlank()||name.length()>120)throw bad("Layer name must contain 1 to 120 characters");
   layer.put("name",name);
  }
  if(request.visible()!=null)layer.put("visible",request.visible());
  if(request.locked()!=null)layer.put("locked",request.locked());
  if(request.opacity()!=null){
   double alpha=request.opacity();
   if(!Double.isFinite(alpha)||alpha<0||alpha>1)throw bad("Opacity must be between 0 and 1");
   layer.put("opacity",alpha);
  }
  SaveStateResponse saved=projects.saveState(projectId,next,row.stateVersion);
  return new LayerResult(projectId,saved.stateVersion(),objects.size(),layerId);
 }
 @Transactional
 public LayerResult delete(long projectId,String layerId,Long expectedStateVersion){
  EditorStateEntity row=locked(projectId);
  verifyExpected(row,expectedStateVersion);
  ObjectNode next=copy(row);
  ArrayNode objects=(ArrayNode)next.path("objects");
  int index=indexOf(objects,layerId);
  if(index<0)throw missing();
  if(objects.get(index).path("locked").asBoolean(false))
   throw new ApiException(HttpStatus.CONFLICT,"LAYER_LOCKED","Unlock layer before deleting");
  objects.remove(index);
  SaveStateResponse saved=projects.saveState(projectId,next,row.stateVersion);
  return new LayerResult(projectId,saved.stateVersion(),objects.size(),layerId);
 }
 @Transactional
 public LayerResult reorder(long projectId,LayerOrder request){
  if(request==null||request.layerIds()==null)throw bad("Layer order is required");
  EditorStateEntity row=locked(projectId);
  verifyExpected(row,request.expectedStateVersion());
  ObjectNode next=copy(row);
  ArrayNode objects=(ArrayNode)next.path("objects");
  if(request.layerIds().size()!=objects.size())throw bad("Layer order must contain all existing layers exactly once");
  Map<String,JsonNode> current=new HashMap<>();
  for(JsonNode layer:objects){
   String key=layer.path("id").asText("");
   if(key.isBlank()||current.putIfAbsent(key,layer.deepCopy())!=null)throw bad("Layer IDs must be unique");
  }
  ArrayNode ordered=next.arrayNode();
  Set<String> seen=new HashSet<>();
  for(String id:request.layerIds()){
   if(id==null||!seen.add(id)||!current.containsKey(id))throw bad("Invalid or duplicate layer ID in order");
   ordered.add(current.get(id));
  }
  next.set("objects",ordered);
  SaveStateResponse saved=projects.saveState(projectId,next,row.stateVersion);
  return new LayerResult(projectId,saved.stateVersion(),ordered.size(),null);
 }
 private EditorStateEntity locked(long projectId){
  access.requireMine(projectId);
  return states.findLockedByProjectId(projectId).orElseThrow(()->
   new ApiException(HttpStatus.NOT_FOUND,"EDITOR_STATE_NOT_FOUND","Project editor state not found"));
 }
 private ObjectNode copy(EditorStateEntity state){
  if(state.stateJson==null||!state.stateJson.isObject()||!state.stateJson.path("objects").isArray())throw bad("Invalid editor state");
  return (ObjectNode)state.stateJson.deepCopy();
 }
 private void verifyExpected(EditorStateEntity row,Long expected){
  if(expected!=null&&!expected.equals(row.stateVersion))throw new ApiException(HttpStatus.CONFLICT,"STATE_VERSION_CONFLICT","Reload project before editing");
 }
 private ObjectNode find(ArrayNode objects,String id){
  int index=indexOf(objects,id);
  if(index<0)throw missing();
  JsonNode node=objects.get(index);
  if(!node.isObject())throw bad("Invalid layer");
  return (ObjectNode)node;
 }
 private int indexOf(ArrayNode objects,String id){
  if(id==null||id.isBlank())throw bad("Layer ID is required");
  for(int i=0;i<objects.size();i++)if(id.equals(objects.get(i).path("id").asText(null)))return i;
  return -1;
 }
 private ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"LAYER_NOT_FOUND","Layer not found");}
 private ApiException bad(String msg){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR",msg);}
}
