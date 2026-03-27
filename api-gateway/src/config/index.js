'use strict';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()),
    clientId: process.env.KAFKA_CLIENT_ID || 'api-gateway',
    topics: {
      ORDER_PLACED: 'order.placed',
      PASSWORD_RESET: 'password.reset',
      NOTIFICATION_RETRY: 'notification.retry',
    },
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
      .split(',')
      .map((o) => o.trim()),
  },
};

module.exports = config;
