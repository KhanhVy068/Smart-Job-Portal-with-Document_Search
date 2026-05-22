USE job_portal;

CREATE TABLE IF NOT EXISTS candidate_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    title VARCHAR(255) NULL,
    desired_position VARCHAR(255) NULL,
    location VARCHAR(255) NULL,
    bio TEXT NULL,
    skills TEXT NULL,
    experience INT DEFAULT 0,
    education TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_candidate_profiles_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    job_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_saved_jobs_user_job (user_id, job_id),
    INDEX idx_saved_jobs_user (user_id),
    INDEX idx_saved_jobs_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employer_id INT NOT NULL,
    candidate_id INT NOT NULL,
    application_id INT NULL,
    document_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_employer_candidate (employer_id, candidate_id),
    INDEX idx_saved_candidates_employer (employer_id),
    INDEX idx_saved_candidates_candidate (candidate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(80) NOT NULL DEFAULT 'system',
    title VARCHAR(255) NOT NULL,
    message TEXT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user_read (user_id, is_read),
    INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_extracted_skills := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'documents'
      AND COLUMN_NAME = 'extracted_skills'
);
SET @add_extracted_skills := IF(
    @has_extracted_skills = 0,
    'ALTER TABLE documents ADD COLUMN extracted_skills TEXT NULL AFTER extracted_text_hash',
    'SELECT 1'
);
PREPARE stmt FROM @add_extracted_skills;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_desired_position := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'desired_position'
);
SET @add_desired_position := IF(
    @has_desired_position = 0,
    'ALTER TABLE documents ADD COLUMN desired_position VARCHAR(255) NULL AFTER extracted_skills',
    'SELECT 1'
);
PREPARE stmt FROM @add_desired_position;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_experience_years := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'experience_years'
);
SET @add_experience_years := IF(
    @has_experience_years = 0,
    'ALTER TABLE documents ADD COLUMN experience_years DECIMAL(4,1) NULL AFTER desired_position',
    'SELECT 1'
);
PREPARE stmt FROM @add_experience_years;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_extracted_summary := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'extracted_summary'
);
SET @add_extracted_summary := IF(
    @has_extracted_summary = 0,
    'ALTER TABLE documents ADD COLUMN extracted_summary TEXT NULL AFTER experience_years',
    'SELECT 1'
);
PREPARE stmt FROM @add_extracted_summary;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_extraction_status := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'extraction_status'
);
SET @add_extraction_status := IF(
    @has_extraction_status = 0,
    'ALTER TABLE documents ADD COLUMN extraction_status VARCHAR(50) DEFAULT ''pending'' AFTER status',
    'SELECT 1'
);
PREPARE stmt FROM @add_extraction_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_extracted_at := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'extracted_at'
);
SET @add_extracted_at := IF(
    @has_extracted_at = 0,
    'ALTER TABLE documents ADD COLUMN extracted_at DATETIME NULL AFTER processed_at',
    'SELECT 1'
);
PREPARE stmt FROM @add_extracted_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_saved_candidate_application_id := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'saved_candidates'
      AND COLUMN_NAME = 'application_id'
);
SET @add_saved_candidate_application_id := IF(
    @has_saved_candidate_application_id = 0,
    'ALTER TABLE saved_candidates ADD COLUMN application_id INT NULL AFTER candidate_id',
    'SELECT 1'
);
PREPARE stmt FROM @add_saved_candidate_application_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
