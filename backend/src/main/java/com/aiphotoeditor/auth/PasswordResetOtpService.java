package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Independent of legacy password-reset links: a 6-digit, one-use, 5-minute OTP flow. */
@Service
public class PasswordResetOtpService {
    private static final Duration OTP_TTL = Duration.ofMinutes(5);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_PER_HOUR = 3;
    private final SecureRandom random = new SecureRandom();

    private final UserRepository users;
    private final PasswordResetOtpRepository otps;
    private final PasswordResetTokenRepository legacyTokens;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final ObjectProvider<JavaMailSender> mailSenders;
    private final boolean emailEnabled;
    private final String senderAddress;
    private final byte[] hmacKey;

    public PasswordResetOtpService(UserRepository users, PasswordResetOtpRepository otps,
                                   PasswordResetTokenRepository legacyTokens,
                                   RefreshTokenRepository refreshTokens,
                                   PasswordEncoder encoder,
                                   ObjectProvider<JavaMailSender> mailSenders,
                                   @Value("${PASSWORD_RESET_EMAIL_ENABLED:false}") boolean emailEnabled,
                                   @Value("${PASSWORD_RESET_FROM:no-reply@localhost}") String senderAddress,
                                   @Value("${PASSWORD_RESET_OTP_PEPPER:${app.security.jwt-secret}}") String pepper) {
        this.users = users;
        this.otps = otps;
        this.legacyTokens = legacyTokens;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.mailSenders = mailSenders;
        this.emailEnabled = emailEnabled;
        this.senderAddress = senderAddress;
        this.hmacKey = pepper.getBytes(StandardCharsets.UTF_8);
        if (emailEnabled && hmacKey.length < 32) {
            throw new IllegalStateException("PASSWORD_RESET_OTP_PEPPER must be at least 32 bytes");
        }
    }

    @Transactional
    public void requestOtp(String rawEmail) {
        if (!emailEnabled || senderAddress.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PASSWORD_RESET_NOT_CONFIGURED",
                    "Password reset email is not configured");
        }
        JavaMailSender mailer = mailSenders.getIfAvailable();
        if (mailer == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PASSWORD_RESET_NOT_CONFIGURED",
                    "Password reset email is not configured");
        }
        var found = users.findByEmailIgnoreCase(rawEmail.strip().toLowerCase(Locale.ROOT));
        // Uniform 202 response, including unknown users and Google-only accounts.
        if (found.isEmpty() || found.get().passwordHash == null) return;
        var user = found.get();
        Instant now = Instant.now();
        if (otps.countRecentlyIssued(user.id, now.minus(Duration.ofHours(1))) >= MAX_PER_HOUR) return;
        var previous = otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(user.id);
        if (previous.isPresent() && previous.get().createdAt.isAfter(now.minus(RESEND_COOLDOWN))) return;

        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        byte[] nonceBytes = new byte[16];
        random.nextBytes(nonceBytes);
        String nonce = HexFormat.of().formatHex(nonceBytes);

        PasswordResetOtp entry = new PasswordResetOtp();
        entry.user = user;
        entry.nonce = nonce;
        entry.codeHash = otpHash(user.id, nonce, code);
        entry.attemptCount = 0;
        entry.createdAt = now;
        entry.expiresAt = now.plus(OTP_TTL);
        otps.invalidateUnusedForUser(user.id, now);
        otps.save(entry);

        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setFrom(senderAddress);
        mail.setTo(user.email);
        mail.setSubject("Lumina Studio - Ma OTP khoi phuc mat khau");
        mail.setText("Ma OTP khoi phuc mat khau Lumina cua ban la: " + code
                + "\n\nMa co hieu luc trong 5 phut, chi dung mot lan."
                + "\nNhap ma nay tai man hinh Quen mat khau da mo tren ung dung Lumina."
                + "\nKhong chia se ma voi bat ky ai. Neu ban khong yeu cau, hay bo qua email nay.");
        try {
            mailer.send(mail);
        } catch (MailException e) {
            // Transaction rolls back: an unsent OTP must not be considered issued.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "PASSWORD_RESET_EMAIL_FAILED", "Unable to send OTP email");
        }
    }

    /**
     * Return false rather than throw: bad-attempt increments must commit.
     * The controller turns false into a uniform HTTP 400 after this transaction returns.
     */
    @Transactional
    public boolean resetUsingOtp(String rawEmail, String code, String newPassword) {
        PasswordPolicy.requireValid(newPassword);
        if (code == null || !code.matches("[0-9]{6}")) return false;
        var found = users.findByEmailIgnoreCase(rawEmail.strip().toLowerCase(Locale.ROOT));
        if (found.isEmpty() || found.get().passwordHash == null) return false;
        var user = found.get();
        var latest = otps.findTopByUser_IdOrderByCreatedAtDescIdDesc(user.id);
        if (latest.isEmpty()) return false;
        var otp = latest.get();
        Instant now = Instant.now();
        if (otp.usedAt != null || !otp.expiresAt.isAfter(now) || otp.attemptCount >= MAX_ATTEMPTS) return false;
        byte[] expected = otp.codeHash.getBytes(StandardCharsets.US_ASCII);
        byte[] actual = otpHash(user.id, otp.nonce, code).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, actual)) {
            otp.attemptCount++;
            if (otp.attemptCount >= MAX_ATTEMPTS) otp.usedAt = now;
            return false;
        }
        user.passwordHash = encoder.encode(newPassword);
        otp.usedAt = now;
        otps.invalidateUnusedForUser(user.id, now);
        legacyTokens.invalidateUnusedForUser(user.id, now);
        refreshTokens.revokeAll(user.id, now);
        return true;
    }

    private String otpHash(Long userId, String nonce, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacKey, "HmacSHA256"));
            String payload = "lumina-password-otp:v1:" + userId + ":" + nonce + ":" + code;
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("Unable to hash OTP", e);
        }
    }
}
