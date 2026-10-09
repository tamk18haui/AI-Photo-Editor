package com.aiphotoeditor.auth;
import com.aiphotoeditor.auth.AuthDtos.*;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.*;
import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class AuthService {
 private final UserRepository users; private final RefreshTokenRepository tokens;
 private final PasswordEncoder encoder; private final TokenService jwt;
 public AuthService(UserRepository users,RefreshTokenRepository tokens,PasswordEncoder encoder,TokenService jwt){
  this.users=users;this.tokens=tokens;this.encoder=encoder;this.jwt=jwt;
 }
 private String email(String raw){return raw.strip().toLowerCase(Locale.ROOT);}
 @Transactional
 public AuthResponse register(RegisterRequest r){
  String normalized=email(r.email());
  if(users.existsByEmailIgnoreCase(normalized))throw new ApiException(HttpStatus.CONFLICT,"EMAIL_ALREADY_EXISTS","Email already in use");
  var u=new User();u.email=normalized;u.passwordHash=encoder.encode(r.password());
  u.displayName=r.displayName()==null||r.displayName().isBlank()?null:r.displayName().trim();
  return issue(users.saveAndFlush(u));
 }
 @Transactional
 public AuthResponse login(LoginRequest r){
  var u=users.findByEmailIgnoreCase(email(r.email())).orElse(null);
  // Always run a BCrypt comparison to reduce the difference between unknown and known emails.
  boolean valid=encoder.matches(r.password(),u==null||u.passwordHash==null?"$2a$12$6zf0IehfUe1o4NVVmhigau86hR6OXZTaWYAsVkmmHoTyME5dKmE6G":u.passwordHash);
  if(u==null||u.passwordHash==null||!valid)throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_INVALID_CREDENTIALS","Invalid email or password");
  return issue(u);
 }
 @Transactional
 public AuthResponse refresh(RefreshTokenRequest r){
  var token=tokens.findForUpdate(jwt.hash(r.refreshToken()))
     .orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_TOKEN_EXPIRED","Refresh token invalid or expired"));
  if(token.revokedAt!=null || !token.expiresAt.isAfter(Instant.now()))
     throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_TOKEN_EXPIRED","Refresh token invalid or expired");
  token.revokedAt=Instant.now();
  return issue(token.user);
 }
 @Transactional
 public void logout(Long currentUserId,LogoutRequest r){
  if(r==null||r.refreshToken()==null||r.refreshToken().isBlank())return;
  tokens.findForUpdate(jwt.hash(r.refreshToken())).ifPresent(t->{
     if(!t.user.id.equals(currentUserId))throw new ApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Token does not belong to user");
     if(t.revokedAt==null)t.revokedAt=Instant.now();
  });
 }
 @Transactional
 public AuthResponse issue(User user){
  var refresh=new RefreshToken();refresh.user=user;refresh.createdAt=Instant.now();refresh.expiresAt=jwt.refreshExpiry();
  String raw=jwt.randomRefreshToken();refresh.tokenHash=jwt.hash(raw);tokens.save(refresh);
  return new AuthResponse(jwt.accessToken(user),raw,jwt.accessTtl(),"Bearer",user.id,user.displayName);
 }
}
