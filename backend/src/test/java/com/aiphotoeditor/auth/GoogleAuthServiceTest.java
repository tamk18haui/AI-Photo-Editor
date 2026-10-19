package com.aiphotoeditor.auth;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.User;
import com.aiphotoeditor.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GoogleAuthServiceTest {
    @Mock JwtDecoder decoder;
    @Mock UserRepository users;
    @Mock OauthAccountRepository accounts;
    @Mock AuthService auth;
    private GoogleAuthService service;

    @BeforeEach void setup() {
        service = new GoogleAuthService(decoder, users, accounts, auth);
    }

    private Jwt valid(String email) {
        return new Jwt("id-token", Instant.now(), Instant.now().plusSeconds(600),
                Map.of("alg", "RS256"), Map.of("sub", "google-sub", "email", email,
                        "email_verified", true, "name", "Test User", "iss", "https://accounts.google.com",
                        "aud", List.of("client-id")));
    }

    @Test void cannotLinkDifferentEmail() {
        User user = new User(); user.id=9L; user.email="owner@example.com";
        when(decoder.decode("token")).thenReturn(valid("attacker@example.com"));
        when(users.findById(9L)).thenReturn(Optional.of(user));
        assertThrows(ApiException.class, () -> service.link("token", 9L));
        verifyNoInteractions(accounts);
    }

    @Test void refusesSilentLinkOfPasswordAccount() {
        when(decoder.decode("token")).thenReturn(valid("existing@example.com"));
        when(accounts.findByProviderAndProviderSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(users.existsByEmailIgnoreCase("existing@example.com")).thenReturn(true);
        assertThrows(ApiException.class, () -> service.login("token"));
        verify(auth, never()).issue(any());
    }

    @Test void canLinkOnlyMatchingAccount() {
        User user = new User(); user.id=9L; user.email="owner@example.com";
        when(decoder.decode("token")).thenReturn(valid("owner@example.com"));
        when(users.findById(9L)).thenReturn(Optional.of(user));
        when(accounts.findByProviderAndProviderSubject("GOOGLE", "google-sub")).thenReturn(Optional.empty());
        when(accounts.findByUser_IdAndProvider(9L,"GOOGLE")).thenReturn(Optional.empty());
        service.link("token",9L);
        verify(accounts).save(any(OauthAccount.class));
    }

    @Test void rejectsInvalidToken() {
        when(decoder.decode("bad")).thenThrow(new JwtException("invalid"));
        assertThrows(ApiException.class, () -> service.login("bad"));
        verifyNoInteractions(users, accounts, auth);
    }

    @Test void rejectsUnverifiedEmail() {
        Jwt t = new Jwt("id-token",Instant.now(),Instant.now().plusSeconds(500), Map.of("alg","RS256"),
                Map.of("sub","google-sub","email","owner@example.com","email_verified",false));
        when(decoder.decode("token")).thenReturn(t);
        assertThrows(ApiException.class,()->service.login("token"));
        verifyNoInteractions(users,accounts,auth);
    }
}
