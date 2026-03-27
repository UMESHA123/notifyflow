'use strict';

const http = require('http');
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { createSocketServer } = require('./socket/server');

const app = express();

// Health check endpoint (no auth required)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404 for any other HTTP route
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

const httpServer = http.createServer(app);

let ioInstance;
let isShuttingDown = false;

async function start() {
  try {
    ioInstance = await createSocketServer(httpServer);

    httpServer.listen(config.port, () => {
      logger.info('Socket server listening', { port: config.port, env: config.env });
    });
  } catch (err) {
    logger.error('Failed to start socket server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — shutting down socket server gracefully`);

  // Stop accepting new HTTP connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    // Close all Socket.IO connections
    if (ioInstance) {
      ioInstance.close();
      logger.info('Socket.IO server closed');

      // Close the Redis adapter clients
      if (typeof ioInstance.closeAdapter === 'function') {
        await ioInstance.closeAdapter();
      }
    }

    logger.info('Socket server shutdown complete');
    process.exit(0);
  });

  // Force exit after 15 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

start();
