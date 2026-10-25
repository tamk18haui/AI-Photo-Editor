package com.aiphotoeditor.naturaledit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * First-pass, zero-API-cost intent routing for tools already present in the editor.
 * Ambiguous phrases are NOT guessed: caller can ask the text-only planner instead.
 */
@Component
public class LocalCommandPlanner {
    private static final Pattern NUMBER = Pattern.compile("(-?\\d+(?:[.,]\\d+)?)");
    private static final Pattern QUOTED = Pattern.compile("[\\\"“”'‘’]([^\\\"“”'‘’]{1,400})[\\\"“”'‘’]");
    private final ObjectMapper mapper;

    public LocalCommandPlanner(ObjectMapper mapper) { this.mapper = mapper; }

    /** Returns null if any clause cannot be handled confidently without an LLM. */
    public JsonNode plan(String prompt) {
        if (prompt == null || prompt.isBlank()) return null;
        // Split the original phrase so Vietnamese accents and the exact text to insert survive.
        // Do not split decimal commas inside numbers.
        List<String> clauses = splitClauses(prompt);
        ArrayNode steps = mapper.createArrayNode();
        for (String original : clauses) {
            // Literal text in quotes is *content*, not an instruction. E.g. adding
            // the caption "Xóa nền" must not invoke background removal.
            String clause = normalize(QUOTED.matcher(original).replaceAll(" "));
            if (clause.isEmpty()) continue;
            ObjectNode arguments = mapper.createObjectNode();
            String executor;
            String tool;
            if (matches(clause, "nen trong suot", "bo mau nen", "xoa nen mau", "nen mau", "doi mau nen",
                    "doi nen thanh mau", "background color")) {
                executor = "FRONTEND"; tool = "SET_BACKGROUND";
                boolean transparent = matches(clause, "trong suot", "bo mau nen", "xoa nen mau");
                arguments.put("backgroundType", transparent ? "transparent" : "color");
                if (!transparent) arguments.put("color", mentionedColor(clause, "#ffffff"));
            } else if (matches(clause, "xoa nen", "tach nen", "remove background")) {
                executor = "LOCAL_AI"; tool = "REMOVE_BACKGROUND";
            } else if (matches(clause, "to son", "son moi", "son bong", "ma hong",
                    "lam min da", "lam trang rang", "nhuom toc", "doi mau toc",
                    "doi mau mat", "phan mat", "ke mat")) {
                executor = "LOCAL_AI"; tool = "MAKEUP";
                String effect = matches(clause, "son bong") ? "LIP_GLOSS" :
                        matches(clause, "to son", "son moi") ? "LIPSTICK" :
                        matches(clause, "ma hong") ? "BLUSH" :
                        matches(clause, "lam min da") ? "SKIN_SMOOTH" :
                        matches(clause, "lam trang rang") ? "TEETH_WHITEN" :
                        matches(clause, "nhuom toc", "doi mau toc") ? "HAIR_COLOR" :
                        matches(clause, "doi mau mat") ? "EYE_COLOR" :
                        matches(clause, "phan mat") ? "EYESHADOW" : "EYELINER";
                arguments.put("effect", effect);
                arguments.put("intensity", .65);
                arguments.put("faceIndex", 0);
                String makeupColor=mentionedColor(clause,null);
                if(makeupColor!=null)arguments.put("color",makeupColor);
            } else if (matches(clause, "phuc hoi khuon mat", "phuc hoi mat", "face restore")) {
                executor = "LOCAL_AI"; tool = "FACE_RESTORE";
            } else if (matches(clause, "khu nhieu", "giam nhieu", "denoise")) {
                executor = "LOCAL_AI"; tool = "DENOISE";
            } else if (matches(clause, "nang cao chat luong", "cai thien chat luong",
                    "auto enhance", "tu dong toi uu anh")) {
                executor = "LOCAL_AI"; tool = "AUTO_ENHANCE";
            } else if (matches(clause, "lam net", "tang do phan giai", "upscale", "phong to bang ai")) {
                executor = "LOCAL_AI"; tool = "UPSCALE";
                double factor = firstNumber(clause, 2);
                if (factor != 2 && factor != 4) return null;
                arguments.put("scale", (int) factor);
            } else if (matches(clause, "them chu", "chen chu", "viet chu", "them dong chu", "add text")) {
                Matcher quoted = QUOTED.matcher(original);
                if (!quoted.find()) return null; // Never guess the actual typography content.
                executor = "FRONTEND"; tool = "ADD_TEXT";
                arguments.put("text", quoted.group(1));
                arguments.put("color", mentionedColor(clause, "#ffffff"));
            } else if (matches(clause, "them sticker", "chen sticker", "dan sticker", "add sticker")) {
                executor = "FRONTEND"; tool = "ADD_STICKER";
                Matcher quoted = QUOTED.matcher(original);
                if (quoted.find()) arguments.put("text", quoted.group(1));
                else if (clause.contains("trai tim")) arguments.put("text", "❤️");
                else if (clause.contains("ngoi sao")) arguments.put("text", "⭐");
                else return null;
            } else if (matches(clause, "them hinh tron", "hinh tron", "them hinh vuong", "hinh vuong")) {
                executor = "FRONTEND"; tool = "ADD_SHAPE";
                arguments.put("shape", matches(clause, "tron") ? "circle" : "square");
            } else if (matches(clause, "khung polaroid", "khung film", "khung vien",
                    "khung vang", "bo khung", "xoa khung")) {
                executor = "FRONTEND"; tool = "SET_FRAME";
                arguments.put("frame", matches(clause, "xoa khung") ? "none" :
                        matches(clause, "polaroid") ? "polaroid" : matches(clause, "film") ? "film" :
                        matches(clause, "vang") ? "gold" : "simple");
            } else if (matches(clause, "den trang", "vintage", "bo loc", "filter",
                    "phong cach dien anh", "anh am ap", "anh mat me", "ruc ro")) {
                executor = "FRONTEND"; tool = "SET_FILTER";
                String filter = matches(clause, "den trang") ? "bw" : matches(clause, "vintage") ? "vintage" :
                        matches(clause, "dien anh") ? "dramatic" : matches(clause, "am ap") ? "warm" :
                        matches(clause, "mat me") ? "cool" : matches(clause, "ruc ro") ? "vivid" : null;
                if (filter == null) return null;
                arguments.put("preset", filter);
            } else if (matches(clause, "xoay", "rotate")) {
                executor = "FRONTEND"; tool = "ROTATE";
                double angle = firstNumber(clause, 90);
                if (angle < 0 || angle > 360) return null;
                if (matches(clause, "trai", "nguoc chieu", "left")) angle = -angle;
                arguments.put("angle", angle);
            } else if (matches(clause, "lat ngang", "lat anh", "flip horizontal", "flip image")) {
                executor = "FRONTEND"; tool = "FLIP";
            } else if (matches(clause, "lam mo", "blur", "nhiet do mau", "am mau", "lanh mau",
                    "do choi", "highlight", "lux")) {
                executor = "FRONTEND"; tool = "ADJUST";
                if (matches(clause, "lam mo", "blur")) {
                    double value = firstNumber(clause, 3);
                    if (!Double.isFinite(value) || value < 0 || value > 20) return null;
                    arguments.put("blur", value);
                } else if (matches(clause, "nhiet do mau", "am mau", "lanh mau")) {
                    double value = firstNumber(clause, 20);
                    if (matches(clause, "lanh", "giam")) value = -value;
                    if (!Double.isFinite(value) || Math.abs(value) > 100) return null;
                    arguments.put("temperature", value);
                } else {
                    double value = firstNumber(clause, 20);
                    if (!Double.isFinite(value) || value < 0 || value > 200) return null;
                    if (matches(clause, "tang", "giam")) value = 100 + (matches(clause, "giam") ? -value : value);
                    if (value < 0 || value > 200) return null;
                    arguments.put(matches(clause, "lux") ? "lux" : "highlights", value);
                }
            } else if (matches(clause, "tang sang", "giam sang", "do sang", "sang hon",
                    "toi hon", "brightness", "tuong phan", "contrast", "bao hoa", "saturation",
                    "dam mau", "nhat mau")) {
                executor = "FRONTEND"; tool = "ADJUST";
                double amount = firstNumber(clause, 20);
                if (!Double.isFinite(amount) || amount < 0 || amount > 200) return null;
                boolean decrease = matches(clause, "giam", "toi", "nhat");
                double value = matches(clause, "do sang", "brightness", "tuong phan", "contrast",
                        "bao hoa", "saturation") && !matches(clause, "tang", "giam", "hon", "nhat", "dam")
                        ? amount : 100 + (decrease ? -amount : amount);
                if (value < 0 || value > 200) return null;
                if (matches(clause, "tuong phan", "contrast")) arguments.put("contrast", value);
                else if (matches(clause, "bao hoa", "saturation", "dam mau", "nhat mau"))
                    arguments.put("saturation", value);
                else arguments.put("brightness", value);
            } else {
                // Do not silently substitute an expensive generated image for an unknown tool.
                return null;
            }
            int order = steps.size() + 1;

            steps.addObject()
                    .put("order", order)
                    .put("executor", executor)
                    .put("tool", tool)
                    .set("arguments", arguments);
            if (steps.size() > 8) return null;
        }
        if (steps.isEmpty()) return null;
        ObjectNode result = mapper.createObjectNode();
        result.set("steps", steps);
        return result;
    }

