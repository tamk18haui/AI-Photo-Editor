# N5 (Huệ) — Gemini Chat chỉnh ảnh bằng câu lệnh

## Luồng sử dụng

Mở Editor → chọn **Chỉnh theo AI** → **Chỉnh ảnh bằng câu lệnh** → Gemini Chat → gửi prompt và **ảnh Editor hiện tại** → Backend gọi Gemini image editing → hiển thị preview → **Apply vào Editor** hoặc nhắn tiếp để chỉnh trên preview vừa tạo.

- Gemini **không** gọi AI runner/N4, `AiJob*`, SSE hay worker; yêu cầu đồng bộ theo từng tin nhắn.
- **Không thêm migration V6/V7/V8**, không sửa database, controller/project/asset của N3.
- N5 xử lý ảnh của phiên chỉnh sửa trong bộ nhớ. **Apply** chỉ thay ảnh đang mở trong Editor và reset điều chỉnh CSS cũ (tránh áp filter 2 lần), **chưa lưu lên Cloudinary/Project/History của N3**. Bấm **Xuất ảnh** trong Editor để lưu file PNG về máy. Khi N3 tích hợp EditorState/Asset, tích hợp lưu riêng sau.
- Mỗi tin nhắn tiếp theo gửi **ảnh preview mới nhất** và prompt mới tới Gemini, không tự động Apply và không tự gửi toàn bộ lịch sử văn bản cho Gemini. Lịch sử chat chỉ tồn tại trong modal hiện tại.

## Cài vào repo / nhánh riêng

1. Giải nén `N5_Hue_Gemini_Patch.zip` ra thư mục riêng, **không giải nén đè vào repo**.
2. Repo phải sạch (`git status`). Trong PowerShell, chạy từ thư mục đã giải nén:

```powershell
.\tools\Install-N5.ps1 -RepoPath 'E:\AI-Photo-Editor' -Push
```

Script kiểm tra repo sạch, `git fetch`, chuyển sang `main`, `pull --ff-only`, tạo **nhánh `n5-hue-gemini`**, thêm 6 file N5 mới, chỉ vá đúng **một file hiện có `frontend/src/pages/EditorPage.tsx`** ở các điểm mở chat/Apply, commit, và nếu có `-Push` thì push branch lên GitHub. Không tự merge. Nếu GitHub không cho phép push, code và commit local vẫn được giữ. Bỏ `-Push` nếu chỉ muốn kiểm tra trước.

**Cảnh báo:** script yêu cầu working tree sạch, branch `n5-hue-gemini` chưa tồn tại ở máy. Nó KHÔNG `reset --hard`, KHÔNG `force-push`, KHÔNG xóa dữ liệu và sẽ từ chối ghi đè file N5 đã tồn tại. Không chạy nếu bạn có thay đổi chưa commit/stash.

## Cấu hình Backend (chỉ trên máy, không commit API key)

Ở `backend/.env` (bản sao của `backend/.env.example`), thêm:

```properties
GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_KEY
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
SERVER_PORT=8081
```

Mô hình có thể chọn `gemini-3.1-flash-lite-image` hoặc `gemini-3-pro-image` nếu account API hỗ trợ. Cần tài khoản Google Gemini API đã kích hoạt truy cập mô hình ảnh và quota; có thể phát sinh phí. API key chỉ nằm trong Backend.

Backend từ thư mục `backend`:

```powershell
.\mvnw.cmd test
.\mvnw.cmd spring-boot:run
```

Vì `frontend/vite.config.ts` của `main` đang proxy `/api` đến **8080**, nhưng N3 thường chạy Backend **8081**, tạo `frontend/.env.local` để N5 gọi chính xác Backend N3 (không cần sửa Vite config của N1):

```properties
VITE_N5_GEMINI_URL=http://localhost:8081/api/gemini/edit
```

Sau đó từ `frontend`:

```powershell
npm ci
npm run build
npm run dev
```

N5 sử dụng `localStorage['lumina-access-token']` giống nhánh N1 Auth; Backend `/api/gemini/edit` **bắt buộc JWT hợp lệ**. Trên nhánh `main` tại thời điểm đóng gói, `LoginPage` vẫn chỉ là UI demo (chưa trả JWT). Để chạy end-to-end, cần merge **N1 Auth integration** hoặc thực hiện đăng nhập qua API rồi đặt access token vào session theo contract N1. Không bỏ xác thực chỉ để test Gemini.

## API contract

`POST /api/gemini/edit` với `multipart/form-data`, header `Authorization: Bearer <access-token>`:

- `image`: JPEG, PNG hoặc WebP, tối đa 20 MiB
- `prompt`: không rỗng, tối đa 1500 ký tự
- Response JSON: `{ "mimeType":"image/png", "imageBase64":"...", "message":"..." }`

Ví dụ PowerShell (có JWT):

```powershell
curl.exe -X POST 'http://localhost:8081/api/gemini/edit' -H "Authorization: Bearer $env:N5_ACCESS_TOKEN" -F 'prompt=Xóa chiếc xe ở nền sau, giữ nguyên khuôn mặt' -F 'image=@C:\temp\photo.png;type=image/png'
```

Gemini có thể trả lỗi 429, không có ảnh, hoặc chậm; giao diện giữ bản preview trước và cho người dùng gửi lại. Không có kết quả Gemini giả lập.

## Phạm vi thay đổi

- **Mới:** `backend/src/main/java/com/aiphotoeditor/gemini/*` (controller + client Google)
- **Mới:** `backend/src/test/java/com/aiphotoeditor/gemini/*` (validation test)
- **Mới:** `frontend/src/features/gemini/*` (giao diện Gemini chat, preview, API)
- **Sửa tối thiểu:** `frontend/src/pages/EditorPage.tsx` (mở modal, kết nối Apply)
- **Giữ nguyên:** `ai-runner/`, `backend/src/main/java/com/aiphotoeditor/ai/`, `job/`, `asset/`, `project/`, `db/migration/`, `pom.xml`, `application.yml`, `.env.example`, các file auth N1 và Vite config.

## Lưu ý kiểm thử

- Thử luồng một prompt, nhiều prompt (lượt sau dùng preview trước), Apply, xuất ảnh, close không Apply.
- Test 401 khi thiếu/expired JWT, 503 khi thiếu `GEMINI_API_KEY`, 400 khi prompt/ảnh không hợp lệ, 429 khi API quota, 502 khi API trả lỗi hoặc không có ảnh.
- Trên máy khác, chỉ cần cấu hình lại `GEMINI_API_KEY`, port và đăng nhập đúng. Không đưa `backend/.env` hoặc `frontend/.env.local` lên Git.
