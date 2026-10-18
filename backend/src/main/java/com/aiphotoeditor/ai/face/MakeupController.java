package com.aiphotoeditor.ai.face;

import com.aiphotoeditor.ai.LocalImageService;
import com.aiphotoeditor.ai.local.AiRunnerClient;
import com.aiphotoeditor.job.AiJobDtos;
import com.aiphotoeditor.job.AiJobType;
import com.aiphotoeditor.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** N4 final renderer is an AI Job; frontend preview and editor History belong to N2/N1/N3. */
@RestController
@RequestMapping("/api/ai/local")
public class MakeupController {
    private static final Set<String> EFFECTS=Set.of("LIPSTICK","LIP_GLOSS","EYESHADOW","EYELINER",
        "EYEBROW_COLOR","BLUSH","FOUNDATION","SKIN_SMOOTH","HAIR_COLOR","TEETH_WHITEN","EYE_COLOR","FACE_RELIGHT");
    private static final Set<String> MODES=Set.of("NORMAL","MULTIPLY","OVERLAY","SOFT_LIGHT","SCREEN");
    private final LocalImageService images;
    private final AiRunnerClient runner;
    private final ObjectMapper mapper;
    public MakeupController(LocalImageService images,AiRunnerClient runner,ObjectMapper mapper) {
        this.images=images; this.runner=runner; this.mapper=mapper;
    }
    public record MakeupRequest(@NotNull @Positive Long projectId,@NotNull @Positive Long assetId,
             Long baseRevisionId,@NotNull @Min(0) Integer faceIndex,@NotEmpty List<JsonNode> effects,
             List<Long> sourceFaceMaskAssetIds,String outputMode) {}

    @PostMapping("/makeup")
    public ResponseEntity<AiJobDtos.AiJobResponse> makeup(@Valid @RequestBody MakeupRequest request) {
        if(request.effects()==null || request.effects().size()>24 || request.effects().stream().anyMatch(e->e==null || !e.isObject()))
            throw bad("INVALID_MAKEUP","effects must contain 1..24 objects");
        if(request.outputMode()!=null && !Set.of("PREVIEW","FINAL").contains(request.outputMode()))
            throw bad("INVALID_OUTPUT_MODE","outputMode must be PREVIEW or FINAL");
        if(request.baseRevisionId()!=null && request.baseRevisionId()<=0)
            throw bad("INVALID_MAKEUP","Invalid baseRevisionId");
        if(request.sourceFaceMaskAssetIds()!=null && !request.sourceFaceMaskAssetIds().isEmpty())
            throw bad("UNSUPPORTED_MAKEUP_MASKS","Custom mask list is not yet supported by N4 renderer; regenerate from source");
        for(JsonNode effect:request.effects()) {
            if(!EFFECTS.contains(effect.path("effect").asText("")))
                throw bad("UNSUPPORTED_MAKEUP_EFFECT","Unsupported effect");
            JsonNode strength=effect.get("intensity");
            if(strength==null || !strength.isNumber() || !Double.isFinite(strength.asDouble()) ||
               strength.asDouble()<0 || strength.asDouble()>1)
                throw bad("INVALID_MAKEUP","intensity must be between 0 and 1");
            if(effect.hasNonNull("feather")) {
                double f=effect.path("feather").asDouble(Double.NaN);
                if(!Double.isFinite(f) || f<0 || f>1) throw bad("INVALID_MAKEUP","Invalid feather");
            }
            if(effect.hasNonNull("color") && !effect.get("color").asText().matches("#[0-9a-fA-F]{6}"))
                throw bad("INVALID_MAKEUP","Invalid color");
            if(effect.hasNonNull("blendMode") && !MODES.contains(effect.get("blendMode").asText()))
                throw bad("INVALID_MAKEUP","Invalid blend mode");
        }
        ObjectNode params=mapper.createObjectNode();
        params.put("faceIndex",request.faceIndex());
        params.set("effects",mapper.valueToTree(request.effects()));
        params.put("outputMode",request.outputMode()==null?"PREVIEW":request.outputMode());
        if(request.baseRevisionId()!=null)params.put("baseRevisionId",request.baseRevisionId());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(
            images.submit(request.projectId(),request.assetId(),AiJobType.MAKEUP,params));
    }

    @GetMapping("/capabilities")
    public JsonNode capabilities(){return runner.capabilitiesV3();}

    private ApiException bad(String code,String msg){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,code,msg);}
}
