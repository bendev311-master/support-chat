'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

export default function CustomerChat() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [roomId, setRoomId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const userStr = localStorage.getItem('chat_user');
    if (!userStr) {
      router.push('/');
      return;
    }
    const user = JSON.parse(userStr);

    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('register', user);
    });

    newSocket.on('room_assigned', (data) => {
      setRoomId(data.roomId);
    });

    newSocket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => newSocket.close();
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !socket || !roomId) return;
    
    socket.emit('send_message', { roomId, content: inputVal });
    setInputVal('');
  };

  return (
    <div className="container">
      <div className="glass-panel chat-container" style={{ margin: '0 auto', maxWidth: '800px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.2)' }}>
          <h2 style={{ margin: 0 }}>Customer Support</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: '14px' }}>
            {roomId ? 'Connected to support line. Awaiting agent...' : 'Connecting...'}
          </p>
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
            placeholder="Type your message here..." 
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
          />
          <button type="submit" className="btn" style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
