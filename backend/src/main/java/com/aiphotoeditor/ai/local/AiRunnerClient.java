package com.aiphotoeditor.ai.local;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** Typed transport between Spring Boot and the private Python image processor. */
@Component
public class AiRunnerClient {
    private static final int MAX_RESULT_BYTES = 80 * 1024 * 1024;
    private final RestClient client;
    private final String token;
    private final ObjectMapper mapper;

    public AiRunnerClient(@Qualifier("aiRunnerRestClient") RestClient client,
                          @Value("${AI_RUNNER_TOKEN:}") String token,
                          ObjectMapper mapper) {
        this.client = client;
        this.token = token;
        this.mapper = mapper;
    }

    /** Function: Send source image and optional authorized mask/background to Python. */
    public byte[] process(String operation, byte[] input, JsonNode params,
                          byte[] mask, byte[] background) {
        requireToken();
        if (!Set.of("upscale","remove-background","denoise","auto-enhance","sharpen",
                    "adjust","white-balance","hdr-style","smart-selection","refine-mask","apply-mask","replace-background",
                    "remove-object","inpaint","face-parsing","face-restore")
                    .contains(operation)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,"UNSUPPORTED_OPERATION","Unknown AI operation");
        }
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", resource("source.png", input));
        form.add("params", params == null ? "{}" : params.toString());
        if (mask != null) form.add("mask", resource("mask.png", mask));
        if (background != null) form.add("background", resource("background.png", background));
        try {
            byte[] result = client.post().uri("/v1/run/" + operation)
                    .header("X-Runner-Token", token)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form).retrieve().body(byte[].class);
            if (result == null || result.length == 0 || result.length > MAX_RESULT_BYTES) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_OUTPUT_INVALID", "Empty or oversize AI output");
            }
            return result;
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_RUNNER_UNAVAILABLE", "Cannot reach Python processor");
        }
    }

    /** Function: Return face rectangles without modifying the original image. */
    public JsonNode faces(byte[] input) {
        requireToken();
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", resource("source.png", input));
        try {
            JsonNode result = client.post().uri("/v1/analyze-faces")
                    .header("X-Runner-Token", token)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form).retrieve().body(JsonNode.class);
            if (result == null) throw new IllegalStateException("No face response");
            return result;
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_RUNNER_UNAVAILABLE", "Face analysis unavailable");
        }
    }

    /** Function: Retrieve MediaPipe face landmarks for one project image. */
    public JsonNode landmarks(byte[] input) {
        requireToken();
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", resource("source.png", input));
        try {
            JsonNode result = client.post().uri("/v1/face-landmarks")
                    .header("X-Runner-Token", token)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form).retrieve().body(JsonNode.class);
            if (result == null) throw new IllegalStateException("No landmarks response");
            return result;
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_RUNNER_UNAVAILABLE", "Face landmarks unavailable");
        }
    }

    /** Function: Request quality metrics for an authorized image asset. */
    public JsonNode quality(byte[] input) {
        requireToken();
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", resource("source.png", input));
        try {
            JsonNode result = client.post().uri("/v1/analyze-quality")
                    .header("X-Runner-Token", token)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form).retrieve().body(JsonNode.class);
            if (result == null) throw new IllegalStateException("No quality response");
            return result;
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,"AI_RUNNER_UNAVAILABLE","Quality analysis unavailable");
        }
    }

    /** Function: Wrap images as multipart file data with the correct filename. */
    private ByteArrayResource resource(String filename, byte[] bytes) {
        return new ByteArrayResource(bytes) {
            @Override public String getFilename() { return filename; }
        };
    }

    /** Function: Fail closed if private service token was never configured. */
    private void requireToken() {
        if (token == null || token.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_RUNNER_NOT_CONFIGURED",
                                   "Python runner token is missing");
        }
    }

    /** Function: Preserve a safe error code returned by Python in the job failure record. */
    private ApiException translate(RestClientResponseException exception) {
        String code = "AI_PROCESSING_FAILED";
        try {
            JsonNode body = mapper.readTree(exception.getResponseBodyAsString());
            String reported = body.path("code").asText("");
            if (reported.matches("[A-Z_]{3,80}")) code = reported;
        } catch (Exception ignored) {
            // Client must never return untrusted Python response bodies to users.
        }
        return new ApiException(HttpStatus.BAD_GATEWAY,code,"Python processor error: " + code);
    }
}
