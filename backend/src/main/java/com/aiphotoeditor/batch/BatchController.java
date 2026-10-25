package com.aiphotoeditor.batch;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/batches")
public class BatchController {
    private final BatchOrchestrator batches;
    public BatchController(BatchOrchestrator batches) { this.batches = batches; }

    public record BatchRequest(@NotNull @Positive Long projectId,
                               @NotBlank String idempotencyKey,
                               boolean paidOperationConfirmed,
                              @NotEmpty @Size(max = 8) @Valid List<BatchOrchestrator.Item> items) {}

    @PostMapping
    public ResponseEntity<BatchOrchestrator.BatchView> create(@Valid @RequestBody BatchRequest request) {
        if (!request.paidOperationConfirmed()) throw new com.aiphotoeditor.common.ApiException(
                HttpStatus.PAYMENT_REQUIRED, "GEMINI_IMAGE_CONFIRMATION_REQUIRED",
                "Batch Gemini image operations require cost confirmation");
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(
                batches.create(request.projectId(), request.idempotencyKey(), request.items()));
    }

    @GetMapping("/{batchId}")
    public BatchOrchestrator.BatchView status(@PathVariable long batchId) { return batches.status(batchId); }

    @PostMapping("/{batchId}/cancel")
    public BatchOrchestrator.BatchView cancel(@PathVariable long batchId) { return batches.cancel(batchId); }
}
