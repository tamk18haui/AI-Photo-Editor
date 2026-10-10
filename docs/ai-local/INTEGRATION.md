# Tích hợp API: Spring Boot → Python Runner → Cloudinary → Frontend

## Contract hiện có

Hai tài liệu tại `docs/contracts/07_API_CONTRACT_v2_1_CLOUDINARY_FINAL.yaml` và `08_FE_BE_INTEGRATION_CONSTRAINTS_v1.yaml` thuộc sở hữu chung. Installer không ghi đè. `servers: /api` trong OpenAPI.

| HTTP API (Spring Boot) | Code phụ trách | Trả về |
|---|---|---|
| `POST /api/projects/{projectId}/assets` | `AssetController` | `201 AssetResponse` |
| `GET /api/projects/{projectId}/assets` | `AssetController` | AssetResponse[] |
| `GET/DELETE /api/projects/{projectId}/assets/{assetId}` | `AssetController` | AssetResponse/204 |
| `POST /api/ai/upscale` | `LocalAiController` | 202 `{jobId,status}` |
| `POST /api/ai/remove-background` | `LocalAiController` | 202 `{jobId,status}` |
| `POST /api/ai/denoise` | `LocalAiController` | 202 `{jobId,status}` |
| `POST /api/ai/face-restore` | `LocalAiController` | 202 `{jobId,status}` |
| `POST /api/ai/auto-enhance` | `LocalAiController` | 202 `{jobId,status}` |
| `POST /api/ai/analyze-quality` | `LocalAiController` | 200 JSON |
| `GET /api/ai/local/jobs/{jobId}` | `LocalAiController` (poll fallback) | 200 job state |
| `POST /api/ai/local/operations/{operation}` | `LocalAiController` (mở rộng) | 202 `{jobId,status}` |
| `POST /api/ai/local/face-landmarks` | `LocalAiController` (mở rộng) | 200 JSON |

**Lưu ý ownership:** Theo thống nhất mới giữa chủ N4 và bạn hỗ trợ, AI Local public Controller do N4 triển khai; N5 vẫn giữ `/api/ai/jobs`, Job SSE và Gemini/Natural Edit. Cần N3/N5 xác nhận trong PR để không mapping trùng. `/api/ai/remove-object` hiện là **AI Gemini** theo YAML, nên dùng endpoint riêng `/api/ai/local/operations/remove-object` cho LaMa cho đến khi hợp đồng được review.

## Ví dụ request

```http
POST /api/ai/upscale
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":12,"assetId":301,"scale":2,"tileSize":512}
```

```http
POST /api/ai/local/operations/smart-selection
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":12,"assetId":301,"params":{"points":[{"x":0.51,"y":0.36,"label":1}],"outputMode":"MASK_ONLY"}}
```

```http
POST /api/ai/local/operations/remove-object
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":12,"assetId":301,"params":{"maskAssetId":325,"method":"LAMA"}}
```

```http
POST /api/ai/local/operations/face-parsing
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":12,"assetId":301,"params":{"classId":12}}
```

`GET /api/ai/local/jobs/{jobId}` trả `status=COMPLETED`, `resultAssetId`, `resultUrl`; frontend cập nhật layer đang chọn hoặc thêm layer theo thao tác người dùng, không tự download/reupload PNG.

## Kết nối nội bộ

`AiRunnerClient` gửi multipart tới `http://127.0.0.1:8010/v1/run/{operation}` gồm `file`, `params`, `mask?`, `background?`, header `X-Runner-Token`. Python trả PNG thật hoặc `{code,message}` có HTTP lỗi. JSON khác qua `/v1/analyze-quality`, `/v1/face-landmarks`.

- N3 cung cấp JWT, `ProjectAccessService.requireMine/requireOwned`; `OwnedAssetReferenceResolver` implement `AssetReferenceResolver` đã có trong monorepo.
- Spring Boot đọc asset URL từ MySQL sau kiểm quyền, không nhận URL tùy ý từ client; Asset kết quả lưu bằng Cloudinary signed upload.
- Không ghi đè ảnh nguồn. Không commit secrets/weights. N3 review V3–V5/Flyway.
- Các URL `/api/ai/local/*` là **phần mở rộng**, cần bổ sung vào contract YAML trước khi N1/N2 dựa vào cho production.
- N5 có thể sử dụng trực tiếp `LocalImageService` khi Natural Edit điều phối AI Local, không phải chạy trung gian cho request AI thông thường.

## Kiểm thử bắt buộc trước khi merge

1. Java 21 `mvnw.cmd clean test` pass trên chính nhánh từ `main` hoặc `develop` mới nhất.
2. Pytest pass với cả ảnh RGB/RGBA/mask và token sai.
3. Load + inference thật từng checkpoint; đối chiếu các ảnh thử trước/sau.
4. JWT user A không thể đọc asset/job của user B, test đúng `projectId`.
5. Cloudinary upload/re-download, job `QUEUED→RUNNING→COMPLETED`, `resultUrl` trả đúng.
6. Test job bị hủy, thiếu weights, hết dung lượng, cloud thất bại, ảnh quá lớn; kết quả không giả.
7. N1/N2 test bằng Postman/Frontend trên cùng environment; validate response theo YAML chung.
