package com.aiphotoeditor.gemini;

import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class GeminiImageServiceTest {
    @Test void detectsPng() {
        assertEquals("image/png", GeminiImageService.sniff(new byte[] {(byte)137,80,78,71,13,10,26,10,0,0,0,0}));
    }
    @Test void rejectsNonImage() {
        assertThrows(ApiException.class, () -> GeminiImageService.sniff("hello world!".getBytes()));
    }
    @Test void rejectsTextToImageWithoutServerCredentials() {
        var gemini = new GeminiImageService(new ObjectMapper(), null, "", "gemini-3.1-flash-image");
        assertEquals("GEMINI_NOT_CONFIGURED", assertThrows(ApiException.class, () ->
                gemini.generateImage("Sunset beach", null, null, null)).getCode());
    }
    @Test void rejectsEmptyImagePrompt() {
        var gemini = new GeminiImageService(new ObjectMapper(), null, "test-key", "gemini-3.1-flash-image");
        assertEquals("GEMINI_INVALID_PROMPT", assertThrows(ApiException.class, () ->
                gemini.generateImage("   ", null, null, null)).getCode());
    }
}
