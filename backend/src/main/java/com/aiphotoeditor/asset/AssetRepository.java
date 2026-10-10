package com.aiphotoeditor.asset;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Database access only; business ownership checks are performed by AssetService. */
public interface AssetRepository extends JpaRepository<Asset, Long> {
    List<Asset> findByProjectIdOrderByCreatedAtDesc(Long projectId);
    List<Asset> findByProjectIdAndAssetTypeOrderByCreatedAtDesc(Long projectId, AssetType type);
    Optional<Asset> findByIdAndProjectId(Long assetId, Long projectId);
}
