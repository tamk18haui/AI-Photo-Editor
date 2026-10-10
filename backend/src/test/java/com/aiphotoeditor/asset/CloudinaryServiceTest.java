package com.aiphotoeditor.asset;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
class CloudinaryServiceTest {
 @Test void acceptsOnlyOwnCloudinaryHttpsUrls() {
   var c=new CloudinaryService("my-cloud","key","secret",RestClient.builder(),new ObjectMapper());
   assertTrue(c.safeUrl("https://res.cloudinary.com/my-cloud/image/upload/v1/asset.png"));
   assertFalse(c.safeUrl("http://res.cloudinary.com/my-cloud/image/upload/a.png"));
   assertFalse(c.safeUrl("https://evil.com/image/upload/asset.png"));
   assertFalse(c.safeUrl("https://res.cloudinary.com/another/image/upload/v1/asset.png"));
 }
}
