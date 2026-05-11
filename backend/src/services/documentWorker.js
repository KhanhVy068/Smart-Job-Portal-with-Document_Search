const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { PDFParse } = require('pdf-parse');
const db = require('../config/db');
const searchService = require('./searchService');

let isRunning = false;
let timer = null;

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith('https:') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return String(result.text || '').replace(/\s+/g, ' ').trim();
}

async function processDocument(documentId) {
  const [[document]] = await db.query(
    'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [documentId]
  );
  if (!document) return null;

  await db.query(
    'UPDATE documents SET status = "processing", retry_count = retry_count + 1, error_message = NULL WHERE id = ?',
    [document.id]
  );

  try {
    const buffer = await downloadBuffer(document.file_url);
    const text = await extractPdfText(buffer);
    const textHash = crypto.createHash('sha256').update(text).digest('hex');

    await db.query(
      `
      UPDATE documents
      SET extracted_text = ?,
          extracted_text_hash = ?,
          status = "completed",
          processed_at = NOW(),
          error_message = NULL
      WHERE id = ?
      `,
      [text, textHash, document.id]
    );

    await searchService.indexDocument(document.id).catch(err => {
      console.warn('Index document warning:', err.message);
    });

    return { id: document.id, status: 'completed', characters: text.length };
  } catch (error) {
    await db.query(
      'UPDATE documents SET status = "failed", error_message = ? WHERE id = ?',
      [error.message, document.id]
    );
    throw error;
  }
}

async function processPendingBatch(limit = 3) {
  if (isRunning) return;
  isRunning = true;
  try {
    const [rows] = await db.query(
      `
      SELECT id
      FROM documents
      WHERE deleted_at IS NULL
        AND doc_type = 'cv'
        AND status IN ('pending', 'failed')
        AND retry_count < 3
      ORDER BY created_at ASC
      LIMIT ?
      `,
      [limit]
    );

    for (const row of rows) {
      try {
        await processDocument(row.id);
      } catch (err) {
        console.error(`Document worker failed for #${row.id}:`, err.message);
      }
    }
  } finally {
    isRunning = false;
  }
}

function enqueueDocument(documentId) {
  setTimeout(() => processDocument(documentId).catch(err => {
    console.error(`Document worker failed for #${documentId}:`, err.message);
  }), 0);
}

function start() {
  if (timer) return;
  timer = setInterval(() => processPendingBatch().catch(err => {
    console.error('Document worker batch error:', err.message);
  }), Number(process.env.WORKER_INTERVAL_MS || 15000));
  processPendingBatch().catch(err => console.error('Document worker initial error:', err.message));
  console.log('Document extraction worker started.');
}

module.exports = {
  start,
  enqueueDocument,
  processDocument,
  processPendingBatch
};
