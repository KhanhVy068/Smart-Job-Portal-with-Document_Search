-- Tạo extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tạo extension full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Kiểm tra
SELECT * FROM pg_extension;

CREATE TABLE IF NOT EXISTS job_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE user_role AS ENUM ('candidate', 'employer', 'admin');
CREATE TYPE job_type_enum AS ENUM ('Full-time', 'Part-time', 'Freelance', 'Remote');
CREATE TYPE job_status_enum AS ENUM ('open', 'closed');
CREATE TYPE doc_type_enum AS ENUM ('cv', 'jd');
CREATE TYPE doc_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE app_status_enum AS ENUM ('applied', 'reviewing', 'rejected', 'accepted');

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'candidate',
    phone VARCHAR(20),
    avatar_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_id UUID NOT NULL,
    category_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    salary_range VARCHAR(100),
    job_type job_type_enum DEFAULT 'Full-time',
    status job_status_enum DEFAULT 'open',
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_jobs_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_jobs_category FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    extracted_text TEXT,
    doc_type doc_type_enum,
    status doc_status_enum DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE documents 
ALTER COLUMN id TYPE INT USING id::integer,
ALTER COLUMN user_id TYPE INT USING user_id::integer;


CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    cv_document_id UUID NOT NULL,
    cover_letter TEXT,
    status app_status_enum DEFAULT 'applied',
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_applications_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_applications_cv FOREIGN KEY (cv_document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    search_query TEXT,
    filters JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_saved_searches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index cho bảng jobs
CREATE INDEX idx_jobs_category_status ON jobs(category_id, status);
CREATE INDEX idx_jobs_location_status ON jobs(location, status);
CREATE INDEX idx_jobs_type_status ON jobs(job_type, status);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at DESC);

-- Index full-text search
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION vietnamese (COPY = simple);

ALTER TEXT SEARCH CONFIGURATION vietnamese
    ALTER MAPPING FOR asciiword, asciihword, hword_asciipart,
    word, hword, hword_part
    WITH unaccent, simple;

CREATE INDEX idx_jobs_title_fts ON jobs USING GIN (to_tsvector('vietnamese', title));
CREATE INDEX idx_jobs_description_fts ON jobs USING GIN (to_tsvector('vietnamese', description));
CREATE INDEX idx_docs_text_fts ON documents USING GIN (to_tsvector('vietnamese', extracted_text));
-- Index cho documents
CREATE INDEX IF NOT EXISTS idx_docs_text_fts ON documents USING GIN (to_tsvector('vietnamese', extracted_text));
CREATE INDEX IF NOT EXISTS idx_docs_status_type ON documents(status, doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_docs_text_trgm ON documents USING GIN (extracted_text gin_trgm_ops);

-- Index cho applications
CREATE INDEX idx_applications_job_status ON applications(job_id, status);
CREATE INDEX idx_applications_candidate_status ON applications(candidate_id, status);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION search_jobs(
    search_keyword TEXT,
    category_filter INTEGER DEFAULT NULL,
    location_filter TEXT DEFAULT NULL,
    job_type_filter job_type_enum DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    title VARCHAR,
    description TEXT,
    location VARCHAR,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id,
        j.title,
        j.description,
        j.location,
        ts_rank(to_tsvector('vietnamese', j.title || ' ' || j.description), 
                plainto_tsquery('vietnamese', search_keyword)) AS relevance
    FROM jobs j
    WHERE 
        (search_keyword IS NULL OR 
         to_tsvector('vietnamese', j.title || ' ' || j.description) @@ 
         plainto_tsquery('vietnamese', search_keyword))
        AND (category_filter IS NULL OR j.category_id = category_filter)
        AND (location_filter IS NULL OR j.location ILIKE '%' || location_filter || '%')
        AND (job_type_filter IS NULL OR j.job_type = job_type_filter)
        AND j.status = 'open'
    ORDER BY relevance DESC, j.posted_at DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Thêm danh mục
INSERT INTO job_categories (name, slug) VALUES 
('Information Technology', 'it'),
('Marketing & Sales', 'marketing-sales'),
('Graphic Design', 'graphic-design'),
('Tài chính - Kế toán', 'finance-accounting');

-- Thêm users (dùng ID thật từ bảng users sau khi tạo)
INSERT INTO users (full_name, email, password_hash, role) VALUES 
('Công ty Công nghệ ABC', 'hr@abc.tech', '$2b$10$examplehash123456', 'employer'),
('Nguyễn Văn A', 'nguyenvana@email.com', '$2b$10$examplehash123456', 'candidate');

-- Thêm jobs
INSERT INTO jobs (employer_id, category_id, title, description, location, salary_range) 
SELECT 
    u.id,
    c.id,
    'Node.js Developer',
    'Yêu cầu 2 năm kinh nghiệm Node.js, PostgreSQL, Redis',
    'TP. Hồ Chí Minh',
    '20M - 35M'
FROM users u, job_categories c
WHERE u.email = 'hr@abc.tech' AND c.slug = 'it';