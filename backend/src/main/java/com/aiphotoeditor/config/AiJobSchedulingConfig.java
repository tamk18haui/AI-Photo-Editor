package com.aiphotoeditor.config;

import com.aiphotoeditor.job.AiJobService;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Turn on the existing MySQL-backed job worker and recover interrupted jobs. */
@Configuration
@EnableScheduling
public class AiJobSchedulingConfig {
    private final AiJobService jobs;

    public AiJobSchedulingConfig(AiJobService jobs) {
        this.jobs = jobs;
    }

    /** Function: Return interrupted local jobs to the queue when the app is ready. */
    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        jobs.recover();
    }
}
