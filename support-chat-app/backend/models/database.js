const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'clarion.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Save database to file periodically
function saveToFile() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Error saving database:', err.message);
  }
}

// Auto-save every 30 seconds
let saveInterval = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('customer', 'vendor', 'admin')),
      display_name TEXT,
      email TEXT,
      password_hash TEXT,
      google_id TEXT,
      avatar_url TEXT,
      auth_provider TEXT DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT,
      login_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Migration: add new columns to existing tables
  const migrations = [
    "ALTER TABLE accounts ADD COLUMN password_hash TEXT",
    "ALTER TABLE accounts ADD COLUMN google_id TEXT",
    "ALTER TABLE accounts ADD COLUMN avatar_url TEXT",
    "ALTER TABLE accounts ADD COLUMN auth_provider TEXT DEFAULT 'local'"
  ];
  migrations.forEach(sql => {
    try { db.run(sql); } catch (e) { /* column already exists */ }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      vendor_id INTEGER,
      vendor_name TEXT,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'resolved', 'closed')),
      rating INTEGER CHECK(rating BETWEEN 1 AND 5),
      rating_comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      first_response_at TEXT,
      resolved_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      login_method TEXT DEFAULT 'password',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_status ON chat_sessions(status)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_created ON chat_sessions(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_google ON accounts(google_id)',
    'CREATE INDEX IF NOT EXISTS idx_login_history_account ON login_history(account_id)',
  ];
  indexes.forEach(sql => db.run(sql));

  // Save initial state
  saveToFile();

  // Auto-save every 30 seconds
  saveInterval = setInterval(saveToFile, 30000);

  console.log('[DB] Database initialized successfully');
  return db;
}

// ─── Helper Functions ────────────────────────────────────────

function runQuery(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveToFile();
}

