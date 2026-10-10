package com.aiphotoeditor.asset;

import com.aiphotoeditor.asset.AssetDtos.AssetResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** Public Asset CRUD endpoint owned by the image-storage backend module. */
@RestController
@RequestMapping("/api/projects/{projectId}/assets")
public class AssetController {
    private final AssetService service;

    public AssetController(AssetService service) {
        this.service = service;
    }

    /** Function: Return only assets belonging to the authenticated user's project. */
    @GetMapping
    public List<AssetResponse> list(@PathVariable long projectId,
                                    @RequestParam(required = false) AssetType assetType) {
        return service.list(projectId, assetType);
    }

    /** Function: Validate and upload a project image to Cloudinary through Spring Boot. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AssetResponse> upload(
            @PathVariable long projectId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "IMAGE") AssetType assetType) throws IOException {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.upload(projectId, file, assetType));
    }

    /** Function: Return one asset if it belongs to the caller's project. */
    @GetMapping("/{assetId}")
    public AssetResponse get(@PathVariable long projectId, @PathVariable long assetId) {
        return service.get(projectId, assetId);
    }

    /** Function: Remove a project-owned asset from Cloudinary and metadata storage. */
    @DeleteMapping("/{assetId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long projectId, @PathVariable long assetId) {
        service.delete(projectId, assetId);
    }
}
