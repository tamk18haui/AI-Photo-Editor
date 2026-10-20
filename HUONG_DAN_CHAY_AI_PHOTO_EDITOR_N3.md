# HƯỚNG DẪN CHẠY AI-PHOTO-EDITOR (LUMINA) — N3

> Dành cho Windows / PowerShell. Lưu file tại thư mục gốc `E:\AI-Photo-Editor-N3\HUONG_DAN_CHAY_AI_PHOTO_EDITOR_N3.md`.
>
> Cập nhật: 21/10/2026. Căn cứ cấu trúc repo công khai và những lần chạy gần đây của nhóm; **chưa kiểm tra trực tiếp nhánh N3 trên máy bạn**. Nếu nhánh hiện tại đã đổi tên biến môi trường hoặc đường dẫn, ưu tiên cấu hình thực tế trong repo.

## 0. Sơ đồ và địa chỉ cần nhớ

| Thành phần | Đường dẫn / địa chỉ | Ghi chú |
|---|---|---|
| Repo N3 | `E:\AI-Photo-Editor-N3` | Thay nếu bạn clone ở chỗ khác |
| MySQL | `localhost:3306` | Tên database đã sử dụng: `ai_photo_editor` |
| Backend Spring Boot | `http://localhost:8081` | Nếu `8081` đã bị chiếm, kiểm tra cấu hình |
| Frontend React + Vite | `http://localhost:5173` | Vite có thể tự chuyển cổng khi 5173 bận |
| Admin Dashboard | `http://localhost:5173/admin` | **Không chạy server Admin riêng** |
| AI Runner Python | `http://127.0.0.1:8010` | Health: `/health` |

**Thứ tự khởi động:** MySQL → Backend → AI Runner (nếu dùng AI Local) → Frontend → đăng nhập Admin.

**Chuẩn bị:** MySQL Server 8.x, Java/JDK theo `backend/pom.xml`, Node.js và npm, Python cùng virtual environment tương thích dự án, Maven Wrapper hoặc Maven. Mỗi server chạy **một cửa sổ PowerShell riêng**, giữ cửa sổ mở.

## 1. Kiểm tra repo và thư mục

Mở PowerShell đầu tiên:

```powershell
cd E:\AI-Photo-Editor-N3
Get-Location
git branch --show-current
git status --short
Get-ChildItem -Name
```

Thông thường đang làm trên `feature/n3-admin-management`. Nếu branch khác, **không tự động checkout hoặc reset**, kiểm tra lại trước khi chạy và push.

## 2. MySQL — bật server và kiểm tra database

**Cách dễ nhất:** mở Windows Services (`services.msc`) → tìm `MySQL80` (hoặc tên dịch vụ MySQL đang cài) → Start. Hoặc nếu tên dịch vụ thực sự là `MySQL80`, chạy PowerShell với quyền Admin:

```powershell
Start-Service MySQL80
Get-Service MySQL80
```

Kiểm tra dịch vụ có lắng nghe cổng 3306:

```powershell
Test-NetConnection localhost -Port 3306
```

Nếu đã cài lệnh `mysql` trong PATH, đăng nhập bằng chính tài khoản MySQL của bạn:

```powershell
mysql -u root -p
```

Trong cửa sổ MySQL (không phải PowerShell):

```sql
SHOW DATABASES;
USE ai_photo_editor;
SHOW TABLES;
SELECT installed_rank, version, description, success
FROM flyway_schema_history ORDER BY installed_rank;
```

Nếu database **chưa tồn tại**, hãy mở và **kiểm tra nội dung** `database/CREATE_DATABASE_DEV.sql` trước khi chạy. Không chạy lại script tạo schema/migration trên database có dữ liệu thật, không xóa bảng và không `flyway repair` chỉ để lách checksum.

Nếu lệnh `mysql` không được nhận diện, dùng MySQL Workbench kết nối `localhost:3306`, nhập đúng user/password đang cấu hình.

## 3. Backend N3 — Spring Boot (cửa sổ PowerShell số 2)

```powershell
cd E:\AI-Photo-Editor-N3\backend
java -version
Test-Path .\mvnw.cmd
```

