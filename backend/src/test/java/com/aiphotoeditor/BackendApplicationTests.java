package com.aiphotoeditor;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Starts the application context with a test-only signing secret.
 * This value must NEVER be used for production JWT signing.
 * The real application still requires JWT_SIGNING_SECRET in its environment.
 */
@SpringBootTest(properties = {
        "app.security.jwt-secret=TEST_ONLY_JWT_KEY_5a3e9e5ad1b74a88815f9dfba62bc311"
})
class BackendApplicationTests {

    @Test
    void contextLoads() {
    }
}
