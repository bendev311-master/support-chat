const express = require('express');
const db = require('../models/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Get Branding ────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const branding = {
      logo: db.getSetting('site_logo', ''),
      siteName: db.getSetting('site_name', 'Clarion Stream'),
      primaryColor: db.getSetting('site_primary_color', ''),
      footerText: db.getSetting('site_footer', ''),
    };
    res.json(branding);
  } catch (err) {
    console.error('[Branding] Get error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Update Branding ─────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { siteName, primaryColor, footerText } = req.body;

    if (siteName !== undefined) db.setSetting('site_name', siteName);
    if (primaryColor !== undefined) db.setSetting('site_primary_color', primaryColor);
    if (footerText !== undefined) db.setSetting('site_footer', footerText);

    res.json({ success: true });
  } catch (err) {
    console.error('[Branding] Update error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Upload Logo (base64) ────────────────────────────────────
router.post('/logo', (req, res) => {
  try {
    const { logo } = req.body;

    if (!logo) {
      // Clear logo
      db.setSetting('site_logo', '');
      return res.json({ success: true, logo: '' });
    }

    // Validate base64 image
    const match = logo.match(/^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/);
    if (!match) {
      return res.status(400).json({ error: 'Định dạng ảnh không hợp lệ (PNG, JPG, GIF, SVG, WebP)' });
    }

    // Check size (max 500KB base64 ≈ 375KB file)
    if (logo.length > 700000) {
      return res.status(400).json({ error: 'Kích thước ảnh tối đa 500KB' });
    }

    // Save base64 directly to settings (simple, no file management needed)
    db.setSetting('site_logo', logo);

    res.json({ success: true, logo });
  } catch (err) {
    console.error('[Branding] Logo upload error:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ── Serve uploaded files ────────────────────────────────────
router.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
