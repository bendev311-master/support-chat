'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Vui lòng nhập tên hiển thị'); return; }

    localStorage.setItem('chat_user', JSON.stringify({
      username: username.trim(),
      role: 'customer'
    }));
    router.push('/chat');
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError('Vui lòng nhập tên hiển thị'); return; }
    if (!email.trim()) { setError('Vui lòng nhập email'); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu'); return; }
    if (password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (password !== confirmPassword) { setError('Mật khẩu xác nhận không khớp'); return; }

    // Demo: save to localStorage and auto-login
    localStorage.setItem('chat_user', JSON.stringify({
      username: username.trim(),
      email: email.trim(),
      role: 'customer'
    }));
    setSuccess('Đăng ký thành công! Đang chuyển hướng...');
    setTimeout(() => router.push('/chat'), 1200);
  };

  const switchMode = (e) => {
    e.preventDefault();
    setIsRegister(!isRegister);
    setError('');
    setSuccess('');
  };

  return (
    <div className="auth-page">
      {/* Hero Section */}
      <div className="auth-hero">
        <div className="auth-hero-content">
          <h1>{isRegister ? 'Tham gia Clarion Stream.' : 'Trải nghiệm Khách hàng Đẳng cấp.'}</h1>
          <p>
            {isRegister
              ? 'Tạo tài khoản để nhận hỗ trợ nhanh chóng và trải nghiệm dịch vụ khách hàng đẳng cấp.'
              : 'Đăng nhập vào Clarion Stream để quản lý dịch vụ và tận hưởng trải nghiệm hỗ trợ trọn vẹn theo phong cách riêng của bạn.'}
          </p>
          <div className="auth-quote">
            {isRegister
              ? '\u201cChỉ cần vài bước đơn giản, bạn sẽ được kết nối với đội ngũ hỗ trợ tận tâm nhất.\u201d'
              : '\u201cDịch vụ tận tâm như một người quản gia riêng thực thụ ngay trong tầm tay bạn.\u201d'}
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div className="auth-form-section">
        <form className="auth-form" onSubmit={isRegister ? handleRegister : handleLogin}>
          <div>
            <h2>{isRegister ? 'Tạo tài khoản mới' : 'Chào mừng bạn trở lại'}</h2>
            <p className="auth-form-subtitle">
              {isRegister
                ? 'Điền thông tin để bắt đầu sử dụng dịch vụ'
                : 'Vui lòng nhập thông tin để truy cập tài khoản'}
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(168, 56, 54, 0.08)',
              color: 'var(--error)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              animation: 'fadeSlideUp 0.25s ease'
            }}>
              <span className="material-icons-outlined" style={{ fontSize: 16 }}>error</span>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(22, 163, 74, 0.08)',
              color: '#16a34a',
              fontSize: '0.8125rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              animation: 'fadeSlideUp 0.25s ease'
            }}>
              <span className="material-icons-outlined" style={{ fontSize: 16 }}>check_circle</span>
              {success}
            </div>
          )}

          {/* Name field */}
          <div className="input-group">
            <label className="input-label" htmlFor="login-name">
              {isRegister ? 'Tên hiển thị' : 'Tên hiển thị'}
            </label>
            <input
              id="login-name"
              type="text"
              className="input"
              placeholder={isRegister ? 'Nguyễn Văn A' : 'Nhập tên của bạn'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          {/* Email field - only for register */}
          {isRegister && (
            <div className="input-group" style={{ animation: 'fadeSlideUp 0.3s ease' }}>
              <label className="input-label" htmlFor="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          )}

          {/* Password - only for register */}
          {isRegister && (
          <div className="input-group" style={{ animation: 'fadeSlideUp 0.3s ease' }}>
            <label className="input-label" htmlFor="login-password">Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          )}

          {/* Confirm Password - only for register */}
          {isRegister && (
            <div className="input-group" style={{ animation: 'fadeSlideUp 0.3s ease' }}>
              <label className="input-label" htmlFor="register-confirm-password">Xác nhận mật khẩu</label>
              <input
                id="register-confirm-password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}


          <button type="submit" className="btn-gradient" id="auth-submit-btn">
            {isRegister ? 'Đăng ký' : 'Đăng nhập'}
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>
            {isRegister ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
            <a href="#" className="auth-link" onClick={switchMode} id="auth-switch-btn">
              {isRegister ? 'Đăng nhập' : 'Đăng ký ngay'}
            </a>
          </p>

          <div className="auth-footer">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a
              href="/staff-login"
              style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 500 }}
            >
              Staff Portal →
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
