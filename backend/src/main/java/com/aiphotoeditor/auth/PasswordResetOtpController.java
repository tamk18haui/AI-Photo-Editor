package com.aiphotoeditor.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/otp")
public class PasswordResetOtpController {
    private final PasswordResetOtpService service;

    public PasswordResetOtpController(PasswordResetOtpService service) {
        this.service = service;
    }

    public record OtpRequest(@NotBlank @Email String email) {}
    public record OtpResetRequest(@NotBlank @Email String email,
                                  @NotBlank @Pattern(regexp = "\\d{6}") String code,
                                  @NotBlank @Size(min = 8, max = 200) String newPassword) {}
    public record MessageResponse(String message) {}

    @PostMapping("/request")
    public ResponseEntity<MessageResponse> request(@Valid @RequestBody OtpRequest request) {
        service.requestOtp(request.email());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(
                new MessageResponse("If this account exists, an OTP has been emailed."));
    }

    @PostMapping("/reset")
    public MessageResponse reset(@Valid @RequestBody OtpResetRequest request) {
        // Service commits invalid attempts before returning false (do NOT throw within service tx).
        if (!service.resetUsingOtp(request.email(), request.code(), request.newPassword())) {
            throw new com.aiphotoeditor.common.ApiException(HttpStatus.BAD_REQUEST,
                    "PASSWORD_RESET_INVALID_OTP", "Invalid, expired, or used OTP");
        }
        return new MessageResponse("Password updated. Please sign in again.");
    }
}
