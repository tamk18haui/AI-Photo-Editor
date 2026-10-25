package com.aiphotoeditor.ai;

import com.aiphotoeditor.ai.controller.LocalAiController;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class LocalAiControllerTest {

    @Test
    void fastUpscalePassesModelAndTileIntoJob() {
        var images = mock(LocalImageService.class);
        var controller = new LocalAiController(images, mock(AiJobService.class));
        var receipt = new AiJobDtos.AiJobResponse(42L, AiJobStatus.QUEUED);
        when(images.upscale(12L, 34L, 4, 256, "fast")).thenReturn(receipt);

        var response = controller.upscale(
                new LocalAiController.UpscaleRequest(12L, 34L, 4, 256, "fast"));

        assertEquals(202, response.getStatusCode().value());
        assertSame(receipt, response.getBody());
        verify(images).upscale(12L, 34L, 4, 256, "fast");
    }

    @Test
    void analyzeFacesDelegatesToOwnedLocalImageService() {
        var images = mock(LocalImageService.class);
        var jobs = mock(AiJobService.class);
        var controller = new LocalAiController(images, jobs);

        var expected = new ObjectMapper()
                .createObjectNode()
                .put("faceCount", 1);

        when(images.detectFaces(12L, 34L))
                .thenReturn(expected);

        var result = controller.analyzeFaces(
                new LocalAiController.ImageRequest(12L, 34L));

        assertSame(expected, result);
        verify(images).detectFaces(12L, 34L);
        verifyNoInteractions(jobs);
    }
}
