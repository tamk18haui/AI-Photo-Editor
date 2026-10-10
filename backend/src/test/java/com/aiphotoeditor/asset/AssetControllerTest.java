package com.aiphotoeditor.asset;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AssetControllerTest {
 @Test void listDelegatesWithProject() {
  var service=mock(AssetService.class);var controller=new AssetController(service);
  when(service.list(12L,AssetType.IMAGE)).thenReturn(java.util.List.of());
  assertTrue(controller.list(12L,AssetType.IMAGE).isEmpty());verify(service).list(12L,AssetType.IMAGE);
 }
}
