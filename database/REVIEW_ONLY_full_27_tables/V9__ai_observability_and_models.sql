-- OWNER: N4/N5. EXTENDED.
CREATE TABLE ai_model_versions (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, model_key VARCHAR(80) NOT NULL, version_label VARCHAR(90) NOT NULL,
 provider VARCHAR(16) NOT NULL, config_json JSON NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_ai_model_version (model_key,version_label),
 CONSTRAINT chk_ai_model_provider CHECK (provider IN ('LOCAL','GEMINI'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE ai_job_attempts (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, job_id BIGINT NOT NULL, attempt_no INT NOT NULL,
 worker_name VARCHAR(90) NULL, status VARCHAR(20) NOT NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 finished_at DATETIME(3) NULL, error_code VARCHAR(100) NULL,
 UNIQUE KEY uq_ai_job_attempt (job_id,attempt_no), FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE,
 CONSTRAINT chk_ai_attempt_no CHECK (attempt_no >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE ai_job_events (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, job_id BIGINT NOT NULL, event_type VARCHAR(40) NOT NULL,
 payload_json JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_job_event_order (job_id,id), FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE ai_pipeline_steps (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, job_id BIGINT NOT NULL, step_index INT NOT NULL,
 executor VARCHAR(20) NOT NULL, action_type VARCHAR(50) NOT NULL, params_json JSON NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING', result_asset_id BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_ai_step_index (job_id,step_index), FOREIGN KEY (job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE,
 FOREIGN KEY (result_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 CONSTRAINT chk_ai_step_executor CHECK (executor IN ('FRONTEND','LOCAL_AI','GEMINI_IMAGE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
