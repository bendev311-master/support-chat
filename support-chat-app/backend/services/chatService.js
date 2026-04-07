const { users, rooms } = require('../models/userModel');
const { randomUUID } = require('crypto');

function handleConnection(io, socket) {
  console.log(`User connected: ${socket.id}`);

  // Register user
  socket.on('register', (data) => {
    const { role, username } = data;
    users.set(socket.id, { id: socket.id, role, username, currentRoom: null });
    
    // Notify admins of new user
    broadcastState(io);

    if (role === 'customer') {
      // Auto-create a support room and join it
      const roomId = `room_${randomUUID()}`;
      rooms.set(roomId, { customerId: socket.id, vendorId: null, messages: [] });
      socket.join(roomId);
      users.get(socket.id).currentRoom = roomId;
      
      socket.emit('room_assigned', { roomId });
      broadcastState(io);
    } else if (role === 'vendor' || role === 'admin') {
      // Vendor/Admin joins a global lobby to receive state updates
      socket.join('admin_lobby');
      broadcastState(io);
    }
  });

  // Handle vendor picking up a customer chat
  socket.on('join_room', ({ roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);
    
    if (user && (user.role === 'vendor' || user.role === 'admin') && room) {
      if (!room.vendorId) {
        room.vendorId = socket.id;
      }
      socket.join(roomId);
      user.currentRoom = roomId;
      socket.emit('room_joined', { roomId, messages: room.messages });
      broadcastState(io);
    }
  });

  // Handle messaging
  socket.on('send_message', (data) => {
    const { roomId, content } = data;
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (user && room) {
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
      
      // Update admins
      broadcastState(io);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const user = users.get(socket.id);
    if (user && user.role === 'customer') {
      const roomId = user.currentRoom;
      if (roomId) {
         io.to(roomId).emit('user_offline', { userId: socket.id, role: 'customer' });
      }
    }
    users.delete(socket.id);
    broadcastState(io);
  });
}

function broadcastState(io) {
  // Compute state to send to vendors/admins
  const state = {
    connectedUsers: Array.from(users.values()),
    activeRooms: Array.from(rooms.entries()).map(([id, data]) => ({ id, ...data }))
  };
  io.to('admin_lobby').emit('state_update', state);
}

module.exports = {
  handleConnection
};
