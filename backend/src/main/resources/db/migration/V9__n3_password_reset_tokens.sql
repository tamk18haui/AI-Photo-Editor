-- N3 Auth extension. Append-only migration: do not edit V1..V8 already applied.
CREATE TABLE password_reset_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_password_reset_token_hash (token_hash),
    KEY idx_password_reset_user_created (user_id, created_at),
    KEY idx_password_reset_expires_at (expires_at),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
