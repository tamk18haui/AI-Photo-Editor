package com.aiphotoeditor.assetbridge;
import com.aiphotoeditor.common.ApiException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
@Configuration
public class AssetBridgeConfig {
 @Bean @ConditionalOnMissingBean(AssetReferenceResolver.class)
 AssetReferenceResolver pendingAssetResolver(){
  return (id,user,project)->{throw new ApiException(HttpStatus.CONFLICT,"ASSET_NOT_FOUND","N4 asset resolver is not integrated yet");};
 }
}
