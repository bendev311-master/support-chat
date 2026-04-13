const { users, rooms, resolvedRooms, chatRatings, staffMetrics, announcements } = require('../models/userModel');
const db = require('../models/database');
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

    // ★ Save/update account in database
    try {
      const account = db.loginAccount(username, role, username);
      console.log(`[DB] Account logged in: ${username} (${role}), total logins: ${account.login_count}`);

      // Send active announcements from DB
      const dbAnnouncements = db.getActiveAnnouncements();
      if (dbAnnouncements.length > 0) {
        socket.emit('announcements_update', dbAnnouncements.map(a => ({
          id: a.id,
          content: a.content,
          createdAt: a.created_at,
          createdBy: a.created_by,
          active: a.is_active === 1
        })));
      }

      users.set(socket.id, {
        id: socket.id,
        role,
        username,
        accountId: account.id,
        currentRoom: null,
        status: 'online',
        joinedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[DB] Account login error:', err.message);
      // Fallback to in-memory only
      users.set(socket.id, {
        id: socket.id,
        role,
        username,
        accountId: null,
        currentRoom: null,
        status: 'online',
        joinedAt: new Date().toISOString()
      });

      // Send in-memory announcements as fallback
      const activeAnnouncements = announcements.filter(a => a.active);
      if (activeAnnouncements.length > 0) {
        socket.emit('announcements_update', activeAnnouncements);
      }
    }

    if (role === 'customer') {
      // Check if customer has an existing active room (reconnection)
      let existingRoomId = null;
      for (const [rid, room] of rooms.entries()) {
        const existingCustomer = users.get(room.customerId);
        if (existingCustomer && existingCustomer.username === username) {
          existingRoomId = rid;
          break;
        }
        // Also check if room was left by this username (customer disconnected)
        if (!existingCustomer && room._customerName === username && room.status !== 'resolved' && room.status !== 'closed') {
          existingRoomId = rid;
          break;
        }
      }

      if (existingRoomId) {
        // Reconnect to existing room
        const room = rooms.get(existingRoomId);
        if (room._disconnectTimer) {
          clearTimeout(room._disconnectTimer);
          delete room._disconnectTimer;
        }
        room.customerId = socket.id;
        socket.join(existingRoomId);
        users.get(socket.id).currentRoom = existingRoomId;

        socket.emit('room_assigned', {
          roomId: existingRoomId,
          messages: room.messages,
          chatHistory: []
        });
        console.log(`[Reconnect] Customer ${username} rejoined room ${existingRoomId}`);
      } else {
        // Create new room
        const roomId = `room_${randomUUID()}`;

        // ★ Create chat session in database
        try {
          db.createChatSession(roomId, username);
        } catch (err) {
          console.error('[DB] Create session error:', err.message);
        }

        rooms.set(roomId, {
          customerId: socket.id,
          vendorId: null,
          messages: [],
          status: 'waiting',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          rating: null,
          firstResponseAt: null,
          _customerName: username // Store for reconnection lookup
        });
        socket.join(roomId);
        users.get(socket.id).currentRoom = roomId;

        // ★ Send previous chat history to returning customers
        let previousHistory = [];
        try {
          previousHistory = db.getCustomerHistory(username);
        } catch (err) {
          console.error('[DB] Get history error:', err.message);
        }

        socket.emit('room_assigned', {
          roomId,
          chatHistory: previousHistory.slice(-5) // last 5 sessions
        });

        // Telegram: notify new customer waiting
        telegram.notifyNewCustomer({ customerName: username, roomId });
      }
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

      // ★ Update session in database
      try {
        db.assignVendor(roomId, user.username);
      } catch (err) {
        console.error('[DB] Assign vendor error:', err.message);
      }
    }

    socket.join(roomId);
    user.currentRoom = roomId;

    // ★ Load messages from database if room messages are empty
    if (room.messages.length === 0) {
      try {
        const dbMessages = db.getChatHistory(roomId);
        room.messages = dbMessages.map(m => ({
          id: m.id,
          senderId: null,
          senderName: m.sender_name,
          role: m.sender_role,
          content: m.content,
          timestamp: m.created_at
        }));
      } catch (err) {
        console.error('[DB] Load messages error:', err.message);
      }
    }

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

    // ★ Save message to database
    try {
      db.saveMessage(message, roomId);
    } catch (err) {
      console.error('[DB] Save message error:', err.message);
    }

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

      // ★ Save first response to database
      try {
        db.setFirstResponse(roomId);
      } catch (err) {
        console.error('[DB] First response error:', err.message);
      }

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

    // ★ Update session in database
    try {
      db.resolveSession(roomId, 'resolved');
    } catch (err) {
      console.error('[DB] Resolve session error:', err.message);
    }

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

    // ★ Save rating to database
    try {
      db.rateSession(roomId, numRating, sanitize(comment || ''));
    } catch (err) {
      console.error('[DB] Rate session error:', err.message);
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

    // ★ Save to database
    try {
      db.insertAnnouncement(announcement.id, announcement.content, announcement.createdBy);
    } catch (err) {
      console.error('[DB] Insert announcement error:', err.message);
    }

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

    // ★ Update in database
    try {
      db.updateAnnouncement(id, ann.content, ann.active ? 1 : 0);
    } catch (err) {
      console.error('[DB] Update announcement error:', err.message);
    }

    io.emit('announcements_update', announcements.filter(a => a.active));
  });

  socket.on('announcement_delete', ({ id }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const idx = announcements.findIndex(a => a.id === id);
    if (idx !== -1) announcements.splice(idx, 1);

    // ★ Delete from database
    try {
      db.deleteAnnouncement(id);
    } catch (err) {
      console.error('[DB] Delete announcement error:', err.message);
    }

    io.emit('announcements_update', announcements.filter(a => a.active));
  });

  socket.on('announcements_get_all', () => {
    const user = users.get(socket.id);
    try {
      if (!user || user.role !== 'admin') {
        const dbAnn = db.getActiveAnnouncements();
        socket.emit('announcements_update', dbAnn.map(a => ({
          id: a.id, content: a.content, createdAt: a.created_at,
          createdBy: a.created_by, active: a.is_active === 1
        })));
      } else {
        const dbAnn = db.getAllAnnouncements();
        socket.emit('announcements_all', dbAnn.map(a => ({
          id: a.id, content: a.content, createdAt: a.created_at,
          createdBy: a.created_by, active: a.is_active === 1
        })));
      }
    } catch (err) {
      // Fallback to in-memory
      if (!user || user.role !== 'admin') {
        socket.emit('announcements_update', announcements.filter(a => a.active));
      } else {
        socket.emit('announcements_all', announcements);
      }
    }
  });

  // ── ★ Chat History & Settings (NEW) ───────────────────────
  socket.on('get_chat_history', ({ customerName }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Customers can only view their own history
    if (user.role === 'customer' && customerName && user.username !== customerName) return;

    try {
      const history = db.getCustomerHistory(customerName || user.username);
      socket.emit('chat_history', { history });
    } catch (err) {
      console.error('[DB] Get chat history error:', err.message);
      socket.emit('chat_history', { history: [] });
    }
  });

  socket.on('get_db_settings', () => {
    const user = users.get(socket.id);
    if (!user) return;

    try {
      const autoDeleteDays = db.getSetting('auto_delete_days', '0');
      const dbStats = db.getDbStats();

      socket.emit('db_settings', {
        autoDeleteDays: parseInt(autoDeleteDays, 10),
        stats: dbStats
      });
    } catch (err) {
      console.error('[DB] Get settings error:', err.message);
      socket.emit('db_settings', { autoDeleteDays: 0, stats: {} });
    }
  });

  socket.on('set_auto_delete', ({ days }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 0 || numDays > 365) return;

    try {
      db.setSetting('auto_delete_days', String(numDays));
      console.log(`[Settings] Auto-delete chat set to ${numDays} days (0 = disabled)`);

      // Broadcast updated settings
      io.to('admin_lobby').emit('db_settings', {
        autoDeleteDays: numDays,
        stats: db.getDbStats()
      });
    } catch (err) {
      console.error('[DB] Set auto-delete error:', err.message);
    }
  });

  socket.on('manual_cleanup', ({ days }) => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1) return;

    try {
      const result = db.cleanupOldChats(numDays);
      console.log(`[Manual cleanup] Deleted ${result.deletedMessages} messages, ${result.deletedSessions} sessions older than ${numDays} days`);

      socket.emit('cleanup_result', {
        ...result,
        days: numDays
      });

      // Refresh stats
      io.to('admin_lobby').emit('db_settings', {
        autoDeleteDays: parseInt(db.getSetting('auto_delete_days', '0'), 10),
        stats: db.getDbStats()
      });
    } catch (err) {
      console.error('[DB] Manual cleanup error:', err.message);
    }
  });

  socket.on('get_accounts', () => {
    const user = users.get(socket.id);
    if (!user || user.role !== 'admin') return;

    try {
      const accounts = db.getAllAccounts();
      socket.emit('accounts_list', { accounts });
    } catch (err) {
      console.error('[DB] Get accounts error:', err.message);
      socket.emit('accounts_list', { accounts: [] });
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

        // Grace period: wait 30 seconds before closing room
        // This allows for page refreshes and brief disconnects
        if (room && room.status !== 'resolved') {
          room._disconnectTimer = setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (currentRoom && currentRoom.customerId === socket.id && currentRoom.status !== 'resolved') {
              currentRoom.status = 'closed';
              currentRoom.resolvedAt = new Date().toISOString();

              // ★ Update in database
              try {
                db.resolveSession(roomId, 'closed');
              } catch (err) {
                console.error('[DB] Close session error:', err.message);
              }

              resolvedRooms.push({ id: roomId, ...currentRoom });
              rooms.delete(roomId);
              broadcastState(io);
            }
          }, 30000); // 30 second grace period
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
    customerId: data.customerId,
    vendorId: data.vendorId,
    status: data.status,
    createdAt: data.createdAt,
    resolvedAt: data.resolvedAt,
    firstResponseAt: data.firstResponseAt,
    messageCount: data.messages.length,
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