**Cấu hình database và JWT:** đối chiếu với `backend/src/main/resources/application.yml`, `backend/.env.example` hoặc hướng dẫn hiện hành của nhánh. Những biến đã xuất hiện trong tài liệu N3 là `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SIGNING_SECRET`; cổng thường là `SERVER_PORT=8081`. Ví dụ (điền giá trị thật trên máy, KHÔNG copy mật khẩu mẫu lên Git):

```powershell
$env:DB_URL = 'jdbc:mysql://localhost:3306/ai_photo_editor'
$env:DB_USERNAME = 'root'
$env:DB_PASSWORD = Read-Host 'Nhap mat khau MySQL'
$env:JWT_SIGNING_SECRET = Read-Host 'Nhap JWT secret da dung tren may (>=32 bytes)'
$env:SERVER_PORT = '8081'
```

> **Quan trọng:** Chỉ đặt các biến trên nếu `application.yml` hiện tại thực sự đọc đúng tên đó. `Read-Host` không lưu vĩnh viễn; chạy lại khi mở terminal mới. Không commit secret. Với AI N5, key OpenAI/Gemini chỉ đưa vào môi trường Backend sau khi tích hợp hoàn tất.

Chạy Backend:

```powershell
if (Test-Path .\mvnw.cmd) {
    .\mvnw.cmd spring-boot:run
} else {
    mvn spring-boot:run
}
```

Khi cần chạy test riêng (trong cửa sổ khác hoặc sau khi dừng Backend):

```powershell
cd E:\AI-Photo-Editor-N3\backend
if (Test-Path .\mvnw.cmd) { .\mvnw.cmd test } else { mvn test }
```

Kiểm tra cổng Backend từ cửa sổ PowerShell khác:

```powershell
Test-NetConnection localhost -Port 8081
```

Không kết luận Backend lỗi chỉ vì mở đường dẫn `/` trả 404: nhiều ứng dụng chỉ có các endpoint `/api/...` và chúng có thể yêu cầu JWT.

## 4. AI Runner N4 — Local AI Python (cửa sổ số 3)

```powershell
cd E:\AI-Photo-Editor-N3\ai-runner
Test-Path .\.venv\Scripts\python.exe
```

Nếu kết quả `True`, chạy đúng Python thuộc môi trường ảo:

```powershell
.\.venv\Scripts\python.exe .\run.py
```

Nếu `False`: **không tự cài lại bừa**; kiểm tra phiên bản Python, file `requirements*.txt`, hướng dẫn N4 và model weights trên máy. `ai-runner/.venv` và weights lớn có thể không có sau khi clone; phải thiết lập riêng. Đừng mặc định Python 3.13 tương thích tất cả thư viện AI.

Kiểm tra API trong PowerShell mới:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
```

Kết quả mong muốn trước đây: trạng thái `UP`. AI local có thể cần token giữa Backend và Runner tùy cấu hình; `/health` chạy được chưa chứng minh tất cả model đã sẵn sàng. Không upload model weights hoặc `.venv` lên Git.

## 5. Frontend N1/N2 — React / Vite (cửa sổ số 4)

```powershell
cd E:\AI-Photo-Editor-N3\frontend
node -v
npm -v
```

Lần đầu clone hoặc khi chưa có `node_modules`:

```powershell
npm ci
```

Nếu repo/lockfile hiện tại không hỗ trợ `npm ci`, kiểm tra `package-lock.json` và dùng `npm install` có chủ đích, không xóa lockfile tùy tiện.

Sau đó chạy:

```powershell
npm run dev
```

Mở trình duyệt:

```powershell
Start-Process 'http://localhost:5173'
```

**Lưu ý proxy/API:** kiểm tra `frontend/vite.config.ts` và `frontend/.env.local` hiện tại xem frontend đang gọi Backend `8080` hay `8081`. Có thời điểm cấu hình Vite của nhánh main proxy về `8080`, trong khi N3 chạy `8081`. Phải cập nhật đúng biến/proxy theo cấu trúc nhánh đang chạy rồi khởi động lại Vite. Không chỉ chỉnh mỗi N5 mà bỏ quên API Auth/Projects của N1.

## 6. Admin Dashboard N3 — cách vào

**Không có lệnh chạy Admin riêng.** Phải có MySQL + Backend + Frontend đang chạy.

1. Vào `http://localhost:5173`.
2. Đăng nhập bằng tài khoản đã được cấp vai trò `ADMIN` (trong phiên kiểm thử trước là tài khoản ID 8).
3. Mở `http://localhost:5173/admin`.
4. Kiểm tra Dashboard hiển thị dữ liệu từ API và các màn hình Tài khoản, Phân quyền, Premium, Nhật ký quản trị.

