const { users, rooms, resolvedRooms, chatRatings, staffMetrics, announcements } = require('../models/userModel');
const { randomUUID } = require('crypto');
const telegram = require('./telegramService');

// Simple XSS sanitizer — strip HTML tags
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).trim();
}

// Rate limiting tracker: socketId -> { count, resetAt }
const rateLimits = new Map();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function checkRateLimit(socketId) {
  const now = Date.now();
  const entry = rateLimits.get(socketId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(socketId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

function handleConnection(io, socket) {
  console.log(`User connected: ${socket.id}`);

  // ── Register user ─────────────────────────────────────────
  socket.on('register', (data) => {
    const role = sanitize(data.role || '');
    const username = sanitize(data.username || '');

    if (!role || !username) return;
    if (!['customer', 'vendor', 'admin'].includes(role)) return;

    // Send active announcements to newly connected user
    const activeAnnouncements = announcements.filter(a => a.active);
    if (activeAnnouncements.length > 0) {
      socket.emit('announcements_update', activeAnnouncements);
    }

    users.set(socket.id, {
      id: socket.id,
      role,
      username,
      currentRoom: null,
      status: 'online',
      joinedAt: new Date().toISOString()
    });

    if (role === 'customer') {
      const roomId = `room_${randomUUID()}`;
      rooms.set(roomId, {
        customerId: socket.id,
        vendorId: null,
        messages: [],
        status: 'waiting',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        rating: null,
        firstResponseAt: null
      });
      socket.join(roomId);
      users.get(socket.id).currentRoom = roomId;
      socket.emit('room_assigned', { roomId });

      // Telegram: notify new customer waiting
      telegram.notifyNewCustomer({ customerName: username, roomId });
    } else {
      socket.join('admin_lobby');

      // Initialize staff metrics
      if (role === 'vendor') {
        staffMetrics.set(socket.id, {
          resolvedCount: 0,
          totalResponseTime: 0,
          responseCount: 0,
          avgResponseTime: 0
        });
      }
    }

    broadcastState(io);
  });

  // ── Vendor picks up a customer chat ───────────────────────
  socket.on('join_room', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!user || !room) return;
    if (user.role !== 'vendor' && user.role !== 'admin') return;

    if (user.role === 'vendor' && !room.vendorId) {
      room.vendorId = socket.id;
      room.status = 'active';
    }

    socket.join(roomId);
    user.currentRoom = roomId;
    socket.emit('room_joined', { roomId, messages: room.messages });
    broadcastState(io);
  });

  // ── Admin views a chat (read-only) ────────────────────────
  socket.on('admin_view_chat', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!user || user.role !== 'admin' || !room) return;

    socket.join(roomId);
    socket.emit('room_joined', { roomId, messages: room.messages, readOnly: true });
  });

  // ── Send message ──────────────────────────────────────────
  socket.on('send_message', (data) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error_message', { message: 'Bạn gửi tin nhắn quá nhanh. Vui lòng chờ.' });
      return;
    }

    const roomId = sanitize(data.roomId || '');
    const content = sanitize(data.content || '');
    if (!roomId || !content) return;

    const user = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!user || !room) return;

    const message = {
      id: randomUUID(),
      senderId: socket.id,
      senderName: user.username,
      role: user.role,
      content,
      timestamp: new Date().toISOString()
    };

    room.messages.push(message);
    io.to(roomId).emit('new_message', message);

    // Telegram: notify when CUSTOMER sends a message
    if (user.role === 'customer') {
      telegram.notifyNewMessage({
        customerName: user.username,
        content,
        roomId
      });
    }

    // Track first response time for vendor
    if (user.role === 'vendor' && !room.firstResponseAt && room.customerId !== socket.id) {
      room.firstResponseAt = new Date().toISOString();
      const responseTime = new Date(room.firstResponseAt) - new Date(room.createdAt);
      const metrics = staffMetrics.get(socket.id);
      if (metrics) {
        metrics.totalResponseTime += responseTime;
        metrics.responseCount += 1;
        metrics.avgResponseTime = Math.round(metrics.totalResponseTime / metrics.responseCount);
      }
    }

    broadcastState(io);
  });

  // ── Typing indicators ─────────────────────────────────────
  socket.on('typing_start', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(roomId).emit('typing_indicator', {
      userId: socket.id,
      username: user.username,
      isTyping: true
    });
  });

  socket.on('typing_stop', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(roomId).emit('typing_indicator', {
      userId: socket.id,
      username: user.username,
      isTyping: false
    });
  });

  // ── Resolve chat ──────────────────────────────────────────
  socket.on('resolve_chat', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!user || !room) return;
    if (user.role !== 'vendor' && user.role !== 'admin') return;

    room.status = 'resolved';
    room.resolvedAt = new Date().toISOString();

    // Track resolved count for staff
    if (user.role === 'vendor') {
      const metrics = staffMetrics.get(socket.id);
      if (metrics) {
        metrics.resolvedCount += 1;
      }
    }

    // Move to resolved archive
    resolvedRooms.push({ id: roomId, ...room });

    // Notify customer
    io.to(roomId).emit('chat_resolved', {
      roomId,
      resolvedBy: user.username,
      resolvedAt: room.resolvedAt
    });

    broadcastState(io);
  });

  // ── Rate chat ─────────────────────────────────────────────
  socket.on('rate_chat', ({ roomId, rating, comment }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'customer') return;

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) return;

    const room = rooms.get(roomId);
    if (room) {
      room.rating = numRating;
    }

    chatRatings.set(roomId, {
      rating: numRating,
      comment: sanitize(comment || ''),
      timestamp: new Date().toISOString(),
      customerId: socket.id
    });

    broadcastState(io);
  });

  // ── Update staff status ───────────────────────────────────
  socket.on('update_staff_status', ({ status }) => {
    const validStatuses = ['online', 'away', 'meeting', 'offline'];
    if (!validStatuses.includes(status)) return;

    const user = users.get(socket.id);
    if (!user) return;
    user.status = status;
    broadcastState(io);
  });

  // ── Telegram config ───────────────────────────────────────
  socket.on('telegram_get_config', () => {
    const user = users.get(socket.id);
    if (!user || (user.role !== 'vendor' && user.role !== 'admin')) return;
    socket.emit('telegram_config', telegram.getConfig());
  });

  socket.on('telegram_set_config', ({ botToken, chatId, enabled }) => {
    const user = users.get(socket.id);
    if (!user || (user.role !== 'vendor' && user.role !== 'admin')) return;

    telegram.setConfig({ botToken, chatId, enabled });
    const config = telegram.getConfig();
    io.to('admin_lobby').emit('telegram_config', config);
  });

  socket.on('telegram_test', async () => {
    const user = users.get(socket.id);
    if (!user || (user.role !== 'vendor' && user.role !== 'admin')) return;

    const result = await telegram.testConnection();
    socket.emit('telegram_test_result', result);
  });

  socket.on('telegram_toggle', ({ enabled }) => {
    const user = users.get(socket.id);
    if (!user || (user.role !== 'vendor' && user.role !== 'admin')) return;

    telegram.setConfig({ enabled });
    const config = telegram.getConfig();
    io.to('admin_lobby').emit('telegram_config', config);
  });

  // ── Announcements (admin only) ────────────────────────────
  socket.on('announcement_create', ({ content }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const cleanContent = sanitize(content || '');
    if (!cleanContent) return;

    const announcement = {
      id: randomUUID(),
      content: cleanContent,
      createdAt: new Date().toISOString(),
      createdBy: user.username,
      active: true
    };
    announcements.push(announcement);

    // Broadcast to ALL connected sockets
    io.emit('announcements_update', announcements.filter(a => a.active));
  });

  socket.on('announcement_update', ({ id, content, active }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const ann = announcements.find(a => a.id === id);
    if (!ann) return;

    if (typeof content === 'string') ann.content = sanitize(content);
    if (typeof active === 'boolean') ann.active = active;

    io.emit('announcements_update', announcements.filter(a => a.active));
  });

  socket.on('announcement_delete', ({ id }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const idx = announcements.findIndex(a => a.id === id);
    if (idx !== -1) announcements.splice(idx, 1);

    io.emit('announcements_update', announcements.filter(a => a.active));
  });

  socket.on('announcements_get_all', () => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') {
      socket.emit('announcements_update', announcements.filter(a => a.active));
    } else {
      socket.emit('announcements_all', announcements);
    }
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const user = users.get(socket.id);

    if (user && user.role === 'customer') {
      const roomId = user.currentRoom;
      if (roomId) {
        const room = rooms.get(roomId);
        io.to(roomId).emit('user_offline', { userId: socket.id, role: 'customer' });

        // Clean up: archive and remove unresolved rooms
        if (room && room.status !== 'resolved') {
          room.status = 'closed';
          room.resolvedAt = new Date().toISOString();
          resolvedRooms.push({ id: roomId, ...room });
          rooms.delete(roomId);
        }
      }
    }

    // Clean up vendor's currentRoom reference when vendor disconnects
    if (user && user.role === 'vendor') {
      // Remove vendor assignment from any active rooms
      for (const [roomId, room] of rooms.entries()) {
        if (room.vendorId === socket.id) {
          room.vendorId = null;
          room.status = 'waiting';
        }
      }
      staffMetrics.delete(socket.id);
    }

    users.delete(socket.id);
    rateLimits.delete(socket.id);
    broadcastState(io);
  });
}

