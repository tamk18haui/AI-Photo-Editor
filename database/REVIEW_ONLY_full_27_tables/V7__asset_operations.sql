-- OWNER: N4. EXTENDED.
CREATE TABLE asset_variants (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, source_asset_id BIGINT NOT NULL, variant_key VARCHAR(90) NOT NULL,
 secure_url VARCHAR(2048) NOT NULL, cloudinary_public_id VARCHAR(512) NULL, width INT NULL, height INT NULL,
 format VARCHAR(20) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_asset_variant (source_asset_id,variant_key), FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE asset_analyses (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, asset_id BIGINT NOT NULL, analyzer_version VARCHAR(80) NOT NULL,
 score_json JSON NOT NULL, suggested_actions_json JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_analysis_asset_created (asset_id,created_at), FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE asset_cleanup_tasks (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, asset_id BIGINT NULL, cloudinary_public_id VARCHAR(512) NOT NULL,
 operation VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', attempt_count INT NOT NULL DEFAULT 0,
 next_retry_at DATETIME(3) NULL, last_error TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_asset_cleanup_status_retry (status,next_retry_at), FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 CONSTRAINT chk_asset_cleanup_op CHECK (operation IN ('DELETE','VERIFY')),
 CONSTRAINT chk_asset_cleanup_status CHECK (status IN ('PENDING','RUNNING','DONE','FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
