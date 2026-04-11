'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('vendor');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    localStorage.setItem('chat_user', JSON.stringify({
      username: username.trim(),
      role
    }));

    if (role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/vendor');
    }
  };

  return (
    <div className="auth-page">
      {/* Hero Section */}
      <div className="auth-hero" style={{ background: 'linear-gradient(135deg, #001018, #003748, #005eb6)' }}>
        <div className="auth-hero-content">
          <p className="label-sm" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 'var(--space-4)' }}>
            CLARION STREAM
          </p>
          <h1 style={{ fontSize: '1.75rem' }}>
            Chào mừng trở lại,<br />Đội ngũ Clarion.
          </h1>
          <p>
            Hệ thống quản trị tập trung dành cho nhân viên Hospitality chuyên nghiệp.
          </p>
        </div>
      </div>

      {/* Form Section */}
      <div className="auth-form-section">
        <form className="auth-form" onSubmit={handleLogin}>
          <div>
            <h2>Đăng nhập Nhân viên</h2>
            <p className="auth-form-subtitle">
              Nhập thông tin tài khoản công việc của bạn để tiếp tục.
            </p>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="staff-email">Tên nhân viên</label>
            <input
              id="staff-email"
              type="text"
              className="input"
              placeholder="Nguyễn Văn A"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="staff-role">Vai trò</label>
            <select
              id="staff-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="vendor">Nhân viên hỗ trợ</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>

          <button type="submit" className="btn-gradient">
            Đăng nhập
          </button>

          <div className="auth-footer">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a
              href="/"
              style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 500 }}
            >
              ← Cổng Khách hàng
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
