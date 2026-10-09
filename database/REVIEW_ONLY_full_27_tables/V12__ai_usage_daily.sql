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
