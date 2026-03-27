'use strict';

const { Router } = require('express');
const { randomUUID } = require('crypto');
const producer = require('../kafka/producer');
const config = require('../config');
const logger = require('../utils/logger');
const { validateEvent } = require('../middleware/validate');

const router = Router();

/**
 * POST /api/v1/events/order-placed
 *
 * Body: { userId, orderId, orderTotal, email, name? }
 * Publishes to ORDER_PLACED Kafka topic.
 */
router.post(
  '/order-placed',
  validateEvent(['userId', 'orderId', 'orderTotal', 'email']),
  async (req, res) => {
    const eventId = randomUUID();
    const { userId, orderId, orderTotal, email, name } = req.body;
    const topic = config.kafka.topics.ORDER_PLACED;

    const payload = {
      eventId,
      userId,
      orderId,
      orderTotal: Number(orderTotal),
      email,
      name: name || email.split('@')[0],
      timestamp: new Date().toISOString(),
    };

    try {
      await producer.publish(topic, userId, payload, {
        'event-type': 'order.placed',
        'event-id': eventId,
      });

      logger.info('order.placed event accepted', { eventId, userId, orderId });

      return res.status(202).json({
        status: 'accepted',
        eventId,
        topic,
        timestamp: payload.timestamp,
      });
    } catch (err) {
      logger.error('Failed to publish order.placed event', {
        eventId,
        userId,
        error: err.message,
      });

      return res.status(503).json({
        status: 'error',
        message: 'Failed to enqueue event. Please retry.',
        eventId,
      });
    }
  }
);

/**
 * POST /api/v1/events/password-reset
 *
 * Body: { userId, email, resetToken, name? }
 * Publishes to PASSWORD_RESET Kafka topic.
 */
router.post(
  '/password-reset',
  validateEvent(['userId', 'email', 'resetToken']),
  async (req, res) => {
    const eventId = randomUUID();
    const { userId, email, resetToken, name } = req.body;
    const topic = config.kafka.topics.PASSWORD_RESET;

    const payload = {
      eventId,
      userId,
      email,
      resetToken,
      name: name || email.split('@')[0],
      timestamp: new Date().toISOString(),
    };

    try {
      await producer.publish(topic, userId, payload, {
        'event-type': 'password.reset',
        'event-id': eventId,
      });

      logger.info('password.reset event accepted', { eventId, userId });

      return res.status(202).json({
        status: 'accepted',
        eventId,
        topic,
        timestamp: payload.timestamp,
      });
    } catch (err) {
      logger.error('Failed to publish password.reset event', {
        eventId,
        userId,
        error: err.message,
      });

      return res.status(503).json({
        status: 'error',
        message: 'Failed to enqueue event. Please retry.',
        eventId,
      });
    }
  }
);

module.exports = router;
