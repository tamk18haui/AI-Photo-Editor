package com.aiphotoeditor.asset;

import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import org.springframework.stereotype.Component;

/** Implement the pre-existing bridge supplied by the core backend team. */
@Component
public class OwnedAssetReferenceResolver implements AssetReferenceResolver {
    private final AssetService assets;

    public OwnedAssetReferenceResolver(AssetService assets) {
        this.assets = assets;
    }

    /** Function: Resolve an asset URL only after validating owner and project. */
    @Override
    public String ownedAssetUrl(long assetId, long userId, Long requiredProjectId) {
        return assets.requireOwned(assetId, userId, requiredProjectId).secureUrl;
    }
}
