const db = require('../config/db');

let ensureTablePromise = null;

async function ensurePerformanceLogsTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = db.query(
      `
      CREATE TABLE IF NOT EXISTS performance_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type ENUM('search', 'filter_jobs', 'filter_candidates', 'benchmark') NOT NULL,
        engine VARCHAR(50) NULL,
        query_text VARCHAR(500) NULL,
        filters JSON NULL,
        result_count INT DEFAULT 0,
        latency_ms INT NOT NULL,
        user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_perf_event_created (event_type, created_at),
        INDEX idx_perf_engine_created (engine, created_at),
        INDEX idx_perf_latency (latency_ms),
        INDEX idx_perf_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    ).catch(error => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

async function logPerformance({
  eventType,
  engine = null,
  queryText = null,
  filters = null,
  resultCount = 0,
  latencyMs,
  userId = null
}) {
  try {
    await ensurePerformanceLogsTable();
    await db.query(
      `
      INSERT INTO performance_logs (
        event_type, engine, query_text, filters, result_count, latency_ms, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        eventType,
        engine,
        queryText ? String(queryText).slice(0, 500) : null,
        filters ? JSON.stringify(filters) : null,
        Number(resultCount || 0),
        Number(latencyMs || 0),
        userId
      ]
    );
  } catch (error) {
    // Không để lỗi logging làm hỏng request chính.
    console.warn('Performance log warning:', error.message);
  }
}

module.exports = {
  ensurePerformanceLogsTable,
  logPerformance
};
