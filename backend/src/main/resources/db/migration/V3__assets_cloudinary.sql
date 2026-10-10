-- N4 schema. NEVER modify existing Flyway V1/V2.
CREATE TABLE assets (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 project_id BIGINT NOT NULL,
 cloudinary_public_id VARCHAR(512) NOT NULL,
 secure_url VARCHAR(2048) NOT NULL,
 asset_type VARCHAR(20) NOT NULL,
 original_file_name VARCHAR(255) NULL,
 mime_type VARCHAR(100) NOT NULL,
 file_size BIGINT NOT NULL,
 format VARCHAR(20) NULL,
 width INT NULL, height INT NULL,
 derived_from_asset_id BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assets_public_id (cloudinary_public_id),
 KEY idx_assets_project_type (project_id,asset_type,created_at),
 CONSTRAINT fk_asset_project FOREIGN KEY (project_id) REFERENCES projects(id),
 CONSTRAINT fk_asset_derived FOREIGN KEY (derived_from_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 CONSTRAINT chk_asset_size CHECK (file_size >= 0),
 CONSTRAINT chk_asset_type CHECK (asset_type IN ('ORIGINAL','IMAGE','MASK','STICKER','AI_OUTPUT','THUMBNAIL','EXPORT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
