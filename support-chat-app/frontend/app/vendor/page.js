'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { Send, Users } from 'lucide-react';

export default function VendorPanel() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [state, setState] = useState({ connectedUsers: [], activeRooms: [] });
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) {
      router.push('/');
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'vendor') {
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
      if (activeRoomId) {
        const room = newState.activeRooms.find(r => r.id === activeRoomId);
        if (room) setMessages(room.messages);
      }
    });

    newSocket.on('room_joined', (data) => {
      setActiveRoomId(data.roomId);
      setMessages(data.messages);
    });

    newSocket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => newSocket.close();
  }, [router, activeRoomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const joinRoom = (roomId) => {
    socket.emit('join_room', { roomId });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !socket || !activeRoomId) return;
    
    socket.emit('send_message', { roomId: activeRoomId, content: inputVal });
    setInputVal('');
  };

  return (
    <div className="container">
      <div className="glass-panel chat-container" style={{ margin: '0 auto', maxWidth: '1000px' }}>
        <div className="sidebar" style={{ borderRight: '1px solid var(--surface-border)' }}>
          <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--surface-border)', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} /> Vendor Dashboard
            </h3>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.5, marginBottom: '8px' }}>Active Support Queries</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {state.activeRooms.map(room => {
                const customer = state.connectedUsers.find(u => u.id === room.customerId);
                return (
                  <div 
                    key={room.id}
                    className={`room-item ${activeRoomId === room.id ? 'active' : ''}`}
                    onClick={() => joinRoom(room.id)}
                  >
                    <div style={{ fontWeight: '500' }}>{customer?.username || 'Unknown Customer'}</div>
                    <div style={{ fontSize: '12px', opacity: 0.7 }}>
                      {room.vendorId ? 'Assigned' : 'Waiting for answers...'}
                    </div>
                  </div>
                );
              })}
              {state.activeRooms.length === 0 && (
                <div style={{ opacity: 0.5, fontSize: '14px', fontStyle: 'italic' }}>No active queries</div>
              )}
            </div>
          </div>
        </div>
        
        <div className="chat-area">
          {activeRoomId ? (
            <>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: 0 }}>Room: {activeRoomId.split('_')[1]}</h3>
              </div>
              
              <div className="messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.senderId === socket?.id ? 'mine' : 'theirs'}`}>
                    <div className="message-header">
                      <span>{msg.senderId === socket?.id ? 'You' : msg.senderName}</span>
                      <span style={{ marginLeft: '12px' }}>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              
              <form className="input-area" onSubmit={sendMessage}>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Type your reply..." 
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                />
                <button type="submit" className="btn" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
              Select a room to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
