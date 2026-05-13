# Smart Job Portal with Document Search

Hệ thống tuyển dụng hỗ trợ đăng tin, ứng tuyển bằng CV PDF, trích xuất nội dung hồ sơ, tìm kiếm full-text CV/JD và đo hiệu năng search/filter.

## Công Nghệ

- Frontend: HTML, CSS, JavaScript ES Modules.
- Backend: Node.js, Express.
- Database: MySQL 8.
- Queue/Worker: BullMQ + Redis.
- Search: Meilisearch, fallback MySQL FULLTEXT.
- Storage: Cloudinary.
- PDF extraction: `pdf-parse`.

## Yêu Cầu

- Node.js 18 trở lên.
- MySQL 8.
- Redis.
- Meilisearch.
- Tài khoản Cloudinary.

Có thể chạy MySQL, Redis, Meilisearch bằng Docker Compose trong thư mục `backend`.

## Cấu Trúc

```text
backend/
  src/
    config/
    controllers/
    routes/
    services/
  scripts/
    benchmark-search.js
database/
  db.sql
frontend/
  components/
  js/
  page/
```

`database/db.sql` là file database final duy nhất của hệ thống.

## Chạy Local

### 1. Cài Dependencies

```powershell
cd backend
npm install
```

### 2. Chạy MySQL, Redis, Meilisearch

```powershell
cd backend
docker compose up -d
```

Docker Compose sẽ mount `../database/db.sql` để khởi tạo MySQL lần đầu. Nếu MySQL volume đã tồn tại từ trước, import lại thủ công:

```powershell
mysql -u root -p job_portal < ..\database\db.sql
```

### 3. Cấu Hình Backend

Tạo file `backend/.env` dựa trên `backend/.env.example`:

```env
PORT=5000
JWT_SECRET=job_portal_secret_key

DB_HOST=localhost
DB_PORT=3306
DB_USER=job_user
DB_PASSWORD=job_pass
DB_NAME=job_portal

REDIS_HOST=localhost
REDIS_PORT=6379

MEILI_HOST=http://127.0.0.1:7700
MEILI_API_KEY=smart_job_portal_meili_key
MEILI_INDEX=smart_job_portal

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

DOCUMENT_QUEUE_NAME=document-extraction
DOCUMENT_WORKER_CONCURRENCY=3
CV_PDF_MAX_BYTES=26214400
PDF_DOWNLOAD_TIMEOUT_MS=30000
PDF_MAX_EXTRACTED_TEXT_CHARS=5000000
```

### 4. Chạy Backend

```powershell
cd backend
npm start
```

Kiểm tra API:

```text
http://localhost:5000/
```

Khi backend khởi động, hệ thống sẽ:

- Kết nối MySQL.
- Khởi động BullMQ document worker.
- Enqueue lại CV đang `pending` hoặc `failed`.
- Tạo bảng `performance_logs` nếu DB cũ chưa có.
- Reindex dữ liệu vào Meilisearch nếu Meilisearch được cấu hình.

### 5. Chạy Frontend

Mở terminal mới:

```powershell
cd frontend
python -m http.server 5500
```

Truy cập:

```text
http://localhost:5500/
```

Nếu frontend gọi sai backend, mở DevTools Console và chạy:

```js
localStorage.setItem('apiBaseUrl', 'http://localhost:5000/api');
location.reload();
```

## Tài Khoản Demo

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

## Test Hệ Thống

### Test Nhanh API

```powershell
Invoke-RestMethod http://localhost:5000/
Invoke-RestMethod "http://localhost:5000/api/search?q=node&type=all"
Invoke-RestMethod "http://localhost:5000/api/jobs?keyword=node&location=Remote"
```

### Test Luồng Ứng Viên

1. Đăng nhập bằng tài khoản ứng viên.
2. Tìm việc bằng keyword, địa điểm, loại hình.
3. Upload CV PDF.
4. Kiểm tra CV chuyển trạng thái từ `pending` sang `processing`, rồi `completed`.
5. Ứng tuyển vào một tin tuyển dụng.
6. Xem lại trạng thái ứng tuyển.

### Test Luồng Nhà Tuyển Dụng

1. Đăng nhập bằng tài khoản nhà tuyển dụng.
2. Đăng tin tuyển dụng mới.
3. Cập nhật tin tuyển dụng.
4. Tìm kiếm CV ứng viên theo keyword.
5. Mở/xem CV PDF.
6. Cập nhật trạng thái ứng viên.

### Test Luồng Admin

1. Đăng nhập bằng tài khoản admin.
2. Kiểm tra dashboard.
3. Kiểm tra danh sách người dùng, jobs, CV.
4. Kiểm tra Search Analytics.
5. Kiểm tra Background Jobs.

### Test Meilisearch Và MySQL Fallback

Khi `MEILI_HOST` được cấu hình, `/api/search` dùng Meilisearch.

```http
GET /api/search?q=node&type=all
```

Response có:

