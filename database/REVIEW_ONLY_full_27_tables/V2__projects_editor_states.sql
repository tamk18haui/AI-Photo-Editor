-- N3 CORE (FULL DB v2): projects and current editor snapshots.
CREATE TABLE projects (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 owner_id BIGINT NOT NULL, name VARCHAR(150) NOT NULL,
 canvas_width INT NOT NULL DEFAULT 1920, canvas_height INT NOT NULL DEFAULT 1080,
 background VARCHAR(255) NULL, thumbnail_asset_id BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 version BIGINT NOT NULL DEFAULT 0,
 KEY idx_project_owner_updated (owner_id,updated_at),
 CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id),
 CONSTRAINT chk_projects_size CHECK (canvas_width > 0 AND canvas_height > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE editor_states (
 project_id BIGINT NOT NULL PRIMARY KEY,
 schema_version INT NOT NULL DEFAULT 1,
 state_json JSON NOT NULL, state_version BIGINT NOT NULL DEFAULT 1,
 lock_version BIGINT NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_editor_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
 CONSTRAINT chk_editor_schema CHECK (schema_version >= 1),
 CONSTRAINT chk_editor_version CHECK (state_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
