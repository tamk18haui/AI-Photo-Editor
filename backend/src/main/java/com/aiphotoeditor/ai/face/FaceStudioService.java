package com.aiphotoeditor.ai.face;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.AssetDtos.AssetResponse;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Reuses N4's existing AssetService/Cloudinary, never writes a second asset table. */
@Service
public class FaceStudioService {
    private static final Set<String> CONTRACT_REGIONS = Set.of(
        "LIPS", "UPPER_LIP", "LOWER_LIP", "HAIR", "LEFT_EYE", "RIGHT_EYE",
        "EYELIDS", "EYEBROWS", "LEFT_EYEBROW", "RIGHT_EYEBROW", "SKIN",
        "FACE", "NOSE", "TEETH", "EARS", "NECK",
        "CHEEKS", "LEFT_CHEEK", "RIGHT_CHEEK",
        "IRIS", "LEFT_IRIS", "RIGHT_IRIS"
    );
    private static final int MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
    private static final int MAX_UNCOMPRESSED_BYTES = 110 * 1024 * 1024;

    private final AssetService assets;
    private final CloudinaryService cloudinary;
    private final AiRunnerClient runner;
    private final ObjectMapper mapper;

    public FaceStudioService(AssetService assets, CloudinaryService cloudinary,
                             AiRunnerClient runner, ObjectMapper mapper) {
        this.assets = assets;
        this.cloudinary = cloudinary;
        this.runner = runner;
        this.mapper = mapper;
    }

    public record FaceAnalysisResponse(long projectId, long assetId, JsonNode faces,
                                       int imageWidth, int imageHeight) {}
    public record FaceRegionMaskItem(String region, long maskAssetId, int width, int height, String url) {}
    public record FaceRegionMaskResponse(long projectId, long assetId, int faceIndex,
                                         List<FaceRegionMaskItem> masks, Long baseRevisionId) {}

    /** Face indexes are sorted left-to-right for this immutable input asset. */
    public FaceAnalysisResponse detect(long projectId, long assetId) {
        var owned = assets.requireMine(projectId, assetId);
        JsonNode raw = runner.faceStudioDetect(cloudinary.download(owned));
        if (!raw.path("faces").isArray() || raw.path("imageWidth").asInt(-1) <= 0 ||
            raw.path("imageHeight").asInt(-1) <= 0) {
            throw invalidOutput("Invalid Face Detect response");
        }
        return new FaceAnalysisResponse(projectId, assetId, raw.get("faces"),
            raw.path("imageWidth").asInt(), raw.path("imageHeight").asInt());
    }

