'use strict';

const Redis = require('ioredis');
const config = require('./config');
const logger = require('./utils/logger');
const { consumer, setRetryQueue } = require('./kafka/consumer');
const RetryQueue = require('./retry/retryQueue');
const { initEmitter, closeEmitter } = require('./socket/emitter');
const { handleOrderPlaced } = require('./handlers/orderPlaced');
const { handlePasswordReset } = require('./handlers/passwordReset');

let redisClient;
let retryQueue;
let isShuttingDown = false;

/**
 * Retry handler called by RetryQueue when a job is due.
 * Dispatches to the correct handler based on payload.topic.
 *
 * @param {object} payload
 */
async function retryHandler(payload) {
  const { topic, ...message } = payload;

  switch (topic) {
    case config.kafka.topics.ORDER_PLACED:
      await handleOrderPlaced(message);
      break;
    case config.kafka.topics.PASSWORD_RESET:
      await handlePasswordReset(message);
      break;
    default:
      logger.warn('RetryHandler: unknown topic', { topic });
      throw new Error(`Unknown topic in retry payload: ${topic}`);
  }
}

async function start() {
  logger.info('notification-worker starting up');

  // 1. Connect Redis
  redisClient = new Redis(config.redis.url, {
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 20) {
        logger.error('Redis: max reconnect attempts exceeded');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    maxRetriesPerRequest: null,
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error', { error: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  await redisClient.connect();

  // 2. Initialize Socket.IO Redis emitter
  await initEmitter();

  // 3. Initialize retry queue
  retryQueue = new RetryQueue(
    redisClient,
    config.retry.maxAttempts,
    config.retry.baseDelayMs
  );
  retryQueue.register(retryHandler);

  // 4. Wire retry queue into Kafka consumer
  setRetryQueue(retryQueue);

  // 5. Connect and subscribe Kafka consumer
  await consumer.connect();
  await consumer.subscribe();

  // 6. Start retry queue polling
  retryQueue.processQueue();

  // 7. Start consuming Kafka messages
  await consumer.run();

  logger.info('notification-worker running', {
    groupId: config.kafka.groupId,
    topics: Object.values(config.kafka.topics),
  });
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — shutting down notification-worker gracefully`);

  // Stop retry queue polling
  if (retryQueue) {
    retryQueue.stop();
  }

  // Disconnect Kafka consumer
  try {
    await consumer.disconnect();
  } catch (err) {
    logger.error('Error disconnecting Kafka consumer during shutdown', { error: err.message });
  }

  // Close socket emitter
  try {
    await closeEmitter();
  } catch (err) {
    logger.error('Error closing socket emitter during shutdown', { error: err.message });
  }

  // Disconnect Redis
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      logger.error('Error disconnecting Redis during shutdown', { error: err.message });
    }
  }

  logger.info('notification-worker shutdown complete');
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error('Fatal error during startup', { error: err.message, stack: err.stack });
  process.exit(1);
});
