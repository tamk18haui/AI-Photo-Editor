# N5 Huệ — Gemini và Natural Edit FULL V3

## Cách chạy trên Windows

1. Chạy MySQL và tạo database `ai_photo_editor`; Flyway tự áp dụng `V11__n5_job_idempotency.sql` khi backend khởi động.
2. Tạo `backend/.env` từ ví dụ hiện có, cấu hình `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SIGNING_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` cùng:

   ```properties
   GEMINI_API_KEY=your_server_side_key
   GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
   GEMINI_TEXT_MODEL=gemini-2.5-flash
   SERVER_PORT=8081
   ```

3. Trong `backend`, chạy `mvnw.cmd test` và `mvnw.cmd spring-boot:run` bằng JDK 21.
4. Trong `frontend`, chạy `npm ci`, `npm run build`, `npm run dev`. Đảm bảo proxy Vite chuyển `/api` đến backend cổng 8081.
5. Đăng nhập JWT, mở Project có ảnh, chọn **Chỉnh ảnh bằng câu lệnh** trong Editor.

Không commit key, `.env`, ảnh thử nghiệm hoặc checkpoint AI Local vào Git. N5 không gọi trực tiếp Python và không tạo thêm bảng job.

## Kiến trúc và API

- **Gemini Provider:** `POST /api/ai/gemini/operations`, `POST /api/ai/gemini/text-to-image`, `GET /api/ai/gemini/projects/{projectId}/context`.
- **Job Core chung:** `GET /api/ai/jobs/{jobId}`, `GET /api/ai/jobs/{jobId}/events` (fetch + JWT Bearer), `POST /cancel`, `POST /retry`, `GET /api/ai/jobs`. Retry job Gemini là lượt gọi mới có thể tính phí, nên cần body `{"paidOperationConfirmed":true}` sau khi người dùng đồng ý; retry job local không cần.
- **Natural Edit:** Người dùng gõ **một câu lệnh**; `POST /api/natural-edit/plan` kiểm tra bộ nhận diện nội bộ trước (không cần Gemini key), trả các bước công cụ sẵn có. Chỉ những lệnh chưa hiểu mới fallback sang Gemini **Text** để phân tích — API text cũng có thể sử dụng quota/tính phí. Lệnh chỉ gồm FRONTEND/LOCAL_AI được giao diện **tự thực hiện liên tiếp** ngay sau khi người dùng gửi; không bắt chọn từng chức năng hay xác nhận từng bước. `POST /api/natural-edit/execute` nhận `confirmed=true` với mọi lệnh, thêm `paidOperationConfirmed=true` **chỉ khi người dùng đã xác nhận riêng chi phí** cho kế hoạch có GEMINI_IMAGE. `GET /runs/{runId}` và `POST /runs/{runId}/advance` điều phối từng bước. FRONTEND upload tài sản mới; Local AI dùng worker N4; Gemini dùng worker N5; mọi bước chia sẻ `ai_jobs`.
- **Chống phát sinh phí ngoài ý muốn:** Backend từ chối mọi `/ai/gemini/operations`, `/text-to-image`, batch Gemini, hoặc kế hoạch có bước GEMINI_IMAGE nếu thiếu `paidOperationConfirmed=true`. Giao diện có checkbox đồng ý riêng, trạng thái mặc định luôn **chưa đồng ý**. Ảnh chỉ được xem trước sau khi xử lý, không tự Apply.
- **Tool Adapter N1 thật:** Với kế hoạch chỉ có thao tác Editor (ROTATE, FLIP, ADJUST, ADD_TEXT, ADD_STICKER, ADD_SHAPE, SET_FILTER, SET_BACKGROUND, SET_FRAME), `GeminiFullChat` gọi `LayersWorkspace.previewCommands` tạo bản xem trước **từ một bản sao cấu trúc layer**. Chỉ khi bấm **Áp dụng**, `applyCommands` mới lưu chính các thuộc tính/layer của N1 bằng cơ chế EditorState + kiểm tra state version. Giữ nguyên layer gốc, có Undo/Redo. Không dùng ảnh PNG flattened làm kết quả lưu cho nhóm lệnh này.
- **Không phân tích sai nội dung chữ:** Bộ nhận diện câu lệnh giữ dấu tiếng Việt, chữ hoa/thường, dấu phẩy và từ nối ở *bên trong dấu nháy*. Ví dụ `Thêm chữ "Xóa nền, làm nét"` chỉ thêm một layer chữ, tuyệt đối không kích hoạt xóa nền/làm nét. Có unit test riêng cho các trường hợp này.
- **Kế hoạch trộn AI Local/Gemini:** Vẫn dùng Job Core tuần tự, ảnh trung gian được kết xuất/upload như một Asset mới để N4/N5 xử lý. Các lệnh FRONTEND bên trong kế hoạch trộn chạy bằng Canvas kết xuất ảnh trung gian (không thể tự động giữ mọi thao tác ở dạng layer chỉnh sửa). Đây là hạn chế kiến trúc chưa thể coi như Tool Adapter đầy đủ cho mixed workflow.
- **Giới hạn mixed được chặn sớm:** Không chạy bước bỏ nền màu canvas, gỡ khung hay kiểu khung chưa có renderer tương ứng sau khi đã raster hóa; yêu cầu tách lệnh layer trước để tránh xem trước sai. Đổi *nền canvas* chỉ ảnh hưởng phần trong suốt, không phải phép tách chủ thể khỏi phông gốc; muốn xóa phông trong ảnh phải gọi N4 BiRefNet.
- **AI N4:** Đã định tuyến thêm DENOISE, AUTO_ENHANCE, FACE_RESTORE và MAKEUP (cấu hình effect được chuyển sang schema `faceIndex/effects/outputMode` của N4). Các hiệu ứng trang điểm hỗ trợ từ runner thực tế gồm son, má hồng, tóc, da, mắt, răng. Vật thể cần xóa vẫn đòi mask thật; không được tự bịa ID.
- **Batch:** `POST /api/ai/batches` (1–8 inputs, idempotency key), `GET /{batchId}` và `POST /{batchId}/cancel`. Parent batch và các child nằm chung bảng `ai_jobs`.
- **Apply:** `POST /api/ai/gemini/jobs/{jobId}/apply` kiểm trạng thái, Project, version và dùng N3 `AiResultLayerService` tạo Asset layer + History trong transaction. Không tự Apply khi Job hoàn thành.

