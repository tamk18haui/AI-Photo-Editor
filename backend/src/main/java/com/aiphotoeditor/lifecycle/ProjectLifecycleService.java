package com.aiphotoeditor.lifecycle;

import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetRepository;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.AiJob;
import com.aiphotoeditor.job.AiJobStatus;
import com.aiphotoeditor.project.*;
import com.aiphotoeditor.project.ProjectDtos.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * N3 project deletion and independent deep copy (including N4 Cloudinary assets).
 * No N4 code or asset is overwritten. External rollback cleanup is best-effort;
 * deletions use a persistent outbox retried by AssetDeletionWorker.
 */
@Service
public class ProjectLifecycleService {
 private static final int MAX_CLONE_ASSETS=100;
 private static final long MAX_CLONE_BYTES=250L*1024*1024;
 private final ProjectAccessService access;
 private final ProjectRepository projects;
 private final EditorStateRepository states;
 private final AssetRepository assets;
 private final AssetService assetService;
 private final CloudinaryService cloudinary;
 private final EntityManager em;
 private final JdbcTemplate jdbc;
 private final ObjectMapper mapper;

 public ProjectLifecycleService(ProjectAccessService access,ProjectRepository projects,
   EditorStateRepository states,AssetRepository assets,AssetService assetService,
   CloudinaryService cloudinary,EntityManager em,JdbcTemplate jdbc,ObjectMapper mapper){
  this.access=access;this.projects=projects;this.states=states;this.assets=assets;
  this.assetService=assetService;this.cloudinary=cloudinary;this.em=em;this.jdbc=jdbc;this.mapper=mapper;
 }

 @Transactional
 public ProjectResponse duplicate(long originalId,DuplicateProjectRequest req){
  Project source=access.requireMine(originalId);
  // Serialize with concurrent state/layer saves. A snapshot of the latest current state is cloned.
  var originalState=states.findLockedByProjectId(originalId).orElseThrow(()->
    new ApiException(HttpStatus.NOT_FOUND,"EDITOR_STATE_NOT_FOUND","Editor state not found"));
  List<Asset> assetList=assets.findByProjectIdOrderByCreatedAtDesc(originalId);
  if(assetList.size()>MAX_CLONE_ASSETS || assetList.stream().mapToLong(a->a.fileSize).sum()>MAX_CLONE_BYTES)
   throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,"PROJECT_TOO_LARGE","Clone exceeds asset safety limits");
  String name=req==null||req.name()==null||req.name().isBlank()?"Copy of "+source.name:req.name().strip();
  if(name.isBlank()||name.length()>150)throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","Project name too long");

  Project cloned=new Project();
  cloned.owner=source.owner;cloned.name=name;cloned.canvasWidth=source.canvasWidth;
  cloned.canvasHeight=source.canvasHeight;cloned.background=source.background;
  projects.saveAndFlush(cloned);

