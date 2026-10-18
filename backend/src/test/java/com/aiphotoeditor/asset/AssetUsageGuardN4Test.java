package com.aiphotoeditor.asset;

import com.aiphotoeditor.common.ApiException;
import com.aiphotoeditor.project.ProjectAccessService;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** N4 prevents destructive deletion while an asset still participates in a job or derived chain. */
class AssetUsageGuardN4Test {
    AssetRepository repo=mock(AssetRepository.class);
    ProjectAccessService access=mock(ProjectAccessService.class);
    CloudinaryService cloud=mock(CloudinaryService.class);
    AssetService service=new AssetService(repo,access,cloud);
    Asset source(){
        Asset a=new Asset();a.id=17L;a.projectId=1L;a.cloudinaryPublicId="n4-asset17";
        when(repo.findByIdAndProjectId(17L,1L)).thenReturn(Optional.of(a));return a;
    }
    @Test void refusesDeleteWhenReferencedByDerivedAssets(){
        source();when(repo.existsByDerivedFromAssetId(17L)).thenReturn(true);
        assertThrows(ApiException.class,()->service.delete(1L,17L));
        verifyNoInteractions(cloud);verify(repo,never()).delete(any());
    }
    @Test void refusesDeleteWhenReferencedByAnyAiJob(){
        source();when(repo.countAiJobReferences(17L)).thenReturn(2L);
        assertThrows(ApiException.class,()->service.delete(1L,17L));
        verifyNoInteractions(cloud);verify(repo,never()).delete(any());
    }
    @Test void allowsDeleteOnlyWithoutKnownReferences(){
        var a=source();
        service.delete(1L,17L);
        verify(cloud).delete("n4-asset17");verify(repo).delete(a);
    }
}
