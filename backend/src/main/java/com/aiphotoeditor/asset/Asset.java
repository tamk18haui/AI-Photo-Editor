package com.aiphotoeditor.asset;

import jakarta.persistence.*;
import java.time.Instant;

/** Metadata for an original/project image, segmentation mask or derived AI asset. */
@Entity
@Table(name = "assets")
public class Asset {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "project_id", nullable = false)
    public Long projectId;

    @Column(name = "cloudinary_public_id", nullable = false, length = 512)
    public String cloudinaryPublicId;

    @Column(name = "secure_url", nullable = false, length = 2048)
    public String secureUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 20)
    public AssetType assetType;

    @Column(name = "original_file_name")
    public String originalFileName;

    @Column(name = "mime_type", nullable = false, length = 100)
    public String mimeType;

    @Column(name = "file_size", nullable = false)
    public long fileSize;

    @Column(length = 20)
    public String format;

    public Integer width;
    public Integer height;

    @Column(name = "derived_from_asset_id")
    public Long derivedFromAssetId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    /** Function: Stamp creation and update time before persisting. */
    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    /** Function: Update the asset's modification timestamp. */
    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
