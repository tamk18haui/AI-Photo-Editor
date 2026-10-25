package com.aiphotoeditor.naturaledit;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Gemini output is untrusted: only predeclared executor/tool/argument combinations are accepted. */
@Component
public class EditPlanValidator {
    public record Step(int order, String executor, String tool, JsonNode arguments) {}
    private static final Map<String, Set<String>> TOOLS = Map.of(
            "FRONTEND", Set.of("CROP", "ROTATE", "FLIP", "ADJUST", "ADD_TEXT",
                    "ADD_STICKER", "ADD_SHAPE", "SET_FILTER", "SET_BACKGROUND", "SET_FRAME"),
            "LOCAL_AI", Set.of("REMOVE_OBJECT", "REMOVE_BACKGROUND", "UPSCALE",
                    "DENOISE", "AUTO_ENHANCE", "FACE_RESTORE", "MAKEUP"),
            "GEMINI_IMAGE", Set.of("GENERATIVE_EDIT", "REMOVE", "REPLACE", "BACKGROUND",
                    "FILL", "EXPAND", "RELIGHT", "HAIRSTYLE"));
    private static final Set<String> ARGUMENTS = Set.of("prompt", "scale", "x", "y", "width", "height",
            "angle", "brightness", "contrast", "saturation", "lux", "blur",
            "temperature", "highlights", "maskAssetId", "backgroundAssetId",
            "text", "color", "fontSize", "fontFamily", "preset", "frame", "shape", "backgroundType",
            "effect", "faceIndex", "intensity", "feather");
    private static final Set<String> FILTERS = Set.of("original","bw","vintage","warm","cool",
            "vivid","soft","dramatic","golden","portrait","peach","cream","blush","fade",
            "street","urban","cinema","night","steel","neon-night","forest",
            "sky","desert","ocean","sunset","spring","film35","matte",
            "retro-blue","sepia","old-photo","mono-soft","pop","ice","dream","moody");
    private static final Set<String> FRAMES = Set.of("none","simple","polaroid","film",
            "minimal","gold","noir","editorial","rounded","double","vintage","neon",
            "pastel","postcard");

