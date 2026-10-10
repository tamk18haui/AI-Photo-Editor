package com.aiphotoeditor.job;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.*;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class AiJobDispatcherTest {
    @Test
    void marksJobFailedWhenSourceAssetIsMissing() {
        var jobs = mock(AiJobService.class);
        var assets = mock(AssetService.class);
        var cloudinary = mock(CloudinaryService.class);
        var client = mock(AiRunnerClient.class);
        var dispatcher = new AiJobDispatcher(jobs, assets, cloudinary, client);
        var job = new AiJob();
        job.id = 4L;
        job.projectId = 1L;
        job.createdByUserId = 2L;
        job.inputAssetId = 3L;
        job.type = "UPSCALE";
        when(assets.requireOwned(3L, 2L, 1L)).thenThrow(new IllegalStateException("not found"));
        dispatcher.dispatch(job);
        verify(jobs).fail(eq(4L), eq("AI_PROCESSING_FAILED"), anyString());
        verifyNoInteractions(client);
    }
}
