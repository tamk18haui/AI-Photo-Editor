package com.aiphotoeditor.ai.face;

import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.asset.Asset;
import com.aiphotoeditor.asset.AssetService;
import com.aiphotoeditor.asset.AssetType;
import com.aiphotoeditor.asset.AssetDtos.AssetResponse;
import com.aiphotoeditor.asset.CloudinaryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Each new public region traverses the full authenticated Spring mask-asset adapter. */
class FaceRegionsPublicN4Test {
    private static final List<String> REGIONS=List.of(
            "CHEEKS", "LEFT_CHEEK", "RIGHT_CHEEK", "IRIS", "LEFT_IRIS", "RIGHT_IRIS");

    @Test
    void allSixPublicRegionsReturnSourceSizedMaskAssetIds() throws Exception {
        var assets=mock(AssetService.class);
        var cloud=mock(CloudinaryService.class);
        var runner=mock(AiRunnerClient.class);
        var service=new FaceStudioService(assets,cloud,runner,new ObjectMapper());
        var source=new Asset();
        source.projectId=7L; source.id=12L;source.width=32;source.height=24;
        when(assets.requireMine(7L,12L)).thenReturn(source);
        when(cloud.download(source)).thenReturn(new byte[]{(byte)137,80,78,71,0});
        when(runner.faceStudioRegions(any(byte[].class),eq(1),eq(REGIONS),eq("REGION_MASK")))
                .thenReturn(zip(REGIONS));
        when(assets.store(eq(7L),any(byte[].class),anyString(),eq(AssetType.MASK),eq(12L)))
                .thenAnswer(inv -> new AssetResponse(100L,7L,
                    "https://res.cloudinary.com/example/image/upload/mask.png",AssetType.MASK,
                    "mask.png","image/png",1024,32,24,Instant.now()));
        var response=service.regions(new FaceStudioController.RegionRequest(
                7L,12L,1,REGIONS,9L,"REGION_MASK"));
        assertEquals(6,response.masks().size());
        assertEquals(1,response.faceIndex());
        assertEquals(9L,response.baseRevisionId());
        for(int i=0;i<6;i++){
            assertEquals(REGIONS.get(i),response.masks().get(i).region());
            assertEquals(100L,response.masks().get(i).maskAssetId());
            assertEquals(32,response.masks().get(i).width());
            assertEquals(24,response.masks().get(i).height());
        }
        verify(assets,times(6)).store(eq(7L),any(byte[].class),anyString(),eq(AssetType.MASK),eq(12L));
    }

    private static byte[] zip(List<String> regions) throws Exception {
        var image=new BufferedImage(32,24,BufferedImage.TYPE_BYTE_GRAY);
        var raw=new ByteArrayOutputStream();
        ImageIO.write(image,"png",raw);
        var manifest=new StringBuilder("{\"format\":\"N4_FACE_REGIONS_V1\",\"faceIndex\":1,\"imageWidth\":32,\"imageHeight\":24,\"outputMode\":\"REGION_MASK\",\"masks\":[");
        for(int i=0;i<regions.size();i++){
            if(i>0)manifest.append(',');
            var n=regions.get(i);
            manifest.append("{\"region\":\"").append(n)
                    .append("\",\"file\":\"regions/").append(n)
                    .append(".png\",\"width\":32,\"height\":24}");
        }
        manifest.append("]}");
        var out=new ByteArrayOutputStream();
        try(var zipped=new ZipOutputStream(out)){
            zipped.putNextEntry(new ZipEntry("manifest.json"));
            zipped.write(manifest.toString().getBytes(StandardCharsets.UTF_8));
            zipped.closeEntry();
            for(var region:regions){
                zipped.putNextEntry(new ZipEntry("regions/"+region+".png"));
                zipped.write(raw.toByteArray());
                zipped.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
