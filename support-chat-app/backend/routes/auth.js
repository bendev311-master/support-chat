const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'clarion-stream-secret-key-2026';
const JWT_EXPIRES = '7d';

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// ── Register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Tên và mật khẩu là bắt buộc' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const validRoles = ['customer', 'vendor', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'customer';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Check if username exists
    const existing = db.getAccountByUsername(username.trim());

    if (existing) {
      // Old account without password → upgrade it
      if (!existing.password_hash) {
        db.setPasswordHash(existing.id, passwordHash);
        db.updateLoginInfo(existing.id, userRole);
        db.logLoginHistory(existing.id, req.ip, req.headers['user-agent'] || '', 'register_upgrade');

        const token = generateToken({ ...existing, role: userRole });
        return res.status(200).json({
          token,
          user: {
            id: existing.id,
            username: existing.username,
            role: userRole,
            email: existing.email || email,
            auth_provider: 'local'
          }
        });
      }
      // Already has password → can't register again
      return res.status(409).json({ error: 'Tên người dùng đã tồn tại. Vui lòng đăng nhập.' });
    }

    // Create new account
    const account = db.createAccount(username.trim(), userRole, email || null, passwordHash, 'local');

    // Log login history
    db.logLoginHistory(account.id, req.ip, req.headers['user-agent'] || '', 'register');

    const token = generateToken(account);

    res.status(201).json({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        email: account.email,
        auth_provider: 'local'
      }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Tên và mật khẩu là bắt buộc' });
    }

    const account = db.getAccountByUsername(username.trim());
    if (!account) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại. Vui lòng đăng ký trước.' });
    }

    // Old account without password → auto-set password on first login
    if (!account.password_hash) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự (đặt mật khẩu lần đầu)' });
      }
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      db.setPasswordHash(account.id, passwordHash);

      const validRoles = ['customer', 'vendor', 'admin'];
      const loginRole = validRoles.includes(role) ? role : account.role;
      db.updateLoginInfo(account.id, loginRole);
      db.logLoginHistory(account.id, req.ip, req.headers['user-agent'] || '', 'password_set');

      const token = generateToken({ ...account, role: loginRole });
      return res.json({
        token,
        user: {
          id: account.id,
          username: account.username,
          role: loginRole,
          email: account.email,
          auth_provider: 'local'
        },
        message: 'Mật khẩu đã được thiết lập thành công!'
      });
    }

    const isMatch = await bcrypt.compare(password, account.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Mật khẩu không đúng' });
    }

    // Validate role
    const validRoles = ['customer', 'vendor', 'admin'];
    const loginRole = validRoles.includes(role) ? role : account.role;

    // Update login info
    db.updateLoginInfo(account.id, loginRole);

    // Log login history
    db.logLoginHistory(account.id, req.ip, req.headers['user-agent'] || '', 'password');

    const token = generateToken({ ...account, role: loginRole });

    res.json({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: loginRole,
        email: account.email,
        auth_provider: account.auth_provider || 'local'
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Google Login ────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential, role } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Token Google không hợp lệ' });
    }

    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ error: 'Token Google không hợp lệ' });
    }

    let payload;
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
    } catch (e) {
      return res.status(400).json({ error: 'Không thể giải mã token Google' });
    }

    const { sub: googleId, email, name, picture } = payload;

    if (!googleId || !email) {
      return res.status(400).json({ error: 'Thông tin Google không đầy đủ' });
    }

    const validRoles = ['customer', 'vendor', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'customer';

    // Check if Google account exists
    let account = db.getAccountByGoogleId(googleId);

    if (account) {
      db.updateLoginInfo(account.id, userRole);
      if (picture) db.updateAvatar(account.id, picture);
    } else {
      const displayName = name || email.split('@')[0];
      account = db.createAccount(displayName, userRole, email, null, 'google', googleId, picture);
    }

    // Log login history
    db.logLoginHistory(account.id, req.ip, req.headers['user-agent'] || '', 'google');

    const token = generateToken({ ...account, role: userRole });

    res.json({
      token,
      user: {
        id: account.id,
        username: account.username,
        role: userRole,
        email: account.email || email,
        avatar: picture || account.avatar_url,
        auth_provider: 'google'
      }
    });
  } catch (err) {
    console.error('[Auth] Google login error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Get Login History ───────────────────────────────────────
router.get('/history', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

    const history = db.getLoginHistory(decoded.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Verify Token ────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Token không hợp lệ' });
  res.json({ user: decoded });
});

module.exports = { router, verifyToken };
