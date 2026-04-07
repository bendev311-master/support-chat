'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('customer');

  const handleJoin = (e) => {
    e.preventDefault();
    if (!username) return;
    
    // Store user info in localStorage for demo purposes
    localStorage.setItem('chat_user', JSON.stringify({ username, role }));
    
    if (role === 'customer') router.push('/chat');
    else if (role === 'vendor') router.push('/vendor');
    else if (role === 'admin') router.push('/admin');
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="glass-panel" style={{ padding: '40px', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>Support Center</h1>
        <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '32px' }}>Enter your details to join</p>
        
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Username</label>
            <input 
              type="text" 
              className="input" 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. John Doe"
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Role</label>
            <select 
              className="input"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="customer">Customer</option>
              <option value="vendor">Support Vendor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <button type="submit" className="btn" style={{ marginTop: '12px' }}>Enter System</button>
        </form>
      </div>
    </div>
  );
}
