package com.aiphotoeditor.auth;
import com.aiphotoeditor.auth.AuthDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/auth")
public class AuthController {
 private final AuthService auth;private final CurrentUser current;
 public AuthController(AuthService auth,CurrentUser current){this.auth=auth;this.current=current;}
 @PostMapping("/register") public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest r){return ResponseEntity.status(201).body(auth.register(r));}
 @PostMapping("/login") public AuthResponse login(@Valid @RequestBody LoginRequest r){return auth.login(r);}
 @PostMapping("/refresh") public AuthResponse refresh(@Valid @RequestBody RefreshTokenRequest r){return auth.refresh(r);}
 @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void logout(@RequestBody(required=false) LogoutRequest r){auth.logout(current.id(),r);}
}
