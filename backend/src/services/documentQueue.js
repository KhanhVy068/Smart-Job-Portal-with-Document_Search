const { Queue, QueueEvents } = require('bullmq');
const { redisConnection } = require('../config/queue');

const DOCUMENT_QUEUE_NAME = process.env.DOCUMENT_QUEUE_NAME || 'document-extraction';

const documentQueue = new Queue(DOCUMENT_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
      count: 5000
    }
  }
});

const documentQueueEvents = new QueueEvents(DOCUMENT_QUEUE_NAME, {
  connection: redisConnection
});

async function enqueueDocument(documentId) {
  return documentQueue.add(
    'extract-pdf-text',
    { documentId },
    {
      jobId: `document-${documentId}`
    }
  );
}

async function enqueuePendingDocuments(db, limit = 100) {
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
    await enqueueDocument(row.id);
  }

  return rows.length;
}

module.exports = {
  DOCUMENT_QUEUE_NAME,
  documentQueue,
  documentQueueEvents,
  enqueueDocument,
  enqueuePendingDocuments
};

