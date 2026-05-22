const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { PDFParse } = require('pdf-parse');
const db = require('../config/db');
const searchService = require('./searchService');

const MAX_PDF_BYTES = Number(process.env.CV_PDF_MAX_BYTES || 25 * 1024 * 1024);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.PDF_DOWNLOAD_TIMEOUT_MS || 30000);
const MAX_EXTRACTED_TEXT_CHARS = Number(process.env.PDF_MAX_EXTRACTED_TEXT_CHARS || 5_000_000);

const KNOWN_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'NodeJS', 'Node.js', 'Express',
  'Python', 'Django', 'Flask', 'Java', 'Spring', 'C#', '.NET', 'PHP', 'Laravel',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure',
  'Git', 'HTML', 'CSS', 'Tailwind', 'Figma', 'UI/UX', 'SEO', 'Linux', 'SOC',
  'Security', 'Cybersecurity', 'OWASP', 'GraphQL', 'REST', 'Next.js', 'NestJS',
  'C++', 'SIEM', 'Networking'
];

const POSITION_PATTERNS = [
  /\b(frontend|front-end)\s+(engineer|developer|dev)\b/i,
  /\bbackend\s+(engineer|developer|dev)\b/i,
  /\bfullstack\s+(engineer|developer|dev)\b/i,
  /\b(nodejs|node\.js|react|java|python)\s+(engineer|developer|dev)\b/i,
  /\b(security|cybersecurity|soc|siem)\s+(analyst|engineer|specialist)\b/i,
  /\b(data|machine learning|ai)\s+(engineer|scientist|analyst)\b/i,
  /\b(devops|cloud)\s+(engineer|specialist)\b/i,
  /\b(ui\/ux|product)\s+(designer|design)\b/i,
  /\b(kỹ sư|ki su)\s+[^.\n]{3,60}/i,
  /\b(lập trình viên|lap trinh vien)\s+[^.\n]{3,60}/i,
  /\b(chuyên viên|chuyen vien)\s+[^.\n]{3,60}/i
];

function downloadBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Download failed: too many redirects'));

    const client = String(url).startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadBuffer(res.headers.location, redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        res.resume();
        return;
      }

      const contentLength = Number(res.headers['content-length'] || 0);
      if (contentLength > MAX_PDF_BYTES) {
        reject(new Error(`PDF is too large (${contentLength} bytes). Max allowed is ${MAX_PDF_BYTES} bytes.`));
        res.destroy();
        return;
      }

      const chunks = [];
      let receivedBytes = 0;
      res.on('data', chunk => {
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_PDF_BYTES) {
          reject(new Error(`PDF is too large (${receivedBytes} bytes). Max allowed is ${MAX_PDF_BYTES} bytes.`));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);

    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy(new Error(`PDF download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
    });
  });
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  const text = String(result.text || '').replace(/\s+/g, ' ').trim();
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    return text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
  }
  return text;
}

function extractSkills(text = '') {
  const normalized = String(text).toLowerCase();
  const found = [];
  for (const skill of KNOWN_SKILLS) {
    const needle = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9+#.])${needle}([^a-z0-9+#.]|$)`, 'i').test(normalized)) {
      const canonical = skill === 'Node.js' ? 'NodeJS' : skill;
      if (!found.includes(canonical)) found.push(canonical);
    }
  }
  return found.slice(0, 20);
}

function extractExperienceYears(text = '') {
  const source = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*\+?\s*(?:năm|nam)(?:\s+kinh\s+nghiệm)?/gi,
    /(\d+(?:[.,]\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/gi,
    /(?:kinh\s+nghiệm|experience)[^\d]{0,24}(\d+(?:[.,]\d+)?)/gi
  ];
  const values = [];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const value = Number(String(match[1]).replace(',', '.'));
      if (Number.isFinite(value) && value >= 0 && value <= 50) values.push(value);
    }
  }

  if (!values.length) return null;
  return Math.max(...values);
}

function normalizePosition(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[-:|•\s]+|[-:|•\s]+$/g, '')
    .trim()
    .slice(0, 255);
}

