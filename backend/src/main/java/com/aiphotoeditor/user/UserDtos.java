package com.aiphotoeditor.user;
import jakarta.validation.constraints.*;
import java.time.Instant;
public final class UserDtos {
 private UserDtos(){}
 public record UserResponse(Long id,String email,String displayName,String avatarUrl,Instant createdAt){}
 public record UpdateProfileRequest(@Size(max=100) String displayName,Long avatarAssetId){}
 public record ChangePasswordRequest(@NotBlank String currentPassword,@NotBlank @Size(min=8,max=200) String newPassword){}
}
