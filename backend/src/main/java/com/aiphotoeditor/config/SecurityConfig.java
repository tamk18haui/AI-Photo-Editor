package com.aiphotoeditor.config;
import com.aiphotoeditor.common.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.*;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.util.List;
@Configuration @EnableWebSecurity
public class SecurityConfig {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder(12);}
 @Bean SecretKey secretKey(@Value("${app.security.jwt-secret}") String secret){
   byte[] value=secret.getBytes(StandardCharsets.UTF_8);
   if(value.length<32)throw new IllegalStateException("JWT_SIGNING_SECRET must be at least 32 UTF-8 bytes");
   return new SecretKeySpec(value,"HmacSHA256");
 }
 @Bean public JwtEncoder jwtEncoder(SecretKey key){return new NimbusJwtEncoder(new ImmutableSecret<>(key));}
 @Bean public JwtDecoder jwtDecoder(SecretKey key,@Value("${app.security.issuer}") String issuer){
   var decoder=NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
   decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
   return decoder;
 }
 @Bean CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}") String origins){
   var cors=new CorsConfiguration();
   cors.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s->!s.isBlank()).toList());
   cors.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
   cors.setAllowedHeaders(List.of("Authorization","Content-Type"));
   cors.setMaxAge(3600L);
   var source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/**",cors);return source;
 }
 @Bean SecurityFilterChain filterChain(HttpSecurity http,ObjectMapper mapper) throws Exception {
   http.csrf(csrf->csrf.disable()).cors(Customizer.withDefaults())
     .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
     .authorizeHttpRequests(a->a
       .requestMatchers(HttpMethod.OPTIONS,"/**").permitAll()
       .requestMatchers("/api/auth/register","/api/auth/login","/api/auth/refresh","/api/auth/google").permitAll()
       .requestMatchers("/actuator/health","/actuator/info").permitAll()
       .anyRequest().authenticated())
     .oauth2ResourceServer(o->o.jwt(Customizer.withDefaults()).authenticationEntryPoint((req,res,e)->{
        res.setStatus(401);res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.getWriter().write(mapper.writeValueAsString(ErrorResponse.of(401,"AUTH_TOKEN_EXPIRED","Missing, expired or invalid access token")));
     }))
     .exceptionHandling(e->e.authenticationEntryPoint((req,res,x)->{
         res.setStatus(401);res.setContentType(MediaType.APPLICATION_JSON_VALUE);
         res.getWriter().write(mapper.writeValueAsString(ErrorResponse.of(401,"AUTH_TOKEN_EXPIRED","Authentication required")));
       }).accessDeniedHandler((req,res,x)->{
         res.setStatus(403);res.setContentType(MediaType.APPLICATION_JSON_VALUE);
         res.getWriter().write(mapper.writeValueAsString(ErrorResponse.of(403,"FORBIDDEN","Access denied")));
       }));
   return http.build();
 }
}
