package com.aiphotoeditor.auth;
import com.aiphotoeditor.user.User;
import java.time.*;
import java.util.UUID;
import java.security.SecureRandom;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
@Service
public class TokenService {
 private final JwtEncoder encoder;private final String issuer;private final long accessTtl;private final int refreshDays;
 private final SecureRandom rng=new SecureRandom();
 public TokenService(JwtEncoder encoder,@Value("${app.security.issuer}") String issuer,
    @Value("${app.security.access-ttl-seconds}") long accessTtl,
    @Value("${app.security.refresh-ttl-days}") int refreshDays){
  if(accessTtl<60||accessTtl>86400)throw new IllegalArgumentException("Invalid JWT TTL");
  if(refreshDays<1||refreshDays>90)throw new IllegalArgumentException("Invalid refresh TTL");
  this.encoder=encoder;this.issuer=issuer;this.accessTtl=accessTtl;this.refreshDays=refreshDays;
 }
 public String accessToken(User user){
  Instant now=Instant.now();
  var claims=JwtClaimsSet.builder().issuer(issuer).subject(user.id.toString()).issuedAt(now)
    .expiresAt(now.plusSeconds(accessTtl)).id(UUID.randomUUID().toString()).build();
  var header=JwsHeader.with(MacAlgorithm.HS256).build();
  return encoder.encode(JwtEncoderParameters.from(header,claims)).getTokenValue();
 }
 public String randomRefreshToken(){byte[] raw=new byte[48];rng.nextBytes(raw);return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);}
 public Instant refreshExpiry(){return Instant.now().plus(Duration.ofDays(refreshDays));}
 public long accessTtl(){return accessTtl;}
 public String hash(String token){
  try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));}
  catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
 }
}
