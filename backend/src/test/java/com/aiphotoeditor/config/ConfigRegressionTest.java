package com.aiphotoeditor.config;

import com.aiphotoeditor.auth.RefreshToken;
import jakarta.persistence.Column;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ConfigRegressionTest {
    @Test
    void refreshHashMappingMatchesTheAppliedFlywayCharColumn() throws Exception {
        var hash = RefreshToken.class.getDeclaredField("tokenHash");
        assertEquals(SqlTypes.CHAR, hash.getAnnotation(JdbcTypeCode.class).value());
        assertEquals("token_hash", hash.getAnnotation(Column.class).name());
        assertEquals(64, hash.getAnnotation(Column.class).length());
    }

    @Test
    void productionJwtKeyFailsClosedWhenTooShort() {
        var security = new SecurityConfig();
        assertThrows(IllegalStateException.class, () -> security.secretKey("short"));
        assertTrue(security.secretKey("some-nonproduction-test-secret-over-32-bytes")
                .getEncoded().length >= 32);
    }
}
