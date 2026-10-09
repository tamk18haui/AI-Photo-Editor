-- FULL 27 TABLES / 12 MIGRATIONS - REVIEW ONLY
-- For FRESH databases only; DO NOT run on an existing Flyway-managed DB.
-- N4/N5 own their sections, obtain approval before applying.
-- CREATE DATABASE separately via database/CREATE_DATABASE_DEV.sql.
USE ai_photo_editor;


-- ============================================================
-- V1__users_oauth_refresh.sql
-- ============================================================
-- N3 CORE (FULL DB v2): clean schema only. Never edit after first Flyway application.
CREATE TABLE users (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(254) NOT NULL, password_hash VARCHAR(255) NULL,
 display_name VARCHAR(100) NULL, avatar_asset_id BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE oauth_accounts (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NOT NULL, provider VARCHAR(20) NOT NULL,
 provider_subject VARCHAR(255) NOT NULL, provider_email VARCHAR(254) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_oauth_provider_subject (provider,provider_subject),
 UNIQUE KEY uq_oauth_user_provider (user_id,provider),
 CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE refresh_tokens (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT NOT NULL, token_hash CHAR(64) NOT NULL,
 expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_refresh_token_hash (token_hash),
 KEY idx_refresh_user_expires (user_id, expires_at),
 CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- V2__projects_editor_states.sql
-- ============================================================
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


-- ============================================================
-- V3__assets_cloudinary.sql
-- ============================================================
-- OWNER: N4; N3 reviews. Review Cloudinary cleanup policy before deploying.
CREATE TABLE assets (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 project_id BIGINT NOT NULL, cloudinary_public_id VARCHAR(512) NOT NULL, secure_url VARCHAR(2048) NOT NULL,
 asset_type VARCHAR(20) NOT NULL, original_file_name VARCHAR(255) NULL, mime_type VARCHAR(100) NOT NULL,
 file_size BIGINT NOT NULL, format VARCHAR(20) NULL, width INT NULL, height INT NULL,
 derived_from_asset_id BIGINT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_assets_public_id (cloudinary_public_id), KEY idx_assets_project_type (project_id,asset_type,created_at),
 CONSTRAINT fk_asset_project FOREIGN KEY (project_id) REFERENCES projects(id),
 CONSTRAINT fk_asset_derived FOREIGN KEY (derived_from_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 CONSTRAINT chk_asset_file_size CHECK (file_size >= 0),
 CONSTRAINT chk_asset_kind CHECK (asset_type IN ('ORIGINAL','IMAGE','MASK','STICKER','AI_OUTPUT','THUMBNAIL','EXPORT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- FK avatar/thumbnail are planned but can obstruct Cloudinary deletion. N4 must approve deletion flow.
ALTER TABLE users ADD CONSTRAINT fk_user_avatar FOREIGN KEY (avatar_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT fk_project_thumbnail FOREIGN KEY (thumbnail_asset_id) REFERENCES assets(id) ON DELETE SET NULL;


-- ============================================================
-- V4__ai_jobs.sql
-- ============================================================
-- OWNER: N4 queue + N5 API/SSE.
CREATE TABLE ai_jobs (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL,
 created_by_user_id BIGINT NULL, type VARCHAR(64) NOT NULL,
 provider VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
 progress SMALLINT NULL, stage VARCHAR(64) NULL,
 input_asset_id BIGINT NULL, result_asset_id BIGINT NULL, result_url VARCHAR(2048) NULL,
 params_json JSON NULL, error_code VARCHAR(100) NULL, error_message TEXT NULL,
 attempt_count INT NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), started_at DATETIME(3) NULL, finished_at DATETIME(3) NULL,
 KEY idx_job_project_created (project_id,created_at), KEY idx_job_status_created (status,created_at),
 FOREIGN KEY (project_id) REFERENCES projects(id),
 FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY (input_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 FOREIGN KEY (result_asset_id) REFERENCES assets(id) ON DELETE SET NULL,
 CONSTRAINT chk_job_status CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
 CONSTRAINT chk_job_provider CHECK (provider IN ('LOCAL','GEMINI')),
 CONSTRAINT chk_job_progress CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
 CONSTRAINT chk_job_attempt CHECK (attempt_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- V5__full_contract_optional_modules.sql
-- ============================================================
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


-- ============================================================
-- V6__preferences_security.sql
-- ============================================================
-- OWNER: N3. EXTENDED; not required by OpenAPI.
CREATE TABLE user_preferences (
 user_id BIGINT NOT NULL PRIMARY KEY, theme VARCHAR(16) NOT NULL DEFAULT 'SYSTEM', locale VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
 autosave_enabled BOOLEAN NOT NULL DEFAULT TRUE, autosave_delay_ms INT NOT NULL DEFAULT 1500,
 editor_preferences_json JSON NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_preferences_delay CHECK (autosave_delay_ms >= 300),
 CONSTRAINT chk_theme CHECK (theme IN ('LIGHT','DARK','SYSTEM'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE auth_security_events (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NULL, event_type VARCHAR(40) NOT NULL,
 client_ip_hash CHAR(64) NULL, user_agent VARCHAR(512) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_security_user_created (user_id,created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- V7__asset_operations.sql
-- ============================================================
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


-- ============================================================
-- V8__natural_edit_persistence.sql
-- ============================================================
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


-- ============================================================
-- V9__ai_observability_and_models.sql
-- ============================================================
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


-- ============================================================
-- V10__presets_notifications.sql
-- ============================================================
-- OWNER: N1/N2/N5. EXTENDED.
CREATE TABLE editor_presets (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, owner_user_id BIGINT NULL, preset_type VARCHAR(40) NOT NULL,
 name VARCHAR(100) NOT NULL, payload_json JSON NOT NULL, is_public BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_preset_user_type (owner_user_id,preset_type), FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE notifications (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, kind VARCHAR(40) NOT NULL,
 title VARCHAR(180) NOT NULL, body TEXT NULL, is_read BOOLEAN NOT NULL DEFAULT FALSE,
 payload_json JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), read_at DATETIME(3) NULL,
 KEY idx_notify_user_read (user_id,is_read,created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- V11__collaboration_audit.sql
-- ============================================================
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


-- ============================================================
-- V12__ai_usage_daily.sql
-- ============================================================
-- OWNER: N5. EXTENDED.
CREATE TABLE ai_usage_daily (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, usage_date DATE NOT NULL,
 provider VARCHAR(16) NOT NULL, model_key VARCHAR(80) NOT NULL, request_count INT NOT NULL DEFAULT 0,
 estimated_cost_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
 UNIQUE KEY uq_usage_user_date_model (user_id,usage_date,provider,model_key),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT chk_usage_count CHECK (request_count >= 0),
 CONSTRAINT chk_usage_provider CHECK (provider IN ('LOCAL','GEMINI'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;