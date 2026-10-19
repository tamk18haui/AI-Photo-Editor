package com.aiphotoeditor.project;

import com.aiphotoeditor.project.ProjectDtos.*;
import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.undo.UndoRedoService;
import com.aiphotoeditor.lifecycle.ProjectLifecycleService;
import com.aiphotoeditor.history.EditHistoryEntity;
import com.aiphotoeditor.history.EditHistoryRepository;
import com.aiphotoeditor.user.UserRepository;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** N3 project and editor document state. Existing public constructor is preserved for tests. */
@Service
public class ProjectService {
 private final ProjectRepository projects;
 private final EditorStateRepository states;
 private final UserRepository users;
 private final ProjectAccessService access;
 private final AssetReferenceResolver assets;
 private final ObjectMapper mapper;

 @Autowired
 private UndoRedoService undoRedo;

 @Autowired
 private ProjectLifecycleService lifecycle;

 @Autowired
 private EditHistoryRepository histories;

 public ProjectService(ProjectRepository projects,EditorStateRepository states,UserRepository users,
                       ProjectAccessService access,AssetReferenceResolver assets,ObjectMapper mapper){
  this.projects=projects;this.states=states;this.users=users;this.access=access;this.assets=assets;this.mapper=mapper;
 }
 @Transactional(readOnly=true)
 public ProjectPageResponse list(int page,int size,String search,String sort){
  if(page<0||size<1||size>100)throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Invalid pagination");
  Sort s=switch(sort){
   case "UPDATED_DESC"->Sort.by(Sort.Direction.DESC,"updatedAt","id");
   case "UPDATED_ASC"->Sort.by(Sort.Direction.ASC,"updatedAt","id");
   case "NAME_ASC"->Sort.by(Sort.Direction.ASC,"name","id");
   case "NAME_DESC"->Sort.by(Sort.Direction.DESC,"name","id");
   default->throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Invalid sort");
  };
  var result=projects.searchMine(access.currentUserId(),search==null||search.isBlank()?null:search.strip(),PageRequest.of(page,size,s));
  return new ProjectPageResponse(result.map(this::response).getContent(),page,size,result.getTotalElements(),result.getTotalPages());
 }
 @Transactional
 public ProjectResponse create(CreateProjectRequest r){
  Project p=new Project();p.owner=users.getReferenceById(access.currentUserId());
  p.name=r.name().trim();p.canvasWidth=r.canvasWidth()==null?1920:r.canvasWidth();
  p.canvasHeight=r.canvasHeight()==null?1080:r.canvasHeight();p.background=r.background();
  projects.saveAndFlush(p);states.save(makeState(p,initialState(p)));return response(p);
 }
 private JsonNode initialState(Project p){
  ObjectNode root=mapper.createObjectNode();root.put("schemaVersion",1);
  var canvas=root.putObject("canvas");canvas.put("width",p.canvasWidth);canvas.put("height",p.canvasHeight);
  if(p.background!=null)canvas.put("background",p.background);root.putArray("objects");root.putArray("activeFilters");return root;
 }
 private EditorStateEntity makeState(Project p,JsonNode data){
  var s=new EditorStateEntity();s.project=p;s.stateJson=data.deepCopy();s.schemaVersion=data.path("schemaVersion").asInt(1);
  s.stateVersion=1L;s.createdAt=Instant.now();s.updatedAt=s.createdAt;return s;
 }
 @Transactional(readOnly=true)
 public ProjectResponse get(long id){return response(access.requireMine(id));}
 @Transactional
public ProjectResponse update(long id, UpdateProjectRequest r) {
    Project p = access.requireMine(id);

    if (r.name() != null) {
        if (r.name().isBlank())
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Name cannot be blank"
            );
        p.name = r.name().trim();
    }

    if (r.thumbnailAssetId() != null) {
        if (r.thumbnailAssetId() < 1)
            throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                "Invalid thumbnail id"
            );

        assets.ownedAssetUrl(
            r.thumbnailAssetId(),
            access.currentUserId(),
            p.id
        );

