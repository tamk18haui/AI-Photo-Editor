-- N3 persistent undo/redo cursor: stacks reference immutable project_versions IDs.
-- No changes to V1..V6, or N4 asset/job tables.
CREATE TABLE project_undo_redo (
    project_id BIGINT NOT NULL PRIMARY KEY,
    undo_stack JSON NOT NULL,
    redo_stack JSON NOT NULL,
    lock_version BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_n3_undo_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