**Bảo mật:** đừng trực tiếp sửa DB hoặc tắt kiểm tra JWT chỉ để vượt trang đăng nhập. Không khóa tài khoản Admin chính. Admin Dashboard đã hiển thị được thống kê nhưng chưa có bằng chứng đầy đủ rằng tất cả hành động khóa/mở khóa, phân quyền, Premium và audit log đều đã qua kiểm thử.

## 7. Kiểm tra nhanh tất cả dịch vụ (PowerShell mới)

```powershell
Test-NetConnection localhost -Port 3306  # MySQL
Test-NetConnection localhost -Port 8081  # Backend
Test-NetConnection localhost -Port 8010  # AI Runner
Test-NetConnection localhost -Port 5173  # Frontend
Invoke-RestMethod http://127.0.0.1:8010/health
Start-Process 'http://localhost:5173/admin'
```

Các dòng `TcpTestSucceeded : True` chứng minh cổng đang mở, **không tự chứng minh từng chức năng đã thành công**.

## 8. Lỗi thường gặp

| Lỗi | Kiểm tra trước |
|---|---|
| Backend báo `Port 8080 already in use` | Dùng `SERVER_PORT=8081` nếu `application.yml` hỗ trợ; kiểm tra `netstat -ano \| findstr :8080` |
| MySQL `Access denied` | Đúng host/user/password và quyền database; không hardcode thông tin nhạy cảm |
| Flyway checksum mismatch | Không sửa migration đã chạy; đối chiếu lịch sử và file V1–V5; không tùy tiện `repair`/xóa DB |
| FE không gọi API được | Kiểm tra proxy Vite, CORS, Backend port, Network tab trong DevTools, JWT |
| `/admin` trả 403 hoặc redirect | Kiểm tra đã đăng nhập và tài khoản có role ADMIN; không tự sửa quyền trong code |
| AI Runner thiếu module/weights | Kiểm tra `.venv`, dependency và đường dẫn weights của N4 |
| AI chỉnh ảnh bằng OpenAI chưa chạy | N5 đang chuyển nhà cung cấp từ Gemini; chỉ test khi nhánh OpenAI đã tích hợp và cấu hình key hợp lệ |

## 9. Tắt dịch vụ

Trong từng cửa sổ đang chạy `npm run dev`, Spring Boot, AI Runner: nhấn **Ctrl+C**. Không cần tắt MySQL nếu dịch vụ đang dùng cho việc khác.

## 10. Thêm file hướng dẫn vào Git (sau khi xác nhận chạy ổn)

Đặt file này trong thư mục gốc của repo N3, mở PowerShell:

```powershell
cd E:\AI-Photo-Editor-N3
git branch --show-current
git status --short
git add .\HUONG_DAN_CHAY_AI_PHOTO_EDITOR_N3.md
git diff --cached --check
git diff --cached --stat
git commit -m "docs(n3): add local run guide for backend frontend ai admin mysql"
```

**Chưa tự push toàn bộ code** khi chưa xem `git status` và các file khác đang thay đổi. Sau khi kiểm tra, push nhánh `feature/n3-admin-management` bằng `git push -u origin feature/n3-admin-management`. Không dùng `--force`, không merge thẳng `main`.

---

**Ghi chú:** Tài liệu được soạn để copy thao tác nhanh, không chứa API key, mật khẩu hoặc JWT thực. Không có cơ sở xác nhận tất cả lệnh đã chạy thành công trên máy/nhánh N3 hiện tại; kiểm tra lại bằng terminal thực tế.
