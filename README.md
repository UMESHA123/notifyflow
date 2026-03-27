# NotifyFlow

> Event-driven notification platform — Kafka-powered email delivery and real-time WebSocket push, built with Node.js, Redis, and Socket.IO.

## Overview

NotifyFlow is a production-ready microservices system that decouples event producers from notification delivery. When your application fires an event (order placed, password reset, etc.), NotifyFlow asynchronously sends a transactional email **and** pushes a real-time update to the user's browser — with automatic retry on failure.

```
HTTP Client
    │
    ▼
┌─────────────────┐     Kafka Topics      ┌──────────────────────┐
│   API Gateway   │ ───────────────────▶  │ Notification Worker  │
│   (Port 3000)   │  order.placed         │                      │
└─────────────────┘  password.reset       │  ├─ Email (SMTP)     │
                     notification.retry   │  ├─ Redis Emitter    │
                                          │  └─ Retry Queue      │
                                          └──────────┬───────────┘
                                                     │ Redis Pub/Sub
                                                     ▼
                                          ┌──────────────────────┐
                                          │   Socket Server      │
                                          │   (Port 3001)        │
                                          │   Socket.IO + JWT    │
                                          └──────────┬───────────┘
                                                     │ WebSocket
                                                     ▼
                                               Browser / Client
```

## Services

| Service | Port | Role |
|---|---|---|
| `api-gateway` | 3000 | REST API — accepts events and publishes to Kafka |
| `notification-worker` | — | Kafka consumer — sends emails and emits socket events |
| `socket-server` | 3001 | Socket.IO server — real-time WebSocket connections |
| `kafka` | 9092 | Distributed message broker |
| `redis` | 6379 | Socket.IO adapter + retry queue state |
| `mailhog` | 8025 | Email UI for local development |

## Tech Stack

- **Node.js 20** — Runtime for all three services
- **Apache Kafka** (Confluent 7.5) — Event streaming backbone
- **KafkaJS** — Node.js Kafka client with compression and retry
- **Socket.IO 4** — WebSocket framework with room-based routing
- **Redis 7** — Socket.IO adapter (horizontal scaling) + retry queue
- **Nodemailer** — SMTP email delivery with connection pooling
- **MailHog** — SMTP capture server for local development
- **JWT** — WebSocket connection authentication
- **Winston** — Structured logging (JSON in prod, colorized in dev)
- **Docker Compose** — One-command local environment

## Kafka Topics

| Topic | Description |
|---|---|
| `order.placed` | New order created — triggers confirmation email + socket event |
| `password.reset` | Password reset requested — triggers reset email + socket event |
| `notification.retry` | Dead-letter queue for events that failed delivery |

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- SMTP credentials (or use the built-in MailHog for local dev)

### 1. Clone and configure

```bash
git clone https://github.com/your-username/notifyflow.git
cd notifyflow

# Copy environment templates
cp .env.example .env
cp api-gateway/.env.example api-gateway/.env
cp notification-worker/.env.example notification-worker/.env
cp socket-server/.env.example socket-server/.env
```

Edit each `.env` file. For local development the defaults work out of the box — MailHog captures all outgoing email so no real SMTP credentials are needed.

### 2. Start all services

```bash
docker-compose up --build
```

Wait for the health checks to pass (about 30–60 seconds on first run while Kafka initialises).

### 3. Verify services are up

```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
```

### 4. Open the test dashboard

Open `ui/index.html` in your browser. Enter a JWT token (see [Generating a Test Token](#generating-a-test-token)), connect, then submit events and watch real-time notifications arrive.

View captured emails at **http://localhost:8025** (MailHog UI).

## API Reference

### POST /api/v1/events/order-placed

Publish an order confirmation event.

**Request body**

```json
{
  "userId": "user-123",
  "orderId": "ord-456",
  "orderTotal": 99.99,
  "email": "customer@example.com",
  "name": "Jane Doe"
}
```

**Response `202 Accepted`**

```json
{
  "status": "accepted",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "topic": "order.placed",
  "timestamp": "2026-03-25T10:00:00.000Z"
}
```

### POST /api/v1/events/password-reset

Publish a password reset event.

**Request body**

```json
{
  "userId": "user-123",
  "email": "customer@example.com",
  "resetToken": "abc123xyz",
  "name": "Jane Doe"
}
```

**Response `202 Accepted`**

```json
{
  "status": "accepted",
  "eventId": "550e8400-e29b-41d4-a716-446655440001",
  "topic": "password.reset",
  "timestamp": "2026-03-25T10:00:00.000Z"
}
```

## WebSocket Client

Connect with a valid JWT token. The server automatically places each client into a personal room `user:{userId}` based on the token payload.

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: '<your-jwt-token>' }
});

