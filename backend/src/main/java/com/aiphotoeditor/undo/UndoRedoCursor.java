package com.aiphotoeditor.undo;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Per-project cursor stacks of immutable ProjectVersion IDs (never image binaries). */
@Entity
@Table(name = "project_undo_redo")
public class UndoRedoCursor {
    @Id
    @Column(name = "project_id")
    public Long projectId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "undo_stack", nullable = false, columnDefinition = "json")
    public JsonNode undoStack;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "redo_stack", nullable = false, columnDefinition = "json")
    public JsonNode redoStack;

    @Version
    @Column(name = "lock_version", nullable = false)
    public Long lockVersion;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @PrePersist
    @PreUpdate
    void stamp() { updatedAt = Instant.now(); }
}
