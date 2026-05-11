# Smart Job Portal with Document Search

Hệ thống tuyển dụng hỗ trợ đăng tin, ứng tuyển bằng CV PDF, lưu trữ hồ sơ, trích xuất nội dung CV/JD và tìm kiếm full-text.

## Tính năng chính

- Nhà tuyển dụng đăng và quản lý tin tuyển dụng.
- Ứng viên tìm kiếm, lọc việc làm và ứng tuyển bằng CV.
- Chỉ cho phép upload CV định dạng PDF.
- Lưu trữ CV PDF trên Cloudinary.
- Background worker tự động tải PDF, trích xuất văn bản và lưu vào cơ sở dữ liệu.
- Tìm kiếm full-text trên CV và JD bằng Meilisearch nếu được cấu hình, tự động fallback sang MySQL FULLTEXT khi chưa bật Meilisearch.
- Nhà tuyển dụng xem CV ứng viên, tải CV và cập nhật trạng thái ứng tuyển.
- Ứng viên theo dõi trạng thái: Đã nộp, Đang xét duyệt, Phỏng vấn, Không đạt.
- Admin quản lý người dùng, tin tuyển dụng, tài liệu và thống kê hệ thống.

## Công nghệ sử dụng

- Frontend: HTML, CSS, JavaScript ES Modules.
- Backend: Node.js, Express.
- Database: MySQL.
- Authentication: JWT.
- File storage: Cloudinary.
- PDF text extraction: `pdf-parse`.
- Search engine: Meilisearch hoặc MySQL FULLTEXT fallback.

## Yêu cầu môi trường

- Node.js 18 trở lên.
- MySQL 8.x khuyến nghị.
- Tài khoản Cloudinary để upload và xem CV PDF.
- Meilisearch là tùy chọn, chỉ cần nếu muốn test search engine riêng.

## Cài đặt database

Tạo database:

```sql
CREATE DATABASE job_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Import schema và dữ liệu mẫu:

```powershell
mysql -u root -p job_portal < database/db.sql
```

Nếu muốn dùng đúng user trong file `.env` mẫu:

```sql
CREATE USER 'job_user'@'localhost' IDENTIFIED BY 'job_pass';
GRANT ALL PRIVILEGES ON job_portal.* TO 'job_user'@'localhost';
FLUSH PRIVILEGES;
```

## Cấu hình backend

Vào thư mục backend và cài dependencies:

```powershell
cd backend
npm install
```

Tạo file `backend/.env`:

```env

```

Chạy backend:

```powershell
npm start
```

Kiểm tra API:

```text
http://localhost:5000/
```

## Chạy frontend

Mở terminal mới:

```powershell
cd frontend
python -m http.server 5500
```

Truy cập:

```text
http://localhost:5500/
```

Nếu frontend gọi sai API, mở DevTools Console và chạy:

```js
localStorage.setItem('apiBaseUrl', 'http://localhost:5000/api');
location.reload();
```

## Tài khoản demo

```text
Admin:
Email: admin@smartjob.vn
Password: 123456

Nhà tuyển dụng:
Email: hr@abc.tech
Password: 123456

