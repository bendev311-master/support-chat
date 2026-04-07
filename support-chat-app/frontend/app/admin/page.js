'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';

export default function AdminPanel() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState({ connectedUsers: [], activeRooms: [] });

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) {
      router.push('/');
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      router.push('/');
      return;
    }

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

  return (
    <div className="container">
      <h1 style={{ marginBottom: '24px' }}>Admin Overview</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>Connected Users ({state.connectedUsers.length})</h3>
          <table style={{ width: '100%', textAlign: 'left', marginTop: '16px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                <th style={{ padding: '8px' }}>Username</th>
                <th style={{ padding: '8px' }}>Role</th>
                <th style={{ padding: '8px' }}>ID</th>
              </tr>
            </thead>
            <tbody>
              {state.connectedUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '8px' }}>{u.username}</td>
                  <td style={{ padding: '8px', textTransform: 'capitalize' }}>{u.role}</td>
                  <td style={{ padding: '8px', fontSize: '12px', opacity: 0.7 }}>{u.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>Active Rooms ({state.activeRooms.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {state.activeRooms.map(room => {
              const customer = state.connectedUsers.find(u => u.id === room.customerId)?.username || 'Unknown';
              const vendor = state.connectedUsers.find(u => u.id === room.vendorId)?.username || 'Unassigned';
              return (
                <div key={room.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', opacity: 0.5, marginBottom: '8px' }}>ID: {room.id}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>🙎‍♂️ {customer}</span>
                    <span style={{ opacity: 0.5 }}>⟷</span>
                    <span>🎧 {vendor}</span>
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.8 }}>
                    Total Messages: {room.messages.length}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