    /** Return hidden MASK assets only; no editor Apply or History mutation. */
    public FaceRegionMaskResponse regions(FaceStudioController.RegionRequest request) {
        String mode = request.outputMode() == null ? "REGION_MASK" : request.outputMode();
        if (!Set.of("REGION_MASK", "LABEL_MAP").contains(mode)) {
            throw bad("INVALID_OUTPUT_MODE", "Unsupported Face Region outputMode");
        }
        List<String> names = request.regions();
        if (names == null || names.isEmpty() || names.size() > CONTRACT_REGIONS.size() ||
            names.stream().anyMatch(s -> s == null || !CONTRACT_REGIONS.contains(s)) ||
            new HashSet<>(names).size() != names.size()) {
            throw bad("UNSUPPORTED_FACE_REGION", "Unsupported or repeated Face Region");
        }
        long projectId = request.projectId();
        long assetId = request.assetId();
        var owned = assets.requireMine(projectId, assetId);
        if (owned.width == null || owned.height == null || owned.width <= 0 || owned.height <= 0) {
            throw bad("INVALID_IMAGE", "Source asset dimensions unavailable");
        }
        byte[] zipBytes = runner.faceStudioRegions(cloudinary.download(owned),
                        request.faceIndex(), names, mode);
        if (zipBytes == null || zipBytes.length > MAX_ARCHIVE_BYTES) {
            throw invalidOutput("Face region archive too large");
        }
        Map<String, byte[]> entries = unzipMasks(zipBytes);
        JsonNode manifest;
        try {
            byte[] json = entries.remove("manifest.json");
            if (json == null || json.length > 32768) throw invalidOutput("Missing mask manifest");
            manifest = mapper.readTree(json);
        } catch (IOException e) {
            throw invalidOutput("Invalid mask manifest JSON");
        }
        if (!"N4_FACE_REGIONS_V1".equals(manifest.path("format").asText()) ||
            manifest.path("faceIndex").asInt(-1) != request.faceIndex() ||
            !mode.equals(manifest.path("outputMode").asText()) ||
            manifest.path("imageWidth").asInt(-1) != owned.width ||
            manifest.path("imageHeight").asInt(-1) != owned.height ||
            !manifest.path("masks").isArray() || manifest.path("masks").size() != names.size()) {
            throw invalidOutput("Face mask metadata does not match source");
        }
        if (entries.size() != names.size()) throw invalidOutput("Unexpected mask entries");
        var generated = new ArrayList<FaceRegionMaskItem>();
        var storedIds = new ArrayList<Long>();
        try {
            for (int i = 0; i < names.size(); i++) {
                JsonNode entry = manifest.path("masks").get(i);
                String region = names.get(i);
                String path = "regions/" + region + ".png";
                if (!region.equals(entry.path("region").asText()) ||
                    !path.equals(entry.path("file").asText()) ||
                    entry.path("width").asInt(-1) != owned.width ||
                    entry.path("height").asInt(-1) != owned.height) {
                    throw invalidOutput("Face mask region mismatch");
                }
                byte[] png = entries.remove(path);
                requireGrayscalePng(png, owned.width, owned.height);
                AssetResponse saved = assets.store(projectId, png,
                    "n4_face_" + request.faceIndex() + "_" + region.toLowerCase() + ".png",
                    AssetType.MASK, assetId);
                storedIds.add(saved.assetId());
                generated.add(new FaceRegionMaskItem(region, saved.assetId(),
                                    owned.width, owned.height, saved.url()));
            }
            if (!entries.isEmpty()) throw invalidOutput("Unexpected extra mask file");
            return new FaceRegionMaskResponse(projectId, assetId,
                            request.faceIndex(), generated, request.baseRevisionId());
        } catch (RuntimeException e) {
            // Cloudinary is not transactionally coupled to MySQL. Best-effort
            // cleanup of only those NEW masks created by this request.
            for (Long id : storedIds) {
                try { assets.delete(projectId, id); } catch (RuntimeException ignored) { }
            }
            throw e;
        }
    }

    private static void requireGrayscalePng(byte[] png, int width, int height) {
        if (png == null || png.length < 12 || png.length > MAX_ARCHIVE_BYTES ||
            (png[0] & 255) != 137 || png[1] != 80 || png[2] != 78 || png[3] != 71) {
            throw invalidOutput("Region mask is not PNG");
        }
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(png));
            if (image == null || image.getWidth() != width || image.getHeight() != height ||
                image.getColorModel().getNumComponents() != 1 ||
                image.getSampleModel().getSampleSize(0) != 8) {
                throw invalidOutput("Mask must be 8-bit grayscale PNG at source dimensions");
            }
        } catch (IOException e) {
            throw invalidOutput("Cannot decode face mask PNG");
        }
    }

    private static Map<String, byte[]> unzipMasks(byte[] zipBytes) {
        var output = new HashMap<String, byte[]>();
        int total = 0;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory() || name == null ||
                    !("manifest.json".equals(name) || name.matches("regions/[A-Z_]+\\.png")) ||
                    output.containsKey(name) || output.size() >= CONTRACT_REGIONS.size() + 1) {
                    throw invalidOutput("Invalid face region ZIP entry");
                }
                var data = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int n;
                while ((n = zip.read(buffer)) != -1) {
                    total += n;
                    if (total > MAX_UNCOMPRESSED_BYTES) throw invalidOutput("Mask archive expanded too large");
                    data.write(buffer, 0, n);
                }
                output.put(name, data.toByteArray());
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw invalidOutput("Invalid face region ZIP archive");
        }
        return output;
    }

    private static ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    }

    private static ApiException invalidOutput(String message) {
        return new ApiException(HttpStatus.BAD_GATEWAY, "FACE_MASK_OUTPUT_INVALID", message);
    }
}