```json
{
  "engine": "meilisearch",
  "latencyMs": 12
}
```

Nếu tắt Meilisearch hoặc bỏ `MEILI_HOST`, hệ thống fallback sang MySQL FULLTEXT:

```json
{
  "engine": "mysql-fallback",
  "latencyMs": 20
}
```

## Benchmark Hiệu Năng

Script benchmark vừa seed dữ liệu lớn, vừa đo latency các API chính.

```powershell
cd backend
npm run benchmark:search
```

Biến môi trường:

```env
BENCHMARK_BASE_URL=http://localhost:5000
BENCHMARK_JOB_ROWS=5000
BENCHMARK_DOC_ROWS=2000
BENCHMARK_BATCH_SIZE=250
```

Script sẽ đo:

- Full-text CV/JD search: `/api/search`.
- Filter việc làm dữ liệu lớn: `/api/jobs`.
- Search/filter ứng viên: `/api/candidates/search`.

Kết quả benchmark in ra JSON, dùng để đưa vào báo cáo phần:

- Full-text search latency.
- Thời gian phản hồi khi filter dữ liệu lớn.
- Search engine đang dùng: `meilisearch` hoặc `mysql-fallback`.

## Pipeline Upload Và Search

Luồng upload CV:

```text
Frontend upload PDF
-> Backend nhận file
-> Cloudinary lưu PDF dạng raw
-> MySQL lưu document status = pending
-> BullMQ enqueue job
-> Redis lưu queue state
-> Worker tải PDF
-> pdf-parse trích xuất text
-> MySQL lưu extracted_text, status = completed
-> Meilisearch index document
```

Luồng search:

```text
Request /api/search
-> Meilisearch nếu bật
-> MySQL FULLTEXT MATCH ... AGAINST nếu Meilisearch lỗi hoặc chưa cấu hình
-> Trả items + latencyMs
-> Ghi performance_logs
```

## Deploy

### 1. Chuẩn Bị Production

- Tạo MySQL production.
- Tạo Redis production.
- Tạo Meilisearch production.
- Tạo Cloudinary account.
- Tạo file `.env` production.
- Import `database/db.sql`.
- Không deploy file `.env` thật lên Git.

### 2. Deploy Backend

Backend cần chạy Node.js service:

```powershell
cd backend
npm install --omit=dev
npm start
```

Production process nên dùng PM2 hoặc service manager:

```powershell
npm install -g pm2
pm2 start src/server.js --name smart-job-backend
pm2 save
```

Các biến production quan trọng:

```env
NODE_ENV=production
PORT=5000
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=job_portal
REDIS_HOST=...
MEILI_HOST=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### 3. Deploy Frontend

Frontend là static site, có thể deploy lên Nginx, Netlify, Vercel hoặc bất kỳ static hosting nào.

Nếu dùng Nginx, trỏ root tới thư mục `frontend`:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/smart-job-portal/frontend;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Cấu hình frontend gọi backend bằng:

```js
localStorage.setItem('apiBaseUrl', 'https://api.your-domain.com/api');
```

Hoặc chỉnh mặc định trong `frontend/js/api.js` nếu muốn cố định URL production.

### 4. Reverse Proxy Backend

Ví dụ Nginx proxy backend:

```nginx
server {
  listen 80;
  server_name api.your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### 5. Checklist Sau Deploy

- API `/` trả message thành công.
- Frontend gọi được backend production.
- Đăng nhập được 3 vai trò.
- Upload PDF thành công.
- Worker xử lý CV sang `completed`.
- Search trả kết quả và có `latencyMs`.
- Admin Search Analytics có dữ liệu.
- Benchmark chạy được trên môi trường demo.

## Lỗi Thường Gặp

### Frontend Báo `Failed to fetch`

- Kiểm tra backend đang chạy.
- Kiểm tra CORS.
- Kiểm tra `localStorage.apiBaseUrl`.
- Kiểm tra URL có đúng `/api`.

### CV Không Chuyển Sang `completed`

- Kiểm tra Redis đang chạy.
- Kiểm tra backend log có dòng `BullMQ document worker started`.
- Kiểm tra Cloudinary URL có tải được không.
- Kiểm tra file đúng PDF và không vượt `CV_PDF_MAX_BYTES`.

### Search Không Có Kết Quả

- Kiểm tra CV đã `completed`.
- Gọi:

```http
POST /api/search/reindex
```

- Nếu không bật Meilisearch, kiểm tra FULLTEXT index trong `database/db.sql`.

### Database Import Lỗi

- Dùng MySQL 8.
- Đảm bảo file `database/db.sql` là UTF-8.
- Nếu dùng Docker volume cũ, xóa volume hoặc import lại thủ công.

## Lệnh Chạy Nhanh

Terminal 1:

```powershell
cd backend
docker compose up -d
```

Terminal 2:

```powershell
cd backend
npm start
```

Terminal 3:

```powershell
cd frontend
python -m http.server 5500
```

Mở:

```text
http://localhost:5500/
```
