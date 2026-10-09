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
