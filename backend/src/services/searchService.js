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

  const item = {
    uid: `document-${row.id}`,
    kind: row.doc_type || 'cv',
    documentId: row.id,
    candidateId: row.user_id,
    title: row.file_name,
    fileName: row.file_name,
    candidateName: row.candidate_name,
    email: row.email,
    status: row.status,
    content: row.extracted_text || row.file_name,
    summary: clip(row.extracted_text || row.file_name, 360),
    createdAt: row.created_at,
    score: 0
  };

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

  const content = [row.title, row.description, row.requirements, row.benefits, row.location, row.category_name]
    .map(stripHtml)
    .filter(Boolean)
    .join('\n');
  const item = {
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

  await addDocuments([item]);
  return item;
}

async function reindexAll() {
  if (!isMeiliEnabled()) return { engine: 'mysql-fallback', indexed: 0 };
  await ensureIndex();

  const [docs] = await db.query('SELECT id FROM documents WHERE deleted_at IS NULL AND extracted_text IS NOT NULL');
  const [jobs] = await db.query('SELECT id FROM jobs WHERE deleted_at IS NULL');
  let indexed = 0;

  for (const doc of docs) {
    await indexDocument(doc.id);
    indexed += 1;
  }
  for (const job of jobs) {
    await indexJob(job.id);
    indexed += 1;
  }

  return { engine: 'meilisearch', indexed };
}

async function searchWithMeili(options = {}) {
  await ensureIndex();
  const filter = [];
  if (options.type && options.type !== 'all') {
    const kind = options.type === 'job' ? 'jd' : options.type;
    filter.push(`kind = "${kind}"`);
  }
  if (options.location) filter.push(`location CONTAINS "${String(options.location).replaceAll('"', '\\"')}"`);

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
      score: Math.round((1 - Number(hit._rankingScore || 0)) * 100) || 90,
      summary: hit._formatted?.content || hit.summary || clip(hit.content, 260)
    }))
  };
}

async function searchWithMySql(options = {}) {
  const q = normalizeText(options.q);
  const like = `%${q}%`;
  const type = options.type || 'all';
  const page = Math.max(Number(options.page || 1), 1);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);
  const offset = (page - 1) * limit;
  const items = [];

  if (type === 'all' || type === 'cv') {
    const where = ['d.deleted_at IS NULL', 'd.doc_type = "cv"'];
    const params = [];
    if (q) {
      where.push('(d.file_name LIKE ? OR d.extracted_text LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(like, like, like, like);
    }
    const [rows] = await db.query(
      `
      SELECT d.*, u.full_name AS candidate_name, u.email
      FROM documents d
      JOIN users u ON u.id = d.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );
    rows.forEach(row => items.push({
      id: row.id,
      type: 'cv',
      documentId: row.id,
      candidateId: row.user_id,
      name: row.candidate_name,
      candidateName: row.candidate_name,
      email: row.email,
      title: row.file_name,
      fileName: row.file_name,
      status: row.status,
      summary: clip(row.extracted_text || row.file_name, 360),
      score: q ? scoreText(row.extracted_text || row.file_name, q) : 70,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  if (type === 'all' || type === 'jd' || type === 'job') {
    const where = ['j.deleted_at IS NULL'];
    const params = [];
    if (q) {
      where.push('(j.title LIKE ? OR j.description LIKE ? OR j.requirements LIKE ? OR j.benefits LIKE ? OR j.location LIKE ?)');
      params.push(like, like, like, like, like);
    }
    if (options.location) {
      where.push('j.location LIKE ?');
      params.push(`%${options.location}%`);
    }
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      WHERE ${where.join(' AND ')}
      ORDER BY j.posted_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
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
        score: q ? scoreText(`${row.title}\n${content}`, q) : 70,
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

function scoreText(text = '', keyword = '') {
  if (!keyword) return 70;
  const haystack = normalizeText(text).toLowerCase();
  const words = normalizeText(keyword).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
  return Math.min(100, Math.round((hits / Math.max(words.length, 1)) * 100));
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
