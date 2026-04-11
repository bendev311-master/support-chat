// In-memory store for connected users
// Structure: { socketId: { id, role, username, currentRoom, status, joinedAt } }
const users = new Map();

// In-memory store for active chat rooms
// Structure: { roomId: { customerId, vendorId, messages[], status, createdAt, resolvedAt, rating, firstResponseAt } }
const rooms = new Map();

// In-memory store for resolved rooms (archive)
const resolvedRooms = [];

// Chat quality ratings
// Structure: { roomId: { rating: 1-5, comment, timestamp } }
const chatRatings = new Map();

// Staff profiles and metrics
// Structure: { socketId: { resolvedCount, totalResponseTime, responseCount, avgResponseTime } }
const staffMetrics = new Map();

// Admin announcements (marquee messages)
// Structure: [{ id, content, createdAt, createdBy, active }]
const announcements = [];

module.exports = {
  users,
  rooms,
  resolvedRooms,
  chatRatings,
  staffMetrics,
  announcements
};
