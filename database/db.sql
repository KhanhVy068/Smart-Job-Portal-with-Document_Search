
-- ==========================================
-- SMART JOB PORTAL WITH DOCUMENT SEARCH
-- DATABASE SCHEMA FOR MySQL 
-- ==========================================

-- ==========================================
-- 1. Bảng JobCategories: Danh mục ngành nghề (có phân cấp)
-- ==========================================
CREATE TABLE IF NOT EXISTS job_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NULL,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_parent (parent_id),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. Bảng Users: Quản lý tài khoản (Employer & Candidate)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('candidate', 'employer', 'admin') DEFAULT 'candidate',
    phone VARCHAR(20),
    avatar_url VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    reset_token VARCHAR(255) NULL,
    reset_token_expiry TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_user_email (email),
    INDEX idx_user_reset_token (reset_token),
    INDEX idx_users_role (role),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. Bảng Jobs: Danh sách tin tuyển dụng (JD)
-- ==========================================
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employer_id INT NULL,                              
    category_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    
    -- Lương
    salary_min DECIMAL(15, 2) NULL,
    salary_max DECIMAL(15, 2) NULL,
    currency ENUM('VND', 'USD') DEFAULT 'VND',
    
    -- Hình thức & trạng thái
    job_type ENUM('Full-time', 'Part-time', 'Freelance', 'Remote') DEFAULT 'Full-time',
    status ENUM('open', 'closed') DEFAULT 'open',
    
    -- Thông tin bổ sung
    expiry_date DATE NOT NULL,
    experience_required INT DEFAULT 0,
    positions_available INT DEFAULT 1,
    benefits TEXT,
    requirements TEXT,
    
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_job_employer (employer_id),
    INDEX idx_job_category (category_id),
    INDEX idx_job_expiry (expiry_date),
    INDEX idx_job_salary (salary_min, salary_max),
    INDEX idx_deleted_at (deleted_at),
    
    CONSTRAINT chk_experience_range CHECK (experience_required >= 0 AND experience_required <= 50),
    CONSTRAINT chk_salary_range CHECK (salary_min <= salary_max OR (salary_min IS NULL AND salary_max IS NULL)),
    CONSTRAINT chk_positions_positive CHECK (positions_available > 0)   -- [FIX] Không được âm hoặc 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. Bảng Documents: Lưu trữ hồ sơ PDF/CV (tối ưu cho worker)
