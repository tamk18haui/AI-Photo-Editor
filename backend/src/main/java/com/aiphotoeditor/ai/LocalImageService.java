package com.aiphotoeditor.ai;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Project-owned AI Local business operations: all work runs on existing project assets. */
@Service
public class LocalImageService {
    private final AiJobService jobs;
    private final AssetService assets;
    private final CloudinaryService cloudinary;
    private final AiRunnerClient runner;
    private final ObjectMapper mapper;

    public LocalImageService(AiJobService jobs, AssetService assets,
                             CloudinaryService cloudinary, AiRunnerClient runner,
                             ObjectMapper mapper) {
        this.jobs = jobs;
        this.assets = assets;
        this.cloudinary = cloudinary;
        this.runner = runner;
        this.mapper = mapper;
    }

    /** Function: Create a validated job from the public API contract's image IDs. */
    public AiJobDtos.AiJobResponse submit(long projectId, long assetId,
                                         AiJobType operation, JsonNode params) {
        if (projectId <= 0 || assetId <= 0 || operation == null) throw invalid("Invalid asset or operation");
        JsonNode clean = params == null ? mapper.createObjectNode() : params;
        if (!clean.isObject() || clean.toString().length() > 16384) throw invalid("Invalid job parameters");
        check(operation, clean);
        return jobs.create(projectId, assetId, operation, clean);
    }

    /** Function: Run synchronous quality analysis, matching /ai/analyze-quality response schema. */
    public JsonNode analyze(long projectId, long assetId) {
        var owned = assets.requireMine(projectId, assetId);
        return runner.quality(cloudinary.download(owned));
    }

