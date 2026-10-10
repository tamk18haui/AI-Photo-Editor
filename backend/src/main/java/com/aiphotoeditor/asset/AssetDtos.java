package com.aiphotoeditor.asset;

import java.time.Instant;

/** JSON types for project asset APIs defined in the shared YAML contract. */
public final class AssetDtos {
    private AssetDtos() {}

    /** Function: Return project-owned asset metadata to frontend without Cloudinary secrets. */
    public record AssetResponse(
        long assetId,
        long projectId,
        String url,
        AssetType assetType,
        String originalFileName,
        String mimeType,
        long fileSize,
        Integer width,
        Integer height,
        Instant createdAt
    ) {}
}
