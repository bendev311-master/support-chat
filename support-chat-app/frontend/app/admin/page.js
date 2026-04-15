'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import API_URL from '../config';
import { SiteLogo, useBranding } from '../branding';

export default function AdminDashboard() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState({ connectedUsers: [], activeRooms: [], stats: {}, resolvedRooms: [], ratings: [], staffMetrics: {} });
  const [viewingRoom, setViewingRoom] = useState(null);
  const [viewMessages, setViewMessages] = useState([]);
  const [showTelegram, setShowTelegram] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState({ botToken: '', chatId: '', enabled: false, isConfigured: false });
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [showAnnouncementPanel, setShowAnnouncementPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    notifications: true,
    sound: true,
    darkMode: true,
  });
  const [dbSettings, setDbSettings] = useState({ autoDeleteDays: 0, stats: {} });
  const [accountsList, setAccountsList] = useState([]);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [showAccounts, setShowAccounts] = useState(false);
  // Branding states
  const { refresh: refreshBranding } = useBranding();
  const [brandingData, setBrandingData] = useState({ logo: '', siteName: 'Clarion Stream', primaryColor: '', footerText: '' });
  const [logoPreview, setLogoPreview] = useState('');
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState('');
  const logoInputRef = useState(null);

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) { router.push('/staff-login'); return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') { router.push('/staff-login'); return; }

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
      console.error('Admin socket connection error:', err.message);
    });

    // Database settings listeners
    newSocket.on('db_settings', (data) => setDbSettings(data));
    newSocket.on('accounts_list', (data) => setAccountsList(data.accounts || []));
    newSocket.on('cleanup_result', (data) => {
      setCleanupResult(data);
      setTimeout(() => setCleanupResult(null), 5000);
    });

    newSocket.on('state_update', (newState) => {
      setState(newState);
    });

    newSocket.on('room_joined', (data) => {
      setViewMessages(data.messages);
      setViewingRoom(data.roomId);
    });

    newSocket.on('new_message', (msg) => {
      setViewMessages((prev) => [...prev, msg]);
    });

    // Telegram
    newSocket.on('telegram_config', (config) => {
      setTelegramConfig(config);
      if (config.chatId) setTelegramChatId(config.chatId);
    });
    newSocket.on('telegram_test_result', (result) => {
      setTelegramTestResult(result);
      setTimeout(() => setTelegramTestResult(null), 4000);
    });
    newSocket.emit('telegram_get_config');

    // Announcements
    newSocket.on('announcements_update', (anns) => {
      setAnnouncements(anns || []);
    });
    newSocket.on('announcements_all', (anns) => {
      setAllAnnouncements(anns || []);
    });
    newSocket.emit('announcements_get_all');

    // Fetch branding
    fetch(`${API_URL}/api/branding`).then(r => r.json()).then(data => {
      setBrandingData(data);
      setLogoPreview(data.logo || '');
    }).catch(() => {});

    return () => newSocket.close();
  }, [router]);

  const viewChat = (roomId) => {
    if (socket) socket.emit('admin_view_chat', { roomId });
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    router.push('/staff-login');
  };

  // ── Branding handlers ─────────────────────
  const handleLogoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setBrandingMsg('❌ Kích thước ảnh tối đa 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result);
      setBrandingMsg('');
    };
    reader.readAsDataURL(file);
  };

  const saveBranding = async () => {
    setBrandingSaving(true);
    setBrandingMsg('');
    try {
      // Upload logo if changed
      if (logoPreview !== brandingData.logo) {
        const logoRes = await fetch(`${API_URL}/api/branding/logo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: logoPreview }),
        });
        if (!logoRes.ok) {
          const err = await logoRes.json();
          throw new Error(err.error);
        }
      }
      // Save other settings
      await fetch(`${API_URL}/api/branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName: brandingData.siteName,
          primaryColor: brandingData.primaryColor,
          footerText: brandingData.footerText,
        }),
      });
      setBrandingMsg('✅ Đã lưu thành công! Logo đã đồng bộ tất cả trang.');
      refreshBranding();
      // Update local state
      setBrandingData(prev => ({ ...prev, logo: logoPreview }));
    } catch (err) {
      setBrandingMsg(`❌ ${err.message}`);
    } finally {
      setBrandingSaving(false);
    }
  };

  const removeLogo = async () => {
    setBrandingSaving(true);
    try {
      await fetch(`${API_URL}/api/branding/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: '' }),
      });
      setLogoPreview('');
      setBrandingData(prev => ({ ...prev, logo: '' }));
      setBrandingMsg('✅ Đã xóa logo');
      refreshBranding();
    } catch {
      setBrandingMsg('❌ Lỗi xóa logo');
    } finally {
      setBrandingSaving(false);
    }
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

  const createAnnouncement = () => {
    if (!socket || !newAnnouncement.trim()) return;
    socket.emit('announcement_create', { content: newAnnouncement.trim() });
    setNewAnnouncement('');
    // Refresh all list
    setTimeout(() => socket.emit('announcements_get_all'), 300);
  };

  const toggleAnnouncement = (id, currentActive) => {
    if (!socket) return;
    socket.emit('announcement_update', { id, active: !currentActive });
    setTimeout(() => socket.emit('announcements_get_all'), 300);
  };

  const deleteAnnouncement = (id) => {
    if (!socket) return;
    socket.emit('announcement_delete', { id });
    setTimeout(() => socket.emit('announcements_get_all'), 300);
  };

  const initials = (name) => name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const staffList = (state.connectedUsers || []).filter((u) => u.role === 'vendor');
  const customerList = (state.connectedUsers || []).filter((u) => u.role === 'customer');

  const statusIcon = (status) => {
    const map = { online: 'status-online', away: 'status-away', meeting: 'status-meeting', offline: 'status-offline' };
    return map[status] || 'status-offline';
  };
  const statusLabel = (status) => {
    const map = { online: 'Đang hoạt động', away: 'Vắng mặt', meeting: 'Đang họp', offline: 'Ngoại tuyến' };
    return map[status] || 'Ngoại tuyến';
  };

  return (
    <div className="page-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <SiteLogo size={36} />
          <div>
            <div className="title-sm">Quản trị viên</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <span className="status-dot status-online" />
              <span className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Trực tuyến</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button className="sidebar-link active">
            <span className="material-icons-outlined">dashboard</span>
            <span>Bảng điều khiển</span>
          </button>
          <button className="sidebar-link" onClick={() => router.push('/admin/staff')}>
            <span className="material-icons-outlined">badge</span>
            <span>Quản lý Nhân viên</span>
          </button>
          <button className="sidebar-link">
            <span className="material-icons-outlined">chat_bubble</span>
            <span>Tất cả hội thoại</span>
          </button>
          <button className="sidebar-link" onClick={() => setShowTelegram(!showTelegram)}>
            <span className="material-icons-outlined">send</span>
            <span>Telegram</span>
            {telegramConfig.enabled && (
              <span className="status-dot status-online" style={{ marginLeft: 'auto' }} />
            )}
          </button>
          <button className="sidebar-link" onClick={() => setShowAnnouncementPanel(!showAnnouncementPanel)}>
            <span className="material-icons-outlined">campaign</span>
            <span>Thông báo</span>
            {announcements.length > 0 && (
              <span className="chip chip-success" style={{ marginLeft: 'auto', fontSize: '0.625rem', padding: '1px 6px' }}>{announcements.length}</span>
            )}
          </button>
        </div>

        <div className="sidebar-spacer" />
        <button className="sidebar-link" onClick={() => { setShowSettings(true); socket?.emit('get_db_settings'); }}>
          <span className="material-icons-outlined">settings</span>
          <span>Cài đặt</span>
        </button>
        <button className="sidebar-link" onClick={handleLogout}>
          <span className="material-icons-outlined">logout</span>
          <span>Đăng xuất</span>
        </button>
      </nav>

      {/* Main Content */}
      <div className="main-content" style={{ padding: 'var(--space-6)', overflowY: 'auto' }}>
        {/* Announcement Management Panel */}
        {showAnnouncementPanel && (
          <div className="announcement-panel" style={{ marginBottom: 'var(--space-6)', animation: 'fadeSlideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="title-lg">📢 Quản lý Thông báo</div>
                <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                  Thông báo sẽ chạy ngang trên giao diện Nhân viên và Khách hàng
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowAnnouncementPanel(false)}>
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            {/* Create new */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <input
                id="new-announcement-input"
                type="text"
                className="input"
                placeholder="Nhập nội dung thông báo mới..."
                value={newAnnouncement}
                onChange={(e) => setNewAnnouncement(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createAnnouncement()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={createAnnouncement} disabled={!newAnnouncement.trim()}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>add</span>
                Tạo
              </button>
            </div>

            {/* Existing announcements */}
            {allAnnouncements.length === 0 ? (
              <div className="body-sm" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--space-4)' }}>
                Chưa có thông báo nào. Tạo thông báo đầu tiên!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {allAnnouncements.map((ann) => (
                  <div key={ann.id} className="announcement-item" style={{ opacity: ann.active ? 1 : 0.5 }}>
                    <div style={{ flex: 1 }}>
                      <div className="announcement-item-content">{ann.content}</div>
                      <div className="announcement-item-meta">
                        {ann.createdBy} • {new Date(ann.createdAt).toLocaleString('vi-VN')}
                        {' • '}
                        <span style={{ color: ann.active ? '#16a34a' : 'var(--error)' }}>
                          {ann.active ? 'Đang hiển thị' : 'Đã ẩn'}
                        </span>
                      </div>
                    </div>
                    <div className="announcement-item-actions">
                      <label className="toggle-switch" style={{ width: 36, height: 20 }}>
                        <input
                          type="checkbox"
                          checked={ann.active}
                          onChange={() => toggleAnnouncement(ann.id, ann.active)}
                        />
                        <span className="toggle-slider" style={{ '--toggle-knob': '14px' }} />
                      </label>
                      <button className="btn-icon" onClick={() => deleteAnnouncement(ann.id)} title="Xóa">
                        <span className="material-icons-outlined" style={{ fontSize: 16, color: 'var(--error)' }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <h1 className="headline-lg" style={{ marginBottom: 'var(--space-2)' }}>Hỗ trợ</h1>
        <h2 className="headline-sm" style={{ color: 'var(--on-surface-variant)', fontWeight: 500, marginBottom: 'var(--space-6)' }}>
          Bảng điều khiển Quản trị
        </h2>

        {/* Stats Row */}
        <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="stat-card">
            <div className="stat-value">{state.stats?.totalStaffOnline || 0}</div>
            <div className="stat-label">Nhân viên đang trực</div>
            <div className="stat-trend stat-trend-up">
              <span className="material-icons-outlined" style={{ fontSize: 14 }}>arrow_upward</span>
              {staffList.length} tổng cộng
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.stats?.totalCustomers || 0}</div>
            <div className="stat-label">Khách hàng trực tuyến</div>
            <div className="stat-trend stat-trend-up">
              <span className="material-icons-outlined" style={{ fontSize: 14 }}>trending_up</span>
              Đang kết nối
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.stats?.openTickets || 0}</div>
            <div className="stat-label">Phiếu hỗ trợ đang mở</div>
            <div className="stat-trend" style={{ color: 'var(--on-surface-variant)' }}>
              {state.stats?.waitingTickets || 0} đang chờ phản hồi
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left Column — Staff & Quality */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Quality Metrics */}
            <div className="glass-panel" style={{ padding: 'var(--space-5)' }}>
              <h3 className="title-lg" style={{ marginBottom: 'var(--space-4)' }}>
                <span className="material-icons-outlined" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 'var(--space-2)' }}>
                  star
                </span>
                Chất lượng dịch vụ
              </h3>
              <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{state.stats?.avgRating || '—'}</div>
                  <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Đánh giá TB</div>
                </div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{state.stats?.resolvedTotal || 0}</div>
                  <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Đã giải quyết</div>
                </div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{state.ratings?.length || 0}</div>
                  <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Đánh giá</div>
                </div>
              </div>
            </div>

            {/* Staff List */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 className="title-lg">Danh bạ nhân viên</h3>
                <button className="btn btn-secondary" onClick={() => router.push('/admin/staff')} style={{ fontSize: '0.8125rem' }}>
                  Quản lý →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {staffList.map((staff) => {
                  const metrics = state.staffMetrics?.[staff.id] || {};
                  return (
                    <div key={staff.id} className="user-card">
                      <div className="user-card-avatar">
                        {initials(staff.username)}
                        <span className={`status-dot ${statusIcon(staff.status)}`} />
                      </div>
                      <div className="user-card-info">
                        <div className="user-card-name">{staff.username}</div>
                        <div className="user-card-role">
                          Nhân viên hỗ trợ • Đã giải quyết {metrics.resolvedCount || 0} phiếu
                        </div>
                      </div>
                      <span className={`status-badge ${staff.status === 'online' ? 'status-badge-active' : 'status-badge-waiting'}`}>
                        {statusLabel(staff.status)}
                      </span>
                    </div>
                  );
                })}
                {staffList.length === 0 && (
                  <div className="body-sm" style={{ color: 'var(--on-surface-variant)', padding: 'var(--space-4)', textAlign: 'center' }}>
                    Chưa có nhân viên trực tuyến
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column — Active Chats & Monitoring */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Active Chats */}
            <div>
              <h3 className="title-lg" style={{ marginBottom: 'var(--space-4)' }}>
                Cuộc hội thoại đang hoạt động
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {(state.activeRooms || []).filter(r => r.status !== 'resolved').map((room) => (
                  <div
                    key={room.id}
                    className="action-card"
                    onClick={() => viewChat(room.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="chat-item-avatar" style={{ width: 36, height: 36, fontSize: '0.75rem' }}>
                        {initials(room.customerName)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="title-sm">{room.customerName}</div>
                        <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                          {room.vendorName ? `Được hỗ trợ bởi ${room.vendorName}` : 'Đang chờ nhân viên'}
                        </div>
                      </div>
                      <span className={`status-badge ${room.status === 'waiting' ? 'status-badge-waiting' : 'status-badge-active'}`}>
                        {room.status === 'waiting' ? 'Chờ' : 'Đang hỗ trợ'}
                      </span>
                    </div>
                  </div>
                ))}
                {(state.activeRooms || []).filter(r => r.status !== 'resolved').length === 0 && (
                  <div className="body-sm" style={{ color: 'var(--on-surface-variant)', padding: 'var(--space-4)', textAlign: 'center' }}>
                    Không có cuộc hội thoại hoạt động
                  </div>
                )}
              </div>
            </div>

            {/* Chat Viewer */}
            {viewingRoom && (
              <div className="glass-panel" style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 className="title-lg">
                    <span className="material-icons-outlined" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 'var(--space-2)' }}>
                      visibility
                    </span>
                    Giám sát hội thoại
                  </h3>
                  <button className="btn btn-tertiary" onClick={() => setViewingRoom(null)}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {viewMessages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                      <span className="chip chip-primary" style={{ flexShrink: 0, fontSize: '0.6875rem' }}>
                        {msg.role === 'customer' ? 'KH' : 'NV'}
                      </span>
                      <div>
                        <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
                          {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="body-sm">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {viewMessages.length === 0 && (
                    <div className="body-sm" style={{ color: 'var(--on-surface-variant)', textAlign: 'center' }}>
                      Chưa có tin nhắn
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Ratings */}
            {state.ratings?.length > 0 && (
              <div>
                <h3 className="title-lg" style={{ marginBottom: 'var(--space-4)' }}>Đánh giá gần đây</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {state.ratings.slice(-5).reverse().map((r, i) => (
                    <div key={i} className="action-card" style={{ cursor: 'default' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span key={s} className="material-icons-outlined" style={{ fontSize: 16, color: s <= r.rating ? '#f59e0b' : 'var(--outline-variant)' }}>
                              star
                            </span>
                          ))}
                        </div>
                        <span className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                          {new Date(r.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Telegram Settings Modal */}
      {showTelegram && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTelegram(false); }}>
          <div className="telegram-panel" style={{ maxWidth: 440, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="telegram-header">
                <div className="telegram-icon">
                  <span className="material-icons-outlined" style={{ fontSize: 22 }}>send</span>
                </div>
                <div>
                  <div className="title-lg">Thông báo Telegram</div>
                  <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>Nhận thông báo khi có khách mới</div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowTelegram(false)}>
                <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', background: 'var(--surface-container-low)', borderRadius: 'var(--radius-lg)' }}>
              <div>
                <div className="title-sm">Bật thông báo</div>
                <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                  {telegramConfig.enabled ? 'Đang gửi thông báo đến Telegram' : 'Thông báo đã tắt'}
                </div>
              </div>
              <label className="toggle-switch" id="admin-telegram-toggle">
                <input type="checkbox" checked={telegramConfig.enabled} onChange={toggleTelegram} />
                <span className="toggle-slider" />
              </label>
            </div>

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

            <div className="input-group">
              <label className="input-label" htmlFor="admin-tg-bot-token">Bot Token</label>
              <input id="admin-tg-bot-token" type="password" className="input" placeholder="123456:ABC-DEF..." value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="admin-tg-chat-id">Chat ID</label>
              <input id="admin-tg-chat-id" type="text" className="input" placeholder="-1001234567890" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} />
              <span className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>ID nhóm hoặc cá nhân nhận thông báo</span>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button className="btn btn-primary" onClick={saveTelegramConfig} style={{ flex: 1 }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>save</span>
                Lưu cấu hình
              </button>
              <button className="btn btn-secondary" onClick={testTelegram} disabled={!telegramConfig.isConfigured} style={{ opacity: telegramConfig.isConfigured ? 1 : 0.5 }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>send</span>
                Test
              </button>
            </div>

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

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="settings-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title-lg">⚙️ Cài đặt Quản trị</div>
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
                  <div className="settings-item-desc">Nhận thông báo khi có khách mới hoặc tin nhắn</div>
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
                  <div className="settings-item-desc">Phát âm báo khi nhận tin nhắn mới</div>
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

            {/* ★ Logo & Branding */}
            <div className="settings-group">
              <div className="settings-group-title">🎨 Logo & Thương hiệu</div>
              <div className="settings-item-desc" style={{ marginBottom: 'var(--space-3)' }}>
                Logo sẽ đồng bộ trên tất cả các trang: Đăng nhập Khách hàng, Đăng nhập Nhân viên, Chat, Vendor, Admin.
              </div>

              {/* Logo Preview & Upload */}
              <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 12,
                  border: '2px dashed var(--outline-variant)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', background: 'var(--surface-container)',
                  flexShrink: 0, position: 'relative'
                }}>
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: '0.7rem' }}>
                      <span className="material-icons-outlined" style={{ fontSize: 28, opacity: 0.5 }}>image</span>
                      <div>Chưa có logo</div>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 'var(--space-2)' }}>Logo hệ thống</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: 'var(--space-3)' }}>
                    PNG, JPG, SVG, WebP — tối đa 500KB
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <label style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                      padding: '6px 14px', borderRadius: 'var(--radius-full)',
                      background: 'var(--primary)', color: '#fff',
                      fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 500
                    }}>
                      <span className="material-icons-outlined" style={{ fontSize: 16 }}>upload</span>
                      Tải lên
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={handleLogoSelect} />
                    </label>
                    {logoPreview && (
                      <button
                        onClick={removeLogo}
                        disabled={brandingSaving}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                          padding: '6px 14px', borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--error)', background: 'transparent',
                          color: 'var(--error)', fontSize: '0.8125rem', cursor: 'pointer'
                        }}
                      >
                        <span className="material-icons-outlined" style={{ fontSize: 16 }}>delete</span>
                        Xóa
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Site Name */}
              <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className="material-icons-outlined">badge</span>
                  <div className="settings-item-label">Tên hệ thống</div>
                </div>
                <input
                  type="text"
                  className="input"
                  placeholder="Clarion Stream"
                  value={brandingData.siteName}
                  onChange={(e) => setBrandingData(prev => ({ ...prev, siteName: e.target.value }))}
                  style={{ fontSize: '0.875rem' }}
                />
              </div>

              {/* Save Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button
                  className="btn-gradient"
                  onClick={saveBranding}
                  disabled={brandingSaving}
                  style={{ padding: '8px 24px', fontSize: '0.875rem' }}
                >
                  {brandingSaving ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="material-icons-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>sync</span>
                      Đang lưu...
                    </span>
                  ) : '💾 Lưu thương hiệu'}
                </button>
                {brandingMsg && (
                  <span style={{ fontSize: '0.8125rem', animation: 'fadeSlideUp 0.3s ease' }}>{brandingMsg}</span>
                )}
              </div>
            </div>

            {/* ★ Database Management */}
            <div className="settings-group">
              <div className="settings-group-title">🗄️ Quản lý Database</div>

              {/* DB Stats */}
              {dbSettings.stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <div className="stat-card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dbSettings.stats.total_accounts || 0}</div>
                    <div className="label-sm">Tài khoản</div>
                  </div>
                  <div className="stat-card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dbSettings.stats.total_sessions || 0}</div>
                    <div className="label-sm">Phiên chat</div>
                  </div>
                  <div className="stat-card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dbSettings.stats.total_messages || 0}</div>
                    <div className="label-sm">Tin nhắn</div>
                  </div>
                </div>
              )}

              {/* Auto-delete setting */}
              <div className="settings-item">
                <span className="material-icons-outlined">auto_delete</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Tự động xóa lịch sử chat</div>
                  <div className="settings-item-desc">
                    {dbSettings.autoDeleteDays > 0
                      ? `Xóa tin nhắn cũ hơn ${dbSettings.autoDeleteDays} ngày`
                      : 'Đang tắt — giữ toàn bộ lịch sử'}
                  </div>
                </div>
                <select
                  className="input"
                  style={{ width: 100, marginLeft: 'auto' }}
                  value={dbSettings.autoDeleteDays}
                  onChange={(e) => {
                    const days = parseInt(e.target.value, 10);
                    socket?.emit('set_auto_delete', { days });
                  }}
                >
                  <option value={0}>Tắt</option>
                  <option value={3}>3 ngày</option>
                  <option value={7}>7 ngày</option>
                  <option value={14}>14 ngày</option>
                  <option value={30}>30 ngày</option>
                  <option value={90}>90 ngày</option>
                </select>
              </div>

              {/* Manual cleanup buttons */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                <button
                  className="btn-outline"
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={() => { if (confirm('Xóa chat cũ hơn 3 ngày?')) socket?.emit('manual_cleanup', { days: 3 }); }}
                >
                  🗑️ Xóa chat {'>'} 3 ngày
                </button>
                <button
                  className="btn-outline"
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={() => { if (confirm('Xóa chat cũ hơn 7 ngày?')) socket?.emit('manual_cleanup', { days: 7 }); }}
                >
                  🗑️ Xóa chat {'>'} 7 ngày
                </button>
              </div>

              {cleanupResult && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}>
                  ✅ Đã xóa {cleanupResult.deletedMessages} tin nhắn và {cleanupResult.deletedSessions} phiên chat cũ hơn {cleanupResult.days} ngày
                </div>
              )}

              {/* View accounts */}
              <button
                className="settings-item"
                style={{ marginTop: 'var(--space-3)', cursor: 'pointer' }}
                onClick={() => { setShowAccounts(!showAccounts); socket?.emit('get_accounts'); }}
              >
                <span className="material-icons-outlined">people</span>
                <div className="settings-item-info">
                  <div className="settings-item-label">Danh sách tài khoản</div>
                  <div className="settings-item-desc">Xem tất cả tài khoản đã đăng nhập</div>
                </div>
                <span className="material-icons-outlined" style={{ marginLeft: 'auto' }}>
                  {showAccounts ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showAccounts && accountsList.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 'var(--space-2)' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tên</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Vai trò</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Đăng nhập</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Lần cuối</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsList.map(acc => (
                        <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '4px 8px' }}>{acc.username}</td>
                          <td style={{ padding: '4px 8px' }}>
                            <span className={`badge badge-${acc.role === 'admin' ? 'info' : acc.role === 'vendor' ? 'success' : 'warning'}`} style={{ fontSize: '0.65rem' }}>
                              {acc.role}
                            </span>
                          </td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{acc.login_count}x</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: '0.65rem' }}>
                            {acc.last_login_at ? new Date(acc.last_login_at).toLocaleDateString('vi-VN') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <div className="settings-item-desc">Thoát khỏi phiên quản trị</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
