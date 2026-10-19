package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {
    private static final String INVALID_TOKEN = "Invalid or expired password reset token";

    private final UserRepository users;
    private final PasswordResetTokenRepository resetTokens;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final TokenService tokenService;
    private final ObjectProvider<JavaMailSender> mailSenders;
    private final boolean emailEnabled;
    private final int ttlMinutes;
    private final String frontendBaseUrl;
    private final String senderAddress;

    public PasswordResetService(UserRepository users,
                                PasswordResetTokenRepository resetTokens,
                                RefreshTokenRepository refreshTokens,
                                PasswordEncoder encoder,
                                TokenService tokenService,
                                ObjectProvider<JavaMailSender> mailSenders,
                                @Value("${PASSWORD_RESET_EMAIL_ENABLED:false}") boolean emailEnabled,
                                @Value("${PASSWORD_RESET_TTL_MINUTES:20}") int ttlMinutes,
                                @Value("${FRONTEND_BASE_URL:http://localhost:5173}") String frontendBaseUrl,
                                @Value("${PASSWORD_RESET_FROM:no-reply@localhost}") String senderAddress) {
        if (ttlMinutes < 5 || ttlMinutes > 60) {
            throw new IllegalArgumentException("PASSWORD_RESET_TTL_MINUTES must be between 5 and 60");
        }
        if (!frontendBaseUrl.startsWith("http://") && !frontendBaseUrl.startsWith("https://")) {
            throw new IllegalArgumentException("FRONTEND_BASE_URL must use HTTP(S)");
        }
        this.users = users;
        this.resetTokens = resetTokens;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.tokenService = tokenService;
        this.mailSenders = mailSenders;
        this.emailEnabled = emailEnabled;
        this.ttlMinutes = ttlMinutes;
        this.frontendBaseUrl = frontendBaseUrl.replaceAll("/+$", "");
        this.senderAddress = senderAddress;
    }

    @Transactional
    public void requestReset(String rawEmail) {
        // Disabled for everyone: don't silently claim an email was sent.
        if (!emailEnabled) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_NOT_CONFIGURED", "Password reset email is not configured");
        }
        JavaMailSender mailer = mailSenders.getIfAvailable();
        if (mailer == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_NOT_CONFIGURED", "Password reset email is not configured");
        }
        String email = rawEmail.strip().toLowerCase(Locale.ROOT);
        var user = users.findByEmailIgnoreCase(email);
        // Always return the same HTTP 202 response for unknown or rate-limited addresses.
        if (user.isEmpty() || user.get().passwordHash == null) {
            return; // A Google-only account cannot use a local password until separately configured.
        }
        Instant now = Instant.now();
        if (resetTokens.countRecentlyIssued(user.get().id, now.minus(Duration.ofHours(1))) >= 3) {
            return;
        }
        String rawToken = tokenService.randomRefreshToken(); // 48 random bytes, Base64URL
        PasswordResetToken entry = new PasswordResetToken();
        entry.user = user.get();
        entry.tokenHash = tokenService.hash(rawToken); // Database stores hash only.
        entry.createdAt = now;
        entry.expiresAt = now.plus(Duration.ofMinutes(ttlMinutes));
        resetTokens.save(entry);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(senderAddress);
        message.setTo(user.get().email);
        message.setSubject("Lumina Studio - Reset your password");
        message.setText("A password reset was requested for your Lumina Studio account.\n\n"
                + "Open this link within " + ttlMinutes + " minutes:\n"
                + frontendBaseUrl + "/reset-password?token=" + rawToken + "\n\n"
                + "If you did not request this, ignore this email.\n"
                + "The link can be used only once.");
        try {
            mailer.send(message);
        } catch (MailException e) {
            // Transaction rolls back; never log or expose the plaintext token.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_EMAIL_FAILED", "Unable to send password reset email");
        }
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        if (rawToken.length() > 512) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_RESET_INVALID_TOKEN", INVALID_TOKEN);
        }
        String hash = tokenService.hash(rawToken);
        PasswordResetToken entry = resetTokens.findForUpdate(hash)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
                        "PASSWORD_RESET_INVALID_TOKEN", INVALID_TOKEN));
        Instant now = Instant.now();
        if (entry.usedAt != null || !entry.expiresAt.isAfter(now)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_RESET_INVALID_TOKEN", INVALID_TOKEN);
        }
        if (entry.user.passwordHash == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_RESET_INVALID_TOKEN", INVALID_TOKEN);
        }
        entry.user.passwordHash = encoder.encode(newPassword);
        // Invalidate all reset links and refresh tokens for this user after password change.
        resetTokens.invalidateUnusedForUser(entry.user.id, now);
        refreshTokens.revokeAll(entry.user.id, now);
        // Existing JWT access tokens expire naturally (default 15 minutes).
    }
}
