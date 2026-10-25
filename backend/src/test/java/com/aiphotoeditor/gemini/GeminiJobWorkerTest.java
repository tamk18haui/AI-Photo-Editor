package com.aiphotoeditor.gemini;

import com.aiphotoeditor.common.ApiException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class GeminiJobWorkerTest {
    private static byte[] png(BufferedImage image) throws Exception {
        var out=new ByteArrayOutputStream();ImageIO.write(image,"png",out);return out.toByteArray();
    }

    @Test void preservesNonSelectedPixelsExactly() throws Exception {
        var source=new BufferedImage(2,1,BufferedImage.TYPE_INT_ARGB);
        source.setRGB(0,0,0xFF112233);source.setRGB(1,0,0xFF445566);
        var generated=new BufferedImage(2,1,BufferedImage.TYPE_INT_ARGB);
        generated.setRGB(0,0,0xFFABCDEF);generated.setRGB(1,0,0xFF010203);
        var mask=new BufferedImage(2,1,BufferedImage.TYPE_BYTE_GRAY);
        mask.getRaster().setSample(0,0,0,0);mask.getRaster().setSample(1,0,0,255);
        var result=ImageIO.read(new ByteArrayInputStream(GeminiJobWorker.compositeMasked(
                png(source),png(generated),png(mask))));
        assertEquals(0xFF112233,result.getRGB(0,0));
        assertEquals(0xFF010203,result.getRGB(1,0));
    }

    @Test void rejectsMaskSizeMismatchBeforeModelCall() throws Exception {
        var source=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB);
        var mask=new BufferedImage(3,2,BufferedImage.TYPE_BYTE_GRAY);
        ApiException exception=assertThrows(ApiException.class, () ->
                GeminiJobWorker.validateMask(png(source),png(mask)));
        assertEquals("MASK_DIMENSION_MISMATCH",exception.getCode());
    }

    @Test void rejectsRgbMask() throws Exception {
        var source=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB);
        var mask=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB);
        assertEquals("GEMINI_INVALID_MASK", assertThrows(ApiException.class, () ->
                GeminiJobWorker.validateMask(png(source),png(mask))).getCode());
    }
}
