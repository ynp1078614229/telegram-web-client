#!/bin/bash
set -e

# ============================================================
# Telegram Web Client - 个人版一键部署脚本
# 用法: curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash
# 支持系统: Ubuntu 18+/Debian 10+/CentOS 7+
# ============================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
APP_NAME="telegram-web"
APP_DIR="/opt/telegram-web"
DOWNLOAD_URL="https://github.com/ynp1078614229/telegram-web-client/releases/download/v4/telegram-web-client.tar.gz"
BACKEND_PORT=3001
FRONTEND_PORT=5000
DOMAIN="${1:-_}"  # 第一个参数为域名，默认为 _ (任意域名)

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  error "请使用 root 权限运行: sudo bash deploy.sh [your-domain.com]"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Telegram Web Client - 一键部署脚本${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "域名: ${YELLOW}${DOMAIN}${NC}"
echo -e "后端端口: ${YELLOW}${BACKEND_PORT}${NC}"
echo ""

# ============================================================
# 1. 系统更新 & 基础工具
# ============================================================
log "更新系统包..."
apt-get update -qq
apt-get install -y -qq curl wget git build-essential software-properties-common sqlite3 > /dev/null 2>&1

# ============================================================
# 2. 安装 Node.js 20.x
# ============================================================
if command -v node &> /dev/null; then
  NODE_VER=$(node -v)
  log "Node.js 已安装: ${NODE_VER}"
else
  log "安装 Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  log "Node.js 安装完成: $(node -v)"
fi

# ============================================================
# 3. 安装 pnpm
# ============================================================
if command -v pnpm &> /dev/null; then
  log "pnpm 已安装: $(pnpm -v)"
else
  log "安装 pnpm..."
  npm install -g pnpm > /dev/null 2>&1
  log "pnpm 安装完成: $(pnpm -v)"
fi

# ============================================================
# 4. 安装 PM2 进程管理器
# ============================================================
if command -v pm2 &> /dev/null; then
  log "PM2 已安装: $(pm2 -v)"
else
  log "安装 PM2..."
  npm install -g pm2 > /dev/null 2>&1
  log "PM2 安装完成: $(pm2 -v)"
fi

# ============================================================
# 5. 安装 Nginx
# ============================================================
if command -v nginx &> /dev/null; then
  log "Nginx 已安装: $(nginx -v 2>&1)"
else
  log "安装 Nginx..."
  apt-get install -y -qq nginx > /dev/null 2>&1
  log "Nginx 安装完成: $(nginx -v 2>&1)"
fi

# ============================================================
# 6. 从 GitHub Release 下载并解压源码
# ============================================================
log "从 GitHub Release 下载源码..."
mkdir -p /tmp/telegram-deploy
cd /tmp/telegram-deploy

if [ -f /tmp/telegram-deploy/telegram-web-client.tar.gz ]; then
  rm -f /tmp/telegram-deploy/telegram-web-client.tar.gz
fi

wget -q --show-progress -O telegram-web-client.tar.gz "${DOWNLOAD_URL}"

log "解压源码到 ${APP_DIR}..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"
tar xzf telegram-web-client.tar.gz --strip-components=1 -C "${APP_DIR}"

# 清理临时文件
rm -rf /tmp/telegram-deploy

log "源码部署完成"

# ============================================================
# 7. 安装后端依赖 & 构建
# ============================================================
log "安装后端依赖..."
cd "${APP_DIR}/backend"
rm -rf node_modules

# pnpm v10 安全策略：允许原生模块编译（必须在 install 之前配置）
echo 'onlyBuiltDependencies[]=better-sqlite3' > .npmrc
echo 'onlyBuiltDependencies[]=esbuild' >> .npmrc

pnpm install --prod=false 2>&1 | tail -5

log "构建后端 TypeScript..."
pnpm run build > /dev/null 2>&1

# 创建 .env 文件
cat > "${APP_DIR}/backend/.env" << EOF
TELEGRAM_API_ID=2040
TELEGRAM_API_HASH=b18441a1ff607e10a989891a54620ff1
BACKEND_PORT=${BACKEND_PORT}
NODE_ENV=production
EOF

log "后端构建完成"

# ============================================================
# 8. 安装前端依赖 & 构建
# ============================================================
log "安装前端依赖..."
cd "${APP_DIR}/frontend"
rm -rf node_modules
pnpm install 2>&1 | tail -5

log "构建前端生产版本..."
pnpm run build > /dev/null 2>&1

log "前端构建完成"

# ============================================================
# 9. 配置 Nginx
# ============================================================
log "配置 Nginx..."

cat > /etc/nginx/sites-available/${APP_NAME} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 前端静态文件
    root ${APP_DIR}/frontend/dist;
    index index.html;

    # 前端路由 - SPA history mode
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 代理 (Socket.io)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 日志
    access_log /var/log/nginx/${APP_NAME}.access.log;
    error_log /var/log/nginx/${APP_NAME}.error.log;
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}

# 测试 Nginx 配置
nginx -t 2>&1 || error "Nginx 配置测试失败"

# 重启 Nginx
systemctl enable nginx > /dev/null 2>&1
systemctl restart nginx

log "Nginx 配置完成"

# ============================================================
# 10. 启动后端服务 (PM2)
# ============================================================
log "启动后端服务..."

# 停止旧进程
pm2 delete ${APP_NAME}-backend 2>/dev/null || true

cd "${APP_DIR}/backend"
pm2 start dist/index.js \
  --name "${APP_NAME}-backend" \
  --env production \
  --max-memory-restart 512M \
  --time

# 保存 PM2 配置 & 设置开机自启
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1

log "后端服务启动完成"

# ============================================================
# 11. 验证服务状态
# ============================================================
sleep 2

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# 检查后端
if curl -s http://127.0.0.1:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
  echo -e "  后端服务: ${GREEN}运行中${NC} (端口 ${BACKEND_PORT})"
else
  echo -e "  后端服务: ${RED}启动失败${NC}"
  echo -e "  查看日志: ${YELLOW}pm2 logs ${APP_NAME}-backend${NC}"
fi

# 检查 Nginx
if systemctl is-active --quiet nginx; then
  echo -e "  Nginx:    ${GREEN}运行中${NC} (端口 80)"
else
  echo -e "  Nginx:    ${RED}启动失败${NC}"
fi

echo ""
if [ "${DOMAIN}" = "_" ]; then
  SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  echo -e "  访问地址: ${GREEN}http://${SERVER_IP}${NC}"
else
  echo -e "  访问地址: ${GREEN}http://${DOMAIN}${NC}"
fi
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  查看后端日志:  pm2 logs ${APP_NAME}-backend"
echo "  重启后端:      pm2 restart ${APP_NAME}-backend"
echo "  重启 Nginx:    systemctl restart nginx"
echo "  查看状态:      pm2 status"
echo ""
echo -e "${YELLOW}HTTPS 配置 (可选):${NC}"
echo "  apt install certbot python3-certbot-nginx"
echo "  certbot --nginx -d ${DOMAIN}"
echo ""
