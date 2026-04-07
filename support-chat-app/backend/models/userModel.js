// In-memory store for connected users
// Structure: { socketId: { id: string, role: 'customer' | 'vendor' | 'admin', username: string, currentRoom: string } }
const users = new Map();

// In-memory store for active chat rooms
// Structure: { roomId: { customerId: string, vendorId: string | null, messages: Array } }
const rooms = new Map();

module.exports = {
  users,
  rooms
};
