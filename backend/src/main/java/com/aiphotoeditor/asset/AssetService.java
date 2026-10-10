package com.aiphotoeditor.asset;

import com.aiphotoeditor.asset.AssetDtos.AssetResponse;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.project.ProjectAccessService;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Secure project asset lifecycle and metadata; file binaries stay on Cloudinary. */
@Service
public class AssetService {
    private static final int MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
    private static final int MAX_RESULT_BYTES = 80 * 1024 * 1024;
    private static final long MAX_IMAGE_PIXELS = 80_000_000L;

    private final AssetRepository repository;
    private final ProjectAccessService projectAccess;
    private final CloudinaryService cloudinary;

    public AssetService(AssetRepository repository, ProjectAccessService projectAccess,
                        CloudinaryService cloudinary) {
        this.repository = repository;
        this.projectAccess = projectAccess;
        this.cloudinary = cloudinary;
    }

    /** Function: List only the authenticated caller's project assets. */
    @Transactional(readOnly = true)
    public List<AssetResponse> list(long projectId, AssetType type) {
        projectAccess.requireMine(projectId);
        var records = type == null
            ? repository.findByProjectIdOrderByCreatedAtDesc(projectId)
            : repository.findByProjectIdAndAssetTypeOrderByCreatedAtDesc(projectId, type);
        return records.stream().map(this::toResponse).toList();
    }

    /** Function: Fetch an asset response with N3's project access policy. */
    @Transactional(readOnly = true)
    public AssetResponse get(long projectId, long assetId) {
        return toResponse(requireMine(projectId, assetId));
    }

    /** Function: Require a matching project for the current user. */
    @Transactional(readOnly = true)
    public Asset requireMine(long projectId, long assetId) {
        projectAccess.requireMine(projectId);
        return repository.findByIdAndProjectId(assetId, projectId).orElseThrow(this::notFound);
    }

    /** Function: Require a project asset for a specific owner (safe for background workers). */
    @Transactional(readOnly = true)
    public Asset requireOwned(long assetId, long userId, Long expectedProjectId) {
        Asset asset = repository.findById(assetId).orElseThrow(this::notFound);
        if (expectedProjectId != null && !expectedProjectId.equals(asset.projectId)) throw notFound();
        projectAccess.requireOwned(asset.projectId, userId);
        return asset;
    }

    /** Function: Validate and upload a user-provided image or mask. */
    public AssetResponse upload(long projectId, MultipartFile file, AssetType type) throws IOException {
        projectAccess.requireMine(projectId);
        if (file == null || file.isEmpty() || file.getSize() > MAX_ORIGINAL_BYTES) {
            throw bad("INVALID_IMAGE", "Image is empty or exceeds 20 MiB");
        }
        String format = sniff(file.getBytes());
        if (!List.of("image/png", "image/jpeg", "image/webp").contains(file.getContentType())) {
            throw bad("INVALID_IMAGE", "Only PNG, JPEG and WebP are accepted");
        }
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase(Locale.ROOT).matches(".*\\.(png|jpe?g|webp)")) {
            throw bad("INVALID_IMAGE", "Invalid file extension");
        }
        if (("webp".equals(format) && !filename.toLowerCase(Locale.ROOT).endsWith("webp")) ||
            ("png".equals(format) && !filename.toLowerCase(Locale.ROOT).endsWith("png")) ||
            ("jpeg".equals(format) && !filename.toLowerCase(Locale.ROOT).matches(".*\\.jpe?g"))) {
            throw bad("INVALID_IMAGE", "Image bytes and extension mismatch");
        }
        return store(projectId, file.getBytes(), filename, type == null ? AssetType.IMAGE : type, null);
    }

    /** Function: Store a current-user asset without overwriting any existing source asset. */
    public AssetResponse store(long projectId, byte[] bytes, String name,
                               AssetType type, Long sourceAssetId) {
        projectAccess.requireMine(projectId);
        return saveInternal(projectId, projectAccess.currentUserId(), bytes, name, type, sourceAssetId);
    }

    /** Function: Store a worker-produced PNG while reusing the original source's project. */
    public Asset storeForJob(long projectId, long userId, byte[] bytes,
                             String name, Long sourceAssetId, AssetType type) {
        projectAccess.requireOwned(projectId, userId);
        var response = saveInternal(projectId, userId, bytes, name, type, sourceAssetId);
        return repository.findById(response.assetId()).orElseThrow(this::notFound);
    }

    /** Function: Upload image and persist Cloudinary metadata, cleaning up if SQL fails. */
    private AssetResponse saveInternal(long projectId, long userId, byte[] bytes,
                                       String name, AssetType type, Long sourceAssetId) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_RESULT_BYTES) {
            throw bad("INVALID_IMAGE", "Image is empty or too large");
        }
        String format = sniff(bytes);
        if (sourceAssetId != null) requireOwned(sourceAssetId, userId, projectId);
        var stored = cloudinary.upload(bytes, name, userId, projectId, type);
        long imagePixels = (long) stored.width() * stored.height();
        if (stored.width() <= 0 || stored.height() <= 0 || imagePixels > MAX_IMAGE_PIXELS) {
            cloudinary.delete(stored.publicId());
            throw bad("INVALID_IMAGE", "Image dimensions are not supported");
        }
        Asset asset = new Asset();
        asset.projectId = projectId;
        asset.cloudinaryPublicId = stored.publicId();
        asset.secureUrl = stored.secureUrl();
        asset.assetType = type;
        asset.originalFileName = name == null ? null : name.substring(0, Math.min(name.length(), 255));
        asset.mimeType = switch (format) {
            case "png" -> "image/png";
            case "jpeg" -> "image/jpeg";
            case "webp" -> "image/webp";
            default -> throw bad("INVALID_IMAGE", "Unsupported format");
        };
        asset.fileSize = stored.bytes();
        asset.width = stored.width();
        asset.height = stored.height();
        asset.format = stored.format();
        asset.derivedFromAssetId = sourceAssetId;
        try {
            return toResponse(repository.saveAndFlush(asset));
        } catch (RuntimeException exception) {
            try { cloudinary.delete(stored.publicId()); } catch (RuntimeException ignored) { }
            throw exception;
        }
    }

    /** Function: Delete only a currently-owned asset and its Cloudinary resource. */
    public void delete(long projectId, long assetId) {
        Asset asset = requireMine(projectId, assetId);
        cloudinary.delete(asset.cloudinaryPublicId);
        repository.delete(asset);
    }

    /** Function: Remove an output asset which finished uploading after its job was cancelled. */
    public void discardForJob(Asset output) {
        cloudinary.delete(output.cloudinaryPublicId);
        repository.delete(output);
    }

    /** Function: Check image file magic bytes instead of trusting caller-provided MIME. */
    private String sniff(byte[] data) {
        if (data == null || data.length < 12) throw bad("INVALID_IMAGE", "Invalid image header");
        if ((data[0] & 255) == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71) return "png";
        if ((data[0] & 255) == 255 && (data[1] & 255) == 216 && (data[2] & 255) == 255) return "jpeg";
        if (data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F' &&
            data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P') return "webp";
        throw bad("INVALID_IMAGE", "Image magic bytes unsupported");
    }

    private AssetResponse toResponse(Asset asset) {
        return new AssetResponse(asset.id, asset.projectId, asset.secureUrl, asset.assetType,
                asset.originalFileName, asset.mimeType, asset.fileSize, asset.width, asset.height, asset.createdAt);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "ASSET_NOT_FOUND", "Asset not found");
    }

    private ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }
}
