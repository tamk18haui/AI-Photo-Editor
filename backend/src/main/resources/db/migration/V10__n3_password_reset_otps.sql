-- N3 OTP 6-digit recovery. Append-only: never edit Flyway V1..V9.
CREATE TABLE password_reset_otps (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    nonce CHAR(32) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_password_reset_otp_user_created (user_id, created_at),
    KEY idx_password_reset_otp_expiry (expires_at),
    CONSTRAINT fk_password_reset_otp_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
