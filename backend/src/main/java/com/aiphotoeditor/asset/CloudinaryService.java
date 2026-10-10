package com.aiphotoeditor.asset;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.SortedMap;
import java.util.StringJoiner;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

/** Signed Cloudinary uploads and secure per-project image storage. */
@Service
public class CloudinaryService {
    /** Metadata returned by a successful Cloudinary upload. */
    public record Stored(String publicId, String secureUrl, long bytes,
                         Integer width, Integer height, String format) {}

    private final String cloudName;
    private final String apiKey;
    private final String apiSecret;
    private final RestClient client;
    private final ObjectMapper mapper;

    public CloudinaryService(
            @Value("${CLOUDINARY_CLOUD_NAME:}") String cloudName,
            @Value("${CLOUDINARY_API_KEY:}") String apiKey,
            @Value("${CLOUDINARY_API_SECRET:}") String apiSecret,
            RestClient.Builder builder, ObjectMapper mapper) {
        this.cloudName = cloudName;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.client = builder.build();
        this.mapper = mapper;
    }

    /** Function: Upload real image bytes with a signed server-only Cloudinary request. */
    public Stored upload(byte[] bytes, String filename, long userId,
                         long projectId, AssetType assetType) {
        requireConfigured();
        var parameters = new TreeMap<String, String>();
        parameters.put("timestamp", Long.toString(System.currentTimeMillis() / 1000));
        parameters.put("public_id", UUID.randomUUID().toString());
        parameters.put("folder", "ai-photo-editor/users/" + userId + "/projects/" + projectId +
                        "/" + assetType.name().toLowerCase(Locale.ROOT));
        var fields = new LinkedMultiValueMap<String, Object>();
        parameters.forEach(fields::add);
        fields.add("api_key", apiKey);
        fields.add("signature", signature(parameters));
        fields.add("file", new ByteArrayResource(bytes) {
            @Override public String getFilename() { return "uploaded-image.png"; }
        });
        try {
            String response = client.post()
                    .uri("https://api.cloudinary.com/v1_1/" + cloudName + "/image/upload")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(fields)
                    .retrieve().body(String.class);
            JsonNode json = mapper.readTree(response);
            String id = json.path("public_id").asText("");
            String url = json.path("secure_url").asText("");
            int width = json.path("width").asInt(0);
            int height = json.path("height").asInt(0);
            if (id.isBlank() || !safeUrl(url) || width < 1 || height < 1) {
                throw new IllegalStateException("Invalid Cloudinary response");
            }
            return new Stored(id, url, json.path("bytes").asLong(bytes.length),
                              width, height, json.path("format").asText("png"));
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "CLOUDINARY_UPLOAD_FAILED",
                                   "Cloudinary could not store the image");
        }
    }

    /** Function: Delete a stored Cloudinary resource using a signed server request. */
    public void delete(String publicId) {
        requireConfigured();
        var parameters = new TreeMap<String, String>();
        parameters.put("timestamp", Long.toString(System.currentTimeMillis() / 1000));
        parameters.put("public_id", publicId);
        var fields = new LinkedMultiValueMap<String, String>();
        parameters.forEach(fields::add);
        fields.add("api_key", apiKey);
        fields.add("signature", signature(parameters));
        try {
            String response = client.post()
                    .uri("https://api.cloudinary.com/v1_1/" + cloudName + "/image/destroy")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(fields).retrieve().body(String.class);
            String result = mapper.readTree(response).path("result").asText("");
            if (!"ok".equals(result) && !"not found".equals(result)) {
                throw new IllegalStateException("Cloudinary destroy unsuccessful");
            }
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "CLOUDINARY_DELETE_FAILED",
                                   "Cloudinary could not delete the image");
        }
    }

    /** Function: Download only an owned asset's previously validated Cloudinary URL. */
    public byte[] download(Asset asset) {
        requireConfigured();
        if (!safeUrl(asset.secureUrl)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ASSET_URL", "Invalid stored image URL");
        }
        try {
            byte[] bytes = client.get().uri(asset.secureUrl).retrieve().body(byte[].class);
            if (bytes == null || bytes.length == 0 || bytes.length > 80 * 1024 * 1024) {
                throw new IllegalStateException("Empty or excessive Cloudinary response");
            }
            return bytes;
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "ASSET_DOWNLOAD_FAILED", "Asset is unavailable");
        }
    }

    /** Function: Reject arbitrary hosts, non-HTTPS URLs, user info and unexpected resource paths. */
    public boolean safeUrl(String url) {
        try {
            URI parsed = URI.create(url);
            return "https".equalsIgnoreCase(parsed.getScheme()) &&
                   "res.cloudinary.com".equalsIgnoreCase(parsed.getHost()) &&
                   parsed.getUserInfo() == null && parsed.getPort() == -1 &&
                   parsed.getPath().startsWith("/" + cloudName + "/image/upload/");
        } catch (Exception exception) {
            return false;
        }
    }

    /** Function: Fail closed when credentials are missing; never log secrets. */
    private void requireConfigured() {
        if (cloudName == null || cloudName.isBlank() ||
            apiKey == null || apiKey.isBlank() ||
            apiSecret == null || apiSecret.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "CLOUDINARY_NOT_CONFIGURED",
                                   "Cloudinary credentials are missing");
        }
    }

    /** Function: Build Cloudinary's SHA-1 signature from sorted API parameters. */
    private String signature(SortedMap<String, String> parameters) {
        try {
            var joined = new StringJoiner("&");
            parameters.forEach((key, value) -> joined.add(key + "=" + value));
            byte[] digest = MessageDigest.getInstance("SHA-1")
                    .digest((joined + apiSecret).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot prepare signed Cloudinary request");
        }
    }
}
