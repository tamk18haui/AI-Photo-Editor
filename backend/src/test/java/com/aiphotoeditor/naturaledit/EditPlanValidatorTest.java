package com.aiphotoeditor.naturaledit;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class EditPlanValidatorTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final EditPlanValidator validator = new EditPlanValidator();

    @Test void acceptsSequentialMixedPlan() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[
              {"order":1,"executor":"FRONTEND","tool":"CROP","arguments":{"x":0,"y":0,"width":1,"height":1}},
              {"order":2,"executor":"LOCAL_AI","tool":"UPSCALE","arguments":{"scale":2}},
              {"order":3,"executor":"GEMINI_IMAGE","tool":"BACKGROUND","arguments":{"prompt":"Blue sky"}}
            ]}
            """);
        var steps = validator.validate(plan);
        assertEquals(3, steps.size());
        assertEquals("LOCAL_AI", steps.get(1).executor());
    }

    @Test void rejectsUnregisteredTool() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":1,"executor":"LOCAL_AI","tool":"RUN_SHELL","arguments":{}}]}
            """);
        assertEquals("INVALID_EDIT_PLAN", assertThrows(ApiException.class, () -> validator.validate(plan)).getCode());
    }

    @Test void rejectsWrongExecutorEvenIfToolExists() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":1,"executor":"GEMINI_IMAGE","tool":"UPSCALE","arguments":{"scale":4}}]}
            """);
        assertThrows(ApiException.class, () -> validator.validate(plan));
    }

    @Test void rejectsOutOfOrderSteps() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":2,"executor":"FRONTEND","tool":"ROTATE","arguments":{"angle":90}}]}
            """);
        assertThrows(ApiException.class, () -> validator.validate(plan));
    }

    @Test void rejectsUnknownParametersAndNestedJson() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":1,"executor":"FRONTEND","tool":"ADJUST","arguments":{"script":"evil"}}]}
            """);
        assertThrows(ApiException.class, () -> validator.validate(plan));
    }

    @Test void rejectsGeminiWithoutPrompt() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":1,"executor":"GEMINI_IMAGE","tool":"FILL","arguments":{}}]}
            """);
        assertThrows(ApiException.class, () -> validator.validate(plan));
    }
    @Test void refusesLocalRemovalWithoutRealMask() throws Exception {
        var plan = mapper.readTree("""
            {"steps":[{"order":1,"executor":"LOCAL_AI","tool":"REMOVE_OBJECT","arguments":{}}]}
            """);
        assertThrows(ApiException.class, () -> validator.validate(plan));
    }

    @Test void rejectsEmptyAndExcessivePlan() throws Exception {
        assertThrows(ApiException.class, () -> validator.validate(mapper.readTree("{\"steps\":[]}")));
        var many = mapper.createObjectNode();var steps=many.putArray("steps");
        for(int i=1;i<=9;i++)steps.addObject().put("order",i).put("executor","FRONTEND")
                .put("tool","ROTATE").putObject("arguments").put("angle",90);
        assertThrows(ApiException.class, () -> validator.validate(many));
    }
}
