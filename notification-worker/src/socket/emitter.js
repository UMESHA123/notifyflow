'use strict';

const { Emitter } = require('@socket.io/redis-emitter');
const IORedis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let emitter;
let pubClient;

/**
 * Initialize the Redis-backed Socket.IO emitter.
 * Must be called once before using emit().
 */
async function initEmitter() {
  pubClient = new IORedis(config.redis.url, {
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: null,
  });

  pubClient.on('error', (err) => {
    logger.error('Socket emitter Redis client error', { error: err.message });
  });

  pubClient.on('connect', () => {
    logger.info('Socket emitter Redis client connected');
  });

  pubClient.on('reconnecting', () => {
    logger.warn('Socket emitter Redis client reconnecting');
  });

  await pubClient.connect();

  emitter = new Emitter(pubClient);
  logger.info('Socket.IO Redis emitter initialized');
}

/**
 * Emit an event to all sockets in a given room.
 *
 * @param {string} room  - Target room name (e.g., "user:123")
 * @param {string} event - Socket event name (e.g., "order:confirmed")
 * @param {object} data  - Payload to broadcast
 */
async function emit(room, event, data) {
  if (!emitter) {
    logger.error('Socket emitter not initialized — call initEmitter() first');
    return;
  }

  try {
    emitter.to(room).emit(event, data);
    logger.info('Socket event emitted via Redis', { room, event });
  } catch (err) {
    logger.error('Failed to emit socket event', {
      room,
      event,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Disconnect the underlying Redis client.
 */
async function closeEmitter() {
  if (pubClient) {
    await pubClient.disconnect();
    logger.info('Socket emitter Redis client disconnected');
  }
}

module.exports = { initEmitter, emit, closeEmitter };
