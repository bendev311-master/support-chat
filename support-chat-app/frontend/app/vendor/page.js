'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

export default function VendorPanel() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState({ connectedUsers: [], activeRooms: [], stats: {} });
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [filter, setFilter] = useState('all');
  const [typingUser, setTypingUser] = useState(null);
  const [showTelegram, setShowTelegram] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState({ botToken: '', chatId: '', enabled: false, isConfigured: false });
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) { router.push('/staff-login'); return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'vendor') { router.push('/staff-login'); return; }

    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit('register', user);
    });

    newSocket.on('state_update', (newState) => {
      setState(newState);
    });

    newSocket.on('room_joined', (data) => {
      setActiveRoomId(data.roomId);
      setMessages(data.messages);
    });

    newSocket.on('new_message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on('typing_indicator', ({ username, isTyping }) => {
      setTypingUser(isTyping ? username : null);
    });

    // Telegram config listeners
    newSocket.on('telegram_config', (config) => {
      setTelegramConfig(config);
      if (config.chatId) setTelegramChatId(config.chatId);
    });
    newSocket.on('telegram_test_result', (result) => {
      setTelegramTestResult(result);
      setTimeout(() => setTelegramTestResult(null), 4000);
    });

    // Request current Telegram config
    newSocket.emit('telegram_get_config');

    // Announcements
    newSocket.on('announcements_update', (anns) => {
      setAnnouncements(anns || []);
    });

    return () => newSocket.close();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync messages when state updates and we have active room
  useEffect(() => {
    if (activeRoomId && state.activeRooms) {
      const room = state.activeRooms.find((r) => r.id === activeRoomId);
      if (room) setMessages(room.messages);
    }
  }, [state, activeRoomId]);

  const joinRoom = (roomId) => {
    if (socket) socket.emit('join_room', { roomId });
  };

  const handleTyping = () => {
    if (!socket || !activeRoomId) return;
    socket.emit('typing_start', { roomId: activeRoomId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing_stop', { roomId: activeRoomId });
    }, 1500);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !socket || !activeRoomId) return;
    socket.emit('send_message', { roomId: activeRoomId, content: inputVal });
    socket.emit('typing_stop', { roomId: activeRoomId });
    setInputVal('');
  };

  const resolveChat = () => {
    if (!socket || !activeRoomId) return;
    socket.emit('resolve_chat', { roomId: activeRoomId });
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    router.push('/staff-login');
  };

  const saveTelegramConfig = () => {
    if (!socket) return;
    socket.emit('telegram_set_config', {
      botToken: telegramBotToken || undefined,
      chatId: telegramChatId || undefined,
      enabled: telegramConfig.enabled
    });
  };

  const toggleTelegram = () => {
    if (!socket) return;
    socket.emit('telegram_toggle', { enabled: !telegramConfig.enabled });
  };

  const testTelegram = () => {
    if (!socket) return;
    setTelegramTestResult(null);
    socket.emit('telegram_test');
  };

  const filteredRooms = (state.activeRooms || []).filter((room) => {
    if (filter === 'assigned') return room.vendorId === socket?.id;
    if (filter === 'resolved') return room.status === 'resolved';
    return room.status !== 'resolved';
  });

  const activeRoom = state.activeRooms?.find((r) => r.id === activeRoomId);
  const initials = (name) => name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <div className="page-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-avatar">
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>support_agent</span>
          </div>
          <div>
            <div className="title-sm">Nhân viên hỗ trợ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <span className="status-dot status-online" />
              <span className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Trực tuyến</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button
            className={`sidebar-link ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <span className="material-icons-outlined">chat_bubble</span>
            <span>Tất cả Chat</span>
          </button>
          <button
            className={`sidebar-link ${filter === 'assigned' ? 'active' : ''}`}
            onClick={() => setFilter('assigned')}
          >
            <span className="material-icons-outlined">assignment_ind</span>
            <span>Đã giao cho tôi</span>
          </button>
          <button
            className={`sidebar-link ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            <span className="material-icons-outlined">check_circle</span>
            <span>Đã giải quyết</span>
          </button>
          <button className="sidebar-link" onClick={() => setShowTelegram(!showTelegram)}>
            <span className="material-icons-outlined">send</span>
            <span>Telegram</span>
            {telegramConfig.enabled && (
              <span className="status-dot status-online" style={{ marginLeft: 'auto' }} />
            )}
          </button>
        </div>

        <div className="sidebar-spacer" />
        <button className="sidebar-link" onClick={handleLogout}>
          <span className="material-icons-outlined">logout</span>
          <span>Đăng xuất</span>
        </button>
      </nav>

      {/* Marquee Banner */}
      {announcements.length > 0 && (
        <div className="marquee-banner" style={{ gridColumn: '1 / -1' }}>
          <div className="marquee-track">
            {[...announcements, ...announcements].map((a, i) => (
              <span key={i} className="marquee-item">{a.content}</span>
            ))}
          </div>
        </div>
      )}

      {/* Chat Layout */}
      <div className="chat-layout">
        {/* Chat List Panel */}
        <div className="chat-list-panel">
          <div className="chat-list-header">
            <h1 className="headline-sm">Hỗ trợ</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <span className="chip chip-warning">
                {state.stats?.waitingTickets || 0} Yêu cầu đang chờ
              </span>
            </div>
            <p className="body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 'var(--space-2)' }}>
              Thời gian phản hồi trung bình hiện tại là <strong>4p 12s</strong>.
            </p>
          </div>

          <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
            <p className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Danh sách Chat gần đây</p>
          </div>

          <div className="chat-list-items">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className={`chat-item ${activeRoomId === room.id ? 'active' : ''}`}
                onClick={() => joinRoom(room.id)}
              >
                <div className="chat-item-avatar">
                  {initials(room.customerName)}
                </div>
                <div className="chat-item-content">
                  <div className="chat-item-name">{room.customerName}</div>
                  <div className="chat-item-preview">
                    {room.messages.length > 0
                      ? room.messages[room.messages.length - 1].content
                      : 'Chưa có tin nhắn'}
                  </div>
                </div>
                <div className="chat-item-meta">
                  <span className={`status-badge ${
                    room.status === 'waiting' ? 'status-badge-waiting' :
                    room.status === 'active' ? 'status-badge-active' :
                    'status-badge-resolved'
                  }`}>
                    {room.status === 'waiting' ? 'Chờ' : room.status === 'active' ? 'Đang hỗ trợ' : 'Xong'}
                  </span>
                </div>
              </div>
            ))}

            {filteredRooms.length === 0 && (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <span className="material-icons-outlined">inbox</span>
                <p className="body-sm">Chưa có cuộc hội thoại nào</p>
              </div>
            )}
          </div>

          {/* Team Activity */}
          <div style={{ padding: 'var(--space-4)', background: 'var(--surface-container-low)' }}>
            <p className="label-sm" style={{ color: 'var(--on-surface-variant)', marginBottom: 'var(--space-2)' }}>
              Hoạt động Đội ngũ
            </p>
            <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
              <strong>{state.stats?.totalStaffOnline || 0}</strong> nhân viên đang trực tuyến
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {activeRoomId && activeRoom ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-item-avatar" style={{ width: 40, height: 40 }}>
                  {initials(activeRoom.customerName)}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{activeRoom.customerName}</div>
                  <div className="chat-header-status">
                    <span className="status-dot status-online" />
                    <span>Đang trực tuyến</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {activeRoom.status !== 'resolved' && (
                    <button className="btn btn-primary" onClick={resolveChat} style={{ fontSize: '0.8125rem' }}>
                      <span className="material-icons-outlined" style={{ fontSize: 16 }}>check_circle</span>
                      Giải quyết
                    </button>
                  )}
                </div>
              </div>

              {/* Customer Info Card */}
              <div style={{ padding: 'var(--space-3) var(--space-6)' }}>
                <div className="product-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Khách hàng</div>
                      <div className="title-sm">{activeRoom.customerName}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Tin nhắn</div>
                      <div className="title-sm">{activeRoom.messages.length}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="messages-container">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`bubble ${msg.senderId === socket?.id ? 'bubble-mine' : 'bubble-theirs'}`}
                  >
                    <div className="bubble-header">
                      <span className="bubble-sender">
                        {msg.senderId === socket?.id ? 'Bạn' : msg.senderName}
                      </span>
                      <span className="bubble-time">
                        {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>{msg.content}</div>
                  </div>
                ))}

                {typingUser && (
                  <div className="typing-indicator">
                    <span>{typingUser} đang nhập</span>
                    <div className="typing-dots">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {activeRoom.status !== 'resolved' && (
                <form className="input-area" onSubmit={sendMessage}>
                  <input
                    id="vendor-message-input"
                    type="text"
                    className="input"
                    placeholder="Nhập câu trả lời..."
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleTyping}
                  />
                  <button type="submit" className="send-btn" disabled={!inputVal.trim()} aria-label="Gửi">
                    <Send size={18} />
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="empty-state">
              <span className="material-icons-outlined">forum</span>
              <h3 className="headline-sm">Chọn cuộc hội thoại</h3>
              <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
                Chọn một cuộc hội thoại bên trái để bắt đầu hỗ trợ khách hàng
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Settings Modal */}
      {showTelegram && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTelegram(false); }}>
          <div className="telegram-panel" style={{ maxWidth: 440, width: '90%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="telegram-header">
                <div className="telegram-icon">
                  <span className="material-icons-outlined" style={{ fontSize: 22 }}>send</span>
                </div>
                <div>
                  <div className="title-lg">Thông báo Telegram</div>
                  <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    Nhận thông báo khi có khách mới
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowTelegram(false)}>
                <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            {/* Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-lg)' }}>
              <div>
                <div className="title-sm">Bật thông báo</div>
                <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                  {telegramConfig.enabled ? 'Đang gửi thông báo đến Telegram' : 'Thông báo đã tắt'}
                </div>
              </div>
              <label className="toggle-switch" id="telegram-toggle">
                <input
                  type="checkbox"
                  checked={telegramConfig.enabled}
                  onChange={toggleTelegram}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span className={`telegram-status ${telegramConfig.isConfigured && telegramConfig.enabled ? 'telegram-status-on' : 'telegram-status-off'}`}>
                <span className="material-icons-outlined" style={{ fontSize: 12 }}>
                  {telegramConfig.isConfigured && telegramConfig.enabled ? 'check_circle' : 'cancel'}
                </span>
                {telegramConfig.isConfigured && telegramConfig.enabled ? 'Đang hoạt động' : telegramConfig.isConfigured ? 'Đã cấu hình (tắt)' : 'Chưa cấu hình'}
              </span>
              {telegramConfig.botToken && (
                <span className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>Token: {telegramConfig.botToken}</span>
              )}
            </div>

            {/* Config Inputs */}
            <div className="input-group">
              <label className="input-label" htmlFor="tg-bot-token">Bot Token</label>
              <input
                id="tg-bot-token"
                type="password"
                className="input"
                placeholder="123456:ABC-DEF..."
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="tg-chat-id">Chat ID</label>
              <input
                id="tg-chat-id"
                type="text"
                className="input"
                placeholder="-1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
              <span className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                ID nhóm hoặc cá nhân nhận thông báo
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-primary" onClick={saveTelegramConfig} style={{ flex: 1 }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>save</span>
                Lưu cấu hình
              </button>
              <button
                className="btn btn-secondary"
                onClick={testTelegram}
                disabled={!telegramConfig.isConfigured}
                style={{ opacity: telegramConfig.isConfigured ? 1 : 0.5 }}
              >
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>send</span>
                Test
              </button>
            </div>

            {/* Test Result */}
            {telegramTestResult && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: telegramTestResult.success ? 'rgba(22, 163, 74, 0.1)' : 'rgba(168, 56, 54, 0.1)',
                color: telegramTestResult.success ? '#16a34a' : 'var(--error)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                animation: 'fadeSlideUp 0.25s ease'
              }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>
                  {telegramTestResult.success ? 'check_circle' : 'error'}
                </span>
                {telegramTestResult.success ? 'Gửi test thành công! Kiểm tra Telegram.' : telegramTestResult.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
