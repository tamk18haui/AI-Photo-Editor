-- N3: durable cleanup work for deleted project Cloudinary assets.
-- No foreign key to projects: jobs must survive project deletion until cloud cleanup succeeds.
CREATE TABLE n3_asset_cleanup_outbox (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 cloudinary_public_id VARCHAR(512) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_n3_cleanup_created (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