        p.thumbnailAssetId = r.thumbnailAssetId();
    }

    p.updatedAt = Instant.now();
    return response(projects.saveAndFlush(p));
}
 /** Lifecycle API is managed by ProjectLifecycleService. Kept for source compatibility. */
 @Deprecated
 @Transactional
 public void delete(long id){
  lifecycle.delete(id);
 }
 /** Lifecycle API is managed by ProjectLifecycleService. Kept for source compatibility. */
 @Deprecated
 @Transactional
 public ProjectResponse duplicate(long id,DuplicateProjectRequest r){
  return lifecycle.duplicate(id,r);
 }
 @Transactional(readOnly=true)
 public JsonNode getState(long id){
  Project p=access.requireMine(id);
  return states.findById(p.id).<JsonNode>map(s->s.stateJson.deepCopy()).orElseGet(()->initialState(p));
 }
 @Transactional
 public SaveStateResponse saveState(long id,JsonNode data){return saveState(id,data,null);}

 /** Optional expectedStateVersion prevents lost updates from concurrent tabs/slow AI requests. */
 @Transactional
 public SaveStateResponse saveState(long id,JsonNode data,Long expectedStateVersion){
  Project p=access.requireMine(id);
  validateState(data);
  EditorStateEntity state=states.findLockedByProjectId(id).orElseGet(()->{
   EditorStateEntity e=makeState(p,data);e.stateVersion=0L;return e;
  });
  long currentVersion=state.stateVersion==null?0:state.stateVersion;
  if(expectedStateVersion!=null && expectedStateVersion!=currentVersion)
   throw new ApiException(HttpStatus.CONFLICT,"STATE_VERSION_CONFLICT","Editor was changed in another request; reload before saving");
  validateAssetRefs(data,p.id);
  if(state.stateJson!=null && state.stateJson.equals(data) && currentVersion>0)
   return new SaveStateResponse(id,state.updatedAt,currentVersion);
  if(state.stateJson!=null && currentVersion>0 && undoRedo!=null)
   undoRedo.recordBeforeSave(id,state.stateJson);
  state.stateJson=data.deepCopy();state.schemaVersion=data.path("schemaVersion").asInt();
  state.stateVersion=currentVersion+1;state.updatedAt=Instant.now();
  states.saveAndFlush(state);
  p.updatedAt=Instant.now();projects.save(p);
  if(histories!=null){
   EditHistoryEntity entry=new EditHistoryEntity();
   entry.projectId=id;entry.userId=access.currentUserId();entry.actionType="EDITOR_STATE_SAVE";
   ObjectNode payload=mapper.createObjectNode();payload.put("stateVersion",state.stateVersion);
   payload.put("layerCount",data.path("objects").size());
   entry.payloadJson=payload;
   histories.save(entry);
  }
  return new SaveStateResponse(id,state.updatedAt,state.stateVersion);
 }
 private void validateState(JsonNode data){
  if(data==null||!data.isObject()||!data.path("schemaVersion").canConvertToInt()||data.path("schemaVersion").asInt()<1
    ||!data.path("canvas").isObject()||!data.path("canvas").path("width").canConvertToInt()||data.path("canvas").path("width").asInt()<1||data.path("canvas").path("width").asInt()>12000
    ||!data.path("canvas").path("height").canConvertToInt()||data.path("canvas").path("height").asInt()<1||data.path("canvas").path("height").asInt()>12000
    ||!data.path("objects").isArray()||data.has("activeFilters")&&!data.path("activeFilters").isArray())
      throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","Invalid EditorState schema");
  try {if(mapper.writeValueAsBytes(data).length>2_000_000)throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,"FILE_TOO_LARGE","Editor state too large");}
  catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Invalid EditorState JSON");}
 }
 private static final Set<String> ASSET_KEYS=Set.of("assetId","sourceAssetId","maskAssetId","backgroundAssetId","thumbnailAssetId","derivedFromAssetId");
 private void validateAssetRefs(JsonNode data,long projectId){
  Set<Long> checked=new HashSet<>();
  checkNode(data,projectId,checked);
 }
 private void checkNode(JsonNode node,long projectId,Set<Long> checked){
  if(node==null||node.isNull())return;
  if(node.isObject()){
   var fields=node.fields();
   while(fields.hasNext()){
    var entry=fields.next();
    if(ASSET_KEYS.contains(entry.getKey()) && !entry.getValue().isNull()){
     if(!entry.getValue().isIntegralNumber()||!entry.getValue().canConvertToLong()||entry.getValue().asLong()<1)
      throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ASSET_REFERENCE","Invalid image asset ID");
     long aid=entry.getValue().asLong();
     if(checked.add(aid))assets.ownedAssetUrl(aid,access.currentUserId(),projectId);
    } else checkNode(entry.getValue(),projectId,checked);
   }
  }else if(node.isArray())for(JsonNode child:node)checkNode(child,projectId,checked);
 }
 

private ProjectResponse response(Project p) {
    Long ownerId = access.currentUserId();

    String thumb = p.thumbnailAssetId == null
        ? null
        : assets.ownedAssetUrl(
            p.thumbnailAssetId,
            ownerId,
            p.id
        );

    return new ProjectResponse(
        p.id,
        p.name,
        ownerId,
        p.canvasWidth,
        p.canvasHeight,
        thumb,
        p.createdAt,
        p.updatedAt
    );
}


}
