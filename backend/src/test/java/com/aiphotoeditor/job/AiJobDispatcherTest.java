package com.aiphotoeditor.job;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.junit.jupiter.api.Assertions.assertEquals;
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

    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest(name = "Face Parsing {0} -> {1}")
    @CsvSource({
            "OVERLAY,AI_OUTPUT",
            "COLOR,AI_OUTPUT",
            "LABEL_MAP,MASK",
            "BINARY_MASK,MASK",
            "overlay,AI_OUTPUT",
            "binary_mask,MASK"
    })
    void classifiesFaceParsingModes(String outputMode, AssetType expected) {
        ObjectNode params = mapper.createObjectNode().put("outputMode", outputMode);
        assertEquals(expected, AiJobDispatcher.outputAssetType(AiJobType.FACE_PARSING, params));
    }

    @Test
    void faceParsingMissingModeDefaultsToLabelMap() {
        assertEquals(AssetType.MASK, AiJobDispatcher.outputAssetType(AiJobType.FACE_PARSING, null));
        assertEquals(AssetType.MASK, AiJobDispatcher.outputAssetType(
                AiJobType.FACE_PARSING, mapper.createObjectNode()));
    }

    @Test
    void otherMaskProducingOperationsStillHaveCorrectTypes() {
        assertEquals(AssetType.MASK, AiJobDispatcher.outputAssetType(AiJobType.REFINE_MASK, null));
        assertEquals(AssetType.MASK, AiJobDispatcher.outputAssetType(AiJobType.SMART_SELECTION, null));
        assertEquals(AssetType.MASK, AiJobDispatcher.outputAssetType(AiJobType.REMOVE_BACKGROUND,
                mapper.createObjectNode().put("outputMode", "MASK_ONLY")));
        assertEquals(AssetType.AI_OUTPUT, AiJobDispatcher.outputAssetType(AiJobType.REMOVE_BACKGROUND, null));
        assertEquals(AssetType.AI_OUTPUT, AiJobDispatcher.outputAssetType(AiJobType.APPLY_MASK, null));
        assertEquals(AssetType.AI_OUTPUT, AiJobDispatcher.outputAssetType(AiJobType.FACE_RESTORE, null));
    }

    @ParameterizedTest(name = "Dispatch Face Parsing {0} as {1}")
    @CsvSource({
            "OVERLAY,AI_OUTPUT",
            "COLOR,AI_OUTPUT",
            "LABEL_MAP,MASK",
            "BINARY_MASK,MASK"
    })
    void dispatchPersistsCorrectFaceParsingAssetType(String mode, AssetType expected) {
        var jobs = mock(AiJobService.class);
        var assets = mock(AssetService.class);
        var cloudinary = mock(CloudinaryService.class);
        var client = mock(AiRunnerClient.class);
        var dispatcher = new AiJobDispatcher(jobs, assets, cloudinary, client);
        byte[] input = new byte[] {1, 2, 3};
        byte[] output = new byte[] {4, 5, 6};
        var params = mapper.createObjectNode().put("outputMode", mode);
        var source = new Asset();
        source.id = 3L;
        var saved = new Asset();
        saved.id = 9L;
        var running = new AiJob();
        running.status = AiJobStatus.RUNNING;
        var job = new AiJob();
        job.id = 4L;
        job.projectId = 1L;
        job.createdByUserId = 2L;
        job.inputAssetId = 3L;
        job.type = AiJobType.FACE_PARSING.name();
        job.paramsJson = params;

        when(assets.requireOwned(3L, 2L, 1L)).thenReturn(source);
        when(cloudinary.download(source)).thenReturn(input);
        when(client.process(eq("face-parsing"), eq(input), eq(params), isNull(), isNull()))
                .thenReturn(output);
        when(jobs.loadWorker(4L)).thenReturn(running);
        when(assets.storeForJob(eq(1L), eq(2L), eq(output), eq("processed.png"),
                eq(3L), eq(expected))).thenReturn(saved);

        dispatcher.dispatch(job);

        verify(assets).storeForJob(eq(1L), eq(2L), eq(output), eq("processed.png"),
                eq(3L), eq(expected));
        verify(jobs).complete(4L, saved);
        verify(jobs, never()).fail(anyLong(), anyString(), anyString());
    }
}