-- ==========================================
CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,                              -- [FIX] Đổi từ file_path → file_url
    storage_provider ENUM('cloudinary', 's3', 'local') DEFAULT 'cloudinary',  -- [NEW]
    file_hash VARCHAR(64) NOT NULL,
    extracted_text LONGTEXT NULL,
    extracted_text_hash VARCHAR(64) NULL,
    doc_type ENUM('cv', 'jd') NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT NULL,
    
    -- Metadata cho Background Worker (BullMQ + Redis)
    retry_count INT DEFAULT 0,
    processed_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_user_id (user_id),
    INDEX idx_doc_type (doc_type),
    INDEX idx_status (status),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_file_hash (file_hash),
    INDEX idx_status_retry (status, retry_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 5. Bảng Applications: Quản lý đơn ứng tuyển
-- ==========================================
CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    candidate_id INT NOT NULL,
    cv_document_id INT NOT NULL,
    cover_letter TEXT,
    
    expected_salary DECIMAL(15, 2) NULL,
    available_from DATE NULL,
    
    status ENUM('pending', 'reviewed', 'shortlisted', 'interviewed', 'offered', 'hired', 'rejected') DEFAULT 'pending',
    rejection_reason TEXT NULL,
    
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    notes TEXT NULL,
    -- status_history JSON NULL,  -- [FIX] ĐÃ XÓA (dùng application_status_log thay thế)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_job (job_id),
    INDEX idx_candidate (candidate_id),
    INDEX idx_status (status),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_applications_job_status (job_id, status),
    
    -- [FIX] 1 user không thể apply 1 job 2 lần
    UNIQUE KEY uk_job_candidate (job_id, candidate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 6. Bảng ApplicationStatusLog: Lịch sử thay đổi trạng thái
-- ==========================================
CREATE TABLE IF NOT EXISTS application_status_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT NOT NULL,
    note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_app_log_application (application_id),
    INDEX idx_app_log_created (created_at),
    INDEX idx_app_log_changed_by (changed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 7. Bảng SavedSearches: Lưu tìm kiếm đã lưu của người dùng
-- ==========================================
CREATE TABLE IF NOT EXISTS saved_searches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    search_query TEXT,
    filters JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_saved_user (user_id),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 8. KHỞI TẠO FOREIGN KEY (ALTER TABLE)
-- ==========================================

ALTER TABLE job_categories 
ADD CONSTRAINT fk_cat_parent 
FOREIGN KEY (parent_id) REFERENCES job_categories(id) ON DELETE SET NULL;

ALTER TABLE jobs 
ADD CONSTRAINT fk_jobs_employer 
FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE jobs 
ADD CONSTRAINT fk_jobs_category 
FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE CASCADE;

ALTER TABLE documents 
ADD CONSTRAINT fk_docs_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE applications 
ADD CONSTRAINT fk_app_job 
FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE applications 
ADD CONSTRAINT fk_app_candidate 
FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE applications 
ADD CONSTRAINT fk_app_cv_doc 
FOREIGN KEY (cv_document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE application_status_log 
ADD CONSTRAINT fk_log_application 
FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;

ALTER TABLE application_status_log 
ADD CONSTRAINT fk_log_changed_by 
FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saved_searches 
ADD CONSTRAINT fk_saved_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ==========================================
-- 9. INDEX TỐI ƯU TRUY VẤN
-- ==========================================

CREATE INDEX idx_jobs_category_status ON jobs(category_id, status);
CREATE INDEX idx_jobs_location ON jobs(location);
CREATE INDEX idx_jobs_expiry_status ON jobs(expiry_date, status);
CREATE INDEX idx_jobs_experience ON jobs(experience_required);

-- ==========================================
-- 10. TRIGGER: Tự động đóng job khi hết hạn
-- ⚠️ LƯU Ý: Chỉ dùng trong đồ án, production sẽ thay bằng background job (cron/BullMQ)
-- ==========================================
DELIMITER $$

CREATE TRIGGER trg_jobs_before_update
BEFORE UPDATE ON jobs
FOR EACH ROW
BEGIN
    IF NEW.expiry_date < CURDATE() AND NEW.status = 'open' THEN
        SET NEW.status = 'closed';
    END IF;
END$$

CREATE TRIGGER trg_jobs_before_insert
BEFORE INSERT ON jobs
FOR EACH ROW
BEGIN
    IF NEW.expiry_date < CURDATE() AND NEW.status = 'open' THEN
        SET NEW.status = 'closed';
    END IF;
END$$

DELIMITER ;

-- ==========================================
-- 11. DỮ LIỆU MẪU (DUMMY DATA)
-- ==========================================

INSERT INTO job_categories (id, name, slug, parent_id) VALUES 
(1, 'Information Technology', 'it', NULL),
(2, 'Backend Developer', 'backend', 1),
(3, 'Marketing & Sales', 'marketing', NULL),
(4, 'Graphic Design', 'graphic-design', NULL);

INSERT INTO users (id, full_name, email, password_hash, role, is_verified) VALUES 
(1, 'Công ty Công nghệ ABC', 'hr@abc.tech', '$2b$10$YourRealHashHere', 'employer', TRUE),
(2, 'Mai Thi Anh Tuyet', 'tuyet.mai@student.uit.edu.vn', '$2b$10$YourRealHashHere', 'candidate', FALSE);

INSERT INTO jobs (
    id, employer_id, category_id, title, description, location,
    salary_min, salary_max, currency, job_type, expiry_date,
    experience_required, positions_available, benefits, requirements
) VALUES 
(
    1, 1, 2,
    'Node.js Developer', 
    'Phát triển backend API cho hệ thống tuyển dụng', 
    'Tp. Hồ Chí Minh',
    20000000, 35000000, 'VND', 'Full-time',
    DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY),
    2, 3,
    'Bảo hiểm đầy đủ, thưởng Tết 13-14 tháng lương, laptop Pro',
    'Thành thạo Node.js, Express, MySQL, có kinh nghiệm với Docker'
),
(
    2, 1, 2,
    'Security Analyst',
    'Phân tích lỗ hổng bảo mật hệ thống',
    'Remote',
    25000000, 40000000, 'VND', 'Remote',
    DATE_ADD(CURRENT_DATE, INTERVAL 15 DAY),
    3, 1,
    'Chế độ đào tạo chứng chỉ quốc tế, làm việc linh hoạt',
    'Có kiến thức về OWASP, từng tham gia bug bounty'
);

-- ==========================================
-- 12. GHI CHÚ CHO BÁO CÁO (REPORT)
-- ==========================================
/*
Trigger trg_jobs_before_update / trg_jobs_before_insert:
- Chỉ sử dụng trong đồ án (đơn giản, dễ hiểu)
- Trong môi trường production với quy mô lớn (100.000+ jobs, 1000+ requests/ngày):
  * Sẽ thay thế bằng background job (cron job chạy mỗi giờ)
  * Hoặc dùng BullMQ + Redis để xử lý bất đồng bộ
  * Lý do: Trigger khó debug, khó scale, ảnh hưởng performance khi có nhiều concurrent writes
*/