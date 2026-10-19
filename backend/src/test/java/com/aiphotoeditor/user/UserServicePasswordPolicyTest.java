package com.aiphotoeditor.user;

import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.auth.RefreshTokenRepository;
import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import com.aiphotoeditor.common.ApiException;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserServicePasswordPolicyTest {
    @Test
    void changePasswordRejectsWeakNewPasswordWithoutMutation() {
        UserRepository users = mock(UserRepository.class);
        CurrentUser current = mock(CurrentUser.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
        AssetReferenceResolver assets = mock(AssetReferenceResolver.class);

        User user = new User();
        user.id = 42L;
        user.passwordHash = "old-hash";
        when(current.id()).thenReturn(42L);
        when(users.findById(42L)).thenReturn(Optional.of(user));
        when(encoder.matches("OldPass@123", "old-hash")).thenReturn(true);

        UserService service = new UserService(users, current, encoder, tokens, assets);
        assertThrows(ApiException.class, () -> service.changePassword(
                new UserDtos.ChangePasswordRequest("OldPass@123", "NewPassword123")));

        assertEquals("old-hash", user.passwordHash);
        verify(encoder, never()).encode(anyString());
        verify(tokens, never()).revokeAll(anyLong(), any(Instant.class));
    }

    @Test
    void changePasswordAcceptsStrongPasswordAndRevokesRefreshTokens() {
        UserRepository users = mock(UserRepository.class);
        CurrentUser current = mock(CurrentUser.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        RefreshTokenRepository tokens = mock(RefreshTokenRepository.class);
        AssetReferenceResolver assets = mock(AssetReferenceResolver.class);

        User user = new User();
        user.id = 42L;
        user.passwordHash = "old-hash";
        when(current.id()).thenReturn(42L);
        when(users.findById(42L)).thenReturn(Optional.of(user));
        when(encoder.matches("OldPass@123", "old-hash")).thenReturn(true);
        when(encoder.encode("NewPassword@123")).thenReturn("new-hash");

        UserService service = new UserService(users, current, encoder, tokens, assets);
        service.changePassword(new UserDtos.ChangePasswordRequest("OldPass@123", "NewPassword@123"));

        assertEquals("new-hash", user.passwordHash);
        verify(tokens).revokeAll(eq(42L), any(Instant.class));
    }
}