REST contract cho toàn bộ endpoint mới nằm trong `docs/contracts/N5_FULL_V3_API_ADDENDUM.yaml`; quy tắc liên thông trong `docs/contracts/N5_FULL_V3_INTEGRATION_RULES.yaml`. Hai contract FULL V3 được phân công làm chuẩn trong Word chưa tồn tại ở nhánh main; các tệp này chỉ là phần bổ sung N5, cần nhóm duyệt và hợp nhất vào 07/08 chính thức, **không giả mạo một bản contract FULL hoàn chỉnh**.

### Ví dụ dùng Job API

```http
POST /api/ai/gemini/operations
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":1,"inputAssetId":34,"baseStateVersion":5,"operation":"BACKGROUND","prompt":"Thay nền thành bãi biển lúc hoàng hôn","idempotencyKey":"edit-20261025-001","paidOperationConfirmed":true}
```

Trả HTTP 202 `{"jobId":101,"status":"QUEUED"}`. Poll `GET /api/ai/jobs/101` hoặc dùng `fetch` đọc SSE `/api/ai/jobs/101/events` với Bearer. Khi `COMPLETED`, `resultAssetId` là **tài sản preview**, chưa thay Editor. Người dùng xác nhận:

```http
POST /api/ai/gemini/jobs/101/apply
Authorization: Bearer <JWT>
Content-Type: application/json

{"projectId":1,"expectedStateVersion":5}
```

