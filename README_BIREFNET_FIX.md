# BiRefNet – bản vá chuẩn hóa đầu vào, 10/10/2026

**Vấn đề:** `/api/ai/remove-background` trả `COMPLETED` và tạo Asset nhưng ảnh không xóa nền rõ ràng. Code N4 FULL cũ chuẩn hóa `(RGB/255 - 0.5) / 1`, không khớp preprocessing của mô hình BiRefNet (`mean=[.485,.456,.406]`, `std=[.229,.224,.225]`). Bản vá chỉ sửa normalization. Đây là lỗi xác định bằng cách đối chiếu code, **không bảo đảm** xóa nền chính xác cho mọi ảnh.

**Nguồn mô hình:** https://huggingface.co/ZhengPeng7/BiRefNet (example official inference).

## Cài đặt

1. **Dừng Python Runner** đang chạy (Ctrl+C); giữ Spring Boot chạy.
2. Mở PowerShell:
   ```powershell
   cd E:\AI-Photo-Editor
   Copy-Item .\ai-runner\processors\remove_background.py .\ai-runner\processors\remove_background.py.bak_pre_imagenet_fix -Force
   Expand-Archive -LiteralPath 'D:\DOWNLOAD\AI-Local-BiRefNet-Preprocess-Fix.zip' -DestinationPath 'E:\AI-Photo-Editor' -Force
   cd .\ai-runner
   .\.venv\Scripts\python.exe -m pytest -q tests/test_birefnet_preprocess.py
   .\.venv\Scripts\python.exe run.py
   ```
3. Sau khi Python Runner đã chạy lại, ở PowerShell khác chạy lại script E2E `remove-background` với `AssetId 1` để tạo **job/asset mới**. Asset 3 từ job 2 vẫn là kết quả cũ.

## Kiểm tra kênh alpha của ảnh cũ hoặc ảnh mới

```powershell
$png = 'D:\DOWNLOAD\job2_remove_bg.png'
Invoke-WebRequest -UseBasicParsing -Uri '<RESULT_URL_cua_job_2>' -OutFile $png
cd E:\AI-Photo-Editor\ai-runner
.\.venv\Scripts\python.exe .\tools\check_alpha.py $png
```

`ALPHA_TRANSPARENT_PCT` gần 0% và `ALPHA_RANGE: 255..255` chứng tỏ gần như không xóa vùng nào. Nếu có vùng trong suốt đáng kể nhưng trông vẫn nền trắng, xem file `_checkerboard.png` để phân biệt lỗi hiển thị.

**Không ghi đè `.env`, weights, database, Java hay Cloudinary.** Không commit ảnh kiểm thử, weights, secrets. Có thể rollback từ file `.bak_pre_imagenet_fix` sau khi tắt Python Runner.
