'use strict';

const { Kafka, CompressionTypes } = require('kafkajs');
const config = require('../config');
const logger = require('../utils/logger');

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        multiplier: 1.5,
        maxRetryTime: 10000,
      },
      logCreator: () => ({ namespace, level, label, log }) => {
        const { message, ...extra } = log;
        const winstonLevel = level === 0 ? 'error' : level === 1 ? 'error' : level === 2 ? 'warn' : 'debug';
        logger[winstonLevel](`[kafkajs] ${namespace} — ${message}`, extra);
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });

    this._connected = false;
    this._shuttingDown = false;

    process.once('SIGTERM', () => this._handleShutdown('SIGTERM'));
    process.once('SIGINT', () => this._handleShutdown('SIGINT'));
  }

  async connect() {
    if (this._connected) return;
    try {
      await this.producer.connect();
      this._connected = true;
      logger.info('Kafka producer connected', { brokers: config.kafka.brokers });
    } catch (err) {
      logger.error('Kafka producer failed to connect', { error: err.message });
      throw err;
    }
  }

  async disconnect() {
    if (!this._connected) return;
    try {
      await this.producer.disconnect();
      this._connected = false;
      logger.info('Kafka producer disconnected');
    } catch (err) {
      logger.error('Kafka producer failed to disconnect cleanly', { error: err.message });
    }
  }

  async publish(topic, key, value, headers = {}) {
    if (!this._connected) {
      throw new Error('Kafka producer is not connected. Call connect() first.');
    }

    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

    const allHeaders = {
      'content-type': 'application/json',
      timestamp: new Date().toISOString(),
      ...headers,
    };

    const message = {
      key: String(key),
      value: serializedValue,
      headers: allHeaders,
    };

    try {
      const result = await this.producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        messages: [message],
      });

      logger.info('Event published to Kafka', {
        topic,
        key,
        partition: result[0]?.partition,
        offset: result[0]?.baseOffset,
      });

      return result;
    } catch (err) {
      logger.error('Failed to publish event to Kafka', {
        topic,
        key,
        error: err.message,
      });
      throw err;
    }
  }

  async _handleShutdown(signal) {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    logger.info(`Received ${signal} — disconnecting Kafka producer`);
    await this.disconnect();
  }
}

const producer = new KafkaProducer();

module.exports = producer;
