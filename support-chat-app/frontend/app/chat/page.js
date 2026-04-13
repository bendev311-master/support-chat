'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import API_URL from '../config';
import { Send, Star } from 'lucide-react';

export default function CustomerChat() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const [isResolved, setIsResolved] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    sound: true,
    fontSize: 'normal',
    darkMode: true,
  });
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) { router.push('/'); return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'customer') { router.push('/'); return; }

    const newSocket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('register', user);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    newSocket.on('room_assigned', (data) => {
      setRoomId(data.roomId);
      // Restore messages if reconnecting to existing room
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
      // Load previous chat history if available
      if (data.chatHistory) {
        setChatHistory(data.chatHistory);
      }
    });

    newSocket.on('chat_history', (data) => {
      setChatHistory(data.history || []);
    });

    newSocket.on('new_message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    newSocket.on('typing_indicator', ({ username, isTyping }) => {
      setTypingUser(isTyping ? username : null);
    });

    newSocket.on('chat_resolved', () => {
      setIsResolved(true);
      setShowRating(true);
    });

    newSocket.on('announcements_update', (anns) => {
      setAnnouncements(anns || []);
    });

    return () => newSocket.close();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTyping = () => {
    if (!socket || !roomId) return;
    socket.emit('typing_start', { roomId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing_stop', { roomId });
    }, 1500);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !socket || !roomId || isResolved) return;
    socket.emit('send_message', { roomId, content: inputVal });
    socket.emit('typing_stop', { roomId });
    setInputVal('');
  };

  const submitRating = () => {
    if (!socket || !roomId || rating === 0) return;
    socket.emit('rate_chat', { roomId, rating, comment: '' });
    setRatingSubmitted(true);
    setTimeout(() => setShowRating(false), 1500);
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    router.push('/');
  };

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
              <span className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Đang trực tuyến</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button className="sidebar-link active">
            <span className="material-icons-outlined">chat_bubble</span>
            <span>Hỗ trợ</span>
          </button>
          <button className="sidebar-link" onClick={() => setShowSettings(true)}>
            <span className="material-icons-outlined">settings</span>
            <span>Cài đặt</span>
          </button>
        </div>

        <div className="sidebar-spacer" />

        <button className="sidebar-link" onClick={handleLogout}>
          <span className="material-icons-outlined">logout</span>
          <span>Đăng xuất</span>
        </button>
      </nav>

      {/* Main Chat Area */}
      <div className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Marquee Banner */}
        {announcements.length > 0 && (
          <div className="marquee-banner">
            <div className="marquee-track">
              {/* Duplicate for seamless loop */}
              {[...announcements, ...announcements].map((a, i) => (
                <span key={i} className="marquee-item">{a.content}</span>
              ))}
            </div>
          </div>
        )}
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <h1 className="headline-sm">Hỗ trợ</h1>
          </div>
          {isResolved && (
            <span className="chip chip-success">
              <span className="material-icons-outlined" style={{ fontSize: 14 }}>check_circle</span>
              Đã giải quyết
            </span>
          )}
        </div>

        {/* Product Context Card */}
        <div style={{ padding: 'var(--space-4) var(--space-6)' }}>
          <div className="product-card">
            <div className="product-card-title">Nordic Chronograph v2</div>
            <div className="product-card-meta">Trạng thái: Trong giỏ • Kích thước: 42mm</div>
            <div className="product-card-row">
              <div>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Dự kiến giao hàng</div>
                <div className="title-sm" style={{ marginTop: 2 }}>27 Th10</div>
              </div>
              <span className="chip chip-primary">Giao hàng hỏa tốc</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="messages-container">
          {messages.length === 0 && !isResolved && (
            <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
              <span className="material-icons-outlined">forum</span>
              <p className="body-md">
                {roomId
                  ? 'Đang chờ nhân viên hỗ trợ...'
                  : 'Đang kết nối...'}
              </p>
            </div>
          )}

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

        {/* Input Area */}
        <form className="input-area" onSubmit={sendMessage}>
          <input
            id="customer-message-input"
            type="text"
            className="input"
            placeholder={isResolved ? 'Cuộc hội thoại đã kết thúc' : 'Nhập tin nhắn...'}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleTyping}
            disabled={isResolved}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!inputVal.trim() || isResolved}
            aria-label="Gửi tin nhắn"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Rating Modal */}
      {showRating && (
        <div className="modal-overlay">
          <div className="modal-content">
            {!ratingSubmitted ? (
              <>
                <span className="material-icons-outlined" style={{ fontSize: 48, color: 'var(--primary)', marginBottom: 'var(--space-4)' }}>
                  sentiment_satisfied
                </span>
                <h2 className="headline-sm">Đánh giá cuộc hội thoại</h2>
                <p className="body-md" style={{ color: 'var(--on-surface-variant)', marginTop: 'var(--space-2)' }}>
                  Chất lượng hỗ trợ bạn nhận được thế nào?
                </p>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={36}
                      className={`rating-star ${star <= (hoverRating || rating) ? 'active' : ''}`}
                      fill={star <= (hoverRating || rating) ? '#f59e0b' : 'none'}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      style={{ cursor: 'pointer', color: star <= (hoverRating || rating) ? '#f59e0b' : 'var(--outline-variant)' }}
                    />
                  ))}
                </div>
                <button
                  className="btn-gradient"
                  onClick={submitRating}
                  disabled={rating === 0}
                  style={{ opacity: rating === 0 ? 0.5 : 1 }}
                >
                  Gửi đánh giá
                </button>
              </>
            ) : (
              <>
                <span className="material-icons-outlined" style={{ fontSize: 48, color: '#16a34a', marginBottom: 'var(--space-4)' }}>
                  check_circle
                </span>
                <h2 className="headline-sm">Cảm ơn bạn!</h2>
                <p className="body-md" style={{ color: 'var(--on-surface-variant)', marginTop: 'var(--space-2)' }}>
                  Đánh giá của bạn giúp chúng tôi cải thiện chất lượng dịch vụ.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="settings-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title-lg">⚙️ Cài đặt</div>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>
                <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div className="settings-group">
              <div className="settings-group-title">Thông báo</div>
              <div className="settings-item">
                <span className="material-icons-outlined">notifications</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Thông báo đẩy</div>
                  <div className="settings-item-desc">Nhận thông báo khi có tin nhắn mới</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={settings.notifications}
                    onChange={() => setSettings(s => ({...s, notifications: !s.notifications}))} />
                  <span className="toggle-slider" />
                </label>
              </div>
              <div className="settings-item">
                <span className="material-icons-outlined">volume_up</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Âm thanh</div>
                  <div className="settings-item-desc">Phát âm thanh khi nhận tin nhắn</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={settings.sound}
                    onChange={() => setSettings(s => ({...s, sound: !s.sound}))} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-title">Giao diện</div>
              <div className="settings-item">
                <span className="material-icons-outlined">text_fields</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Cỡ chữ</div>
                  <div className="settings-item-desc">Điều chỉnh kích thước chữ trong chat</div>
                </div>
                <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8125rem' }}
                  value={settings.fontSize}
                  onChange={(e) => setSettings(s => ({...s, fontSize: e.target.value}))}>
                  <option value="small">Nhỏ</option>
                  <option value="normal">Trung bình</option>
                  <option value="large">Lớn</option>
                </select>
              </div>
              <div className="settings-item">
                <span className="material-icons-outlined">dark_mode</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Chế độ tối</div>
                  <div className="settings-item-desc">Giao diện tối giúp bảo vệ mắt</div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={settings.darkMode}
                    onChange={() => setSettings(s => ({...s, darkMode: !s.darkMode}))} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-divider" />

            {/* Chat History */}
            <div className="settings-group">
              <div className="settings-group-title">💬 Lịch sử chat</div>
              <button
                className="settings-item"
                style={{ cursor: 'pointer' }}
                onClick={() => { setShowHistory(!showHistory); socket?.emit('get_chat_history', {}); }}
              >
                <span className="material-icons-outlined">history</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Xem lịch sử trò chuyện</div>
                  <div className="settings-item-desc">Xem lại các phiên chat trước đây</div>
                </div>
                <span className="material-icons-outlined" style={{ marginLeft: 'auto' }}>
                  {showHistory ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showHistory && (
                <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 'var(--space-2)' }}>
                  {chatHistory.length === 0 ? (
                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      Chưa có lịch sử chat nào
                    </div>
                  ) : (
                    chatHistory.map((session, idx) => (
                      <div key={session.id || idx} style={{
                        padding: 'var(--space-3)',
                        borderBottom: '1px solid var(--border-light)',
                        fontSize: '0.8125rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                          <span style={{ fontWeight: 600 }}>Phiên #{chatHistory.length - idx}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {session.created_at ? new Date(session.created_at).toLocaleDateString('vi-VN') : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                          <span className={`badge badge-${session.status === 'resolved' ? 'success' : session.status === 'closed' ? 'default' : 'warning'}`}
                            style={{ fontSize: '0.65rem' }}>
                            {session.status === 'resolved' ? 'Đã giải quyết' : session.status === 'closed' ? 'Đã đóng' : session.status}
                          </span>
                          {session.rating && (
                            <span style={{ fontSize: '0.75rem' }}>{'⭐'.repeat(session.rating)}</span>
                          )}
                          {session.vendor_name && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NV: {session.vendor_name}</span>
                          )}
                        </div>
                        {session.messages && session.messages.length > 0 && (
                          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', maxHeight: 120, overflowY: 'auto' }}>
                            {session.messages.slice(-5).map((msg, mIdx) => (
                              <div key={mIdx} style={{ marginBottom: 'var(--space-1)', fontSize: '0.75rem' }}>
                                <span style={{ fontWeight: 600, color: msg.sender_role === 'customer' ? 'var(--primary)' : 'var(--success)' }}>
                                  {msg.sender_name}:
                                </span>{' '}
                                <span>{msg.content}</span>
                              </div>
                            ))}
                            {session.messages.length > 5 && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                ... và {session.messages.length - 5} tin nhắn khác
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="settings-divider" />
            <div className="settings-group">
              <div className="settings-group-title">Tài khoản</div>
              <button className="settings-item" onClick={handleLogout}>
                <span className="material-icons-outlined" style={{ color: 'var(--error)' }}>logout</span>
                <div className="settings-item-info">
                  <div className="settings-item-label" style={{ color: 'var(--error)' }}>Đăng xuất</div>
                  <div className="settings-item-desc">Thoát khỏi tài khoản hiện tại</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
