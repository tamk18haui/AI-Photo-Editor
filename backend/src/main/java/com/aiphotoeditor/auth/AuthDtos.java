package com.aiphotoeditor.auth;
import jakarta.validation.constraints.*;
public final class AuthDtos {
 private AuthDtos(){}
 public record RegisterRequest(@NotBlank @Email String email,@NotBlank @Size(min=8,max=200) String password,@Size(max=100) String displayName){}
 public record LoginRequest(@NotBlank @Email String email,@NotBlank String password){}
 public record RefreshTokenRequest(@NotBlank String refreshToken){}
 public record LogoutRequest(String refreshToken){}
 public record AuthResponse(String accessToken,String refreshToken,Long expiresIn,String tokenType,Long userId,String displayName){}
 public record GoogleCredentialRequest(@NotBlank String credential){}
}
