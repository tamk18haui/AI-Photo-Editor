package com.aiphotoeditor.gemini;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/** Calls Google's native image-editing model directly; never touches N4/Local AI/jobs. */
@Service
public class GeminiImageService {
    private static final int MAX_SOURCE_BYTES = 20 * 1024 * 1024;
    private static final int MAX_RESULT_BYTES = 25 * 1024 * 1024;
    private static final Set<String> ALLOWED_MODELS = Set.of(
            "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image");
    private static final String BASE_URL = "https://generativelanguage.googleapis.com/v1/models/";

    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String apiKey;
    private final String model;

    public GeminiImageService(ObjectMapper mapper,
                              @Value("${GEMINI_API_KEY:}") String apiKey,
                              @Value("${GEMINI_IMAGE_MODEL:gemini-3.1-flash-image}") String model) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build(), apiKey, model);
    }

    GeminiImageService(ObjectMapper mapper, HttpClient http, String apiKey, String model) {
        this.mapper = mapper;
        this.http = http;
        this.apiKey = apiKey;
        this.model = model;
    }

    public record GeminiEditResponse(String mimeType, String imageBase64, String message) { }

    public GeminiEditResponse edit(String prompt, MultipartFile image) {
        String instruction = prompt == null ? "" : prompt.trim();
        if (instruction.isEmpty() || instruction.length() > 1500) {
            throw bad("GEMINI_INVALID_PROMPT", "Prompt must contain 1-1500 characters");
        }
        if (image == null || image.isEmpty() || image.getSize() > MAX_SOURCE_BYTES) {
            throw bad("GEMINI_INVALID_IMAGE", "Image must be between 1 byte and 20 MiB");
        }
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_NOT_CONFIGURED", "Missing server-side GEMINI_API_KEY");
        }
        if (!ALLOWED_MODELS.contains(model)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_INVALID_MODEL", "Unsupported Gemini image model");
        }

        final byte[] bytes;
        try {
            bytes = image.getBytes();
        } catch (IOException e) {
            throw bad("GEMINI_INVALID_IMAGE", "Cannot read image");
        }
        String mime = sniff(bytes);
        if (!mime.equals(image.getContentType())) {
            throw bad("GEMINI_INVALID_IMAGE", "Image MIME type does not match file data");
        }
        try {
            ObjectNode root = mapper.createObjectNode();
            ArrayNode parts = mapper.createArrayNode();
            parts.addObject().put("text", instruction);
            ObjectNode inline = parts.addObject().putObject("inline_data");
            inline.put("mime_type", mime);
            inline.put("data", Base64.getEncoder().encodeToString(bytes));
            root.putArray("contents").addObject().put("role", "user").set("parts", parts);
            root.putObject("generationConfig").putArray("responseModalities").add("TEXT").add("IMAGE");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(BASE_URL + model + ":generateContent"))
                    .timeout(Duration.ofSeconds(150))
                    .header("x-goog-api-key", apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "GEMINI_RATE_LIMIT", "Gemini rate limit reached; try later");
            }
            if (response.statusCode() / 100 != 2) {
                // Do not echo upstream body or API key to the browser.
                throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_UPSTREAM_ERROR",
                        "Gemini request failed (HTTP " + response.statusCode() + ")");
            }
            JsonNode candidates = mapper.readTree(response.body()).path("candidates");
            if (!candidates.isArray()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_NO_IMAGE", "Gemini returned no edited image");
            }
            for (JsonNode candidate : candidates) {
                StringBuilder message = new StringBuilder();
                JsonNode answerParts = candidate.path("content").path("parts");
                if (!answerParts.isArray()) continue;
                String imageData = null;
                String outputMime = null;
                for (JsonNode part : answerParts) {
                    if (part.path("text").isTextual() && message.length() < 1500) {
                        message.append(part.path("text").asText(), 0,
                                Math.min(part.path("text").asText().length(), 1500 - message.length()));
                    }
                    JsonNode imagePart = part.path("inlineData");
                    if (imagePart.isMissingNode()) imagePart = part.path("inline_data");
                    if (imagePart.path("data").isTextual()) {
                        imageData = imagePart.path("data").asText();
                        outputMime = imagePart.path("mimeType").asText(
                                imagePart.path("mime_type").asText(""));
                    }
                }
                if (imageData != null) {
                    byte[] output;
                    try {
                        output = Base64.getDecoder().decode(imageData);
                    } catch (IllegalArgumentException ex) {
                        throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_INVALID_RESULT", "Gemini returned invalid image data");
                    }
                    if (output.length > MAX_RESULT_BYTES || output.length == 0 || !isValidOutput(output, outputMime)) {
                        throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_INVALID_RESULT", "Gemini returned an unsupported image");
                    }
                    return new GeminiEditResponse(outputMime, imageData, message.toString());
                }
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_NO_IMAGE", "Gemini did not return an image; try another prompt");
        } catch (ApiException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "GEMINI_INTERRUPTED", "Gemini request interrupted");
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_NETWORK_ERROR", "Cannot reach Gemini API");
        }
    }

    private static boolean isValidOutput(byte[] bytes, String mime) {
        try { return sniff(bytes).equals(mime); }
        catch (ApiException ignored) { return false; }
    }

    /** Reject mismatched/untrusted image signatures before reaching Gemini. */
    static String sniff(byte[] data) {
        if (data == null || data.length < 12) throw bad("GEMINI_INVALID_IMAGE", "Unsupported image data");
        if ((data[0] & 255) == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71
                && data[4] == 13 && data[5] == 10 && data[6] == 26 && data[7] == 10) return "image/png";
        if ((data[0] & 255) == 255 && (data[1] & 255) == 216 && (data[2] & 255) == 255) return "image/jpeg";
        if (data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
                && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P') return "image/webp";
        throw bad("GEMINI_INVALID_IMAGE", "Only PNG, JPEG and WebP files are supported");
    }

    private static ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }
}
