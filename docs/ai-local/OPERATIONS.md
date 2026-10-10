# AI Local — danh sách operation và kết quả

Các thao tác đều lấy `projectId` + `assetId` đã upload; không mở trang chỉnh sửa riêng. Job lưu ảnh kết quả thành **asset mới** (không thay đổi ảnh gốc). Backend không trực tiếp cập nhật layer; N1/N2 nhận `resultAssetId` và lựa chọn replace/add layer.

| Operation | Model / thuật toán | `params` chính | Kết quả |
|---|---|---|---|
| `upscale` | Real-ESRGAN | `scale:2/4`, `tileSize` tùy chọn | PNG kích thước ×2/×4 |
| `remove-background` | BiRefNet | `outputMode` `TRANSPARENT/WHITE/COLOR/MASK_ONLY`, `backgroundColor` | PNG RGBA hoặc mask |
| `smart-selection` | SAM ViT-B | `points:[{x,y,label}]`, `outputMode:MASK_ONLY/TRANSPARENT` | Mask PNG / ảnh RGBA |
| `remove-object` | big-LaMa (mặc định) | `maskAssetId`, `method:LAMA/OPENCV` | Ảnh đã xóa vật thể |
| `inpaint` | big-LaMa hoặc OpenCV | `maskAssetId`, `method` | Ảnh được tái tạo vùng mask |
| `face-restore` | GFPGAN v1.4 | `fidelity:0..1` | PNG khuôn mặt phục hồi |
| `face-parsing` | BiSeNet ResNet34 ONNX | `classId?` (0..18) | PNG nhãn 0..18 hoặc mask nhị phân |
| `denoise` | OpenCV | `strength:LOW/MEDIUM/HIGH` | PNG giảm nhiễu |
| `auto-enhance` | OpenCV | `mode:AUTO/PORTRAIT/LANDSCAPE/DOCUMENT` | PNG đã cải thiện |
| `sharpen` | OpenCV | `amount`, `radius` | PNG làm sắc nét |
| `adjust` | OpenCV/Pillow | `brightness`, `contrast`, `saturation`, `exposure` | PNG điều chỉnh |
| `white-balance` | OpenCV | `strength` | PNG cân bằng trắng |
| `hdr-style` | OpenCV | `strength` | PNG tone mapping phong cách HDR |
| `refine-mask` | Pillow | `maskAssetId`, `grow`, `feather` | PNG mask |
| `apply-mask` | Pillow | `maskAssetId`, `outputMode` | PNG RGBA |
| `replace-background` | Pillow + BiRefNet khi không có mask | `backgroundAssetId?`, `maskAssetId?`, `backgroundColor?` | PNG nền mới |

**JSON APIs** (không tạo asset ảnh): `/api/ai/analyze-quality` (OpenCV metrics) và `/api/ai/local/face-landmarks` (MediaPipe 3D landmark coordinates). OpenCV face rectangles có tại runner endpoint riêng phục vụ test và tích hợp mở rộng.

**Không có Outpainting/Generative Fill trong bộ 7 model**, vì cần thêm generative diffusion pipeline. `MagicTouch` không nằm trong bộ mặc định. Code trả lỗi rõ khi checkpoint/dependencies chưa có.

### Định dạng vùng chọn

`points` dùng tọa độ chuẩn hóa `x,y` từ 0..1. `label=1` để thêm, `label=0` để loại vùng; `maskAssetId` trỏ tới ảnh grayscale thuộc **cùng project và đúng quyền**. Mask được đưa về kích thước ảnh nguồn khi áp dụng. BiSeNet trả class-map nên khi cần mask vùng môi/tóc hãy gửi `classId` theo mapping 19 lớp của dự án yakhyo.

### Ghi chú hiệu năng

- SAM ViT-B, Real-ESRGAN, BiRefNet, GFPGAN, LaMa có thể chậm/ngốn RAM trên CPU.
- `fidelity` của GFPGAN là **mức blend với ảnh gốc sau restoration**, không phải native fidelity control của CodeFormer.
- Quality scores là heuristics, không dùng làm chỉ số khách quan tuyệt đối.
- FastAPI HTTP `GET /health` kiểm tra liveness, **không có nghĩa 7 model đã sẵn sàng**.
