'use strict';

const { sendEmail } = require('../email/mailer');
const { passwordResetTemplate } = require('../email/templates');
const { emit } = require('../socket/emitter');
const logger = require('../utils/logger');

/**
 * Handle a password.reset Kafka message.
 *
 * Responsibilities:
 *  1. Send a password reset email containing the reset link
 *  2. Emit a real-time socket event to the customer's room
 *
 * @param {object} message - Parsed Kafka message value
 * @param {string}   message.eventId
 * @param {string}   message.userId
 * @param {string}   message.email
 * @param {string}   message.resetToken
 * @param {string}   message.name
 * @param {string}   message.timestamp
 * @returns {Promise<boolean>} true on full success
 * @throws {Error} if email or socket emit fails (caller routes to retry queue)
 */
async function handlePasswordReset(message) {
  const { eventId, userId, email, resetToken, name, timestamp } = message;

  logger.info('Handling password.reset event', { eventId, userId });

  // Construct the reset URL — in production the base URL comes from config/env
  const resetBaseUrl = process.env.RESET_BASE_URL || 'https://example.com/auth/reset-password';
  const resetLink = `${resetBaseUrl}?token=${encodeURIComponent(resetToken)}&userId=${encodeURIComponent(userId)}`;

  // 1. Build and send reset email
  const { subject, html, text } = passwordResetTemplate({ name, resetLink });

  await sendEmail({ to: email, subject, html, text });

  // 2. Emit real-time event to the user's socket room
  await emit(`user:${userId}`, 'auth:password-reset-requested', {
    eventId,
    userId,
    status: 'reset-email-sent',
    timestamp: timestamp || new Date().toISOString(),
  });

  logger.info('password.reset handled successfully', { eventId, userId });

  return true;
}

module.exports = { handlePasswordReset };
