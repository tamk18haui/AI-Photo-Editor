package com.aiphotoeditor.gemini;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** N5-only stateless image editing endpoint. All /api/gemini routes retain N3 JWT protection. */
@RestController
@RequestMapping("/api/gemini")
public class GeminiEditController {
    private final GeminiImageService gemini;

    public GeminiEditController(GeminiImageService gemini) {
        this.gemini = gemini;
    }

    @PostMapping(value = "/edit", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public GeminiImageService.GeminiEditResponse edit(
            @RequestParam("prompt") String prompt,
            @RequestParam("image") MultipartFile image) {
        return gemini.edit(prompt, image);
    }
}
