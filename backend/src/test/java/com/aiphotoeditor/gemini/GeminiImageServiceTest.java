package com.aiphotoeditor.gemini;

import com.aiphotoeditor.common.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class GeminiImageServiceTest {
    @Test void detectsPng() {
        assertEquals("image/png", GeminiImageService.sniff(new byte[] {(byte)137,80,78,71,13,10,26,10,0,0,0,0}));
    }
    @Test void rejectsNonImage() {
        assertThrows(ApiException.class, () -> GeminiImageService.sniff("hello world!".getBytes()));
    }
}
