package com.aiphotoeditor.job;

import java.time.Instant;

/** Shared web contract shapes for job receipts and status updates. */
public final class AiJobDtos {
    private AiJobDtos() {}

    /** Function: Response after accepting an async AI request. */
    public record AiJobResponse(long jobId, AiJobStatus status) {}

    /** Function: Return job progress/result metadata from MySQL. */
    public record AiJobView(
            long jobId,
            long projectId,
            String type,
            String provider,
            AiJobStatus status,
            Integer progress,
            String stage,
            Long inputAssetId,
            Long resultAssetId,
            String resultUrl,
            String errorCode,
            String error,
            Instant createdAt,
            Instant startedAt,
            Instant finishedAt
    ) {}

    /** Function: Event payload suitable for N5's SSE adapter. */
    public record AiJobEvent(long jobId, AiJobStatus status,
                             Integer progress, String stage,
                             Long resultAssetId, String resultUrl,
                             String errorCode, String error) {}

    /** Function: Map persisted job entity to compact async receipt. */
    public static AiJobResponse receipt(AiJob job) {
        return new AiJobResponse(job.id, job.status);
    }

    /** Function: Map persisted job to contract view, never leaking raw parameters. */
    public static AiJobView view(AiJob job) {
        return new AiJobView(job.id, job.projectId, job.type, job.provider, job.status,
                job.progress, job.stage, job.inputAssetId, job.resultAssetId,
                job.resultUrl, job.errorCode, job.errorMessage,
                job.createdAt, job.startedAt, job.finishedAt);
    }

    /** Function: Serialize only fields exposed in job-update events. */
    public static AiJobEvent event(AiJob job) {
        return new AiJobEvent(job.id, job.status, job.progress, job.stage,
                job.resultAssetId, job.resultUrl, job.errorCode, job.errorMessage);
    }
}
