'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import API_URL from './config';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Sign-In setup
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      window.google?.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        { theme: 'filled_black', size: 'large', width: '100%', text: 'signin_with', shape: 'pill' }
      );
    };
    return () => { script.remove(); };
  }, []);

  const handleGoogleResponse = useCallback(async (response) => {
    if (!response.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential, role: 'customer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('chat_user', JSON.stringify(data.user));
      localStorage.setItem('auth_token', data.token);
      router.push('/chat');
    } catch (err) {
      setError(err.message || 'Đăng nhập Google thất bại');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Vui lòng nhập tên đăng nhập'); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role: 'customer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('chat_user', JSON.stringify(data.user));
      localStorage.setItem('auth_token', data.token);
      router.push('/chat');
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError('Vui lòng nhập tên đăng nhập'); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu'); return; }
    if (password.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    if (password !== confirmPassword) { setError('Mật khẩu xác nhận không khớp'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password, role: 'customer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      localStorage.setItem('chat_user', JSON.stringify(data.user));
      localStorage.setItem('auth_token', data.token);
      setSuccess('Đăng ký thành công! Đang chuyển hướng...');
      setTimeout(() => router.push('/chat'), 1000);
    } catch (err) {
      setError(err.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
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

          {/* Username field */}
          <div className="input-group">
            <label className="input-label" htmlFor="login-name">Tên đăng nhập</label>
            <input
              id="login-name"
              type="text"
              className="input"
              placeholder={isRegister ? 'Nguyễn Văn A' : 'Nhập tên đăng nhập'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          {/* Email field - only for register */}
          {isRegister && (
            <div className="input-group" style={{ animation: 'fadeSlideUp 0.3s ease' }}>
              <label className="input-label" htmlFor="register-email">Email (tuỳ chọn)</label>
              <input
                id="register-email"
                type="email"
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          )}

          {/* Password field */}
          <div className="input-group">
            <label className="input-label" htmlFor="login-password">Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

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

          <button type="submit" className="btn-gradient" id="auth-submit-btn" disabled={loading}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'center' }}>
                <span className="material-icons-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>sync</span>
                Đang xử lý...
              </span>
            ) : (isRegister ? 'Đăng ký' : 'Đăng nhập')}
          </button>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            color: 'var(--on-surface-variant)', fontSize: '0.75rem'
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--outline-variant)' }} />
            <span>hoặc</span>
            <div style={{ flex: 1, height: 1, background: 'var(--outline-variant)' }} />
          </div>

          {/* Google Sign-In Button */}
          {GOOGLE_CLIENT_ID ? (
            <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center' }} />
          ) : (
            <button
              type="button"
              className="btn-google"
              disabled
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
                width: '100%', padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-full)', border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container)', color: 'var(--on-surface-variant)',
                cursor: 'not-allowed', fontSize: '0.875rem', opacity: 0.5
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Đăng nhập với Google
            </button>
          )}

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
