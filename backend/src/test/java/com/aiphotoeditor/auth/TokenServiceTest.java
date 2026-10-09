package com.aiphotoeditor.auth;
import static org.junit.jupiter.api.Assertions.*;
import com.aiphotoeditor.config.SecurityConfig;
import com.aiphotoeditor.user.User;
import org.junit.jupiter.api.Test;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
class TokenServiceTest {
 @Test void accessTokenAndRefreshAreDifferentAndVerifiable(){
   var config=new SecurityConfig();
   var key=new SecretKeySpec("test-only-secret-of-at-least-32-bytes-123456".getBytes(StandardCharsets.UTF_8),"HmacSHA256");
   var service=new TokenService(config.jwtEncoder(key),"ai-photo-editor",900,30);
   var u=new User();u.id=42L;
   var a=service.accessToken(u);var b=service.randomRefreshToken();
   assertEquals("42",config.jwtDecoder(key,"ai-photo-editor").decode(a).getSubject());
   assertNotEquals(b,service.randomRefreshToken());
   assertEquals(64,service.hash(b).length());
 }
}
