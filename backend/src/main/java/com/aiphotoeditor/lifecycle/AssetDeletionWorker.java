package com.aiphotoeditor.lifecycle;

import com.aiphotoeditor.asset.CloudinaryService;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Durable, retried cleanup of Cloudinary files after transactional project deletion. */
@Component
public class AssetDeletionWorker {
 private static final Logger LOG=LoggerFactory.getLogger(AssetDeletionWorker.class);
 private final JdbcTemplate jdbc;
 private final CloudinaryService cloudinary;
 public AssetDeletionWorker(JdbcTemplate jdbc,CloudinaryService cloudinary){this.jdbc=jdbc;this.cloudinary=cloudinary;}
 @Scheduled(initialDelay=15000,fixedDelay=60000)
 public void process(){
  List<Map<String,Object>> items=jdbc.queryForList(
   "SELECT id, cloudinary_public_id FROM n3_asset_cleanup_outbox ORDER BY id LIMIT 25");
  for(var item:items){
   long id=((Number)item.get("id")).longValue();
   String publicId=(String)item.get("cloudinary_public_id");
   try{
    cloudinary.delete(publicId);
    jdbc.update("DELETE FROM n3_asset_cleanup_outbox WHERE id=?",id);
   }catch(RuntimeException ex){
    LOG.warn("Deferred cleanup of asset resource outbox id={} (will retry)",id);
   }
  }
 }
}
