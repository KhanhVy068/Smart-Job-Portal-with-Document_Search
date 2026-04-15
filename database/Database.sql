
-- ==========================================
-- 1. Bảng JobCategories: Danh mục ngành nghề
-- ==========================================
CREATE TABLE IF NOT EXISTS job_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,      -- VD: IT, Marketing, Tài chính
    slug VARCHAR(100) NOT NULL UNIQUE,      -- VD: it, marketing (dùng cho URL)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. Bảng Users: Quản lý tài khoản (Employer & Candidate)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,    -- Lưu mật khẩu đã mã hóa (bcrypt/argon2)
    role ENUM('candidate', 'employer', 'admin') DEFAULT 'candidate',
    phone VARCHAR(20),
    avatar_url VARCHAR(255),                -- Link ảnh lưu trên Cloudinary
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. Bảng Jobs: Danh sách tin tuyển dụng (JD)
-- ==========================================
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employer_id INT NOT NULL,               -- Khóa ngoại từ bảng Users
    category_id INT NOT NULL,               -- Khóa ngoại từ bảng JobCategories
    title VARCHAR(255) NOT NULL,            -- Tiêu đề công việc
    description TEXT NOT NULL,              -- Mô tả chi tiết (JD)
    location VARCHAR(255) NOT NULL,         -- Địa điểm làm việc
    salary_range VARCHAR(100),              -- Mức lương (VD: 10M - 20M)
    job_type ENUM('Full-time', 'Part-time', 'Freelance', 'Remote') DEFAULT 'Full-time',
    status ENUM('open', 'closed') DEFAULT 'open',
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Khai báo khóa ngoại
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. KHỞI TẠO INDEX (Tối ưu cho dữ liệu lớn 100.000+)
-- ==========================================

-- Index giúp lọc tin tuyển dụng theo ngành nghề và trạng thái cực nhanh
CREATE INDEX idx_jobs_category_status ON jobs(category_id, status);

-- Index giúp tìm kiếm theo địa điểm (thường dùng trong Filter)
CREATE INDEX idx_jobs_location ON jobs(location);

-- Index giúp nhà tuyển dụng truy xuất nhanh các bài đăng của chính họ
CREATE INDEX idx_jobs_employer ON jobs(employer_id);

-- ==========================================
-- DỮ LIỆU MẪU (DUMMY DATA)
-- ==========================================

-- Thêm danh mục
INSERT INTO job_categories (name, slug) VALUES 
('Information Technology', 'it'),
('Marketing & Sales', 'marketing-sales'),
('Graphic Design', 'graphic-design');

-- Thêm user mẫu (Nhà tuyển dụng)
-- PasswordHash giả định cho '123456'
INSERT INTO users (full_name, email, password_hash, role) VALUES 
('Công ty Công nghệ ABC', 'hr@abc.tech', '$2b$10$xyz...', 'employer'),
('Mai Thi Anh Tuyet', 'tuyet.mai@student.uit.edu.vn', '$2b$10$abc...', 'candidate');

-- Thêm tin tuyển dụng mẫu
INSERT INTO jobs (employer_id, category_id, title, description, location, salary_range) VALUES 
(1, 1, 'Node.js Developer', 'Yêu cầu 2 năm kinh nghiệm, am hiểu MySQL...', 'Tp. Hồ Chí Minh', '20M - 35M'),
(1, 1, 'Security Analyst', 'Phân tích lỗ hổng hệ thống, ưu tiên sinh viên UIT...', 'Remote', 'Thỏa thuận');