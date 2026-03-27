'use strict';

const { sendEmail } = require('../email/mailer');
const { orderPlacedTemplate } = require('../email/templates');
const { emit } = require('../socket/emitter');
const logger = require('../utils/logger');

/**
 * Handle an order.placed Kafka message.
 *
 * Responsibilities:
 *  1. Send order confirmation email to the customer
 *  2. Emit a real-time socket event to the customer's room
 *
 * @param {object} message - Parsed Kafka message value
 * @param {string}   message.eventId
 * @param {string}   message.userId
 * @param {string}   message.orderId
 * @param {number}   message.orderTotal
 * @param {string}   message.email
 * @param {string}   message.name
 * @param {string}   message.timestamp
 * @returns {Promise<boolean>} true on full success
 * @throws {Error} if email or socket emit fails (caller routes to retry queue)
 */
async function handleOrderPlaced(message) {
  const { eventId, userId, orderId, orderTotal, email, name, timestamp } = message;

  logger.info('Handling order.placed event', { eventId, userId, orderId });

  // 1. Build and send confirmation email
  const { subject, html, text } = orderPlacedTemplate({
    name,
    orderId,
    total: orderTotal,
  });

  await sendEmail({ to: email, subject, html, text });

  // 2. Emit real-time event to the user's socket room
  await emit(`user:${userId}`, 'order:confirmed', {
    eventId,
    orderId,
    orderTotal,
    status: 'confirmed',
    timestamp: timestamp || new Date().toISOString(),
  });

  logger.info('order.placed handled successfully', { eventId, userId, orderId });

  return true;
}

module.exports = { handleOrderPlaced };
