package com.aiphotoeditor.layerops;

import java.util.List;

/** N3 editor layer manipulation requests. Frontend sends one operation per user action. */
public final class LayerDtos {
 private LayerDtos() {}
 public record LayerPatch(String name,Boolean visible,Boolean locked,Double opacity,Long expectedStateVersion) {}
 public record LayerOrder(List<String> layerIds,Long expectedStateVersion) {}
 public record LayerResult(Long projectId,long stateVersion,int layerCount,String changedLayerId) {}
}