Ứng viên:
Email: tuyet.mai@student.uit.edu.vn
Password: 123456
```

## Luồng sử dụng cho ứng viên

1. Đăng nhập bằng tài khoản ứng viên.
2. Vào mục Tìm việc làm.
3. Nhập từ khóa, chọn địa điểm hoặc loại hình rồi bấm Áp dụng bộ lọc.
4. Mở chi tiết việc làm và ứng tuyển.
5. Vào Upload CV để tải CV PDF lên hệ thống.
6. Vào Quản lý CV để xem CV đã upload và trạng thái xử lý.
7. Vào Việc đã ứng tuyển để lọc theo Đã nộp, Đang xét duyệt, Phỏng vấn hoặc Không đạt.

## Luồng sử dụng cho nhà tuyển dụng

1. Đăng nhập bằng tài khoản nhà tuyển dụng.
2. Đăng tin tuyển dụng mới.
3. Vào danh sách hồ sơ ứng tuyển.
4. Click biểu tượng xem để mở CV ứng viên.
5. Dùng nút Tải CV nếu muốn tải file gốc.
6. Cập nhật trạng thái ứng viên. Trạng thái này sẽ được lưu vào database và hiển thị lại bên ứng viên.
7. Tìm kiếm ứng viên theo tên, kỹ năng hoặc nội dung CV.

## Luồng sử dụng cho admin

1. Đăng nhập bằng tài khoản admin.
2. Theo dõi dashboard tổng quan.
3. Quản lý người dùng, tin tuyển dụng, tài liệu và báo cáo hệ thống.

## Pipeline trích xuất và tìm kiếm CV/JD

Khi ứng viên upload CV:

1. Backend nhận file PDF.
2. File được upload lên Cloudinary dạng `raw`.
3. Bản ghi tài liệu được lưu trong bảng `documents` với trạng thái `pending`.
4. Background worker tự động lấy tài liệu đang chờ xử lý.
5. Worker tải PDF từ Cloudinary, trích xuất text bằng `pdf-parse`.
6. Nội dung text được lưu vào cột `extracted_text`.
7. Tài liệu được index vào Meilisearch nếu có cấu hình.
8. Nếu không có Meilisearch, hệ thống tìm kiếm bằng MySQL FULLTEXT.

JD được index khi nhà tuyển dụng tạo hoặc cập nhật tin tuyển dụng.

## API tìm kiếm quan trọng

```http
GET /api/search?q=node&type=all
GET /api/search?q=react&type=cv
GET /api/search?q=backend&type=jd
POST /api/search/reindex
GET /api/documents/:id/view
```

Response tìm kiếm có `latencyMs` để đánh giá độ trễ full-text search.

## Bật Meilisearch tùy chọn

Chạy Meilisearch bằng Docker:

```powershell
docker run --rm -p 7700:7700 getmeili/meilisearch:v1.7
```

Cập nhật `backend/.env`:

```env
MEILI_HOST=http://127.0.0.1:7700
MEILI_API_KEY=
MEILI_INDEX=smart_job_portal
```

Khởi động lại backend. Nếu Meilisearch không khả dụng, hệ thống vẫn chạy bằng MySQL fallback.

## Checklist test như người dùng cuối

- Đăng nhập được bằng 3 vai trò: Admin, Nhà tuyển dụng, Ứng viên.
- Ứng viên tìm việc bằng từ khóa, địa điểm và loại hình.
- Ứng viên upload được PDF, không upload được file khác PDF.
- CV upload xong được worker xử lý và hiện trạng thái hoàn tất.
- Nhà tuyển dụng mở được CV thật của ứng viên.
- Nhà tuyển dụng đổi trạng thái ứng viên, reload vẫn giữ trạng thái mới.
- Ứng viên thấy trạng thái mới sau khi nhà tuyển dụng cập nhật.
- Search CV/JD trả kết quả đúng với nội dung đã trích xuất.
- Admin xem được dữ liệu quản trị.

## Đánh giá hiệu năng

Các tiêu chí chính:

- Full-text search latency: xem `latencyMs` trong response `/api/search`.
- Thời gian phản hồi khi lọc dữ liệu lớn: test danh sách việc làm và danh sách ứng viên với nhiều bản ghi.
- Thời gian xử lý CV: theo dõi log worker từ `pending` đến `completed`.

## Lỗi thường gặp

### Frontend báo `Failed to fetch`

- Kiểm tra backend đã chạy ở `http://localhost:5000`.
- Kiểm tra `apiBaseUrl` trong `localStorage`.
- Refresh mạnh trình duyệt bằng `Ctrl + F5`.

### CV không mở được

- Chỉ dùng file PDF.
- Upload CV mới sau khi đã cấu hình đúng Cloudinary.
- Dùng endpoint xem file qua backend: `/api/documents/:id/view`.

### Tiếng Việt bị lỗi font

- Đảm bảo database dùng `utf8mb4`.
- Import lại `database/db.sql` với charset UTF-8.
- Khởi động lại backend sau khi chỉnh database.

### Trạng thái ứng tuyển bị quay lại sau khi reload

- Kiểm tra backend đang chạy bản mới nhất.
- Đổi trạng thái từ màn hình nhà tuyển dụng rồi reload lại trang.
- Kiểm tra API `PATCH /api/applications/:id/status` trả về thành công.

### Search không ra kết quả

- Kiểm tra CV đã được worker xử lý sang trạng thái `completed`.
- Thử gọi `POST /api/search/reindex`.
- Nếu chưa bật Meilisearch, đảm bảo database đã có FULLTEXT index từ `database/db.sql`.

## Cấu trúc thư mục

```text
backend/
  src/
    controllers/
    routes/
    services/
    config/
frontend/
  components/
  css/
  js/
  page/
database/
  db.sql
```

## Lệnh chạy nhanh

Terminal 1:

```powershell
cd backend
npm start
```

Terminal 2:

```powershell
cd frontend
python -m http.server 5500
```

Sau đó mở:

```text
http://localhost:5500/
```