Sai Project/token hoặc ảnh thuộc người khác → từ chối. Thay đổi State trong tab khác → HTTP 409. Apply lặp lại cùng job không tạo layer/history mới. Bước AI thất bại hoặc người dùng bỏ qua preview → ảnh nguồn giữ nguyên.

## Trạng thái chất lượng và giới hạn cần nghiệm thu

- Unit tests bổ sung cho whitelist kế hoạch, mask pixel/geometry, validation provider; các bài test liên thông cần MySQL + Cloudinary + Gemini key thật để xác minh AT-07, AT-09, AT-11, AT-12.
- Backend chưa được xác nhận chạy được trong môi trường thực thi hiện tại do Maven Central không thể phân giải DNS; cần đợi CI PASS trước khi merge.
- Frontend đã `npm run build` và chạy ESLint riêng ba tệp N5 thành công trong môi trường bàn giao. Backend yêu cầu Java 21 trong khi môi trường hiện chỉ có Java 17, vì vậy **chưa thể khẳng định unit/integration test backend PASS** ở đây.
- Cổng Vite mặc định trỏ tới 8081 cho máy của Sáng; có thể đổi bằng `VITE_BACKEND_PROXY_TARGET`. API cũ `POST /api/gemini/edit` cũng đòi `paidOperationConfirmed` để tránh bypass xác nhận phí từ client cũ.
- Mask của Gemini phải là grayscale PNG 8-bit cùng kích thước input. Để bảo vệ vùng ngoài mask, ảnh AI được ghép theo pixel với ảnh nguồn và hiện giới hạn 24 MP cho tác vụ masked edit.
- Natural Edit dùng công cụ web CROP/ROTATE/FLIP/ADJUST và các adapter chữ/sticker/hình khối/filter/nền/khung; dùng N4 REMOVE_BACKGROUND/UPSCALE/REMOVE_OBJECT khi có mask thật, thêm DENOISE/AUTO_ENHANCE/FACE_RESTORE/MAKEUP. CROP chưa có adapter non-destructive độc lập (đang kết xuất raster); trường hợp nội dung ảnh đã flatten không thể xóa nền màu hoặc gỡ khung cũ chỉ bằng CSS. Nếu REMOVE_OBJECT cần mask, N2 phải cung cấp `maskAssetId`; không giả tạo mask.
- Câu lệnh thử miễn phí: `Xoay phải 90 độ, tăng sáng 20% rồi làm nét x2`. N5 tách 3 bước theo thứ tự và tự chạy để tạo preview; không gọi Gemini Image. `Thay áo thành vest đen` cần Gemini Image; màn hình phải chặn và chờ xác nhận phí.
- Worker Gemini đang chạy qua `@Scheduled` với cùng bảng `ai_jobs` và vòng đời job N4, không tạo bảng queue riêng. Khi backend restart giữa request Gemini, job được đánh FAILED (không tự chạy lại có thể tính phí); người dùng được quyền retry có chủ đích.
- Batch hiện cung cấp REST status/cancel, chưa có màn hình quản lý Batch riêng trong N1. Bản preview Gemini được tích hợp vào Editor qua N3 History; cần test lại composition nhiều lớp, concurrent Apply và undo/redo bằng trình duyệt thật.

## Kiểm thử bàn giao

- Backend: `cd backend` → `mvnw.cmd test` (JDK 21, DB test hoạt động).
- Frontend: `cd frontend` → `npm ci` → `npm run build`.
- Acceptance: đăng nhập → Project A → ảnh đang render gồm text/filter → Gemini → Job progress → Preview → Apply → reload → Undo/Redo; sau đó thử hủy preview, quota 429, mất Gemini 503, mask sai kích thước, ảnh của Project B, hai tab chỉnh khác version, batch 2 ảnh và Natural Edit mix.
- Chỉ merge sau khi owner N1/N3/N4 review các thay đổi tại `LayersWorkspace`, `AiResultLayerService`, `AiJobService`; không sửa checkpoint/model N4.
