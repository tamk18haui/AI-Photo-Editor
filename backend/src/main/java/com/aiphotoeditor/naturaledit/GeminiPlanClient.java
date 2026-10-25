package com.aiphotoeditor.naturaledit;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Text-only Gemini planner. Model-selected actions cannot bypass EditPlanValidator. */
@Service
public class GeminiPlanClient {
    private static final String RULES = "Return only a JSON object: steps:[{order:1,executor,tool,arguments}]. "
            + "CRITICAL: always use FRONTEND or LOCAL_AI for any task those tools can perform; "
            + "never choose GEMINI_IMAGE if a built-in tool is sufficient. Prefer lower-cost actions. "
            + "Compose steps for multi-part commands in the order requested. "
            + "Available FRONTEND tools: CROP (x,y,width,height fractions 0..1), ROTATE (angle), FLIP (horizontal), "
            + "ADJUST (brightness,contrast,saturation,lux,highlights 0..200; temperature -100..100; blur 0..20). "
            + "More FRONTEND tools: ADD_TEXT (text,color optional #RRGGBB, x,y,width fractions 0..1), "
            + "ADD_STICKER (text emoji), ADD_SHAPE (shape square/rectangle/circle/ellipse), "
            + "SET_FILTER (preset original/bw/vintage/warm/cool/vivid/soft/dramatic/golden/portrait), "
            + "SET_BACKGROUND (backgroundType color/transparent, color #RRGGBB), "
            + "SET_FRAME (frame none/simple/polaroid/film/minimal/gold/noir/editorial/rounded/double/vintage/neon/pastel/postcard). "
            + "Available LOCAL_AI tools: REMOVE_OBJECT (real maskAssetId required), REMOVE_BACKGROUND, "
            + "UPSCALE (scale 2 or 4), DENOISE, AUTO_ENHANCE, FACE_RESTORE, "
            + "MAKEUP (effect LIPSTICK/LIP_GLOSS/EYESHADOW/EYELINER/EYEBROW_COLOR/BLUSH/"
            + "FOUNDATION/SKIN_SMOOTH/HAIR_COLOR/TEETH_WHITEN/EYE_COLOR/FACE_RELIGHT, "
            + "color optional #RRGGBB, intensity 0..1, faceIndex 0..15). "
            + "Available GEMINI_IMAGE tools: GENERATIVE_EDIT, REMOVE, REPLACE, BACKGROUND, FILL, EXPAND, RELIGHT, HAIRSTYLE; "
            + "include a detailed prompt argument for Gemini operations. Max 8 steps. "
            + "For unsupported requests return {\"steps\":[]}. Never invent asset IDs/masks or capabilities. User request: ";
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String apiKey;
    private final String model;

    @Autowired
    public GeminiPlanClient(ObjectMapper mapper, @Value("${GEMINI_API_KEY:}") String apiKey,
                            @Value("${GEMINI_TEXT_MODEL:gemini-2.5-flash}") String model) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build(), apiKey, model);
    }
    GeminiPlanClient(ObjectMapper mapper, HttpClient http, String apiKey, String model) {
        this.mapper = mapper; this.http = http; this.apiKey = apiKey; this.model = model;
    }

    public JsonNode plan(String prompt, byte[] currentImage, String mimeType) {
        if (apiKey == null || apiKey.isBlank()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "GEMINI_NOT_CONFIGURED", "Missing server-side Gemini credentials");
        if (!model.matches("[a-zA-Z0-9._-]{3,80}")) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "GEMINI_INVALID_MODEL", "Invalid configured Gemini text model");
        try {
            ObjectNode root = mapper.createObjectNode();
            root.putArray("contents").addObject().put("role", "user").putArray("parts")
                    .addObject().put("text", RULES + prompt);
            if (currentImage != null) {
                if (currentImage.length == 0 || currentImage.length > 20 * 1024 * 1024
                        || !java.util.Set.of("image/jpeg", "image/png", "image/webp").contains(mimeType)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "GEMINI_INVALID_IMAGE", "Invalid planning image");
                }
                ((com.fasterxml.jackson.databind.node.ArrayNode) root.path("contents").path(0).path("parts"))
                        .addObject().putObject("inline_data").put("mime_type", mimeType)
                        .put("data", Base64.getEncoder().encodeToString(currentImage));
            }
            root.putObject("generationConfig").put("responseMimeType", "application/json")
                    .put("temperature", 0);
            var request = HttpRequest.newBuilder()
                    .uri(URI.create("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"))
                    .timeout(Duration.ofSeconds(45)).header("x-goog-api-key", apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root))).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "GEMINI_RATE_LIMIT", "Gemini quota has been reached");
            if (response.statusCode() / 100 != 2) throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "GEMINI_PLAN_UNAVAILABLE", "Gemini could not prepare a plan");
            JsonNode parts = mapper.readTree(response.body()).path("candidates").path(0).path("content").path("parts");
            String text = parts.path(0).path("text").asText("");
            if (text.length() > 16000) throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "GEMINI_INVALID_PLAN", "Gemini returned an oversized plan");
            return mapper.readTree(text);
        } catch (ApiException ex) { throw ex; }
        catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "GEMINI_INTERRUPTED", "Planning interrupted");
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_PLAN_UNAVAILABLE", "Gemini planning unavailable");
        }
    }
}
