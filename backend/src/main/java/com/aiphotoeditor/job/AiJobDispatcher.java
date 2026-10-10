package com.aiphotoeditor.job;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

/** Carries a project-owned asset through real Python inference and Cloudinary storage. */
@Component
public class AiJobDispatcher {
    private final AiJobService jobs;
    private final AssetService assets;
    private final CloudinaryService cloudinary;
    private final AiRunnerClient runner;

    public AiJobDispatcher(AiJobService jobs, AssetService assets,
                           CloudinaryService cloudinary, AiRunnerClient runner) {
        this.jobs = jobs;
        this.assets = assets;
        this.cloudinary = cloudinary;
        this.runner = runner;
    }

    /** Function: Process the selected image without overwriting its original asset. */
    public void dispatch(AiJob job) {
        try {
            if (job.inputAssetId == null || job.createdByUserId == null) {
                throw new IllegalStateException("Job source or user missing");
            }
            Asset source = assets.requireOwned(job.inputAssetId, job.createdByUserId, job.projectId);
            byte[] image = cloudinary.download(source);
            byte[] mask = secondary(job, "maskAssetId");
            byte[] background = secondary(job, "backgroundAssetId");
            AiJobType type = AiJobType.valueOf(job.type);
            byte[] result = runner.process(type.runnerOperation(), image, job.paramsJson, mask, background);

            // Cancellation may occur while inference is running: never publish a cancelled result.
            if (jobs.loadWorker(job.id).status != AiJobStatus.RUNNING) return;
            // Face Parsing has four output modes: only LABEL_MAP/BINARY_MASK are masks.
            // COLOR/OVERLAY must be saved as ordinary AI output images for the frontend.
            AssetType outputType = outputAssetType(type, job.paramsJson);
            Asset saved = assets.storeForJob(job.projectId, job.createdByUserId, result,
                    "processed.png", source.id, outputType);
            if (!jobs.complete(job.id, saved)) {
                assets.discardForJob(saved);
            }
        } catch (Exception exception) {
            String code = exception instanceof ApiException api ? api.getCode() : "AI_PROCESSING_FAILED";
            jobs.fail(job.id, code, "Image processing failed (" + code + ")");
        }
    }

    /** Classify the actual PNG returned by Python, not merely the AI job operation name. */
    static AssetType outputAssetType(AiJobType type, JsonNode params) {
        if (type == AiJobType.FACE_PARSING) {
            // Python Face Parsing defaults to LABEL_MAP when outputMode is absent.
            String mode = outputMode(params, "LABEL_MAP");
            return "LABEL_MAP".equalsIgnoreCase(mode) || "BINARY_MASK".equalsIgnoreCase(mode)
                    ? AssetType.MASK : AssetType.AI_OUTPUT;
        }
        if (type == AiJobType.REFINE_MASK) return AssetType.MASK;
        if (type == AiJobType.SMART_SELECTION || type == AiJobType.REMOVE_BACKGROUND) {
            String mode = outputMode(params,
                    type == AiJobType.SMART_SELECTION ? "MASK_ONLY" : "TRANSPARENT");
            return "MASK_ONLY".equalsIgnoreCase(mode) ? AssetType.MASK : AssetType.AI_OUTPUT;
        }
        return AssetType.AI_OUTPUT;
    }

    private static String outputMode(JsonNode params, String fallback) {
        if (params == null || params.isNull()) return fallback;
        return params.path("outputMode").asText(fallback);
    }

    /** Function: Fetch only mask/background asset references already checked against the owner. */
    private byte[] secondary(AiJob job, String key) {
        JsonNode node = job.paramsJson == null ? null : job.paramsJson.get(key);
        if (node == null || node.isNull()) return null;
        if (!node.canConvertToLong() || node.asLong() <= 0) {
            throw new IllegalArgumentException("Invalid secondary asset id");
        }
        Asset attachment = assets.requireOwned(node.asLong(), job.createdByUserId, job.projectId);
        return cloudinary.download(attachment);
    }
}
