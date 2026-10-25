package com.aiphotoeditor.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** Create the internal, timeout-bounded HTTP client used by AI Local. */
@Configuration
public class AiRunnerConfig {
    /** Function: Connect only to a specifically configured private Python service. */
    @Bean(name = "aiRunnerRestClient")
    RestClient aiRunnerRestClient(
            @Value("${AI_RUNNER_URL:http://127.0.0.1:8010}") String url,
            @Value("${AI_RUNNER_READ_TIMEOUT_SECONDS:720}") long readTimeoutSeconds) {
        if (readTimeoutSeconds < 30 || readTimeoutSeconds > 3600) {
            throw new IllegalArgumentException("AI_RUNNER_READ_TIMEOUT_SECONDS must be 30..3600");
        }
        var http = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
                .build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(readTimeoutSeconds));
        return RestClient.builder().baseUrl(url).requestFactory(factory).build();
    }
}
