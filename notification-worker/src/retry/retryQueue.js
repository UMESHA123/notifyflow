'use strict';

const logger = require('../utils/logger');

const PENDING_KEY_PREFIX = 'retry:pending:';
const READY_ZSET_KEY = 'retry:ready';
const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;

class RetryQueue {
  /**
   * @param {import('ioredis').Redis} redisClient
   * @param {number} maxRetries   - Maximum delivery attempts before giving up
   * @param {number} baseDelay    - Base delay in milliseconds for exponential backoff
   */
  constructor(redisClient, maxRetries = 3, baseDelay = 1000) {
    this.redis = redisClient;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this._handler = null;
    this._pollTimer = null;
    this._processing = false;
  }

  /**
   * Register the async callback that will be invoked when a job is retried.
   * The handler receives (payload) and should return true on success.
   *
   * @param {Function} handler - async (payload: object) => boolean
   */
  register(handler) {
    this._handler = handler;
  }

  /**
   * Enqueue a new job for immediate processing.
   * If attempt > 0 it means we are re-enqueueing an already-failed job.
   *
   * @param {string} jobId
   * @param {object} payload
   * @param {number} [attempt=0]
   */
  async enqueue(jobId, payload, attempt = 0) {
    if (attempt >= this.maxRetries) {
      logger.error('RetryQueue: max retries exceeded, dropping job', {
        jobId,
        attempt,
        maxRetries: this.maxRetries,
        topic: payload.topic,
      });
      return;
    }

    await this.scheduleRetry(jobId, payload, attempt);
  }

  /**
   * Schedule a retry with exponential backoff.
   * Stores job state in Redis hash and registers it in the ready sorted set.
   *
   * @param {string} jobId
   * @param {object} payload
   * @param {number} attempt  - The attempt number that just failed (next run = attempt + 1)
   */
  async scheduleRetry(jobId, payload, attempt) {
    const nextAttempt = attempt + 1;
    if (nextAttempt > this.maxRetries) {
      logger.error('RetryQueue: max retries exceeded during schedule', {
        jobId,
        nextAttempt,
        maxRetries: this.maxRetries,
      });
      return;
    }

    const delay = this.baseDelay * Math.pow(2, attempt);
    const processAt = Date.now() + delay;

    const pendingKey = `${PENDING_KEY_PREFIX}${jobId}`;
    const stored = JSON.stringify({ ...payload, attempt: nextAttempt });

    const pipeline = this.redis.pipeline();
    pipeline.set(pendingKey, stored, 'PX', delay * 10); // TTL = 10x delay to allow processing window
    pipeline.zadd(READY_ZSET_KEY, processAt, jobId);
    await pipeline.exec();

    logger.info('RetryQueue: job scheduled', {
      jobId,
      attempt: nextAttempt,
      processAt: new Date(processAt).toISOString(),
      delayMs: delay,
    });
  }

  /**
   * Start the polling loop. Checks for due jobs every POLL_INTERVAL_MS.
   */
  processQueue() {
    if (this._pollTimer) return;

    this._pollTimer = setInterval(() => {
      if (!this._processing) {
        this._processDueJobs().catch((err) => {
          logger.error('RetryQueue: error processing due jobs', { error: err.message });
        });
      }
    }, POLL_INTERVAL_MS);

    logger.info('RetryQueue: polling started', { intervalMs: POLL_INTERVAL_MS });
  }

  /**
   * Stop the polling loop.
   */
  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
      logger.info('RetryQueue: polling stopped');
    }
  }

  /**
   * Internal method: fetch all jobs whose score <= now, process them.
   */
  async _processDueJobs() {
    if (!this._handler) {
      logger.warn('RetryQueue: no handler registered, skipping poll');
      return;
    }

    this._processing = true;

    try {
      const now = Date.now();

      // Atomically pop up to BATCH_SIZE jobs that are due
      const dueJobs = await this.redis.zrangebyscore(
        READY_ZSET_KEY,
        '-inf',
        now,
        'LIMIT',
        0,
        BATCH_SIZE
      );

      if (dueJobs.length === 0) {
        return;
      }

      logger.info('RetryQueue: processing due jobs', { count: dueJobs.length });

      for (const jobId of dueJobs) {
        await this._processJob(jobId);
      }
    } finally {
      this._processing = false;
    }
  }

  /**
   * Process a single job by its ID.
   * @param {string} jobId
   */
  async _processJob(jobId) {
    const pendingKey = `${PENDING_KEY_PREFIX}${jobId}`;

    // Remove from the zset atomically
    const removed = await this.redis.zrem(READY_ZSET_KEY, jobId);
    if (removed === 0) {
      // Another instance already claimed this job
      return;
    }

    const raw = await this.redis.get(pendingKey);
    if (!raw) {
      logger.warn('RetryQueue: job payload not found in Redis (may have expired)', { jobId });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      logger.error('RetryQueue: failed to parse job payload', { jobId, error: err.message });
      await this.redis.del(pendingKey);
      return;
    }

    const { attempt, ...originalPayload } = payload;

    logger.info('RetryQueue: retrying job', { jobId, attempt });

    try {
      await this._handler(originalPayload);
      // Success — clean up
      await this.redis.del(pendingKey);
      logger.info('RetryQueue: job succeeded on retry', { jobId, attempt });
    } catch (err) {
      logger.error('RetryQueue: job failed on retry', {
        jobId,
        attempt,
        error: err.message,
      });
      await this.redis.del(pendingKey);

      if (attempt < this.maxRetries) {
        await this.scheduleRetry(jobId, originalPayload, attempt);
      } else {
        logger.error('RetryQueue: job permanently failed after max retries', { jobId, attempt });
      }
    }
  }
}

module.exports = RetryQueue;
