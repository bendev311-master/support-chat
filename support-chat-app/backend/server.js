const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const FRONTEND_URL = process.env.FRONTEND_URL || '*';

const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
  }
});

const { handleConnection } = require('./services/chatService');

io.on('connection', (socket) => {
  handleConnection(io, socket);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Clarion Stream Backend listening on port ${PORT}`);
});
