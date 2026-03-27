'use strict';

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create and configure the Socket.IO server.
 *
 * - Attaches the Redis pub/sub adapter so multiple socket-server instances
 *   and the notification-worker (via @socket.io/redis-emitter) share one namespace.
 * - Authenticates clients using a JWT passed in socket.handshake.auth.token.
 * - Automatically joins authenticated clients to their personal room `user:{userId}`.
 *
 * @param {import('http').Server} httpServer
 * @returns {Promise<import('socket.io').Server>}
 */
async function createSocketServer(httpServer) {
  // Create Redis pub/sub clients for the adapter
  const pubClient = new Redis(config.redis.url, {
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: null,
  });

  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => {
    logger.error('Socket Redis pub client error', { error: err.message });
  });

  subClient.on('error', (err) => {
    logger.error('Socket Redis sub client error', { error: err.message });
  });

  await Promise.all([pubClient.connect(), subClient.connect()]);
  logger.info('Socket.IO Redis adapter clients connected');

  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1 MB
  });

  // Attach Redis adapter for horizontal scaling
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO Redis adapter attached');

  // JWT authentication middleware — runs before the "connection" event
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      logger.warn('Socket connection rejected — no auth token', {
        socketId: socket.id,
        address: socket.handshake.address,
      });
      return next(new Error('Authentication token is required'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      logger.warn('Socket connection rejected — invalid token', {
        socketId: socket.id,
        error: err.message,
      });
      return next(new Error('Invalid or expired authentication token'));
    }

    if (!decoded.userId) {
      logger.warn('Socket connection rejected — token missing userId', {
        socketId: socket.id,
      });
      return next(new Error('Token must contain userId claim'));
    }

    // Attach decoded user info to the socket for downstream use
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email || null;

    return next();
  });

  io.on('connection', (socket) => {
    const { userId, userEmail } = socket;

    logger.info('Socket client connected', {
      socketId: socket.id,
      userId,
      userEmail,
    });

    // Auto-join personal user room
    const personalRoom = `user:${userId}`;
    socket.join(personalRoom);
    logger.info('Socket joined personal room', { socketId: socket.id, room: personalRoom });

    // Acknowledge the connection to the client
    socket.emit('authenticated', {
      userId,
      room: personalRoom,
      timestamp: new Date().toISOString(),
    });

    // Allow client to subscribe to additional rooms
    socket.on('subscribe', ({ room }) => {
      if (!room || typeof room !== 'string' || room.trim().length === 0) {
        socket.emit('subscribe:error', { message: 'Room name must be a non-empty string' });
        return;
      }

      const sanitizedRoom = room.trim();

      // Prevent clients from joining other users' personal rooms
      if (sanitizedRoom.startsWith('user:') && sanitizedRoom !== personalRoom) {
        socket.emit('subscribe:error', {
          message: 'Cannot subscribe to another user\'s personal room',
        });
        return;
      }

      socket.join(sanitizedRoom);
      socket.emit('subscribe:success', { room: sanitizedRoom });
      logger.info('Socket joined additional room', {
        socketId: socket.id,
        userId,
        room: sanitizedRoom,
      });
    });

    // Allow client to leave a room
    socket.on('unsubscribe', ({ room }) => {
      if (!room || typeof room !== 'string') return;

      const sanitizedRoom = room.trim();

      // Prevent leaving personal room
      if (sanitizedRoom === personalRoom) {
        socket.emit('unsubscribe:error', { message: 'Cannot leave your personal room' });
        return;
      }

      socket.leave(sanitizedRoom);
      socket.emit('unsubscribe:success', { room: sanitizedRoom });
      logger.info('Socket left room', { socketId: socket.id, userId, room: sanitizedRoom });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket client disconnected', {
        socketId: socket.id,
        userId,
        reason,
      });
    });

    socket.on('error', (err) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId,
        error: err.message,
      });
    });
  });

  // Graceful cleanup of adapter clients on process exit
  async function closeAdapter() {
    try {
      await pubClient.quit();
      await subClient.quit();
      logger.info('Socket.IO Redis adapter clients disconnected');
    } catch (err) {
      logger.error('Error closing Redis adapter clients', { error: err.message });
    }
  }

  // Expose cleanup method on the io instance
  io.closeAdapter = closeAdapter;

  return io;
}

module.exports = { createSocketServer };
