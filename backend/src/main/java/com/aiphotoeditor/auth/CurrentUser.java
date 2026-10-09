package com.aiphotoeditor.auth;
import com.aiphotoeditor.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
@Component
public class CurrentUser {
 public long id(){
  var auth=SecurityContextHolder.getContext().getAuthentication();
  if(!(auth instanceof JwtAuthenticationToken jwt)) throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_TOKEN_EXPIRED","Authentication required");
  try{return Long.parseLong(jwt.getToken().getSubject());}catch(NumberFormatException ex){throw new ApiException(HttpStatus.UNAUTHORIZED,"AUTH_TOKEN_EXPIRED","Invalid user token");}
 }
}
