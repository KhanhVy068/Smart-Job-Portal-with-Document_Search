require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/config/db');

const BASE_URL = process.env.BENCHMARK_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const JOB_ROWS = Number(process.env.BENCHMARK_JOB_ROWS || 5000);
const DOC_ROWS = Number(process.env.BENCHMARK_DOC_ROWS || 2000);
const BATCH_SIZE = Number(process.env.BENCHMARK_BATCH_SIZE || 250);

const skills = ['node', 'react', 'mysql', 'redis', 'meilisearch', 'docker', 'cloudinary', 'pdf', 'backend', 'frontend'];
const locations = ['Ho Chi Minh', 'Ha Noi', 'Da Nang', 'Remote'];
const jobTypes = ['Full-time', 'Part-time', 'Freelance', 'Remote'];

function pick(items, index) {
  return items[index % items.length];
}

function textBlob(index) {
  const primary = pick(skills, index);
  const secondary = pick(skills, index + 3);
  return [
    `Benchmark profile ${index}`,
    `Experience with ${primary}, ${secondary}, REST API, large document search, analytics latency tracking.`,
    `Handled full-text search for CV and JD datasets with repeatable filter measurements.`,
    'This seeded text intentionally repeats search-friendly keywords for stable benchmark results.'
  ].join(' ');
}

async function ensureSeedUserAndCategory() {
  await db.query(
    `
    INSERT INTO users (full_name, email, password_hash, role, is_verified)
    VALUES ('Benchmark Employer', 'benchmark-employer@example.com', 'benchmark', 'employer', TRUE)
    ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)
    `
  );
  await db.query(
    `
    INSERT INTO users (full_name, email, password_hash, role, is_verified)
    VALUES ('Benchmark Candidate', 'benchmark-candidate@example.com', 'benchmark', 'candidate', TRUE)
    ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)
    `
  );
  await db.query(
    `
    INSERT INTO job_categories (name, slug)
    VALUES ('Benchmark Engineering', 'benchmark-engineering')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
    `
  );

  const [[employer]] = await db.query('SELECT id FROM users WHERE email = ?', ['benchmark-employer@example.com']);
  const [[candidate]] = await db.query('SELECT id FROM users WHERE email = ?', ['benchmark-candidate@example.com']);
  const [[category]] = await db.query('SELECT id FROM job_categories WHERE slug = ?', ['benchmark-engineering']);
  return { employerId: employer.id, candidateId: candidate.id, categoryId: category.id };
}

async function countRows(table, markerColumn, markerValue) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM ${table} WHERE ${markerColumn} LIKE ?`, [markerValue]);
  return Number(row.total || 0);
}

async function insertJobs({ employerId, categoryId }) {
  const existing = await countRows('jobs', 'title', 'Benchmark Job %');
  if (existing >= JOB_ROWS) return existing;

  for (let start = existing; start < JOB_ROWS; start += BATCH_SIZE) {
    const rows = [];
    const end = Math.min(start + BATCH_SIZE, JOB_ROWS);
    for (let i = start; i < end; i += 1) {
      rows.push([
        employerId,
        categoryId,
        `Benchmark Job ${i} ${pick(skills, i)}`,
        textBlob(i),
        pick(locations, i),
        12000000 + i,
        25000000 + i,
        'VND',
        pick(jobTypes, i),
        'open',
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        i % 8,
        1 + (i % 5),
        `Benefits for benchmark ${pick(skills, i + 1)}`,
        `Requirements include ${pick(skills, i)} and ${pick(skills, i + 2)}`
      ]);
    }

    await db.query(
      `
      INSERT INTO jobs (
        employer_id, category_id, title, description, location,
        salary_min, salary_max, currency, job_type, status,
        expiry_date, experience_required, positions_available, benefits, requirements
      ) VALUES ?
      `,
      [rows]
    );
    process.stdout.write(`Seeded jobs: ${end}/${JOB_ROWS}\r`);
  }
  process.stdout.write('\n');
  return JOB_ROWS;
}

async function insertDocuments({ candidateId }) {
  const existing = await countRows('documents', 'file_name', 'benchmark-cv-%');
  if (existing >= DOC_ROWS) return existing;

  for (let start = existing; start < DOC_ROWS; start += BATCH_SIZE) {
    const rows = [];
    const end = Math.min(start + BATCH_SIZE, DOC_ROWS);
    for (let i = start; i < end; i += 1) {
      const text = textBlob(i);
      rows.push([
        candidateId,
        `benchmark-cv-${i}.pdf`,
        `https://example.com/benchmark-cv-${i}.pdf`,
        'cloudinary',
        `benchmark-${i}-${Date.now()}`,
        text,
        crypto.createHash('sha256').update(text).digest('hex'),
        'cv',
        'completed',
        new Date()
      ]);
    }

    await db.query(
      `
      INSERT INTO documents (
        user_id, file_name, file_url, storage_provider, file_hash,
        extracted_text, extracted_text_hash, doc_type, status, processed_at
      ) VALUES ?
      `,
      [rows]
    );
    process.stdout.write(`Seeded documents: ${end}/${DOC_ROWS}\r`);
  }
  process.stdout.write('\n');
  return DOC_ROWS;
}

async function requestJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const startedAt = Date.now();
  const res = await fetch(url, options);
  const latencyMs = Date.now() - startedAt;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} failed with ${res.status}: ${JSON.stringify(body)}`);
  return {
    url,
    latencyMs,
    apiLatencyMs: body.latencyMs,
    total: body.total ?? body.totalJobs ?? body.items?.length ?? body.data?.length ?? 0,
    engine: body.engine || 'mysql'
  };
}

async function benchmark() {
  const seedIds = await ensureSeedUserAndCategory();
  const jobs = await insertJobs(seedIds);
  const documents = await insertDocuments(seedIds);

  await requestJson('/api/search/reindex', { method: 'POST' }).catch(error => {
    console.warn(`Reindex skipped: ${error.message}`);
  });

  const cases = [
    ['/api/search?q=node&type=all&limit=20', 'Full-text CV/JD search'],
    ['/api/jobs?keyword=node&location=Remote&job_type=Remote&limit=50', 'Large job filter'],
    ['/api/candidates/search?q=react&limit=20', 'Candidate CV filter/search']
  ];

  const results = [];
  for (const [path, label] of cases) {
    const result = await requestJson(path);
    results.push({ label, ...result });
  }

  console.log(JSON.stringify({ seeded: { jobs, documents }, baseUrl: BASE_URL, results }, null, 2));
}

benchmark()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
