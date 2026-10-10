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
    RestClient aiRunnerRestClient(@Value("${AI_RUNNER_URL:http://127.0.0.1:8010}") String url) {
        var http = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
                .build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofMinutes(12));
        return RestClient.builder().baseUrl(url).requestFactory(factory).build();
    }
}
