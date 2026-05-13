const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { PDFParse } = require('pdf-parse');
const db = require('../config/db');
const searchService = require('./searchService');

const MAX_PDF_BYTES = Number(process.env.CV_PDF_MAX_BYTES || 25 * 1024 * 1024);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.PDF_DOWNLOAD_TIMEOUT_MS || 30000);
const MAX_EXTRACTED_TEXT_CHARS = Number(process.env.PDF_MAX_EXTRACTED_TEXT_CHARS || 5_000_000);

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
  processDocument
};
