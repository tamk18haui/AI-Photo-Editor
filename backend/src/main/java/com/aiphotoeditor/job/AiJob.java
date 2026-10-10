package com.aiphotoeditor.job;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Persistent work record shared by Local AI and the web orchestration module. */
@Entity
@Table(name = "ai_jobs")
public class AiJob {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @Column(name = "project_id", nullable = false)
    public Long projectId;

    @Column(name = "created_by_user_id")
    public Long createdByUserId;

    @Column(nullable = false, length = 64)
    public String type;

    @Column(nullable = false, length = 16)
    public String provider;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    public AiJobStatus status;

    public Integer progress;

    @Column(length = 64)
    public String stage;

    @Column(name = "input_asset_id")
    public Long inputAssetId;

    @Column(name = "result_asset_id")
    public Long resultAssetId;

    @Column(name = "result_url", length = 2048)
    public String resultUrl;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params_json", columnDefinition = "json")
    public JsonNode paramsJson;

    @Column(name = "error_code", length = 100)
    public String errorCode;

    @Column(name = "error_message", columnDefinition = "TEXT")
    public String errorMessage;

    @Column(name = "attempt_count", nullable = false)
    public int attemptCount;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "started_at")
    public Instant startedAt;

    @Column(name = "finished_at")
    public Instant finishedAt;

    /** Function: Fill in a creation timestamp before the first INSERT. */
    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