socket.on('connect', () => console.log('Connected'));

// Receive order confirmation
socket.on('order:confirmed', (data) => {
  console.log('Order confirmed:', data);
});

// Receive password reset acknowledgement
socket.on('auth:password-reset-requested', (data) => {
  console.log('Password reset triggered:', data);
});

// Subscribe to a shared room (e.g. announcements)
socket.emit('subscribe', { room: 'announcements' });
```

## Generating a Test Token

JWT tokens must be signed with the `JWT_SECRET` configured in `socket-server/.env` and must contain `userId` and `email`:

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { userId: 'user-123', email: 'test@example.com' },
  'your-jwt-secret'
);

console.log(token);
```

Or run the included test client:

```bash
cd test
npm install
node index.js
```

## Retry Mechanism

The notification worker uses a Redis-backed retry queue with exponential backoff. If email delivery or socket emission fails, the event is re-queued automatically.

| Attempt | Delay |
|---|---|
| 1st retry | 1 s |
| 2nd retry | 2 s |
| 3rd retry | 4 s |
| After max retries | Logged and discarded |

Max attempts and base delay are configurable via `RETRY_MAX_ATTEMPTS` and `RETRY_BASE_DELAY_MS` in `notification-worker/.env`.

Redis keys:
- `retry:pending:{jobId}` — payload and attempt count
- `retry:ready` — sorted set scored by scheduled process-at timestamp

## Project Structure

```
notifyflow/
├── docker-compose.yml
├── .env.example
├── ui/
│   └── index.html                  # Single-page test dashboard
├── test/
│   └── index.js                    # Socket.IO test client
├── api-gateway/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── config/index.js
│       ├── kafka/producer.js
│       ├── routes/events.js
│       ├── middleware/validate.js
│       └── utils/logger.js
├── notification-worker/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── config/index.js
│       ├── kafka/consumer.js
│       ├── handlers/orderPlaced.js
│       ├── handlers/passwordReset.js
│       ├── email/mailer.js
│       ├── email/templates.js
│       ├── retry/retryQueue.js
│       ├── socket/emitter.js
│       └── utils/logger.js
└── socket-server/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.js
        ├── config/index.js
        ├── socket/server.js
        └── utils/logger.js
```

## Environment Variables

Each service has its own `.env.example`. Key variables:

| Variable | Service | Description |
|---|---|---|
| `KAFKA_BROKERS` | all | Comma-separated Kafka broker addresses |
| `REDIS_URL` | worker, socket | Redis connection URL |
| `SMTP_HOST` / `SMTP_PORT` | worker | SMTP server address |
| `SMTP_USER` / `SMTP_PASS` | worker | SMTP credentials |
| `SMTP_FROM` | worker | Sender address |
| `JWT_SECRET` | socket | Secret for verifying JWT tokens |
| `API_PORT` | gateway | HTTP port (default: 3000) |
| `SOCKET_PORT` | socket | WebSocket port (default: 3001) |
| `RETRY_MAX_ATTEMPTS` | worker | Max retry attempts (default: 3) |
| `RETRY_BASE_DELAY_MS` | worker | Base retry delay in ms (default: 1000) |

## Horizontal Scaling

Both the `api-gateway` and `socket-server` can be scaled horizontally without code changes:

- **API Gateway**: Stateless — scale behind a load balancer freely.
- **Socket Server**: Uses the Redis adapter (`@socket.io/redis-adapter`) so events emitted by the notification worker reach clients regardless of which socket-server instance they are connected to.

```bash
docker-compose up --scale socket-server=3
```

## Security

- JWT authentication on all WebSocket connections
- Clients cannot subscribe to other users' personal rooms
- Email templates escape user input to prevent HTML injection
- Docker containers run as the non-root `node` user
- Helmet security headers on the API Gateway
- CORS origins are allowlist-configured per service

## License

MIT
