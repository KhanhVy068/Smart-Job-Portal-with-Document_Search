# Smart Job Portal with Document Search

## Giới thiệu

**Smart Job Portal with Document Search** là hệ thống cổng thông tin tuyển dụng thông minh, cho phép:

- Nhà tuyển dụng đăng tin tuyển dụng, tìm kiếm CV phù hợp.
- Ứng viên tìm kiếm việc làm, upload CV (PDF) và ứng tuyển.
- Tìm kiếm **full-text** trên nội dung tin tuyển dụng (JD) và CV.
- Xử lý file PDF dung lượng lớn bằng **background worker**.
- Lưu trữ và quản lý hồ sơ an toàn.

---

## Đối tượng người dùng

| Người dùng | Vai trò |
|------------|---------|
| **Nhà tuyển dụng** | Đăng tin, tìm kiếm CV, quản lý hồ sơ ứng viên |
| **Ứng viên** | Tìm việc, upload CV, ứng tuyển, theo dõi trạng thái |
| **Admin** | Quản lý người dùng, tin tuyển dụng, giám sát hệ thống |

---

## Chức năng chính

- Đăng nhập / Đăng ký (JWT authentication)
- Đăng tin tuyển dụng (CRUD)
- Upload CV (PDF)
- Trích xuất văn bản từ PDF bằng background worker
- Tìm kiếm full-text (JD và CV) với highlight từ khóa
- Lọc kết quả (ngành nghề, địa điểm, mức lương, kinh nghiệm)
- Xem trước PDF
- Ứng tuyển công việc
- Lưu trữ hồ sơ

---

## Công nghệ sử dụng

| Thành phần | Công nghệ dự kiến |
|------------|-------------------|
| **Frontend** | React / Vue.js |
| **Backend** | Python (FastAPI) / Node.js (Express) |
| **Database** | PostgreSQL |
| **Search Engine** | Elasticsearch / Meilisearch |
| **Message Queue** | Redis (Bull / Celery) |
| **Storage** | MinIO / AWS S3 |
| **Xử lý PDF** | PyMuPDF / pdfplumber |

---

## Luồng xử lý chính

### 1. Luồng đăng tin tuyển dụng
Nhà tuyển dụng
→ Đăng nhập
→ Tạo tin tuyển dụng (title, description, salary, location...)
→ Lưu vào PostgreSQL
→ Đồng bộ lên Elasticsearch
→ Hiển thị tin lên giao diện tìm kiếm

### 2. Luồng upload CV + xử lý background
Ứng viên
→ Upload file PDF
→ Lưu file vào MinIO/S3
→ Tạo task trong Redis Queue
→ Worker nhận task
→ Trích xuất text từ PDF
→ Lưu extracted_text vào PostgreSQL
→ Đồng bộ lên Elasticsearch
→ Cập nhật trạng thái xử lý


### 3. Luồng tìm kiếm full-text
Người dùng
→ Nhập từ khóa
→ Chọn bộ lọc (ngành, địa điểm, lương...)
→ Gửi request đến API Search
→ Truy vấn Elasticsearch/Meilisearch
→ Nhận kết quả (có highlight từ khóa)
→ Hiển thị danh sách kết quả

### 4. Luồng xem trước PDF
Người dùng
→ Click "Xem CV/JD"
→ Gọi API lấy presigned URL
→ Storage (MinIO/S3) tạo URL có thời hạn
→ Trả về URL cho Frontend
→ Hiển thị PDF trên trình duyệt

### 5. Luồng ứng tuyển công việc
Ứng viên
→ Xem chi tiết tin tuyển dụng
→ Chọn CV đã upload
→ Click "Ứng tuyển"
→ Tạo bản ghi trong bảng applications
→ Cập nhật trạng thái "Đã ứng tuyển"
→ Gửi thông báo (nếu có)

---

## Sơ đồ kiến trúc tổng thể
[Frontend React/Vue]
         │
         ▼
[API Gateway / Backend API]
         │
──┐──────├─────────┐
  ▼                ▼
[PostgreSQL] [Redis Queue]
         │
         ▼
[Worker (PDF Extractor)]
         │
         ▼
[MinIO/S3 Storage]
         │
         ▼
[Elasticsearch/Meilisearch]


---

## Quy mô dữ liệu dự kiến

| Loại dữ liệu | Số lượng |
|--------------|----------|
| Tin tuyển dụng | 100.000+ |
| CV | 50.000+ |
| Kích thước file PDF | 2 - 20 MB |
| Số truy vấn tìm kiếm | 1.000+ / ngày |

---


## Tài liệu liên quan (sẽ cập nhật sau)

- [Đặc tả yêu cầu](./docs/SRS.md)
- [Sơ đồ kiến trúc](./docs/architecture/)
- [Use Case & Sequence Diagram](./docs/diagrams/)
- [Thiết kế Database](./docs/database/)
- [Search Index Mapping](./docs/search/)
- [Pipeline xử lý file](./docs/pipeline/)

---

## Cách chạy dự án (sẽ cập nhật sau)

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm start
