'use strict';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.SOCKET_PORT, 10) || 3001,
  logLevel: process.env.LOG_LEVEL || 'info',

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-to-a-long-random-secret',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
  },
};

module.exports = config;