    private static String normalize(String raw) {
        return Normalizer.normalize(raw.toLowerCase(java.util.Locale.ROOT).replace('đ', 'd'),
                Normalizer.Form.NFD).replaceAll("\\p{M}+", "").replaceAll("\\s+", " ").trim();
    }

    /** Command separators inside quoted text are content, not additional commands. */
    private static List<String> splitClauses(String prompt) {
        List<int[]> quotes = new ArrayList<>();
        Matcher quoted = QUOTED.matcher(prompt);
        while (quoted.find()) quotes.add(new int[]{quoted.start(), quoted.end()});
        Pattern separators = Pattern.compile("(?i)\\s*(?:,(?!\\d)|;|\\b(?:rồi|sau đó|và|then|and)\\b)\\s*");
        Matcher boundary = separators.matcher(prompt);
        List<String> clauses = new ArrayList<>();
        int start = 0;
        while (boundary.find()) {
            int from = boundary.start(), to = boundary.end();
            boolean insideQuote = quotes.stream().anyMatch(quote -> from >= quote[0] && from < quote[1]);
            if (insideQuote) continue;
            clauses.add(prompt.substring(start, from));
            start = to;
        }
        clauses.add(prompt.substring(start));
        return clauses;
    }
    private static boolean matches(String input, String... phrases) {
        for (String phrase : phrases) if (input.contains(phrase)) return true;
        return false;
    }
    private static double firstNumber(String input, double fallback) {
        Matcher matcher = NUMBER.matcher(input);
        if (!matcher.find()) return fallback;
        try { return Double.parseDouble(matcher.group(1).replace(',', '.')); }
        catch (NumberFormatException exception) { return Double.NaN; }
    }
    private static String mentionedColor(String clause, String fallback) {
        Matcher hex = Pattern.compile("#[0-9a-fA-F]{6}").matcher(clause);
        if (hex.find()) return hex.group();
        if (matches(clause, "mau trang", "chu trang")) return "#ffffff";
        if (matches(clause, "mau den", "chu den")) return "#000000";
        if (matches(clause, "mau do", "chu do", "son do", "toc do")) return "#ef4444";
        if (matches(clause, "mau xanh duong", "chu xanh duong")) return "#3b82f6";
        if (matches(clause, "mau xanh la", "chu xanh la")) return "#22c55e";
        if (matches(clause, "mau vang", "chu vang")) return "#facc15";
        return fallback;
    }
}
