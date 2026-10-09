package com.aiphotoeditor.user;
import com.aiphotoeditor.user.UserDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/users/me")
public class UserController {
 private final UserService service;
 public UserController(UserService service){this.service=service;}
 @GetMapping public UserResponse me(){return service.me();}
 @PatchMapping public UserResponse update(@Valid @RequestBody UpdateProfileRequest r){return service.update(r);}
 @PutMapping("/password") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void changePassword(@Valid @RequestBody ChangePasswordRequest r){service.changePassword(r);}
}
