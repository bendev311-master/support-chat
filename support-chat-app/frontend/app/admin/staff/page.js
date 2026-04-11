'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';

export default function StaffManagementPage() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState({ connectedUsers: [], activeRooms: [], stats: {}, staffMetrics: {}, ratings: [] });

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) { router.push('/staff-login'); return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') { router.push('/staff-login'); return; }

    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('register', user);
    });

    newSocket.on('state_update', (newState) => {
      setState(newState);
    });

    return () => newSocket.close();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    router.push('/staff-login');
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

  const formatMs = (ms) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}p ${s % 60}s`;
  };

  return (
    <div className="page-container">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-avatar">
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
          </div>
          <div>
            <div className="title-sm">Clarion Stream</div>
            <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Quản trị</div>
          </div>
        </div>

        <div className="sidebar-nav">
          <button className="sidebar-link" onClick={() => router.push('/admin')}>
            <span className="material-icons-outlined">dashboard</span>
            <span>Bảng điều khiển</span>
          </button>
          <button className="sidebar-link active">
            <span className="material-icons-outlined">badge</span>
            <span>Đội ngũ</span>
          </button>
          <button className="sidebar-link">
            <span className="material-icons-outlined">group</span>
            <span>Khách hàng</span>
          </button>
          <button className="sidebar-link">
            <span className="material-icons-outlined">analytics</span>
            <span>Phân tích</span>
          </button>
        </div>

        <div className="sidebar-spacer" />
        <button className="sidebar-link" onClick={handleLogout}>
          <span className="material-icons-outlined">logout</span>
          <span>Đăng xuất</span>
        </button>
      </nav>

      {/* Main Content */}
      <div className="main-content" style={{ padding: 'var(--space-6)', overflowY: 'auto' }}>
        <h1 className="headline-lg" style={{ marginBottom: 'var(--space-2)' }}>Quản lý Nhân viên</h1>
        <p className="body-md" style={{ color: 'var(--on-surface-variant)', marginBottom: 'var(--space-8)' }}>
          Theo dõi hiệu suất và quản lý quyền hạn cho đội ngũ hỗ trợ toàn cầu của bạn.
        </p>

        {/* Overview Stats */}
        <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="stat-card">
            <div className="stat-value">{staffList.length}</div>
            <div className="stat-label">Nhân viên đang trực</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.stats?.resolvedTotal || 0}</div>
            <div className="stat-label">Tổng phiếu đã giải quyết</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.stats?.avgRating || '—'}</div>
            <div className="stat-label">Đánh giá trung bình</div>
          </div>
        </div>

        {/* Staff Table */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 className="title-lg" style={{ marginBottom: 'var(--space-4)' }}>Danh sách Đội ngũ</h2>

          {staffList.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-10)' }}>
              <span className="material-icons-outlined">groups</span>
              <p>Chưa có nhân viên trực tuyến</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {staffList.map((staff) => {
                const metrics = state.staffMetrics?.[staff.id] || {};
                return (
                  <div key={staff.id} className="glass-panel" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                      <div className="user-card-avatar">
                        {initials(staff.username)}
                        <span className={`status-dot ${statusIcon(staff.status)}`} />
                      </div>

                      <div style={{ flex: 1 }}>
                        <div className="title-md">{staff.username}</div>
                        <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                          Nhân viên hỗ trợ
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div className="title-md">{metrics.resolvedCount || 0}</div>
                          <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Đã giải quyết</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="title-md">{formatMs(metrics.avgResponseTime)}</div>
                          <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>TG phản hồi TB</div>
                        </div>
                        <span className={`status-badge ${staff.status === 'online' ? 'status-badge-active' : 'status-badge-waiting'}`}>
                          {statusLabel(staff.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Customer Directory (mini) */}
        <div>
          <h2 className="title-lg" style={{ marginBottom: 'var(--space-4)' }}>Khách hàng đang kết nối</h2>

          {customerList.length === 0 ? (
            <div className="body-sm" style={{ color: 'var(--on-surface-variant)', padding: 'var(--space-4)', textAlign: 'center' }}>
              Chưa có khách hàng trực tuyến
            </div>
          ) : (
            <div className="grid-2" style={{ gap: 'var(--space-2)' }}>
              {customerList.map((customer) => (
                <div key={customer.id} className="action-card" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div className="chat-item-avatar" style={{ width: 36, height: 36, fontSize: '0.75rem' }}>
                      {initials(customer.username)}
                    </div>
                    <div>
                      <div className="title-sm">{customer.username}</div>
                      <div className="body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                        Phòng: {customer.currentRoom ? 'Đang chat' : 'Chưa kết nối'}
                      </div>
                    </div>
                    <span className="status-dot status-online" style={{ marginLeft: 'auto' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
