package com.aiphotoeditor.job;

import java.util.Optional;
import org.springframework.stereotype.Component;

/** Thin queue facade over MySQL row claiming. */
@Component
public class AiJobQueue {
    private final AiJobService jobs;

    public AiJobQueue(AiJobService jobs) {
        this.jobs = jobs;
    }

    /** Function: Obtain at most one available local job for execution. */
    public Optional<AiJob> take() {
        return jobs.claim();
    }
}
