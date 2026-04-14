const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./models/database');

const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Auth API routes
const { router: authRouter } = require('./routes/auth');
app.use('/api/auth', authRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Database stats endpoint
app.get('/api/stats', (_req, res) => {
  try {
    const stats = db.getDbStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
  }
});

const { handleConnection } = require('./services/chatService');

// Initialize database, then start server
async function start() {
  try {
    await db.initDatabase();
    console.log('[Server] Database initialized');
  } catch (err) {
    console.error('[Server] Database init failed:', err.message);
    console.log('[Server] Running in memory-only mode');
  }

  io.on('connection', (socket) => {
    handleConnection(io, socket);
  });

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`Clarion Stream Backend listening on port ${PORT}`);
  });
}

start();
