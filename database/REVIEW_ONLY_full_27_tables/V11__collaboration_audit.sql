-- OWNER: N3. EXTENDED.
CREATE TABLE project_invitations (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL, invited_email VARCHAR(254) NOT NULL,
 role VARCHAR(16) NOT NULL, token_hash CHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL,
 accepted_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_project_invite_token (token_hash), KEY idx_invite_project_exp (project_id,expires_at),
 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
 CONSTRAINT chk_invite_role CHECK (role IN ('EDITOR','REVIEWER','VIEWER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE audit_logs (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor_user_id BIGINT NULL, project_id BIGINT NULL,
 entity_type VARCHAR(40) NOT NULL, entity_id BIGINT NULL, action VARCHAR(64) NOT NULL,
 details_json JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_audit_project_created (project_id,created_at),
 FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
