package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {
    @Mock UserRepository users;
    @Mock PasswordResetTokenRepository resetTokens;
    @Mock RefreshTokenRepository refreshTokens;
    @Mock PasswordEncoder encoder;
    @Mock TokenService tokenService;
    @Mock ObjectProvider<JavaMailSender> mailSenders;
    @Mock JavaMailSender mailSender;

    private PasswordResetService service;
    private User user;

    @BeforeEach
    void setup() {
        service = new PasswordResetService(users, resetTokens, refreshTokens, encoder,
                tokenService, mailSenders, true, 20, "http://localhost:5173", "test@example.org");
        user = new User();
        user.id = 7L;
        user.email = "person@example.com";
        user.passwordHash = "$2a$12$abc";
    }

    @Test
    void forgotPasswordNormalizesEmailAndSendsLinkButPersistsOnlyHash() {
        when(mailSenders.getIfAvailable()).thenReturn(mailSender);
        when(users.findByEmailIgnoreCase("person@example.com")).thenReturn(Optional.of(user));
        when(tokenService.randomRefreshToken()).thenReturn("the-random-secret");
        when(tokenService.hash("the-random-secret")).thenReturn("hashed-token");
        service.requestReset(" PERSON@EXAMPLE.COM ");
        var saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(resetTokens).save(saved.capture());
        assertEquals("hashed-token", saved.getValue().tokenHash);
        assertNotEquals("the-random-secret", saved.getValue().tokenHash);
        var mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(mail.capture());
        assertTrue(mail.getValue().getText().contains("/reset-password?token=the-random-secret"));
    }

    @Test
    void unknownEmailReturnsWithoutSending() {
        when(mailSenders.getIfAvailable()).thenReturn(mailSender);
        when(users.findByEmailIgnoreCase("missing@example.com")).thenReturn(Optional.empty());
        assertDoesNotThrow(() -> service.requestReset("missing@example.com"));
        verifyNoInteractions(resetTokens, tokenService, mailSender);
    }

    @Test
    void validTokenChangesPasswordAndRevokesSessions() {
        var entry = new PasswordResetToken();
        entry.user = user;
        entry.tokenHash = "sha256";
        entry.expiresAt = Instant.now().plusSeconds(600);
        when(tokenService.hash("raw")).thenReturn("sha256");
        when(resetTokens.findForUpdate("sha256")).thenReturn(Optional.of(entry));
        when(encoder.encode("NewPassword123!")).thenReturn("new-bcrypt-hash");
        service.resetPassword("raw", "NewPassword123!");
        assertEquals("new-bcrypt-hash", user.passwordHash);
        verify(resetTokens).invalidateUnusedForUser(eq(7L), any(Instant.class));
        verify(refreshTokens).revokeAll(eq(7L), any(Instant.class));
    }

    @Test
    void expiredTokenRejected() {
        var entry = new PasswordResetToken();
        entry.user = user;
        entry.expiresAt = Instant.now().minusSeconds(1);
        when(tokenService.hash("expired")).thenReturn("expired-hash");
        when(resetTokens.findForUpdate("expired-hash")).thenReturn(Optional.of(entry));
        assertThrows(ApiException.class, () -> service.resetPassword("expired", "NewPassword123!"));
        verifyNoInteractions(encoder, refreshTokens);
    }

    @Test
    void usedTokenRejected() {
        var entry = new PasswordResetToken();
        entry.user = user;
        entry.expiresAt = Instant.now().plusSeconds(1000);
        entry.usedAt = Instant.now();
        when(tokenService.hash("used")).thenReturn("used-hash");
        when(resetTokens.findForUpdate("used-hash")).thenReturn(Optional.of(entry));
        assertThrows(ApiException.class, () -> service.resetPassword("used", "NewPassword123!"));
    }
}