function getOne(sql, params = []) {
  if (!db) return null;
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getAll(sql, params = []) {
  if (!db) return [];
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// ─── Account Operations ─────────────────────────────────────

function loginAccount(username, role, displayName) {
  const existing = getOne('SELECT * FROM accounts WHERE username = ?', [username]);

  if (existing) {
    runQuery(
      `UPDATE accounts SET last_login_at = datetime('now'), login_count = login_count + 1, role = ? WHERE username = ?`,
      [role, username]
    );
  } else {
    runQuery(
      `INSERT INTO accounts (username, role, display_name, last_login_at, login_count) VALUES (?, ?, ?, datetime('now'), 1)`,
      [username, role, displayName || username]
    );
  }

  return getOne('SELECT * FROM accounts WHERE username = ?', [username]);
}

function getAccountByUsername(username) {
  return getOne('SELECT * FROM accounts WHERE username = ?', [username]);
}

function getAccountByGoogleId(googleId) {
  return getOne('SELECT * FROM accounts WHERE google_id = ?', [googleId]);
}

function createAccount(username, role, email, passwordHash, authProvider, googleId, avatarUrl) {
  runQuery(
    `INSERT INTO accounts (username, role, email, password_hash, auth_provider, google_id, avatar_url, display_name, last_login_at, login_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)`,
    [username, role, email || null, passwordHash || null, authProvider || 'local', googleId || null, avatarUrl || null, username]
  );
  return getOne('SELECT * FROM accounts WHERE username = ?', [username]);
}

function updateLoginInfo(accountId, role) {
  runQuery(
    `UPDATE accounts SET last_login_at = datetime('now'), login_count = login_count + 1, role = ? WHERE id = ?`,
    [role, accountId]
  );
}

function updateAvatar(accountId, avatarUrl) {
  runQuery(`UPDATE accounts SET avatar_url = ? WHERE id = ?`, [avatarUrl, accountId]);
}

function setPasswordHash(accountId, passwordHash) {
  runQuery(`UPDATE accounts SET password_hash = ?, auth_provider = 'local' WHERE id = ?`, [passwordHash, accountId]);
}

function logLoginHistory(accountId, ip, userAgent, method) {
  runQuery(
    `INSERT INTO login_history (account_id, ip_address, user_agent, login_method) VALUES (?, ?, ?, ?)`,
    [accountId, ip || '', userAgent || '', method || 'password']
  );
}

function getLoginHistory(accountId, limit) {
  return getAll(
    'SELECT * FROM login_history WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
    [accountId, limit || 20]
  );
}

function getAllAccounts() {
  return getAll('SELECT id, username, role, email, auth_provider, avatar_url, created_at, last_login_at, login_count, is_active FROM accounts ORDER BY last_login_at DESC');
}

// ─── Chat Session Operations ─────────────────────────────────

function createChatSession(id, customerName) {
  const account = getOne('SELECT id FROM accounts WHERE username = ?', [customerName]);
  runQuery(
    `INSERT INTO chat_sessions (id, customer_id, customer_name, status, created_at) VALUES (?, ?, ?, 'waiting', datetime('now'))`,
    [id, account ? account.id : null, customerName]
  );
  return getOne('SELECT * FROM chat_sessions WHERE id = ?', [id]);
}

function assignVendor(sessionId, vendorName) {
  const account = getOne('SELECT id FROM accounts WHERE username = ?', [vendorName]);
  runQuery(
    `UPDATE chat_sessions SET vendor_id = ?, vendor_name = ?, status = 'active' WHERE id = ?`,
    [account ? account.id : null, vendorName, sessionId]
  );
}

function resolveSession(sessionId, status) {
  runQuery(
    `UPDATE chat_sessions SET status = ?, resolved_at = datetime('now') WHERE id = ?`,
    [status, sessionId]
  );
}

function rateSession(sessionId, rating, comment) {
  runQuery(
    `UPDATE chat_sessions SET rating = ?, rating_comment = ? WHERE id = ?`,
    [rating, comment, sessionId]
  );
}

function setFirstResponse(sessionId) {
  runQuery(
    `UPDATE chat_sessions SET first_response_at = datetime('now') WHERE id = ? AND first_response_at IS NULL`,
    [sessionId]
  );
}

// ─── Message Operations ──────────────────────────────────────

function saveMessage(msg, sessionId) {
  runQuery(
    `INSERT INTO messages (id, session_id, sender_name, sender_role, content, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [msg.id, sessionId, msg.senderName, msg.role, msg.content]
  );
}

function getChatHistory(sessionId) {
  return getAll('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
}

function getCustomerHistory(customerName) {
  const sessions = getAll(
    'SELECT * FROM chat_sessions WHERE customer_name = ? ORDER BY created_at DESC',
    [customerName]
  );
  return sessions.map(session => ({
    ...session,
    messages: getAll('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [session.id])
  }));
}

// ─── Announcement Operations ─────────────────────────────────

function insertAnnouncement(id, content, createdBy) {
  runQuery(
    `INSERT INTO announcements (id, content, created_by, created_at) VALUES (?, ?, ?, datetime('now'))`,
    [id, content, createdBy]
  );
}

function updateAnnouncement(id, content, isActive) {
  runQuery(
    `UPDATE announcements SET content = ?, is_active = ? WHERE id = ?`,
    [content, isActive, id]
  );
}

function deleteAnnouncement(id) {
  runQuery('DELETE FROM announcements WHERE id = ?', [id]);
}

function getActiveAnnouncements() {
  return getAll('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC');
}

function getAllAnnouncements() {
  return getAll('SELECT * FROM announcements ORDER BY created_at DESC');
}

// ─── Settings Operations ─────────────────────────────────────

function getSetting(key, defaultValue) {
  const row = getOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  const existing = getOne('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    runQuery(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`, [String(value), key]);
  } else {
    runQuery(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`, [key, String(value)]);
  }
}

// ─── Cleanup Operations ──────────────────────────────────────

function cleanupOldChats(days) {
  const negDays = `-${days} days`;

  const msgResult = db.exec(`SELECT changes() as c`);
  db.run(`DELETE FROM messages WHERE created_at < datetime('now', ?)`, [negDays]);
  const msgChanges = getOne('SELECT changes() as c');

  db.run(`DELETE FROM chat_sessions WHERE created_at < datetime('now', ?) AND status IN ('resolved', 'closed')`, [negDays]);
  const sessionChanges = getOne('SELECT changes() as c');

  saveToFile();

  return {
    deletedMessages: msgChanges ? msgChanges.c : 0,
    deletedSessions: sessionChanges ? sessionChanges.c : 0
  };
}

// ─── Stats ───────────────────────────────────────────────────

function getDbStats() {
  const stats = getOne(`
    SELECT 
      (SELECT COUNT(*) FROM accounts) as total_accounts,
      (SELECT COUNT(*) FROM accounts WHERE role = 'customer') as total_customers,
      (SELECT COUNT(*) FROM accounts WHERE role = 'vendor') as total_vendors,
      (SELECT COUNT(*) FROM chat_sessions) as total_sessions,
      (SELECT COUNT(*) FROM chat_sessions WHERE status = 'resolved') as resolved_sessions,
      (SELECT COUNT(*) FROM messages) as total_messages,
      (SELECT AVG(rating) FROM chat_sessions WHERE rating IS NOT NULL) as avg_rating
  `);
  return stats || {};
}

// ─── Auto-cleanup scheduler ────────────────────────────────

function startAutoCleanup() {
  setInterval(() => {
    const autoDeleteDays = getSetting('auto_delete_days', '0');
    const days = parseInt(autoDeleteDays, 10);
    if (days > 0) {
      const result = cleanupOldChats(days);
      if (result.deletedMessages > 0 || result.deletedSessions > 0) {
        console.log(`[Auto-cleanup] Deleted ${result.deletedMessages} messages, ${result.deletedSessions} sessions older than ${days} days`);
      }
    }
  }, 60 * 60 * 1000); // Every 1 hour
}

// Graceful shutdown
process.on('exit', () => {
  saveToFile();
  if (saveInterval) clearInterval(saveInterval);
});
process.on('SIGINT', () => {
  saveToFile();
  process.exit(0);
});

module.exports = {
  initDatabase,
  loginAccount,
  getAccountByUsername,
  getAccountByGoogleId,
  createAccount,
  updateLoginInfo,
  updateAvatar,
  setPasswordHash,
  logLoginHistory,
  getLoginHistory,
  getAllAccounts,
  createChatSession,
  assignVendor,
  resolveSession,
  rateSession,
  setFirstResponse,
  saveMessage,
  getChatHistory,
  getCustomerHistory,
  insertAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getActiveAnnouncements,
  getAllAnnouncements,
  getSetting,
  setSetting,
  cleanupOldChats,
  getDbStats
};
