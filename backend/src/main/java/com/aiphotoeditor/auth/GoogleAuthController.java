package com.aiphotoeditor.auth;

import com.aiphotoeditor.auth.AuthDtos.AuthResponse;
import com.aiphotoeditor.auth.AuthDtos.GoogleCredentialRequest;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GIS ID token -> application access/refresh token; no Google client secret is needed. */
@RestController
@RequestMapping("/api/auth")
@ConditionalOnProperty(prefix = "app.google", name = "enabled", havingValue = "true")
public class GoogleAuthController {
    private final GoogleAuthService google;
    private final CurrentUser current;

    public GoogleAuthController(GoogleAuthService google, CurrentUser current) {
        this.google = google;
        this.current = current;
    }

    @PostMapping("/google")
    public AuthResponse login(@Valid @RequestBody GoogleCredentialRequest request) {
        return google.login(request.credential());
    }

    /** Requires a signed-in Lumina account; prevents email-based account takeover. */
    @PostMapping("/google/link")
    public ResponseEntity<Void> link(@Valid @RequestBody GoogleCredentialRequest request) {
        google.link(request.credential(), current.id());
        return ResponseEntity.noContent().build();
    }
}

@Service
@ConditionalOnProperty(prefix = "app.google", name = "enabled", havingValue = "true")
class GoogleAuthService {
    private final JwtDecoder verifier;
    private final UserRepository users;
    private final OauthAccountRepository accounts;
    private final AuthService auth;

    @org.springframework.beans.factory.annotation.Autowired
    GoogleAuthService(@Value("${app.google.client-id}") String audience,
                      UserRepository users, OauthAccountRepository accounts, AuthService auth) {
        if (audience == null || audience.isBlank())
            throw new IllegalStateException("GOOGLE_CLIENT_ID required when Google Login enabled");
        this.users = users;
        this.accounts = accounts;
        this.auth = auth;
        var decoder = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), token -> {
            if (!List.of("accounts.google.com", "https://accounts.google.com")
                    .contains(token.getClaimAsString("iss")))
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid issuer", null));
            if (!token.getAudience().contains(audience))
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience", null));
            if (token.getExpiresAt() == null || !token.getExpiresAt().isAfter(Instant.now()))
                return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Expired", null));
            return OAuth2TokenValidatorResult.success();
        }));
        this.verifier = decoder;
    }

    /** Internal constructor for deterministic tests, never relax issuer/audience in production. */
    GoogleAuthService(JwtDecoder verifier, UserRepository users,
                      OauthAccountRepository accounts, AuthService auth) {
        this.verifier = verifier;
        this.users = users;
        this.accounts = accounts;
        this.auth = auth;
    }

    private record GoogleIdentity(String subject, String email, String name) {}

    private GoogleIdentity verified(String credential) {
        Jwt claims;
        try {
            claims = verifier.decode(credential);
        } catch (JwtException | IllegalArgumentException ex) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "GOOGLE_INVALID_CREDENTIAL", "Invalid Google credential");
        }
        if (!Boolean.TRUE.equals(claims.getClaim("email_verified")))
            throw new ApiException(HttpStatus.UNAUTHORIZED, "GOOGLE_UNVERIFIED_EMAIL", "Google email not verified");
        String email = claims.getClaimAsString("email");
        String sub = claims.getSubject();
        if (email == null || email.isBlank() || sub == null || sub.isBlank())
            throw new ApiException(HttpStatus.UNAUTHORIZED, "GOOGLE_INVALID_CREDENTIAL", "Incomplete Google identity");
        String name = claims.getClaimAsString("name");
        if (name != null && name.length() > 100) name = name.substring(0, 100);
        return new GoogleIdentity(sub, email.strip().toLowerCase(Locale.ROOT), name);
    }

    @Transactional
    public AuthResponse login(String credential) {
        GoogleIdentity identity = verified(credential);
        var linked = accounts.findByProviderAndProviderSubject("GOOGLE", identity.subject());
        if (linked.isPresent()) return auth.issue(linked.get().user);
        // Never silently merge users just because email strings match.
        if (users.existsByEmailIgnoreCase(identity.email()))
            throw new ApiException(HttpStatus.CONFLICT, "GOOGLE_ACCOUNT_LINK_REQUIRED",
                    "Sign in with password and link your Google account from your profile");
        User user = new User();
        user.email = identity.email();
        user.displayName = identity.name();
        user = users.saveAndFlush(user);
        var account = new OauthAccount();
        account.user = user;
        account.provider = "GOOGLE";
        account.providerSubject = identity.subject();
        account.providerEmail = identity.email();
        account.createdAt = Instant.now();
        accounts.save(account);
        return auth.issue(user);
    }

    @Transactional
    public void link(String credential, long userId) {
        GoogleIdentity identity = verified(credential);
        User user = users.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_TOKEN_EXPIRED", "User not found"));
        // Linking requires an authenticated Lumina session AND matching Google verified email.
        if (!user.email.equalsIgnoreCase(identity.email()))
            throw new ApiException(HttpStatus.CONFLICT, "GOOGLE_EMAIL_MISMATCH",
                    "Google email must match the Lumina account email");
        var linked = accounts.findByProviderAndProviderSubject("GOOGLE", identity.subject());
        if (linked.isPresent()) {
            if (linked.get().user.id.equals(user.id)) return; // Idempotent.
            throw new ApiException(HttpStatus.CONFLICT, "GOOGLE_ALREADY_LINKED", "Google identity is linked to another account");
        }
        if (accounts.findByUser_IdAndProvider(user.id, "GOOGLE").isPresent())
            throw new ApiException(HttpStatus.CONFLICT, "GOOGLE_ALREADY_LINKED", "Account is already linked to Google");
        var account = new OauthAccount();
        account.user = user;
        account.provider = "GOOGLE";
        account.providerSubject = identity.subject();
        account.providerEmail = identity.email();
        account.createdAt = Instant.now();
        accounts.save(account);
    }
}
