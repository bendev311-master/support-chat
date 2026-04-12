#!/bin/bash
set -e

echo "=========================================="
echo "  Clarion Stream - VPS Deployment Script"
echo "=========================================="

# Step 1: System update & dependencies
echo "[1/8] Updating system and installing dependencies..."
apt update -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Step 2: Install Node.js 20 LTS
echo "[2/8] Installing Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js: $(node -v), npm: $(npm -v)"

# Install PM2
echo "[2.5/8] Installing PM2..."
npm install -g pm2 2>/dev/null || true

# Step 3: Clone repository
echo "[3/8] Cloning repository..."
mkdir -p /var/www
cd /var/www

if [ -d "support-chat" ]; then
    echo "Repository exists, pulling latest..."
    cd support-chat
    git pull origin main
else
    git clone https://github.com/bendev311-master/support-chat.git
    cd support-chat
fi

cd support-chat-app

# Step 4: Install Backend
echo "[4/8] Setting up Backend..."
cd backend
npm install --production
cd ..

# Step 5: Install & Build Frontend
echo "[5/8] Setting up Frontend (this may take a few minutes)..."
cd frontend

# Create .env.local for frontend
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://support.muataikhoan247.com
EOF

npm install
npm run build
cd ..

# Step 6: Create environment file
echo "[6/8] Creating environment configuration..."
cat > .env << 'EOF'
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://support.muataikhoan247.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOF

# Step 7: Create PM2 ecosystem config
echo "[7/8] Creating PM2 configuration..."
cat > ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'clarion-backend',
      cwd: './backend',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        FRONTEND_URL: 'https://support.muataikhoan247.com'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'clarion-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
PMEOF

# Start/Restart PM2
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 startup systemd -u root --hp /root 2>/dev/null || true
pm2 save

echo "[7.5/8] PM2 Status:"
pm2 status

# Step 8: Configure Nginx
echo "[8/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/clarion-stream << 'NGEOF'
server {
    listen 80;
    server_name support.muataikhoan247.com;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io endpoint (must be before /api)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
NGEOF

# Enable site
ln -sf /etc/nginx/sites-available/clarion-stream /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart nginx
nginx -t && systemctl restart nginx

# Configure firewall
echo "Configuring firewall..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "  HTTP:  http://support.muataikhoan247.com"
echo "  Health: http://support.muataikhoan247.com/health"
echo ""
echo "  Next step: Run SSL certificate install:"
echo "  certbot --nginx -d support.muataikhoan247.com"
echo ""
echo "  PM2 commands:"
echo "    pm2 status    - Check app status"
echo "    pm2 logs      - View logs"
echo "    pm2 restart all - Restart apps"
echo ""
echo "=========================================="
