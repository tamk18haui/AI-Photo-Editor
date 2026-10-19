package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
class PasswordResetOtpServiceTest {
    @Mock UserRepository users;
    @Mock PasswordResetOtpRepository otps;
    @Mock PasswordResetTokenRepository legacy;
    @Mock RefreshTokenRepository refresh;
    @Mock PasswordEncoder encoder;
    @Mock ObjectProvider<JavaMailSender> providers;
    @Mock JavaMailSender sender;
    PasswordResetOtpService service;
    User user;
    final String pepper = "TEST_OTP_PEPPER_123456789012345678901234567890abc";

    @BeforeEach
    void setup() {
        service = new PasswordResetOtpService(users, otps, legacy, refresh, encoder,
                providers, true, "sender@example.org", pepper);
        user = new User();
        user.id = 3L;
        user.email = "member@example.org";
        user.passwordHash = "old-bcrypt-hash";
    }

    @Test
    void unknownEmailIsAcceptedWithoutSending() {
        when(providers.getIfAvailable()).thenReturn(sender);
        when(users.findByEmailIgnoreCase("unknown@example.org")).thenReturn(Optional.empty());
        assertDoesNotThrow(() -> service.requestOtp("UNKNOWN@example.org"));
        verifyNoInteractions(otps, sender);
    }

    @Test
    void sendsSixDigitOtpButStoresOnlyHmac() {
        when(providers.getIfAvailable()).thenReturn(sender);
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        service.requestOtp(" MEMBER@EXAMPLE.ORG ");
        var saved = ArgumentCaptor.forClass(PasswordResetOtp.class);
        verify(otps).save(saved.capture());
        var sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        var matcher = Pattern.compile("(?<![0-9])[0-9]{6}(?![0-9])").matcher(sent.getValue().getText());
        assertTrue(matcher.find());
        assertEquals(64, saved.getValue().codeHash.length());
        assertNotEquals(matcher.group(), saved.getValue().codeHash);
        assertEquals(32, saved.getValue().nonce.length());
        assertTrue(saved.getValue().expiresAt.isAfter(Instant.now().plusSeconds(280)));
    }

    @Test
    void verifiesCodeAndRevokesSessionsAfterReset() {
        when(providers.getIfAvailable()).thenReturn(sender);
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        service.requestOtp("member@example.org");
        var saved = ArgumentCaptor.forClass(PasswordResetOtp.class);
        verify(otps).save(saved.capture());
        var sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        Matcher m = Pattern.compile("(?<![0-9])[0-9]{6}(?![0-9])").matcher(sent.getValue().getText());
        assertTrue(m.find());
        String actualCode = m.group();
        when(otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(3L)).thenReturn(Optional.of(saved.getValue()));
        when(encoder.encode("passwordNEW123")).thenReturn("new-hash");
        assertTrue(service.resetUsingOtp("member@example.org", actualCode, "passwordNEW123"));
        assertEquals("new-hash", user.passwordHash);
        assertNotNull(saved.getValue().usedAt);
        verify(refresh).revokeAll(eq(3L), any(Instant.class));
        verify(legacy).invalidateUnusedForUser(eq(3L), any(Instant.class));
        assertFalse(service.resetUsingOtp("member@example.org", actualCode, "passwordNEW123"));
    }

    @Test
    void wrongOtpIncrementsAttemptWithoutChangingPassword() {
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        PasswordResetOtp entry = new PasswordResetOtp();
        entry.user=user; entry.codeHash="a".repeat(64); entry.nonce="b".repeat(32);
        entry.expiresAt=Instant.now().plusSeconds(100);
        when(otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(3L)).thenReturn(Optional.of(entry));
        assertFalse(service.resetUsingOtp("member@example.org", "000000", "passwordNEW123"));
        assertEquals(1, entry.attemptCount);
        verifyNoInteractions(encoder, refresh);
    }

    @Test
    void fiveWrongAttemptsLockOutOtp() {
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        PasswordResetOtp entry=new PasswordResetOtp();
        entry.user=user; entry.codeHash="a".repeat(64); entry.nonce="b".repeat(32);
        entry.expiresAt=Instant.now().plusSeconds(100);
        when(otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(3L)).thenReturn(Optional.of(entry));
        for(int i=0;i<5;i++) assertFalse(service.resetUsingOtp("member@example.org", "000000", "passwordNEW123"));
        assertEquals(5, entry.attemptCount);
        assertNotNull(entry.usedAt);
        verifyNoInteractions(encoder, refresh);
    }

    @Test
    void expiredOtpIsRejected() {
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        PasswordResetOtp entry=new PasswordResetOtp();
        entry.user=user; entry.codeHash="a".repeat(64); entry.nonce="b".repeat(32);
        entry.expiresAt=Instant.now().minusSeconds(1);
        when(otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(3L)).thenReturn(Optional.of(entry));
        assertFalse(service.resetUsingOtp("member@example.org", "000000", "passwordNEW123"));
        assertEquals(0, entry.attemptCount);
    }

    @Test
    void rateLimitSuppressesFourthEmailWithoutThrowing() {
        when(providers.getIfAvailable()).thenReturn(sender);
        when(users.findByEmailIgnoreCase("member@example.org")).thenReturn(Optional.of(user));
        when(otps.countRecentlyIssued(eq(3L), any(Instant.class))).thenReturn(3L);
        service.requestOtp("member@example.org");
        verifyNoInteractions(sender);
        verify(otps, never()).save(any());
    }

    @Test
    void missingMailConfigThrowsServiceUnavailable() {
        PasswordResetOtpService disabled = new PasswordResetOtpService(users, otps, legacy,
                refresh, encoder, providers, false, "sender@example.org", pepper);
        assertThrows(ApiException.class, () -> disabled.requestOtp("member@example.org"));
    }
}
