package com.aiphotoeditor.job;

/** AI Local operations. Public endpoint ownership is delegated to the web API module. */
public enum AiJobType {
    UPSCALE("upscale"),
    REMOVE_BACKGROUND("remove-background"),
    DENOISE("denoise"),
    AUTO_ENHANCE("auto-enhance"),
    SHARPEN("sharpen"),
    ADJUST("adjust"),
    WHITE_BALANCE("white-balance"),
    HDR_STYLE("hdr-style"),
    SMART_SELECTION("smart-selection"),
    APPLY_MASK("apply-mask"),
    REFINE_MASK("refine-mask"),
    REPLACE_BACKGROUND("replace-background"),
    REMOVE_OBJECT("remove-object"),
    INPAINT("inpaint"),
    FACE_PARSING("face-parsing"),
    FACE_RESTORE("face-restore");

    private final String runnerOperation;

    AiJobType(String runnerOperation) {
        this.runnerOperation = runnerOperation;
    }

    /** Function: Return the exact operation slug recognized by Python. */
    public String runnerOperation() {
        return runnerOperation;
    }

    /** Function: True when the Python result is a mask rather than an image. */
    public boolean producesMask() {
        return this == SMART_SELECTION || this == REFINE_MASK || this == FACE_PARSING;
    }
}
