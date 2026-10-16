package com.aiphotoeditor.ai;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.*;

/** The Spring entry point must accept brush/lasso prompts without legacy points. */
class SmartSelectionServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AiJobService jobs = mock(AiJobService.class);
    private final LocalImageService service = new LocalImageService(
            jobs,
            mock(AssetService.class),
            mock(CloudinaryService.class),
            mock(AiRunnerClient.class),
            mapper);

    @Test
    void acceptsPositiveBrushWithoutLegacyPointArray() throws Exception {
        var params = mapper.readTree("""
            {"positiveBrushStrokes":[[{"x":0.3,"y":0.4},{"x":0.4,"y":0.5}]],
             "outputMode":"MASK_ONLY"}
            """);

        assertDoesNotThrow(() -> service.submit(1L, 2L, AiJobType.SMART_SELECTION, params));
        verify(jobs).create(1L, 2L, AiJobType.SMART_SELECTION, params);
    }

    @Test
    void acceptsLassoWithoutLegacyPointArray() throws Exception {
        var params = mapper.readTree("""
            {"lassoPolygon":[{"x":0.1,"y":0.1},{"x":0.6,"y":0.1},{"x":0.5,"y":0.7}],
             "outputMode":"MASK_ONLY"}
            """);

        assertDoesNotThrow(() -> service.submit(1L, 2L, AiJobType.SMART_SELECTION, params));
        verify(jobs).create(1L, 2L, AiJobType.SMART_SELECTION, params);
    }
}
