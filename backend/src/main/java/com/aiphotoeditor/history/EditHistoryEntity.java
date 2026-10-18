package com.aiphotoeditor.history;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Append-only audit entry. AI results stay as independent project assets. */
@Entity
@Table(name = "edit_histories")
public class EditHistoryEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "project_id", nullable = false)
    public Long projectId;

    @Column(name = "user_id")
    public Long userId;

    @Column(name = "action_type", nullable = false, length = 64)
    public String actionType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload_json", columnDefinition = "json")
    public JsonNode payloadJson;

    @Column(name = "before_state_ref", length = 255)
    public String beforeStateRef;

    @Column(name = "after_state_ref", length = 255)
    public String afterStateRef;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
