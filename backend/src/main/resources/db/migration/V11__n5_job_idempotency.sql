-- One durable request key per user/project. NULL allows legacy Local AI jobs.
ALTER TABLE ai_jobs ADD COLUMN idempotency_key VARCHAR(120) NULL;
CREATE UNIQUE INDEX uq_ai_jobs_idempotent_request
    ON ai_jobs (created_by_user_id, project_id, idempotency_key);
