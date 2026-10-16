package com.aiphotoeditor.layer;

import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.history.HistoryDtos.*;
import com.aiphotoeditor.history.HistoryService;
import com.aiphotoeditor.job.AiJob;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobStatus;
import com.aiphotoeditor.layer.AiResultLayerDtos.*;
import com.aiphotoeditor.project.EditorStateEntity;
import com.aiphotoeditor.project.ProjectAccessService;
import com.aiphotoeditor.project.ProjectDtos.SaveStateResponse;
import com.aiphotoeditor.project.ProjectService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Create a NON-DESTRUCTIVE editor layer from a completed N4 job's saved Cloudinary asset.
 * This service does not upload, delete, reparent, or mutate an N4 Asset or AI Job.
 * A DB row lock serializes repeated requests for the same project's EditorState.
 */
@Service
public class AiResultLayerService {
    private final ProjectAccessService access;
    private final ProjectService projects;
    private final AiJobService jobs;
    private final AssetService assets;
    private final HistoryService history;
    private final EntityManager entityManager;
    private final ObjectMapper mapper;

    public AiResultLayerService(ProjectAccessService access, ProjectService projects,
                                AiJobService jobs, AssetService assets, HistoryService history,
                                EntityManager entityManager, ObjectMapper mapper) {
        this.access = access;
        this.projects = projects;
        this.jobs = jobs;
        this.assets = assets;
        this.history = history;
        this.entityManager = entityManager;
        this.mapper = mapper;
    }

    @Transactional
    public AttachAiJobResultResponse attach(long projectId, AttachAiJobResultRequest request) {
        access.requireMine(projectId);
        if (request == null || request.jobId() == null || request.jobId() <= 0) {
            throw bad("Valid AI job ID is required");
        }
        if (request.name() != null && (request.name().isBlank() || request.name().length() > 120)) {
            throw bad("Layer name must be nonblank and at most 120 characters");
        }
        if (request.opacity() != null && (!Double.isFinite(request.opacity())
                || request.opacity() < 0 || request.opacity() > 1)) {
            throw bad("Layer opacity must be between 0 and 1");
        }

        AiJob job = jobs.mine(request.jobId()); // checks auth owner and source project
        if (!Objects.equals(job.projectId, projectId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "AI_JOB_NOT_FOUND", "AI job not found");
        }
        if (job.status != AiJobStatus.COMPLETED || job.resultAssetId == null) {
            throw new ApiException(HttpStatus.CONFLICT, "AI_JOB_NOT_COMPLETED",
                    "AI job must finish with a saved output asset before attaching a layer");
        }
        Asset result = assets.requireMine(projectId, job.resultAssetId);
        if (result.assetType != AssetType.AI_OUTPUT && result.assetType != AssetType.IMAGE) {
            throw bad("Only rendered image results can be attached as image layers");
        }
        if (result.secureUrl == null || !result.secureUrl.startsWith("https://")) {
            throw bad("AI output does not have a secure image URL");
        }

        // Serialize all attach requests on one project's editor state, including retried requests.
        EditorStateEntity stateRow = entityManager.find(EditorStateEntity.class, projectId,
                LockModeType.PESSIMISTIC_WRITE);
        if (stateRow == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "EDITOR_STATE_NOT_FOUND", "Editor state not found");
        }
        JsonNode current = projects.getState(projectId);
        if (!current.isObject() || !current.path("objects").isArray()) {
            throw bad("EditorState does not contain a valid objects array");
        }

        String layerId = "ai-job-" + job.id;
        for (JsonNode existing : current.path("objects")) {
            if (layerId.equals(existing.path("id").asText())
                    || (existing.path("sourceJobId").canConvertToLong()
                        && existing.path("sourceJobId").asLong() == job.id)) {
                if (existing.path("assetId").asLong(-1) != result.id) {
                    throw new ApiException(HttpStatus.CONFLICT, "LAYER_ID_CONFLICT",
                            "The AI job is already linked to a different asset layer");
                }
                return new AttachAiJobResultResponse(projectId, existing.path("id").asText(),
                        result.id, job.id, false, stateRow.stateVersion,
                        null, null, existing.deepCopy());
            }
        }

        // Preserve all existing Fabric properties, selections, user layers, and custom metadata.
        ObjectNode next = (ObjectNode) current.deepCopy();
        ArrayNode objects = (ArrayNode) next.path("objects");
        ObjectNode layer = makeLayer(job, result, request);
        objects.add(layer);

        // All changes share the same SQL transaction: any error rolls back layer + both
        // snapshots + append-only history. The original AI image and layers are untouched.
        ProjectVersion before = history.snapshot(projectId,
                new CreateVersionRequest("Before attaching AI job " + job.id));
        SaveStateResponse saved = projects.saveState(projectId, next);
        ProjectVersion after = history.snapshot(projectId,
                new CreateVersionRequest("After attaching AI job " + job.id));

        ObjectNode payload = mapper.createObjectNode();
        payload.put("jobId", job.id);
        payload.put("assetId", result.id);
        payload.put("layerId", layerId);
        if (job.inputAssetId != null) payload.put("sourceAssetId", job.inputAssetId);
        history.append(projectId, new CreateHistoryItemRequest("AI_RESULT_ADD_LAYER", payload,
                before.versionId().toString(), after.versionId().toString()));

        return new AttachAiJobResultResponse(projectId, layerId, result.id, job.id,
                true, saved.stateVersion(), before.versionId(), after.versionId(), layer.deepCopy());
    }

    private ObjectNode makeLayer(AiJob job, Asset result, AttachAiJobResultRequest request) {
        ObjectNode layer = mapper.createObjectNode();
        layer.put("id", "ai-job-" + job.id);
        layer.put("type", "image");
        layer.put("name", request.name() == null ? "AI - " + job.type : request.name().trim());
        layer.put("assetId", result.id);
        layer.put("src", result.secureUrl);
        layer.put("sourceJobId", job.id);
        if (job.inputAssetId != null) layer.put("sourceAssetId", job.inputAssetId);
        layer.put("visible", request.visible() == null || request.visible());
        layer.put("opacity", request.opacity() == null ? 1.0 : request.opacity());
        layer.put("left", 0);
        layer.put("top", 0);
        layer.put("scaleX", 1.0);
        layer.put("scaleY", 1.0);
        layer.put("angle", 0);
        if (result.width != null && result.width > 0) layer.put("width", result.width);
        if (result.height != null && result.height > 0) layer.put("height", result.height);
        return layer;
    }

    private static ApiException bad(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}
