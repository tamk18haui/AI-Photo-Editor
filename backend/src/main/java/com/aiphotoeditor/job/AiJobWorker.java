package com.aiphotoeditor.job;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Polls the persistent queue; no Redis/Kafka required for the local worker. */
@Component
public class AiJobWorker {
    private final AiJobQueue queue;
    private final AiJobDispatcher dispatcher;

    public AiJobWorker(AiJobQueue queue, AiJobDispatcher dispatcher) {
        this.queue = queue;
        this.dispatcher = dispatcher;
    }

    /** Function: Process the next queued job without blocking the HTTP request thread. */
    @Scheduled(fixedDelayString = "${AI_JOB_POLL_DELAY_MS:1500}")
    public void poll() {
        queue.take().ifPresent(dispatcher::dispatch);
    }
}
