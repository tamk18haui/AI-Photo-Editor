package com.aiphotoeditor.project;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
public final class ProjectDtos {
 private ProjectDtos(){}
 public record CreateProjectRequest(@NotBlank @Size(max=150) String name,@Min(1) @Max(12000) Integer canvasWidth,@Min(1) @Max(12000) Integer canvasHeight,@Size(max=255) String background){}
 public record UpdateProjectRequest(@Size(max=150) String name,Long thumbnailAssetId){}
 public record DuplicateProjectRequest(@Size(max=150) String name){}
 public record ProjectResponse(Long id,String name,Long ownerId,int canvasWidth,int canvasHeight,String thumbnailUrl,Instant createdAt,Instant updatedAt){}
 public record ProjectPageResponse(List<ProjectResponse> items,int page,int size,long totalElements,int totalPages){}
 public record SaveStateResponse(Long projectId,Instant savedAt,long stateVersion){}
}
