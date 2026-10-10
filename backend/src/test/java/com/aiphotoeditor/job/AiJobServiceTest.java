package com.aiphotoeditor.job;

import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.project.ProjectAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class AiJobServiceTest {
    @Test
    void createsOwnedLocalJob() {
        var repository = mock(AiJobRepository.class);
        var access = mock(ProjectAccessService.class);
        var assets = mock(AssetService.class);
        var events = mock(ApplicationEventPublisher.class);
        when(access.currentUserId()).thenReturn(7L);
        when(repository.saveAndFlush(any(AiJob.class))).thenAnswer(call -> {
            AiJob job = call.getArgument(0);
            job.id = 5L;
            return job;
        });
        var service = new AiJobService(repository, access, assets, events);
        var result = service.create(11L, 13L, AiJobType.UPSCALE,
                new ObjectMapper().createObjectNode().put("scale", 2));
        assertEquals(5L, result.jobId());
        assertEquals(AiJobStatus.QUEUED, result.status());
        verify(access).requireMine(11L);
        verify(assets).requireMine(11L, 13L);
    }
}
