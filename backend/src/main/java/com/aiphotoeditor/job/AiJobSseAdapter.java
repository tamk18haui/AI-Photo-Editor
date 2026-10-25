package com.aiphotoeditor.job;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** SSE channel sends only the subscriber's authorized job; polling is always available. */
@Component
public class AiJobSseAdapter {
    private static final long TIMEOUT_MS = 60_000;
    private final AiJobService jobs;
    private final ConcurrentHashMap<Long, Set<SseEmitter>> subscribers = new ConcurrentHashMap<>();

    public AiJobSseAdapter(AiJobService jobs) { this.jobs = jobs; }

    public SseEmitter subscribe(long jobId) {
        AiJobDtos.AiJobView job = jobs.get(jobId); // authorization BEFORE registering emitter
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        subscribers.computeIfAbsent(jobId, ignored -> ConcurrentHashMap.newKeySet()).add(emitter);
        Runnable remove = () -> unregister(jobId, emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(ignored -> remove.run());
        try {
            emitter.send(SseEmitter.event().name("job").data(job));
            if (terminal(job.status())) { remove.run(); emitter.complete(); }
        } catch (IOException e) { remove.run(); emitter.completeWithError(e); }
        return emitter;
    }

    @EventListener
    public void onJobEvent(AiJobDtos.AiJobEvent event) {
        var waiting = subscribers.get(event.jobId());
        if (waiting == null) return;
        for (SseEmitter emitter : Set.copyOf(waiting)) {
            try {
                emitter.send(SseEmitter.event().name("job").data(event));
                if (terminal(event.status())) { unregister(event.jobId(), emitter); emitter.complete(); }
            } catch (Exception ex) { unregister(event.jobId(), emitter); emitter.complete(); }
        }
    }

    private void unregister(long id, SseEmitter emitter) {
        var list = subscribers.get(id);
        if (list == null) return;
        list.remove(emitter);
        if (list.isEmpty()) subscribers.remove(id, list);
    }

    private static boolean terminal(AiJobStatus status) {
        return status == AiJobStatus.COMPLETED || status == AiJobStatus.CANCELLED || status == AiJobStatus.FAILED;
    }
}