    public List<Step> validate(JsonNode proposed) {
        JsonNode raw = proposed != null && proposed.isObject() ? proposed.path("steps") : null;
        if (raw == null || !raw.isArray() || raw.isEmpty() || raw.size() > 8) {
            throw invalid("Plan must contain 1-8 ordered steps");
        }
        List<Step> validated = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            JsonNode item = raw.get(i);
            if (!item.isObject() || !item.path("order").isInt() || item.path("order").asInt() != i + 1) {
                throw invalid("Plan order must be consecutive starting at 1");
            }
            String executor = item.path("executor").asText("");
            String tool = item.path("tool").asText("");
            if (!TOOLS.getOrDefault(executor, Set.of()).contains(tool)) throw invalid("Unknown tool/executor");
            JsonNode args = item.path("arguments");
            if (!args.isObject() || args.size() > 12) throw invalid("Arguments must be a JSON object");
            var iterator = args.fields();
            while (iterator.hasNext()) {
                var entry = iterator.next();
                if (!ARGUMENTS.contains(entry.getKey()) || entry.getValue().isContainerNode()) {
                    throw invalid("Unsupported argument");
                }
            }
            if ("GEMINI_IMAGE".equals(executor)) {
                String prompt = args.path("prompt").asText("").trim();
                if (prompt.isEmpty() || prompt.length() > 1400) throw invalid("Gemini step needs a prompt");
            }
            if ("FRONTEND".equals(executor) && "ADJUST".equals(tool)) {
                for (String name : List.of("brightness", "contrast", "saturation", "lux", "highlights", "blur", "temperature")) {
                    if (!args.has(name)) continue;
                    if (!args.path(name).isNumber() || !Double.isFinite(args.path(name).asDouble()))
                        throw invalid("Invalid adjustment value");
                    double value = args.path(name).asDouble();
                    double min = "temperature".equals(name) ? -100 : 0;
                    double max = "blur".equals(name) ? 20 : "temperature".equals(name) ? 100 : 200;
                    if (value < min || value > max) throw invalid("Adjustment out of supported range");
                }
            }
            if ("FRONTEND".equals(executor)) {
                if (Set.of("ADD_TEXT","ADD_STICKER").contains(tool)) {
                    String value = args.path("text").asText("");
                    if (value.isBlank() || value.length() > 400) throw invalid("Text/sticker content must contain 1-400 characters");
                }
                if ("ADD_SHAPE".equals(tool)
                        && !Set.of("square","rectangle","circle","ellipse").contains(args.path("shape").asText("")))
                    throw invalid("Unsupported shape");
                if ("SET_FILTER".equals(tool)&&!FILTERS.contains(args.path("preset").asText("")))
                    throw invalid("Unknown filter preset");
                if ("SET_FRAME".equals(tool)&&!FRAMES.contains(args.path("frame").asText("")))
                    throw invalid("Unknown frame");
                if ("SET_BACKGROUND".equals(tool)&&!Set.of("color","transparent").contains(args.path("backgroundType").asText("")))
                    throw invalid("Unknown background type");
                if (args.has("color")&&!args.path("color").asText("").matches("#[0-9a-fA-F]{6}"))
                    throw invalid("Color must be a HEX RGB value");
                for (String axis : List.of("x","y","width")) {
                    if (args.has(axis) && (!args.path(axis).isNumber()
                            || !Double.isFinite(args.path(axis).asDouble())
                            || args.path(axis).asDouble() < 0 || args.path(axis).asDouble() > 1))
                        throw invalid("Image/text coordinates must be fractions 0-1");
                }
                if (args.has("fontSize")&&(!args.path("fontSize").isNumber()
                        || args.path("fontSize").asDouble()<10||args.path("fontSize").asDouble()>160))
                    throw invalid("Font size must be 10-160");
            }
            if ("LOCAL_AI".equals(executor) && "UPSCALE".equals(tool)
                    && !Set.of(2, 4).contains(args.path("scale").asInt(-1))) throw invalid("Upscale factor must be 2 or 4");
            if ("LOCAL_AI".equals(executor) && "REMOVE_OBJECT".equals(tool)
                    && (!args.path("maskAssetId").canConvertToLong() || args.path("maskAssetId").asLong() <= 0)) {
                throw invalid("Local object removal requires a real maskAssetId from Selection UI");
            }
            if ("LOCAL_AI".equals(executor) && "MAKEUP".equals(tool)) {
                if (!Set.of("LIPSTICK","LIP_GLOSS","EYESHADOW","EYELINER","EYEBROW_COLOR",
                        "BLUSH","FOUNDATION","SKIN_SMOOTH","HAIR_COLOR","TEETH_WHITEN",
                        "EYE_COLOR","FACE_RELIGHT").contains(args.path("effect").asText("")))
                    throw invalid("Unsupported Local AI makeup effect");
                if (args.has("color")&&!args.path("color").asText("").matches("#[0-9a-fA-F]{6}"))
                    throw invalid("Invalid makeup color");
                if (args.has("faceIndex")&&(!args.path("faceIndex").canConvertToInt()
                        ||args.path("faceIndex").asInt()<0||args.path("faceIndex").asInt()>15))
                    throw invalid("Face index must be 0-15");
                for(String field:List.of("intensity","feather")){
                    if(args.has(field)&&(!args.path(field).isNumber()
                            ||!Double.isFinite(args.path(field).asDouble())
                            ||args.path(field).asDouble()<0||args.path(field).asDouble()>1))
                        throw invalid("Makeup " + field + " must be 0-1");
                }
            }
            validated.add(new Step(i + 1, executor, tool, args.deepCopy()));
        }
        return List.copyOf(validated);
    }

    private static ApiException invalid(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EDIT_PLAN", detail);
    }
}
