package com.aiphotoeditor.assetbridge;
/** N4 should implement this SPI using assets/project authorization and Cloudinary URLs.
 * Reject unknown/mismatched asset references rather than trusting client-provided ids. */
public interface AssetReferenceResolver {
  String ownedAssetUrl(long assetId,long userId,Long requiredProjectId);
}
