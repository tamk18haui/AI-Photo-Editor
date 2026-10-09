-- OWNER: N5. EXTENDED.
CREATE TABLE natural_edit_plans (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, plan_id VARCHAR(100) NOT NULL, project_id BIGINT NOT NULL,
 created_by_user_id BIGINT NOT NULL, input_asset_id BIGINT NULL, prompt_text TEXT NULL, plan_json JSON NOT NULL,
 validation_status VARCHAR(20) NOT NULL DEFAULT 'VALID', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_edit_plan_public_id (plan_id), KEY idx_edit_plan_project (project_id,created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id), FOREIGN KEY (created_by_user_id) REFERENCES users(id),
 FOREIGN KEY (input_asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE natural_edit_executions (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, plan_id BIGINT NOT NULL, requested_by_user_id BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING', frontend_actions_json JSON NULL,
 started_at DATETIME(3) NULL, finished_at DATETIME(3) NULL,
 KEY idx_edit_exec_plan_started (plan_id,started_at),
 FOREIGN KEY (plan_id) REFERENCES natural_edit_plans(id), FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
