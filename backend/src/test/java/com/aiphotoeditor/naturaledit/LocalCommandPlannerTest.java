package com.aiphotoeditor.naturaledit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class LocalCommandPlannerTest {
    private final LocalCommandPlanner planner = new LocalCommandPlanner(new ObjectMapper());
    private final EditPlanValidator validator = new EditPlanValidator();

    @Test void executesMultipleExistingToolsWithoutImageApi() {
        var result = planner.plan("Xoay phải 90 độ, tăng sáng 20% rồi làm nét x2");
        assertNotNull(result);
        var steps = validator.validate(result);
        assertEquals(3, steps.size());
        assertEquals("ROTATE", steps.get(0).tool());
        assertEquals(90, steps.get(0).arguments().path("angle").asDouble());
        assertEquals("ADJUST", steps.get(1).tool());
        assertEquals(120, steps.get(1).arguments().path("brightness").asDouble());
        assertEquals("UPSCALE", steps.get(2).tool());
        assertTrue(steps.stream().noneMatch(step -> "GEMINI_IMAGE".equals(step.executor())));
    }

    @Test void handlesLocalRemoveBackground() {
        assertEquals("REMOVE_BACKGROUND",
                validator.validate(planner.plan("Xóa nền ảnh này")).get(0).tool());
    }

    @Test void handlesExistingAdvancedAdjustments() {
        var result = planner.plan("Làm mờ 4, lật ngang và tăng độ chói 15");
        var steps = validator.validate(result);
        assertEquals("ADJUST", steps.get(0).tool());
        assertEquals(4, steps.get(0).arguments().path("blur").asDouble());
        assertEquals("FLIP", steps.get(1).tool());
        assertEquals(115, steps.get(2).arguments().path("highlights").asDouble());
    }

    @Test void neverGuessesGenerativeImageOrInvalidNumbers() {
        assertNull(planner.plan("Thay áo thành vest đen"));
        assertNull(planner.plan("Tăng sáng 900%"));
        assertNull(planner.plan("Xóa người ở góc trái"));
    }

    @Test void keepsAccentAndCaseInEditableTextAndUsesBuiltInFilter() {
        var plan = planner.plan("Thêm chữ \"Chúc mừng sinh nhật\" màu trắng rồi chuyển sang đen trắng");
        var steps = validator.validate(plan);
        assertEquals(2,steps.size());
        assertEquals("ADD_TEXT",steps.get(0).tool());
        assertEquals("Chúc mừng sinh nhật",steps.get(0).arguments().path("text").asText());
        assertEquals("#ffffff",steps.get(0).arguments().path("color").asText());
        assertEquals("SET_FILTER",steps.get(1).tool());
        assertEquals("bw",steps.get(1).arguments().path("preset").asText());
    }

    @Test void quotedTextKeepsCommasAndConjunctions() {
        var plan = planner.plan("Thêm chữ \"Tình yêu, gia đình và bạn bè\" rồi xoay 90 độ");
        var steps = validator.validate(plan);
        assertEquals(2, steps.size());
        assertEquals("Tình yêu, gia đình và bạn bè", steps.get(0).arguments().path("text").asText());
        assertEquals("ROTATE", steps.get(1).tool());
    }

    @Test void quotedCaptionCannotTriggerUnrelatedAiTool() {
        var steps = validator.validate(planner.plan("Thêm chữ \"Xóa nền, làm nét\" màu trắng"));
        assertEquals(1, steps.size());
        assertEquals("FRONTEND", steps.get(0).executor());
        assertEquals("ADD_TEXT", steps.get(0).tool());
        assertEquals("Xóa nền, làm nét", steps.get(0).arguments().path("text").asText());
    }

    @Test void removingCanvasBackgroundIsNotConfusedWithAiBackgroundRemoval() {
        var plan = planner.plan("Bỏ màu nền");
        var steps = validator.validate(plan);
        assertEquals("FRONTEND", steps.get(0).executor());
        assertEquals("SET_BACKGROUND", steps.get(0).tool());
        assertEquals("transparent", steps.get(0).arguments().path("backgroundType").asText());
    }

    @Test void choosesExistingBackgroundAndLocalEnhancementTools() {
        var plan = planner.plan("Đổi nền thành màu đỏ rồi khử nhiễu");
        var steps = validator.validate(plan);
        assertEquals("SET_BACKGROUND", steps.get(0).tool());
        assertEquals("#ef4444", steps.get(0).arguments().path("color").asText());
        assertEquals("DENOISE", steps.get(1).tool());
    }

    @Test void choosesN4MakeupForLipstickWithoutPaidImageGeneration() {
        var plan=planner.plan("Tô son đỏ rồi phục hồi khuôn mặt");
        var steps=validator.validate(plan);
        assertEquals("MAKEUP",steps.get(0).tool());
        assertEquals("LIPSTICK",steps.get(0).arguments().path("effect").asText());
        assertEquals("#ef4444",steps.get(0).arguments().path("color").asText());
        assertEquals("FACE_RESTORE",steps.get(1).tool());
        assertTrue(steps.stream().noneMatch(step->"GEMINI_IMAGE".equals(step.executor())));
    }
}
