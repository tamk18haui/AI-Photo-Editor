-- OWNER: N3 (history/versions/members), N4 (exports). OPTIONAL API contract.
CREATE TABLE edit_histories (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL, user_id BIGINT NULL,
 action_type VARCHAR(64) NOT NULL, payload_json JSON NULL, before_state_ref VARCHAR(255) NULL,
 after_state_ref VARCHAR(255) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_history_project_created (project_id, created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE project_versions (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL, created_by_user_id BIGINT NULL,
 label VARCHAR(150) NULL, state_json JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_version_project_created (project_id,created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE exports (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL, asset_id BIGINT NOT NULL,
 format VARCHAR(8) NOT NULL, width INT NULL, height INT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_exports_project_created (project_id,created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (asset_id) REFERENCES assets(id),
 CONSTRAINT chk_export_format CHECK (format IN ('PNG','JPEG','WEBP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE project_members (
 project_id BIGINT NOT NULL, user_id BIGINT NOT NULL, role VARCHAR(16) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (project_id,user_id), KEY idx_member_user_role (user_id,role),
 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_member_role CHECK (role IN ('EDITOR','REVIEWER','VIEWER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
