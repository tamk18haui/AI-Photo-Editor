package com.aiphotoeditor.ai.face;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetDtos.AssetResponse;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.asset.CloudinaryService;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Contract-level N4 tests without touching MySQL, Cloudinary or real model weights. */
@ExtendWith(MockitoExtension.class)
class FaceStudioServiceTest {
    @Mock AssetService assets;
    @Mock CloudinaryService cloudinary;
    @Mock AiRunnerClient runner;
    ObjectMapper mapper = new ObjectMapper();
    FaceStudioService service;

    @BeforeEach
    void setup() {
        service = new FaceStudioService(assets, cloudinary, runner, mapper);
    }

    private void owned(int w, int h) {
        Asset source = new Asset();
        source.id = 12L;
        source.projectId = 7L;
        source.width = w;
        source.height = h;
        when(assets.requireMine(7L, 12L)).thenReturn(source);
        when(cloudinary.download(source)).thenReturn(new byte[]{(byte)137, 80, 78, 71, 0});
    }

    @Test
    void detectIncludesOwnedAssetAndStableFaceIndex() throws Exception {
        owned(32, 24);
        when(runner.faceStudioDetect(any(byte[].class))).thenReturn(mapper.readTree("""
            {"imageWidth":32,"imageHeight":24,
             "faces":[{"faceIndex":0,"boundingBox":{"x":0.1,"y":0.2,"width":0.2,"height":0.3}}]}
            """));
        var response = service.detect(7, 12);
        assertEquals(7, response.projectId());
        assertEquals(12, response.assetId());
        assertEquals(0, response.faces().get(0).get("faceIndex").asInt());
    }

    @Test
    void regionMasksAreStoredWithOriginalAssetLineage() throws Exception {
        owned(32, 24);
        byte[] png = grayPng(32, 24);
        when(runner.faceStudioRegions(any(byte[].class), eq(1),
             eq(List.of("SKIN", "LIPS")), eq("REGION_MASK")))
             .thenReturn(maskZip(png));
        when(assets.store(eq(7L), any(byte[].class), anyString(), eq(AssetType.MASK), eq(12L)))
            .thenReturn(new AssetResponse(101L, 7L, "https://res.cloudinary.com/example/image/upload/skin.png",
                AssetType.MASK, "mask.png", "image/png", png.length, 32, 24, Instant.now()));
        var response = service.regions(new FaceStudioController.RegionRequest(7L, 12L, 1,
                              List.of("SKIN", "LIPS"), 21L, "REGION_MASK"));
        assertEquals(2, response.masks().size());
        assertEquals(21L, response.baseRevisionId());
        assertEquals("SKIN", response.masks().get(0).region());
        verify(assets, times(2)).store(eq(7L), any(byte[].class), anyString(),
                                        eq(AssetType.MASK), eq(12L));
    }

    @Test
    void rejectsRegionsOutsideV3ContractBeforeFetchingModel() {
        assertThrows(ApiException.class, () -> service.regions(
            new FaceStudioController.RegionRequest(7L, 12L, 0, List.of("NOT_A_FACE_REGION"),
                                                   null, "REGION_MASK")));
        verifyNoInteractions(runner, cloudinary);
    }

    @Test
    void rejectsUnauthorizedOrMissingAsset() {
        when(assets.requireMine(7L, 12L)).thenThrow(
            new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "ASSET_NOT_FOUND", "Missing"));
        assertThrows(ApiException.class, () -> service.detect(7L, 12L));
        verifyNoInteractions(runner, cloudinary);
    }

    private byte[] grayPng(int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
        var out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private byte[] maskZip(byte[] png) throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            var manifest = """
                {"format":"N4_FACE_REGIONS_V1","faceIndex":1,"imageWidth":32,"imageHeight":24,
                 "outputMode":"REGION_MASK","masks":[
                  {"region":"SKIN","file":"regions/SKIN.png","width":32,"height":24},
                  {"region":"LIPS","file":"regions/LIPS.png","width":32,"height":24}]}
                """;
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write(manifest.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            for (String region : List.of("SKIN", "LIPS")) {
                zip.putNextEntry(new ZipEntry("regions/" + region + ".png"));
                zip.write(png);
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