function extractDesiredPosition(text = '', fileName = '') {
  const source = String(text || '');
  for (const pattern of POSITION_PATTERNS) {
    const match = source.match(pattern);
    const value = normalizePosition(match?.[0] || '');
    if (value && value.length >= 4) return value;
  }

  const lines = source
    .split(/\r?\n| {2,}/)
    .map(normalizePosition)
    .filter(line => line && line.length >= 4 && line.length <= 80);

  const ignored = /^(curriculum vitae|resume|cv|profile|contact|email|phone|education|experience|skills)$/i;
  const firstUseful = lines.find(line => !ignored.test(line));
  if (firstUseful) return firstUseful;

  return normalizePosition(String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
}

function buildSummary(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

async function addColumnIfMissing(sql) {
  try {
    await db.query(sql);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureExtractionSchema() {
  await addColumnIfMissing('ALTER TABLE documents ADD COLUMN extracted_skills TEXT NULL AFTER extracted_text_hash');
  await addColumnIfMissing('ALTER TABLE documents ADD COLUMN desired_position VARCHAR(255) NULL AFTER extracted_skills');
  await addColumnIfMissing('ALTER TABLE documents ADD COLUMN experience_years DECIMAL(4,1) NULL AFTER desired_position');
  await addColumnIfMissing('ALTER TABLE documents ADD COLUMN extracted_summary TEXT NULL AFTER experience_years');
  await addColumnIfMissing("ALTER TABLE documents ADD COLUMN extraction_status VARCHAR(50) DEFAULT 'pending' AFTER status");
  await addColumnIfMissing('ALTER TABLE documents ADD COLUMN extracted_at DATETIME NULL AFTER processed_at');
}

async function processDocument(documentId) {
  await ensureExtractionSchema();
  const [[document]] = await db.query(
    'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [documentId]
  );
  if (!document) return null;

  await db.query(
    'UPDATE documents SET status = "processing", extraction_status = "processing", retry_count = retry_count + 1, error_message = NULL WHERE id = ?',
    [document.id]
  );

  try {
    const buffer = await downloadBuffer(document.file_url);
    const text = await extractPdfText(buffer);
    const skills = extractSkills(text);
    const desiredPosition = extractDesiredPosition(text, document.file_name);
    const experienceYears = extractExperienceYears(text);
    const summary = buildSummary(text);
    const textHash = crypto.createHash('sha256').update(text).digest('hex');

    await db.query(
      `
      UPDATE documents
      SET extracted_text = ?,
          extracted_text_hash = ?,
          extracted_skills = ?,
          desired_position = ?,
          experience_years = ?,
          extracted_summary = ?,
          extraction_status = "completed",
          status = "completed",
          processed_at = NOW(),
          extracted_at = NOW(),
          error_message = NULL
      WHERE id = ?
      `,
      [
        text,
        textHash,
        skills.length ? JSON.stringify(skills) : null,
        desiredPosition || null,
        experienceYears,
        summary || null,
        document.id
      ]
    );

    await searchService.indexDocument(document.id).catch(err => {
      console.warn('Index document warning:', err.message);
    });

    return { id: document.id, status: 'completed', characters: text.length, skills, desiredPosition, experienceYears };
  } catch (error) {
    await db.query(
      'UPDATE documents SET status = "failed", extraction_status = "failed", error_message = ? WHERE id = ?',
      [error.message, document.id]
    );
    throw error;
  }
}



const { Worker } = require('bullmq');
const { redisConnection } = require('../config/queue');
const { DOCUMENT_QUEUE_NAME } = require('./documentQueue');

let worker = null;

function start() {
  if (worker) return worker;

  worker = new Worker(
    DOCUMENT_QUEUE_NAME,
    async (job) => {
      const { documentId } = job.data;

      await job.updateProgress(10);

      const result = await processDocument(documentId);

      await job.updateProgress(100);

      return result;
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.DOCUMENT_WORKER_CONCURRENCY || 3)
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`Document job completed #${job.id}:`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`Document job failed #${job?.id}:`, error.message);
  });

  console.log(`BullMQ document worker started: ${DOCUMENT_QUEUE_NAME}`);

  return worker;
}

module.exports = {
  start,
  processDocument,
  ensureExtractionSchema,
  extractSkills,
  extractDesiredPosition,
  extractExperienceYears
};