  Map<Long,Asset> byId=new HashMap<>();
  for(Asset old:assetList)byId.put(old.id,old);
  Map<Long,Asset> mapped=new HashMap<>();
  List<String> createdCloudinaryIds=new ArrayList<>();
  TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
   @Override public void afterCompletion(int status){
    if(status!=STATUS_COMMITTED)for(String publicId:createdCloudinaryIds){
     try{cloudinary.delete(publicId);}catch(RuntimeException ignored){/* report + manual cleanup if Cloudinary is unavailable */}
    }
   }
  });
  for(Asset original:assetList)cloneAsset(original,cloned,byId,mapped,createdCloudinaryIds,new HashSet<>());

  if(source.thumbnailAssetId!=null){
   Asset clonedThumb=mapped.get(source.thumbnailAssetId);
   if(clonedThumb==null)throw new ApiException(HttpStatus.CONFLICT,"INVALID_THUMBNAIL","Original project thumbnail is missing");
   cloned.thumbnailAssetId=clonedThumb.id;
   projects.saveAndFlush(cloned);
  }
  JsonNode next=remap(originalState.stateJson,mapped,byId);
  EditorStateEntity editor=new EditorStateEntity();editor.project=cloned;
  editor.schemaVersion=next.path("schemaVersion").asInt(1);editor.stateJson=next;
  editor.stateVersion=1L;
  states.saveAndFlush(editor);
  String thumbnail=cloned.thumbnailAssetId==null?null:mapped.get(source.thumbnailAssetId).secureUrl;
  return new ProjectResponse(cloned.id,cloned.name,cloned.owner.id,cloned.canvasWidth,
    cloned.canvasHeight,thumbnail,cloned.createdAt,cloned.updatedAt);
 }

 /** Recursively clone source assets, preserving derived_from relationships in NEW project. */
 private Asset cloneAsset(Asset old,Project cloned,Map<Long,Asset> originals,
   Map<Long,Asset> mapped,List<String> publicIds,Set<Long> visiting){
  if(mapped.containsKey(old.id))return mapped.get(old.id);
  if(!visiting.add(old.id))throw new ApiException(HttpStatus.CONFLICT,"ASSET_CYCLE","Invalid derived asset graph");
  Long mappedParent=null;
  if(old.derivedFromAssetId!=null){
   Asset parent=originals.get(old.derivedFromAssetId);
   if(parent==null)throw new ApiException(HttpStatus.CONFLICT,"BROKEN_DERIVED_ASSET","Source derived asset is missing");
   mappedParent=cloneAsset(parent,cloned,originals,mapped,publicIds,visiting).id;
  }
  byte[] image=cloudinary.download(old);
  var response=assetService.store(cloned.id,image,old.originalFileName==null?"copy.png":old.originalFileName,
    old.assetType,mappedParent);
  Asset fresh=assets.findById(response.assetId()).orElseThrow(()->new IllegalStateException("Copied asset missing"));
  publicIds.add(fresh.cloudinaryPublicId);
  mapped.put(old.id,fresh);
  visiting.remove(old.id);
  return fresh;
 }

 private JsonNode remap(JsonNode original,Map<Long,Asset> mapped,Map<Long,Asset> originals){
  if(original==null||!original.isObject())throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_STATE","Invalid source editor state");
  JsonNode copy=original.deepCopy();
  Map<String,String> urlMap=new HashMap<>();
  for(var entry:mapped.entrySet())urlMap.put(originals.get(entry.getKey()).secureUrl,entry.getValue().secureUrl);
  rewrite(copy,mapped,urlMap);
  return copy;
 }
 private static final Set<String> ASSET_KEYS=Set.of("assetId","sourceAssetId","maskAssetId","backgroundAssetId","thumbnailAssetId","derivedFromAssetId");
 private void rewrite(JsonNode node,Map<Long,Asset> mapped,Map<String,String> urlMap){
  if(node.isObject()){
   ObjectNode obj=(ObjectNode)node;
   var iterator=obj.fields();
   List<Map.Entry<String,JsonNode>> entries=new ArrayList<>();
   iterator.forEachRemaining(entries::add);
   for(var entry:entries){
    String key=entry.getKey();JsonNode value=entry.getValue();
    if("sourceJobId".equals(key)){
     // The clone has independent image assets but no cloned AI job records.
     if(value.isIntegralNumber())obj.put("copiedFromJobId",value.asLong());
     obj.remove(key);
    }else if(ASSET_KEYS.contains(key)&&value.isIntegralNumber()){
     Asset replacement=mapped.get(value.asLong());
     if(replacement==null)throw new ApiException(HttpStatus.CONFLICT,"BROKEN_ASSET_REFERENCE","Image reference not found in source project");
     obj.put(key,replacement.id);
    }else if(value.isTextual() && urlMap.containsKey(value.asText())){
     obj.put(key,urlMap.get(value.asText()));
    }else rewrite(value,mapped,urlMap);
   }
  }else if(node.isArray())for(JsonNode child:node)rewrite(child,mapped,urlMap);
 }

 /** Delete related AI jobs first; enqueue Cloudinary cleanup in the same SQL transaction. */
 @Transactional
 public void delete(long projectId){
  Project p=access.requireMine(projectId);
  List<AiJob> jobs=em.createQuery("select j from AiJob j where j.projectId = :pid",AiJob.class)
     .setParameter("pid",projectId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
  for(AiJob job:jobs){
   if(job.status==AiJobStatus.QUEUED||job.status==AiJobStatus.RUNNING)
    throw new ApiException(HttpStatus.CONFLICT,"PROJECT_HAS_ACTIVE_JOBS","Cancel or finish AI jobs before deleting project");
  }
  List<Asset> related=assets.findByProjectIdOrderByCreatedAtDesc(projectId);
  for(Asset item:related){
   jdbc.update("INSERT INTO n3_asset_cleanup_outbox (cloudinary_public_id) VALUES (?)",item.cloudinaryPublicId);
  }
  // Avoid dangling user avatars referring to an image in a deleted project.
  jdbc.update("UPDATE users SET avatar_asset_id=NULL WHERE avatar_asset_id IN (SELECT id FROM assets WHERE project_id=?)",projectId);
  for(AiJob job:jobs)em.remove(job);
  em.flush();
  p.thumbnailAssetId=null;
  projects.saveAndFlush(p);
  assets.deleteAllInBatch(related);
  projects.delete(p);
  projects.flush();
 }
}