function broadcastState(io) {
  const connectedUsers = Array.from(users.values());
  const activeRooms = Array.from(rooms.entries()).map(([id, data]) => ({
    id,
    ...data,
    customerName: users.get(data.customerId)?.username || 'Đã ngắt kết nối',
    vendorName: users.get(data.vendorId)?.username || null
  }));

  const metrics = {};
  for (const [socketId, m] of staffMetrics.entries()) {
    metrics[socketId] = { ...m };
  }

  const ratings = Array.from(chatRatings.entries()).map(([roomId, r]) => ({ roomId, ...r }));

  const state = {
    connectedUsers,
    activeRooms,
    resolvedRooms: resolvedRooms.slice(-50), // Last 50
    staffMetrics: metrics,
    ratings,
    stats: {
      totalStaffOnline: connectedUsers.filter(u => u.role === 'vendor' && u.status === 'online').length,
      totalCustomers: connectedUsers.filter(u => u.role === 'customer').length,
      openTickets: activeRooms.filter(r => r.status !== 'resolved').length,
      waitingTickets: activeRooms.filter(r => r.status === 'waiting').length,
      resolvedTotal: resolvedRooms.length,
      avgRating: ratings.length > 0
        ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
        : '—'
    }
  };

  io.to('admin_lobby').emit('state_update', state);
}

module.exports = { handleConnection };
