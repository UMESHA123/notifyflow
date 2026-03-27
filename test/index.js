import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';

// Must match JWT_SECRET in socket-server/.env
const JWT_SECRET = 'change-me-to-a-long-random-secret';

// Generate a token
const token = jwt.sign(
  { userId: 'user-123', email: 'test@example.com' },
  JWT_SECRET
);

console.log('Token:', token);

// Connect to the socket server
const socket = io('http://localhost:3001', {
  auth: { token }
});

socket.on('connect', () => {
  console.log('Connected! Socket ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

socket.on('order:confirmed', (data) => {
  console.log('Order confirmed:', data);
});

socket.on('auth:password-reset-requested', (data) => {
  console.log('Password reset:', data);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
