/**
 * Telegram Notification Service
 * Sends chat notifications via Telegram Bot API
 */

// Global Telegram settings (in-memory)
const telegramConfig = {
  botToken: '',
  chatId: '',
  enabled: false
};

/**
 * Update Telegram configuration
 */
function setConfig({ botToken, chatId, enabled }) {
  if (typeof botToken === 'string') telegramConfig.botToken = botToken.trim();
  if (typeof chatId === 'string') telegramConfig.chatId = chatId.trim();
  if (typeof enabled === 'boolean') telegramConfig.enabled = enabled;
}

/**
 * Get current Telegram configuration (safe — no token leak to non-admin)
 */
function getConfig() {
  return {
    botToken: telegramConfig.botToken ? '••••' + telegramConfig.botToken.slice(-6) : '',
    chatId: telegramConfig.chatId,
    enabled: telegramConfig.enabled,
    isConfigured: !!(telegramConfig.botToken && telegramConfig.chatId)
  };
}

/**
 * Get full config (internal use only)
 */
function getFullConfig() {
  return { ...telegramConfig };
}

/**
 * Send notification to Telegram
 * @param {string} text - Message text (supports Markdown)
 */
async function sendNotification(text) {
  if (!telegramConfig.enabled) return;
  if (!telegramConfig.botToken || !telegramConfig.chatId) return;

  const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Telegram API error:', err);
    }
  } catch (error) {
    console.error('Telegram send failed:', error.message);
  }
}

/**
 * Format and send a new customer message notification
 */
async function notifyNewMessage({ customerName, content, roomId }) {
  const text = [
    '💬 *Tin nhắn mới từ khách hàng*',
    '',
    `👤 *Khách:* ${customerName}`,
    `📝 ${content}`,
    '',
    `🔗 Phòng: \`${roomId.slice(0, 12)}...\``
  ].join('\n');

  await sendNotification(text);
}

/**
 * Notify when a new customer connects (waiting for staff)
 */
async function notifyNewCustomer({ customerName, roomId }) {
  const text = [
    '🔔 *Khách hàng mới cần hỗ trợ*',
    '',
    `👤 *Khách:* ${customerName}`,
    `⏳ Đang chờ nhân viên tiếp nhận`,
    '',
    `🔗 Phòng: \`${roomId.slice(0, 12)}...\``
  ].join('\n');

  await sendNotification(text);
}

/**
 * Test the Telegram connection
 */
async function testConnection() {
  if (!telegramConfig.botToken || !telegramConfig.chatId) {
    return { success: false, error: 'Chưa cấu hình Bot Token hoặc Chat ID' };
  }

  try {
    const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text: '✅ *Clarion Stream* — Kết nối Telegram thành công!',
        parse_mode: 'Markdown'
      })
    });

    if (response.ok) {
      return { success: true };
    }
    const err = await response.json();
    return { success: false, error: err.description || 'Lỗi không xác định' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  setConfig,
  getConfig,
  getFullConfig,
  sendNotification,
  notifyNewMessage,
  notifyNewCustomer,
  testConnection
};
