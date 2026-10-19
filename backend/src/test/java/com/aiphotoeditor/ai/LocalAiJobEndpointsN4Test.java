package com.aiphotoeditor.ai;

import com.aiphotoeditor.ai.controller.LocalAiController;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobService;
import com.aiphotoeditor.job.AiJobStatus;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** N4 contract tests: local routes never cancel/retry GEMINI jobs. */
class LocalAiJobEndpointsN4Test {
    private static AiJobDtos.AiJobView job(String provider, AiJobStatus status) {
        return new AiJobDtos.AiJobView(31L, 4L, "MAKEUP", provider, status,
                0, status.name(), 12L, null, null, null, null,
                null, null, null);
    }

    @Test
    void cancelLocalDelegatesToAlreadyAuthenticatedService() {
        var jobs = mock(AiJobService.class);
        var controller = new LocalAiController(mock(LocalImageService.class), jobs);
        when(jobs.get(31L)).thenReturn(job("LOCAL", AiJobStatus.RUNNING));
        when(jobs.cancel(31L)).thenReturn(job("LOCAL", AiJobStatus.CANCELLED));
        assertEquals(AiJobStatus.CANCELLED, controller.cancelLocalJob(31L).status());
        verify(jobs).get(31L);
        verify(jobs).cancel(31L);
    }

    @Test
    void retryLocalReturns202AndNewJobId() {
        var jobs = mock(AiJobService.class);
        var controller = new LocalAiController(mock(LocalImageService.class), jobs);
        when(jobs.get(31L)).thenReturn(job("LOCAL", AiJobStatus.FAILED));
        when(jobs.retry(31L)).thenReturn(new AiJobDtos.AiJobResponse(32L, AiJobStatus.QUEUED));
        var response=controller.retryLocalJob(31L);
        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals(32L, response.getBody().jobId());
    }

    @Test
    void getCancelAndRetryCannotTouchGemini() {
        var jobs=mock(AiJobService.class);
        var controller=new LocalAiController(mock(LocalImageService.class),jobs);
        when(jobs.get(31L)).thenReturn(job("GEMINI",AiJobStatus.FAILED));
        assertThrows(ApiException.class, () -> controller.localJob(31L));
        assertThrows(ApiException.class, () -> controller.cancelLocalJob(31L));
        assertThrows(ApiException.class, () -> controller.retryLocalJob(31L));
        verify(jobs,never()).cancel(anyLong());
        verify(jobs,never()).retry(anyLong());
    }

    @Test
    void unauthorizedLookupFailsBeforeAnyMutation() {
        var jobs=mock(AiJobService.class);
        var controller=new LocalAiController(mock(LocalImageService.class),jobs);
        when(jobs.get(31L)).thenThrow(new ApiException(HttpStatus.NOT_FOUND,
                "AI_JOB_NOT_FOUND", "AI job not found"));
        assertThrows(ApiException.class, () -> controller.cancelLocalJob(31L));
        assertThrows(ApiException.class, () -> controller.retryLocalJob(31L));
        verify(jobs,never()).cancel(anyLong());
        verify(jobs,never()).retry(anyLong());
    }
}
