package com.aiphotoeditor.gemini;

import com.aiphotoeditor.asset.*;
import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.job.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Gemini executor shares N4's ai_jobs persistence, lifecycle and cancellation semantics. */
@Component
public class GeminiJobWorker {
    private final AiJobService jobs;
    private final GeminiImageService gemini;
    private final AssetService assets;
    private final CloudinaryService cloudinary;

    public GeminiJobWorker(AiJobService jobs, GeminiImageService gemini, AssetService assets,
                           CloudinaryService cloudinary) {
        this.jobs = jobs; this.gemini = gemini; this.assets = assets; this.cloudinary = cloudinary;
    }

    @Scheduled(fixedDelayString = "${GEMINI_JOB_POLL_DELAY_MS:2000}")
    public void poll() { jobs.claimGemini().ifPresent(this::dispatch); }

    public void dispatch(AiJob job) {
        try {
            if (!GeminiOperationsController.OPERATIONS.contains(job.type) || job.createdByUserId == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_OPERATION", "Invalid Gemini job");
            }
            byte[] source = null;
            byte[] mask = null;
            String mime = null;
            if (job.inputAssetId != null) {
                Asset input = assets.requireOwned(job.inputAssetId, job.createdByUserId, job.projectId);
                source = cloudinary.download(input);
                mime = GeminiImageService.sniff(source);
            } else if (!"TEXT_TO_IMAGE".equals(job.type)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEMINI_INVALID_IMAGE", "Image input required");
            }
            long maskId = job.paramsJson == null ? 0 : job.paramsJson.path("maskAssetId").asLong(0);
            if (maskId > 0) {
                Asset maskAsset = assets.requireOwned(maskId, job.createdByUserId, job.projectId);
                mask = cloudinary.download(maskAsset);
                validateMask(source, mask);
            }
            jobs.stage(job.id, "GEMINI_REQUEST");
            String prompt = job.paramsJson == null ? "" : job.paramsJson.path("prompt").asText("");
            String instruction = "TEXT_TO_IMAGE".equals(job.type) ? prompt :
                    "Operation: " + job.type + ". " + prompt +
                    (mask == null ? "" : " The final image input is a mask: white pixels indicate the editable region; preserve outside it.");
            GeminiImageService.GeminiEditResponse response = gemini.generateImage(instruction, source, mime, mask);
            if (jobs.loadWorker(job.id).status != AiJobStatus.RUNNING) return;
            jobs.stage(job.id, "SAVING_ASSET");
            byte[] result = Base64.getDecoder().decode(response.imageBase64());
            if (mask != null) result = compositeMasked(source, result, mask);
            Asset output = assets.storeForJob(job.projectId, job.createdByUserId, result,
                    "gemini-" + job.id + ".png", job.inputAssetId, AssetType.AI_OUTPUT);
            if (!jobs.complete(job.id, output)) assets.discardForJob(output);
        } catch (Exception e) {
            String code = e instanceof ApiException api ? api.getCode() : "GEMINI_PROCESSING_FAILED";
            jobs.fail(job.id, code, "Gemini processing failed (" + code + ")");
        }
    }

    /** Mask pixels must map 1:1 onto source pixels; no viewport-size mask allowed. */
    static void validateMask(byte[] source, byte[] mask) {
        if (source == null) throw new ApiException(HttpStatus.BAD_REQUEST, "GEMINI_INVALID_MASK", "Mask requires an image");
        try {
            if (!"image/png".equals(GeminiImageService.sniff(mask))) throw new IllegalArgumentException();
            var sourceImage = ImageIO.read(new ByteArrayInputStream(source));
            var maskImage = ImageIO.read(new ByteArrayInputStream(mask));
            if (sourceImage == null || maskImage == null || sourceImage.getWidth() != maskImage.getWidth()
                    || sourceImage.getHeight() != maskImage.getHeight()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MASK_DIMENSION_MISMATCH", "Mask pixels must match source image");
            }
            if (maskImage.getColorModel().getColorSpace().getType() != java.awt.color.ColorSpace.TYPE_GRAY
                    || maskImage.getSampleModel().getSampleSize(0) != 8) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "GEMINI_INVALID_MASK", "Mask must be 8-bit grayscale PNG");
            }
        } catch (ApiException ex) { throw ex; }
        catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "GEMINI_INVALID_MASK", "Unreadable mask or image");
        }
    }

    /** Guarantees pixels outside the edit mask remain exactly from the source image. */
    static byte[] compositeMasked(byte[] source, byte[] result, byte[] mask) {
        try {
            BufferedImage original = ImageIO.read(new ByteArrayInputStream(source));
            BufferedImage generated = ImageIO.read(new ByteArrayInputStream(result));
            BufferedImage region = ImageIO.read(new ByteArrayInputStream(mask));
            if (original == null || generated == null || region == null
                    || original.getWidth() != generated.getWidth() || original.getHeight() != generated.getHeight()
                    || original.getWidth() != region.getWidth() || original.getHeight() != region.getHeight()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_MASK_OUTPUT_SIZE",
                        "Gemini must preserve input dimensions for masked editing");
            }
            int width = original.getWidth(), height = original.getHeight();
            if ((long) width * height > 24_000_000) throw new ApiException(HttpStatus.BAD_REQUEST,
                    "GEMINI_MASK_TOO_LARGE", "Masked edit exceeds 24 megapixels");
            BufferedImage combined = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int alpha = region.getRaster().getSample(x, y, 0);
                if (alpha == 0) { combined.setRGB(x, y, original.getRGB(x, y)); continue; }
                if (alpha == 255) { combined.setRGB(x, y, generated.getRGB(x, y)); continue; }
                int oldPixel = original.getRGB(x,y), newPixel = generated.getRGB(x,y);
                int packed = 0;
                for (int shift : new int[]{0,8,16,24}) {
                    int a = (oldPixel >>> shift) & 255, b = (newPixel >>> shift) & 255;
                    packed |= ((a * (255-alpha) + b * alpha + 127) / 255) << shift;
                }
                combined.setRGB(x,y,packed);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(combined, "png", out);
            return out.toByteArray();
        } catch (ApiException ex) { throw ex; }
        catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GEMINI_MASK_COMPOSITE_FAILED", "Cannot apply generated edit to mask");
        }
    }
}
