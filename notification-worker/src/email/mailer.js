'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
    });

    transporter.verify((err) => {
      if (err) {
        logger.warn('SMTP transporter verification failed — emails may not send', {
          error: err.message,
          host: config.email.host,
          port: config.email.port,
        });
      } else {
        logger.info('SMTP transporter ready', {
          host: config.email.host,
          port: config.email.port,
        });
      }
    });
  }

  return transporter;
}

/**
 * Send an email via Nodemailer.
 *
 * @param {object} options
 * @param {string}   options.to      - Recipient email address
 * @param {string}   options.subject - Email subject
 * @param {string}   options.html    - HTML body
 * @param {string}   options.text    - Plain-text body
 * @throws {Error} on send failure so callers can route to retry queue
 */
async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter();

  const mailOptions = {
    from: `"Notifications" <${config.email.from}>`,
    to,
    subject,
    html,
    text,
    headers: {
      'X-Mailer': 'notification-worker/1.0',
    },
  };

  let info;
  try {
    info = await transport.sendMail(mailOptions);
  } catch (err) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: err.message,
      code: err.code,
    });
    // Re-throw so the caller (handler) can enqueue a retry
    throw err;
  }

  logger.info('Email sent successfully', {
    to,
    subject,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  });

  return info;
}

module.exports = { sendEmail };
