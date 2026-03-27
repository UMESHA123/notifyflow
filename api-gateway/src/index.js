'use strict';

const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const producer = require('./kafka/producer');
const eventsRouter = require('./routes/events');

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/v1/events', eventsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const server = http.createServer(app);

async function start() {
  try {
    await producer.connect();
    server.listen(config.port, () => {
      logger.info(`API Gateway listening`, { port: config.port, env: config.env });
    });
  } catch (err) {
    logger.error('Failed to start API Gateway', { error: err.message });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down API Gateway gracefully`);

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await producer.disconnect();
    } catch (err) {
      logger.error('Error disconnecting producer during shutdown', { error: err.message });
    }
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force exit after 15 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

start();

module.exports = app;
