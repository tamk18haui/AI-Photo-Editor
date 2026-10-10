package com.aiphotoeditor.asset;
import com.aiphotoeditor.project.ProjectAccessService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AssetServiceTest {
 @Test void rejectsNonImagesWithoutCloudinaryCall() throws Exception {
  var repo=mock(AssetRepository.class);var access=mock(ProjectAccessService.class);var cloud=mock(CloudinaryService.class);
  var service=new AssetService(repo,access,cloud);
  MultipartFile file=new MockMultipartFile("file","evil.txt","text/plain","not an image".getBytes());
  assertThrows(com.aiphotoeditor.common.ApiException.class,()->service.upload(1L,file,AssetType.IMAGE));
  verifyNoInteractions(cloud);
 }
}
