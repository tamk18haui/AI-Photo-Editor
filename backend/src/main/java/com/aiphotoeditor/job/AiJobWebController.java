package com.aiphotoeditor.job;

import jakarta.validation.constraints.Min;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** N5 HTTP adapter over N4's single MySQL-backed job service. All routes require JWT. */
@RestController
@Validated
@RequestMapping("/api/ai/jobs")
public class AiJobWebController {
    public record RetryRequest(boolean paidOperationConfirmed) {}
    private final AiJobService jobs;
    private final AiJobSseAdapter events;

    public AiJobWebController(AiJobService jobs, AiJobSseAdapter events) {
        this.jobs = jobs;
        this.events = events;
    }

    @GetMapping
    public List<AiJobDtos.AiJobView> list(@RequestParam(required = false) Long projectId,
                                            @RequestParam(required = false) AiJobStatus status) {
        return jobs.list(projectId, status);
    }

    @GetMapping("/{jobId}")
    public AiJobDtos.AiJobView get(@PathVariable @Min(1) long jobId) {
        return jobs.get(jobId);
    }

    @PostMapping("/{jobId}/cancel")
    public AiJobDtos.AiJobView cancel(@PathVariable @Min(1) long jobId) {
        return jobs.cancel(jobId);
    }

    @PostMapping("/{jobId}/retry")
    public ResponseEntity<AiJobDtos.AiJobResponse> retry(@PathVariable @Min(1) long jobId,
                                                         @RequestBody(required = false) RetryRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(
                jobs.retry(jobId, request != null && request.paidOperationConfirmed()));
    }

    /** EventSource cannot attach Bearer headers; browser should use fetch + readable stream. */
    @GetMapping(value = "/{jobId}/events", produces = "text/event-stream")
    public SseEmitter events(@PathVariable @Min(1) long jobId) {
        return events.subscribe(jobId);
    }
}
