package com.aiphotoeditor.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import org.hibernate.proxy.HibernateProxy;
import org.hibernate.proxy.LazyInitializer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceHibernateProxyTest {
    @Test
    void googleReloginMustUnproxyUserBeforeIssuingAccessAndRefreshTokens() {
        User persisted = new User();
        persisted.id = 42L;
        persisted.email = "regression@example.invalid";
        persisted.displayName = "Regression Test";

        User lazyUser = mock(User.class, withSettings().extraInterfaces(HibernateProxy.class));
        LazyInitializer initializer = mock(LazyInitializer.class);
        when(((HibernateProxy) lazyUser).asHibernateProxy()).thenReturn((HibernateProxy) lazyUser);
        when(((HibernateProxy) lazyUser).getHibernateLazyInitializer()).thenReturn(initializer);
        when(initializer.getImplementation()).thenReturn(persisted);

        RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
        TokenService jwt = mock(TokenService.class);
        when(jwt.randomRefreshToken()).thenReturn("test-refresh-token");
        when(jwt.hash("test-refresh-token")).thenReturn("test-hash");
        when(jwt.refreshExpiry()).thenReturn(Instant.now().plus(Duration.ofDays(1)));
        when(jwt.accessTtl()).thenReturn(900L);
        when(jwt.accessToken(persisted)).thenReturn("test-access-token");

        AuthService service = new AuthService(
            mock(UserRepository.class), tokens, mock(PasswordEncoder.class), jwt);
        var result = service.issue(lazyUser);

        assertEquals(42L, result.userId());
        assertEquals("test-access-token", result.accessToken());
        verify(jwt).accessToken(persisted);
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(tokens).save(saved.capture());
        assertSame(persisted, saved.getValue().user);
    }
}