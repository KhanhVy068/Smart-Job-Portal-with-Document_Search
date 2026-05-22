const http = require('http');
const https = require('https');
const db = require('../config/db');

const MEILI_HOST = (process.env.MEILI_HOST || process.env.MEILISEARCH_HOST || '').replace(/\/$/, '');
const MEILI_API_KEY = process.env.MEILI_API_KEY || process.env.MEILISEARCH_API_KEY || '';
const INDEX_NAME = process.env.MEILI_INDEX || 'smart_job_portal';

function isMeiliEnabled() {
  return Boolean(MEILI_HOST);
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(value = '') {
  return normalizeText(String(value || '').replace(/<[^>]+>/g, ' '));
}

function clip(value = '', max = 1200) {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function requestJson(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!isMeiliEnabled()) return reject(new Error('Meilisearch is not configured.'));

    const url = new URL(`${MEILI_HOST}${path}`);
    const client = url.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = client.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(MEILI_API_KEY ? { Authorization: `Bearer ${MEILI_API_KEY}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          const data = raw ? JSON.parse(raw) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
          const err = new Error(data?.message || `Meilisearch request failed: ${res.statusCode}`);
          err.status = res.statusCode;
          reject(err);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureIndex() {
  if (!isMeiliEnabled()) return false;

  try {
    await requestJson('POST', '/indexes', { uid: INDEX_NAME, primaryKey: 'uid' });
  } catch (err) {
    if (err.status !== 409) throw err;
  }

  await requestJson('PATCH', `/indexes/${INDEX_NAME}/settings`, {
    searchableAttributes: ['title', 'companyName', 'candidateName', 'fileName', 'content', 'skills', 'location'],
    filterableAttributes: ['kind', 'status', 'location', 'candidateId', 'jobId', 'documentId'],
    sortableAttributes: ['createdAt', 'score']
  });
  return true;
}

async function addDocuments(items = []) {
  if (!items.length || !isMeiliEnabled()) return false;
  await ensureIndex();
  await requestJson('POST', `/indexes/${INDEX_NAME}/documents`, items);
  return true;
}

function buildDocumentSearchItem(row) {
  return {
    uid: `document-${row.id}`,
    kind: row.doc_type || 'cv',
    documentId: row.id,
    candidateId: row.user_id,
    title: row.desired_position || row.file_name,
    fileName: row.file_name,
    candidateName: row.candidate_name,
    email: row.email,
    status: row.status,
    extractionStatus: row.extraction_status,
    desiredPosition: row.desired_position || '',
    skills: parseSkills(row.extracted_skills),
    content: row.extracted_text || row.file_name,
    summary: row.extracted_summary || clip(row.extracted_text || row.file_name, 360),
    createdAt: row.created_at,
    score: 0
  };
}

function parseSkills(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function buildJobSearchItem(row) {
  const content = [row.title, row.description, row.requirements, row.benefits, row.location, row.category_name]
    .map(stripHtml)
    .filter(Boolean)
    .join('\n');

  return {
    uid: `job-${row.id}`,
    kind: 'jd',
    jobId: row.id,
    title: row.title,
    companyName: row.employer_name || 'Smart Job Portal',
    location: row.location,
    status: row.status,
    content,
    summary: clip(content, 360),
    createdAt: row.posted_at,
    score: 0
  };
}

async function addDocumentsInBatches(items = [], batchSize = 500) {
  for (let start = 0; start < items.length; start += batchSize) {
    await addDocuments(items.slice(start, start + batchSize));
  }
}

async function indexDocument(documentId) {
  const [[row]] = await db.query(
    `
      SELECT d.*, u.full_name AS candidate_name, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ? AND d.deleted_at IS NULL
    LIMIT 1
    `,
    [documentId]
  );
  if (!row) return null;

  const item = buildDocumentSearchItem(row);

  await addDocuments([item]);
  return item;
}

async function indexJob(jobId) {
  const [[row]] = await db.query(
    `
    SELECT j.*, u.full_name AS employer_name, c.name AS category_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.employer_id
    LEFT JOIN job_categories c ON c.id = j.category_id
    WHERE j.id = ? AND j.deleted_at IS NULL
    LIMIT 1
    `,
    [jobId]
  );
  if (!row) return null;

  const item = buildJobSearchItem(row);

  await addDocuments([item]);
  return item;
}

async function reindexAll() {
  if (!isMeiliEnabled()) return { engine: 'mysql-fallback', indexed: 0 };
  await ensureIndex();

  const [docs] = await db.query(
    `
    SELECT d.*, u.full_name AS candidate_name, u.email
    FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.deleted_at IS NULL AND d.extracted_text IS NOT NULL
    `
  );
  const [jobs] = await db.query(
    `
    SELECT j.*, u.full_name AS employer_name, c.name AS category_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.employer_id
    LEFT JOIN job_categories c ON c.id = j.category_id
    WHERE j.deleted_at IS NULL
    `
  );
  const items = [
    ...docs.map(buildDocumentSearchItem),
    ...jobs.map(buildJobSearchItem)
  ];

  await addDocumentsInBatches(items);

  return { engine: 'meilisearch', indexed: items.length };
}

async function searchWithMeili(options = {}) {
  await ensureIndex();
  const filter = [];
  if (options.type && options.type !== 'all') {
    const kind = options.type === 'job' ? 'jd' : options.type;
    filter.push(`kind = "${kind}"`);
  }
  if (options.location) filter.push(`location = "${String(options.location).replaceAll('"', '\\"')}"`);

  const page = Math.max(Number(options.page || 1), 1);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const payload = await requestJson('POST', `/indexes/${INDEX_NAME}/search`, {
    q: options.q || '',
    offset: (page - 1) * limit,
    limit,
    filter,
    attributesToCrop: ['content:40', 'summary:40'],
    attributesToHighlight: ['title', 'content', 'candidateName', 'fileName']
  });

  return {
    engine: 'meilisearch',
    total: payload.estimatedTotalHits || payload.totalHits || payload.hits?.length || 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((payload.estimatedTotalHits || payload.totalHits || 0) / limit)),
    items: (payload.hits || []).map(hit => ({
      ...hit,
      id: hit.documentId || hit.jobId || hit.uid,
      type: hit.kind,
      score: Math.round(Number(hit._rankingScore || 0) * 100) || 50,
      summary: hit._formatted?.content || hit.summary || clip(hit.content, 260)
    }))
  };
}

async function searchWithMySql(options = {}) {
  const q = normalizeText(options.q);
  const type = options.type || 'all';
  const page = Math.max(Number(options.page || 1), 1);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = (page - 1) * limit;
  const items = [];

  if (type === 'all' || type === 'cv') {
    const where = ['d.deleted_at IS NULL', 'd.doc_type = "cv"'];
    const selectParams = [];
    const whereParams = [];
    const relevanceExpr = 'MATCH(d.file_name, d.extracted_text) AGAINST (? IN NATURAL LANGUAGE MODE)';
    const relevanceSelect = q ? `${relevanceExpr} AS relevance` : '0 AS relevance';
    if (q) {
      selectParams.push(q);
      where.push(`(${relevanceExpr} > 0 OR d.extracted_skills LIKE ? OR d.desired_position LIKE ? OR d.extracted_summary LIKE ?)`);
      whereParams.push(q, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [rows] = await db.query(
      `
      SELECT d.*, u.full_name AS candidate_name, u.email, ${relevanceSelect}
      FROM documents d
      JOIN users u ON u.id = d.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY relevance DESC, d.updated_at DESC
      LIMIT ? OFFSET ?
      `,
      [...selectParams, ...whereParams, limit, offset]
    );
    rows.forEach(row => items.push({
      id: row.id,
      type: 'cv',
      documentId: row.id,
      candidateId: row.user_id,
      name: row.candidate_name,
      candidateName: row.candidate_name,
      email: row.email,
      title: row.desired_position || row.file_name,
      desiredPosition: row.desired_position || '',
      desired_position: row.desired_position || '',
      fileName: row.file_name,
      fileUrl: row.file_url,
      url: row.file_url,
      status: row.status,
      extractionStatus: row.extraction_status || row.status,
      summary: row.extracted_summary || clip(row.extracted_text || row.file_name, 360),
      extractedText: row.extracted_text || '',
      extractedSkills: parseSkills(row.extracted_skills),
      skills: parseSkills(row.extracted_skills),
      score: q ? scoreFromRelevance(row.relevance) : 70,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  if (type === 'all' || type === 'jd' || type === 'job') {
    const where = ['j.deleted_at IS NULL'];
    const selectParams = [];
    const whereParams = [];
    const relevanceExpr = 'MATCH(j.title, j.description, j.requirements, j.benefits, j.location) AGAINST (? IN NATURAL LANGUAGE MODE)';
    const relevanceSelect = q ? `${relevanceExpr} AS relevance` : '0 AS relevance';
    if (q) {
      selectParams.push(q);
      where.push(`${relevanceExpr} > 0`);
      whereParams.push(q);
    }
    if (options.location) {
      where.push('j.location LIKE ?');
      whereParams.push(`%${options.location}%`);
    }
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name, ${relevanceSelect}
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      WHERE ${where.join(' AND ')}
      ORDER BY relevance DESC, j.posted_at DESC
      LIMIT ? OFFSET ?
      `,
      [...selectParams, ...whereParams, limit, offset]
    );
    rows.forEach(row => {
      const content = [row.description, row.requirements, row.benefits].filter(Boolean).join('\n');
      items.push({
        id: row.id,
        type: 'jd',
        jobId: row.id,
        title: row.title,
        companyName: row.employer_name || 'Smart Job Portal',
        location: row.location,
        status: row.status,
        summary: clip(content || row.title, 360),
        score: q ? scoreFromRelevance(row.relevance) : 70,
        createdAt: row.posted_at,
        updatedAt: row.updated_at
      });
    });
  }

  const sorted = items.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return {
    engine: 'mysql-fallback',
    total: sorted.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
    items: sorted.slice(0, limit)
  };
}

function scoreFromRelevance(relevance = 0) {
  const score = Number(relevance || 0);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round(score * 20)));
}

async function search(options = {}) {
  const startedAt = Date.now();
  let result;
  try {
    result = isMeiliEnabled() ? await searchWithMeili(options) : await searchWithMySql(options);
  } catch (err) {
    console.warn('Search engine fallback:', err.message);
    result = await searchWithMySql(options);
  }
  result.latencyMs = Date.now() - startedAt;
  return result;
}

module.exports = {
  isMeiliEnabled,
  ensureIndex,
  indexDocument,
  indexJob,
  reindexAll,
  search
};
