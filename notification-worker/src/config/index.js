'use strict';

const config = {
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'notification-worker',
    groupId: process.env.KAFKA_GROUP_ID || 'notification-workers',
    topics: {
      ORDER_PLACED: 'order.placed',
      PASSWORD_RESET: 'password.reset',
      NOTIFICATION_RETRY: 'notification.retry',
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  email: {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },

  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS, 10) || 3,
    baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS, 10) || 1000,
  },
};

module.exports = config;
