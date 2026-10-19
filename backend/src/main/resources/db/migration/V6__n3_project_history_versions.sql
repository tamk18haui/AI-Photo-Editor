-- N3: Non-destructive project snapshots and edit audit trail.
-- Additive migration only. Do not change the previously applied V1..V5 migrations.
CREATE TABLE project_versions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    created_by_user_id BIGINT NULL,
    label VARCHAR(150) NULL,
    state_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_version_project_created (project_id, created_at, id),
    CONSTRAINT fk_n3_version_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_n3_version_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE edit_histories (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NULL,
    action_type VARCHAR(64) NOT NULL,
    payload_json JSON NULL,
    before_state_ref VARCHAR(255) NULL,
    after_state_ref VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_history_project_created (project_id, created_at, id),
    CONSTRAINT fk_n3_history_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_n3_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
