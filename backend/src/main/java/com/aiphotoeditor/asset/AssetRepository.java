package com.aiphotoeditor.asset;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Database access only; business ownership checks are performed by AssetService. */
public interface AssetRepository extends JpaRepository<Asset, Long> {
    List<Asset> findByProjectIdOrderByCreatedAtDesc(Long projectId);
    List<Asset> findByProjectIdAndAssetTypeOrderByCreatedAtDesc(Long projectId, AssetType type);
    Optional<Asset> findByIdAndProjectId(Long assetId, Long projectId);
    boolean existsByDerivedFromAssetId(Long sourceAssetId);
    @Query(value = "SELECT COUNT(*) FROM ai_jobs WHERE input_asset_id = :assetId OR result_asset_id = :assetId", nativeQuery = true)
    long countAiJobReferences(@Param("assetId") Long assetId);
}
// N4_HYBRID_FULL_V3_PATCHED
