package com.aiphotoeditor.user;
import com.aiphotoeditor.auth.CurrentUser;
import com.aiphotoeditor.assetbridge.AssetReferenceResolver;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.user.UserDtos.*;
import com.aiphotoeditor.auth.RefreshTokenRepository;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class UserService {
 private final UserRepository users;private final CurrentUser current;
 private final PasswordEncoder encoder;private final RefreshTokenRepository tokens;
 private final AssetReferenceResolver assets;
 public UserService(UserRepository users,CurrentUser current,PasswordEncoder encoder,RefreshTokenRepository tokens,AssetReferenceResolver assets){
  this.users=users;this.current=current;this.encoder=encoder;this.tokens=tokens;this.assets=assets;
 }
 public User require(long id){return users.findById(id).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_TOKEN_EXPIRED","User no longer exists"));}
 @Transactional(readOnly=true)
 public UserResponse me(){return toResponse(require(current.id()));}
 private UserResponse toResponse(User user){
  String avatar=user.avatarAssetId==null?null:assets.ownedAssetUrl(user.avatarAssetId,user.id,null);
  return new UserResponse(user.id,user.email,user.displayName,avatar,user.createdAt);
 }
 @Transactional
 public UserResponse update(UpdateProfileRequest req){
  User u=require(current.id());
  if(req.displayName()!=null){
   if(req.displayName().isBlank())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","Display name cannot be blank");
   u.displayName=req.displayName().trim();
  }
  if(req.avatarAssetId()!=null){
   if(req.avatarAssetId()<1)throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Invalid avatar id");
   assets.ownedAssetUrl(req.avatarAssetId(),u.id,null); // N4 validates asset owner
   u.avatarAssetId=req.avatarAssetId();
  }
  return toResponse(u);
 }
 @Transactional
 public void changePassword(ChangePasswordRequest req){
  User u=require(current.id());
  if(u.passwordHash==null)throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","Password login not configured for this account");
  if(!encoder.matches(req.currentPassword(),u.passwordHash)) throw new ApiException(HttpStatus.BAD_REQUEST,"AUTH_INVALID_CREDENTIALS","Current password incorrect");
  if(encoder.matches(req.newPassword(),u.passwordHash))throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","New password must differ");
  u.passwordHash=encoder.encode(req.newPassword());
  tokens.revokeAll(u.id,Instant.now());
 }
}
