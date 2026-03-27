'use strict';

const { Kafka } = require('kafkajs');
const config = require('../config');
const logger = require('../utils/logger');
const { handleOrderPlaced } = require('../handlers/orderPlaced');
const { handlePasswordReset } = require('../handlers/passwordReset');

let retryQueueRef = null;

/**
 * Set the RetryQueue instance used by the consumer to enqueue failed messages.
 * @param {import('../retry/retryQueue')} queue
 */
function setRetryQueue(queue) {
  retryQueueRef = queue;
}

class KafkaConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        retries: 10,
        initialRetryTime: 300,
        multiplier: 1.5,
        maxRetryTime: 30000,
      },
      logCreator: () => ({ namespace, level, log }) => {
        const { message, ...extra } = log;
        const winstonLevel = level <= 1 ? 'error' : level === 2 ? 'warn' : 'debug';
        logger[winstonLevel](`[kafkajs] ${namespace} — ${message}`, extra);
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 500,
      retry: { retries: 5 },
    });

    this._running = false;
    this._shuttingDown = false;
  }

  async connect() {
    await this.consumer.connect();
    logger.info('Kafka consumer connected', {
      groupId: config.kafka.groupId,
      brokers: config.kafka.brokers,
    });
  }

  async subscribe() {
    const topics = [
      config.kafka.topics.ORDER_PLACED,
      config.kafka.topics.PASSWORD_RESET,
      config.kafka.topics.NOTIFICATION_RETRY,
    ];

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    logger.info('Kafka consumer subscribed to topics', { topics });
  }

  async run() {
    this._running = true;

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat, resolveOffset }) => {
        const rawValue = message.value ? message.value.toString() : null;

        if (!rawValue) {
          logger.warn('Received Kafka message with empty value', { topic, partition });
          await this.consumer.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);
          return;
        }

        let payload;
        try {
          payload = JSON.parse(rawValue);
        } catch (err) {
          logger.error('Failed to parse Kafka message — skipping', {
            topic,
            partition,
            offset: message.offset,
            error: err.message,
          });
          await this.consumer.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);
          return;
        }

        logger.info('Kafka message received', {
          topic,
          partition,
          offset: message.offset,
          eventId: payload.eventId,
        });

        try {
          await this._dispatch(topic, payload);

          // Manually commit offset only after successful processing
          await this.consumer.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);

          logger.debug('Kafka offset committed', {
            topic,
            partition,
            offset: message.offset,
          });
        } catch (err) {
          logger.error('Handler failed — routing to retry queue', {
            topic,
            partition,
            offset: message.offset,
            eventId: payload.eventId,
            error: err.message,
          });

          if (retryQueueRef) {
            const jobId = payload.eventId || `${topic}-${partition}-${message.offset}`;
            await retryQueueRef.enqueue(jobId, { ...payload, topic }, 0).catch((retryErr) => {
              logger.error('Failed to enqueue retry job', {
                jobId,
                error: retryErr.message,
              });
            });
          }

          // Commit offset to avoid re-processing — retry queue owns the retry lifecycle
          await this.consumer.commitOffsets([
            { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
          ]);
        }

        // Keep consumer session alive during slow processing
        await heartbeat();
      },
    });
  }

  /**
   * Route a decoded payload to the appropriate handler based on topic.
   * @param {string} topic
   * @param {object} payload
   */
  async _dispatch(topic, payload) {
    switch (topic) {
      case config.kafka.topics.ORDER_PLACED:
        await handleOrderPlaced(payload);
        break;

      case config.kafka.topics.PASSWORD_RESET:
        await handlePasswordReset(payload);
        break;

      case config.kafka.topics.NOTIFICATION_RETRY: {
        // Retry topic carries the original topic in payload.topic
        const originalTopic = payload.topic;
        if (!originalTopic) {
          logger.warn('Retry message missing original topic field', { payload });
          return;
        }
        await this._dispatch(originalTopic, payload);
        break;
      }

      default:
        logger.warn('No handler for topic', { topic });
    }
  }

  async disconnect() {
    if (!this._running) return;
    try {
      await this.consumer.disconnect();
      this._running = false;
      logger.info('Kafka consumer disconnected');
    } catch (err) {
      logger.error('Error disconnecting Kafka consumer', { error: err.message });
    }
  }
}

const consumer = new KafkaConsumer();

module.exports = { consumer, setRetryQueue };
