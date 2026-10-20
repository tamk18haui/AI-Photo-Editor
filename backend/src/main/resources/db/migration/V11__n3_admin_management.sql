-- Lumina N3 admin module: additive migration. NEVER edit previous V1-V10 scripts.
ALTER TABLE users
  ADD COLUMN account_role VARCHAR(16) NOT NULL DEFAULT 'USER',
  ADD COLUMN account_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN subscription_plan VARCHAR(16) NOT NULL DEFAULT 'FREE',
  ADD COLUMN premium_until DATETIME(3) NULL,
  ADD COLUMN last_login_at DATETIME(3) NULL;

CREATE INDEX idx_users_admin_created ON users (created_at, id);
CREATE INDEX idx_users_admin_role_status ON users (account_role, account_status);

CREATE TABLE admin_audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT NOT NULL,
  target_user_id BIGINT NOT NULL,
  action VARCHAR(40) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_admin_audit_created (created_at, id),
  KEY idx_admin_audit_target (target_user_id, created_at),
  CONSTRAINT fk_admin_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_admin_audit_target FOREIGN KEY (target_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Counts authenticated API requests, NOT unique website visits or image-processing calls.
-- Intentionally does not record IP addresses, request paths, tokens, or prompts.
CREATE TABLE api_traffic_daily (
  day DATE NOT NULL,
  user_id BIGINT NOT NULL,
  request_count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id),
  KEY idx_api_traffic_user_day (user_id, day),
  CONSTRAINT fk_api_traffic_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
