#!/bin/bash
# ============================================
# Telegram Web Client - 一键部署脚本
# ============================================
# 用法:
#   curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash
#   或:
#   wget -qO- https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash
#
# 绑定域名:
#   curl -sL .../deploy.sh | bash -s -- telegram.example.com
#
# 环境要求: Ubuntu 20.04+ / Debian 11+, root 权限
# ============================================

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
set -e

DOMAIN=${1:-_}
BACKEND_PORT=3001
DEPLOY_DIR="/opt/telegram-web"
REPO_URL="https://github.com/ynp1078614229/telegram-web-client.git"
NODE_VERSION="20"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "============================================"
echo "  Telegram Web Client - 一键部署"
echo "============================================"
echo ""

[ "$EUID" -ne 0 ] && error "请使用 root 或 sudo 运行"

# 1. System packages
info "安装系统依赖..."
apt-get update
apt-get install -y build-essential python3 curl git

# 2. Node.js
if command -v node &> /dev/null; then
    info "Node.js $(node -v)"
else
    info "安装 Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs
    info "Node.js $(node -v) 安装完成"
fi

# 3. pnpm
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm > /dev/null 2>&1
fi
info "pnpm $(pnpm -v)"

# 4. PM2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2 > /dev/null 2>&1
fi
info "PM2 $(pm2 -v)"

# 5. Nginx
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi
info "Nginx 已就绪"

# 6. Get source code
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if running from cloned repo
if [ -f "$SCRIPT_DIR/backend/package.json" ] && [ -f "$SCRIPT_DIR/frontend/package.json" ]; then
    info "检测到本地源码，使用当前目录"
    SRC_DIR="$SCRIPT_DIR"
else
    info "从 GitHub 拉取最新源码..."
    TEMP_DIR=$(mktemp -d)
    if command -v git &> /dev/null; then
        git clone --depth 1 "$REPO_URL" "$TEMP_DIR/repo" > /dev/null 2>&1
        SRC_DIR="$TEMP_DIR/repo"
    else
        curl -sL "$REPO_URL/archive/refs/heads/main.tar.gz" | tar xz -C "$TEMP_DIR"
        SRC_DIR="$TEMP_DIR/telegram-web-client-main"
    fi
    info "源码下载完成"
fi

# 7. Deploy source code
if [ -d "$DEPLOY_DIR" ]; then
    warn "备份旧版本到 ${DEPLOY_DIR}.bak.$(date +%s)"
    mv "$DEPLOY_DIR" "${DEPLOY_DIR}.bak.$(date +%s)" 2>/dev/null || true
fi

info "部署源码到 $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"
cp -r "$SRC_DIR/backend" "$DEPLOY_DIR/"
cp -r "$SRC_DIR/frontend" "$DEPLOY_DIR/"

# 8. Environment config
if [ ! -f "$DEPLOY_DIR/backend/.env" ]; then
    cat > "$DEPLOY_DIR/backend/.env" << ENVEOF
# Telegram API
TELEGRAM_API_ID=33960207
TELEGRAM_API_HASH=b4a1d5e99cce9e6f317596dfc25aa38a

# 服务端口
PORT=${BACKEND_PORT}
ENVEOF
    info "API 配置已自动写入"
fi

# 9. Backend
info "安装后端依赖..."
cd "$DEPLOY_DIR/backend"
rm -rf node_modules
npm install

info "编译后端..."
# native modules auto-built with npm
pnpm run build

# 10. Frontend
info "安装前端依赖..."
cd "$DEPLOY_DIR/frontend"
rm -rf node_modules
pnpm install --silent 2>/dev/null || pnpm install

info "构建前端..."
pnpm run build

# 11. Copy frontend dist to nginx directory
info "部署前端到 Nginx..."
mkdir -p /var/www/telegram-web
cp -r "$DEPLOY_DIR/frontend/dist/"* /var/www/telegram-web/

# 12. Nginx config
info "配置 Nginx..."
cat > /etc/nginx/sites-available/telegram-web << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    root /var/www/telegram-web;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        error_page 502 503 504 =500 @api_error;
    }

    location @api_error {
        default_type application/json;
        add_header Access-Control-Allow-Origin *;
        return 502 '{"error": "Backend service is unavailable"}';
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/telegram-web /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
info "Nginx 配置完成"

# 13. Start backend with PM2
info "启动后端服务..."
cd "$DEPLOY_DIR/backend"
pm2 delete telegram-backend 2>/dev/null || true
pm2 start dist/index.js \
    --name telegram-backend \
    --max-memory-restart 512M \
    --time

pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

sleep 3

# 14. Health check
echo ""
echo "============================================"
SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")

HEALTH=$(curl -s --max-time 5 http://127.0.0.1:${BACKEND_PORT}/api/auth/check 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"authorized"'; then
    echo -e "  后端: ${GREEN}运行中${NC}"
else
    echo -e "  后端: ${RED}可能未启动${NC} - 查看日志: pm2 logs telegram-backend"
fi
echo -e "  Nginx: ${GREEN}运行中${NC}"
echo ""
echo -e "  访问地址: ${GREEN}http://${SERVER_IP}${NC}"
echo ""
echo "常用命令:"
echo "  pm2 logs telegram-backend     # 查看日志"
echo "  pm2 restart telegram-backend  # 重启后端"
echo "  systemctl restart nginx       # 重启 Nginx"
echo ""
echo "HTTPS (可选):"
echo "  apt install certbot python3-certbot-nginx"
echo "  certbot --nginx -d ${DOMAIN}"
echo "============================================"
