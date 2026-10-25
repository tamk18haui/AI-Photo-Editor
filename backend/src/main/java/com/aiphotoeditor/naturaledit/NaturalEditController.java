package com.aiphotoeditor.naturaledit;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Two-stage approval: plan -> explicit execute -> preview -> N3 Apply. */
@RestController
@RequestMapping("/api/natural-edit")
public class NaturalEditController {
    private final NaturalEditService service;
    public NaturalEditController(NaturalEditService service) { this.service = service; }

    public record PlanRequest(@NotNull @Positive Long projectId, @NotNull @Positive Long inputAssetId,
                              @NotNull @PositiveOrZero Long baseStateVersion, @NotBlank @Size(max = 1500) String prompt) {}
    public record ExecuteRequest(@NotNull @Positive Long projectId, @NotNull @Positive Long inputAssetId,
                                 @NotNull @PositiveOrZero Long baseStateVersion, @NotNull JsonNode plan,
                                 boolean confirmed, boolean paidOperationConfirmed,
                                 @NotBlank String idempotencyKey) {}
    public record AdvanceRequest(@NotNull @Positive Integer expectedStep, @Positive Long completedAssetId) {}

    @PostMapping("/plan")
    public NaturalEditService.PlanResponse plan(@Valid @RequestBody PlanRequest request) {
        return service.plan(request.projectId(), request.inputAssetId(), request.baseStateVersion(), request.prompt());
    }

    @PostMapping("/execute")
    public ResponseEntity<NaturalEditService.RunResponse> execute(@Valid @RequestBody ExecuteRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.execute(request.projectId(),
                request.inputAssetId(), request.baseStateVersion(), request.plan(),
                request.confirmed(), request.paidOperationConfirmed(), request.idempotencyKey()));
    }

    @GetMapping("/runs/{runId}")
    public NaturalEditService.RunResponse status(@PathVariable long runId) { return service.status(runId); }

    @PostMapping("/runs/{runId}/cancel")
    public NaturalEditService.RunResponse cancel(@PathVariable long runId) { return service.cancel(runId); }

    @PostMapping("/runs/{runId}/advance")
    public NaturalEditService.RunResponse advance(@PathVariable long runId,
                                                   @Valid @RequestBody AdvanceRequest request) {
        return service.advance(runId, request.expectedStep(), request.completedAssetId());
    }
}
