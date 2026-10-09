package com.aiphotoeditor.auth;
import com.aiphotoeditor.auth.AuthDtos.*;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.*;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.oauth2.core.*;
import java.util.List;
@RestController @RequestMapping("/api/auth")
@ConditionalOnProperty(prefix="app.google",name="enabled",havingValue="true")
public class GoogleAuthController {
 private final GoogleAuthService google;
 public GoogleAuthController(GoogleAuthService google){this.google=google;}
 @PostMapping("/google") public AuthResponse google(@Valid @RequestBody GoogleCredentialRequest request){return google.login(request.credential());}
}
@Service
@ConditionalOnProperty(prefix="app.google",name="enabled",havingValue="true")
class GoogleAuthService {
 private final JwtDecoder verifier;private final String audience;
 private final UserRepository users;private final OauthAccountRepository accounts;private final AuthService auth;
 GoogleAuthService(@Value("${app.google.client-id}") String audience,UserRepository users,OauthAccountRepository accounts,AuthService auth){
   if(audience==null||audience.isBlank())throw new IllegalStateException("GOOGLE_CLIENT_ID required when Google Login enabled");
   this.audience=audience;this.users=users;this.accounts=accounts;this.auth=auth;
   var decoder=NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
   decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), token->{
      if(!List.of("https://accounts.google.com","accounts.google.com").contains(token.getClaimAsString("iss")))
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Invalid issuer",null));
      if(!token.getAudience().contains(this.audience))
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Invalid audience",null));
      if(token.getExpiresAt()==null || !token.getExpiresAt().isAfter(Instant.now()))
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Expired",null));
      return OAuth2TokenValidatorResult.success();
   }));
   this.verifier=decoder;
 }
 @Transactional
 public AuthResponse login(String credential){
  Jwt claims;
  try{claims=verifier.decode(credential);}catch(JwtException e){throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_INVALID_CREDENTIALS","Invalid Google credential");}
  if(!Boolean.TRUE.equals(claims.getClaim("email_verified")))throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_INVALID_CREDENTIALS","Unverified Google email");
  var email=claims.getClaimAsString("email");var sub=claims.getSubject();
  if(email==null||email.isBlank()||sub==null||sub.isBlank())throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_INVALID_CREDENTIALS","Google identity incomplete");
  var found=accounts.findByProviderAndProviderSubject("GOOGLE",sub);
  if(found.isPresent())return auth.issue(found.get().user);
  if(users.existsByEmailIgnoreCase(email)) throw new ApiException(HttpStatus.CONFLICT,"GOOGLE_ACCOUNT_LINK_REQUIRED","Existing account requires explicit linking");
  var user=new User();user.email=email.strip().toLowerCase(java.util.Locale.ROOT);user.displayName=claims.getClaimAsString("name");
  if(user.displayName!=null && user.displayName.length()>100)user.displayName=user.displayName.substring(0,100);
  user=users.saveAndFlush(user);
  var identity=new OauthAccount();identity.user=user;identity.provider="GOOGLE";identity.providerSubject=sub;identity.providerEmail=user.email;identity.createdAt=Instant.now();accounts.save(identity);
  return auth.issue(user);
 }
}