    /** Function: Get precise Face Landmarker coordinates for a validated project asset. */
    public JsonNode landmarks(long projectId, long assetId) {
        var owned = assets.requireMine(projectId, assetId);
        // N4_FACE_STUDIO_V3: return the canonical faceIndex and dimensions.
        JsonNode raw = runner.faceStudioLandmarks(cloudinary.download(owned));
        if (!raw.path("faces").isArray() || raw.path("imageWidth").asInt(-1) <= 0 ||
            raw.path("imageHeight").asInt(-1) <= 0) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "FACE_LANDMARKS_INVALID",
                                   "Invalid Face Landmarks response");
        }
        ObjectNode dto = mapper.createObjectNode();
        dto.put("projectId", projectId);
        dto.put("assetId", assetId);
        dto.set("faces", raw.get("faces"));
        dto.put("imageWidth", raw.path("imageWidth").asInt());
        dto.put("imageHeight", raw.path("imageHeight").asInt());
        return dto;
    }

    /** Function: Detect face rectangles for the requested owned project image. */
    public JsonNode detectFaces(long projectId, long assetId) {
        var owned = assets.requireMine(projectId, assetId);
        return runner.faces(cloudinary.download(owned));
    }

    /** Function: Upscale request with exact contract fields. */
    public AiJobDtos.AiJobResponse upscale(long projectId, long assetId, int scale, Integer tileSize) {
        return upscale(projectId, assetId, scale, tileSize, null);
    }

    /** Fast x4 uses SRVGGNetCompact, quality uses the existing RRDBNet checkpoint. */
    public AiJobDtos.AiJobResponse upscale(long projectId, long assetId, int scale,
                                          Integer tileSize, String model) {
        ObjectNode params = mapper.createObjectNode().put("scale", scale);
        if (tileSize != null) params.put("tileSize", tileSize);
        if (model != null) params.put("model", model);
        return submit(projectId, assetId, AiJobType.UPSCALE, params);
    }

    /** Function: Background-removal request with the contract's outputMode. */
    public AiJobDtos.AiJobResponse removeBackground(long projectId, long assetId,
                                                    String outputMode, String backgroundColor) {
        ObjectNode params = mapper.createObjectNode().put("outputMode", outputMode == null ? "TRANSPARENT" : outputMode);
        if (backgroundColor != null) params.put("backgroundColor", backgroundColor);
        return submit(projectId, assetId, AiJobType.REMOVE_BACKGROUND, params);
    }

    /** Function: Prepare a denoise operation. */
    public AiJobDtos.AiJobResponse denoise(long projectId, long assetId, String strength) {
        return submit(projectId, assetId, AiJobType.DENOISE,
                      mapper.createObjectNode().put("strength", strength == null ? "MEDIUM" : strength));
    }

    /** Function: Prepare a local Auto Enhance operation. */
    public AiJobDtos.AiJobResponse autoEnhance(long projectId, long assetId, String mode,
                                              Boolean previewOnly) {
        if (Boolean.TRUE.equals(previewOnly)) {
            throw invalid("previewOnly requires a separate plan/preview response agreed in API contract");
        }
        return submit(projectId, assetId, AiJobType.AUTO_ENHANCE,
                      mapper.createObjectNode().put("mode", mode == null ? "AUTO" : mode));
    }

    /** Function: Prepare a face restoration operation. */
    public AiJobDtos.AiJobResponse faceRestore(long projectId, long assetId, double fidelity) {
        return submit(projectId, assetId, AiJobType.FACE_RESTORE,
                      mapper.createObjectNode().put("fidelity", fidelity));
    }

    /** Function: Validate high-value parameters before enqueuing a costly AI job. */
    private void check(AiJobType operation, JsonNode params) {
        switch (operation) {
            case UPSCALE -> {
                int scale = params.path("scale").asInt(-1);
                if (!Set.of(2, 4).contains(scale)) throw invalid("scale must be 2 or 4");
                int tile = params.path("tileSize").asInt(0);
                if (tile < 0 || tile > 2048) throw invalid("tileSize out of range");
                String model = params.path("model").asText("quality");
                if (!Set.of("quality", "fast").contains(model) || (scale != 4 && model.equals("fast"))) {
                    throw invalid("model must be quality or fast (x4 only)");
                }
            }
            case REMOVE_BACKGROUND -> {
                String mode = params.path("outputMode").asText("TRANSPARENT");
                if (!Set.of("TRANSPARENT", "WHITE", "COLOR", "MASK_ONLY").contains(mode)) throw invalid("Invalid outputMode");
                if (mode.equals("COLOR") && !params.path("backgroundColor").asText("").matches("#[0-9A-Fa-f]{6}")) {
                    throw invalid("Invalid backgroundColor");
                }
            }
            case DENOISE -> {
                if (!Set.of("LOW", "MEDIUM", "HIGH").contains(params.path("strength").asText("MEDIUM"))) throw invalid("Invalid strength");
            }
            case AUTO_ENHANCE -> {
                if (!Set.of("AUTO","PORTRAIT","LANDSCAPE","DOCUMENT").contains(params.path("mode").asText("AUTO"))) {
                    throw invalid("Invalid enhance mode");
                }
            }
            case SMART_SELECTION -> {
                boolean hasPointPrompt = params.path("points").isArray() && !params.path("points").isEmpty();
                boolean hasPositiveBrush = params.path("positiveBrushStrokes").isArray() && !params.path("positiveBrushStrokes").isEmpty();
                boolean hasNegativeBrush = params.path("negativeBrushStrokes").isArray() && !params.path("negativeBrushStrokes").isEmpty();
                boolean hasLassoPrompt = params.path("lassoPolygon").isArray() && params.path("lassoPolygon").size() >= 3;
                boolean hasBoxPrompt = !params.path("box").isMissingNode() ||
                        (params.path("boxes").isArray() && !params.path("boxes").isEmpty());
                if (!(hasPointPrompt || hasPositiveBrush || hasNegativeBrush || hasLassoPrompt || hasBoxPrompt)) {
                    throw invalid("Selection points, brush strokes, lasso or box required");
                }
            }
            case REMOVE_OBJECT, INPAINT, REFINE_MASK, APPLY_MASK -> {
                if (!params.path("maskAssetId").canConvertToLong()) throw invalid("maskAssetId is required");
            }
            case FACE_RESTORE -> {
                double fidelity = params.path("fidelity").asDouble(-1);
                if (fidelity < 0 || fidelity > 1) throw invalid("fidelity out of range");
            }
            default -> { /* Python performs operation-specific bounds validation. */ }
        }
    }

    private ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", detail);
    }
}
