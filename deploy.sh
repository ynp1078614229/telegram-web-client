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
DOWNLOAD_URL="https://github.com/ynp1078614229/telegram-web-client/releases/download/v5/telegram-web-client.tar.gz"
BACKEND_PORT=3001
DOMAIN="${1:-_}"

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

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
# 1. 基础系统依赖（自动检测并安装）
# ============================================================
log "检测并安装基础系统依赖..."

if command -v apt-get &> /dev/null; then
  PKG="apt"
elif command -v dnf &> /dev/null; then
  PKG="dnf"
elif command -v yum &> /dev/null; then
  PKG="yum"
else
  error "未找到支持的包管理器 (apt/yum/dnf)"
fi

if [ "$PKG" = "apt" ]; then
  apt-get update -qq 2>&1 | tail -1

  APT_PACKAGES="curl wget git ca-certificates gnupg lsb-release build-essential software-properties-common sqlite3"
  NEED=""
  for pkg in $APT_PACKAGES; do
    if ! dpkg -s "$pkg" &> /dev/null 2>&1; then
      NEED="$NEED $pkg"
    fi
  done

  if [ -n "$NEED" ]; then
    log "安装缺失的系统包:${NEED}"
    apt-get install -y $NEED 2>&1 | tail -3
  else
    log "系统基础依赖已就绪 ✓"
  fi
else
  $PKG install -y curl wget git ca-certificates gnupg gcc gcc-c++ make sqlite 2>&1 | tail -3
  log "系统基础依赖已安装 ✓"
fi

# ============================================================
# 2. Node.js 20.x（自动检测版本）
# ============================================================
install_node() {
  log "安装 Node.js 20.x..."
  if [ "$PKG" = "apt" ]; then
    rm -f /etc/apt/sources.list.d/nodesource.list
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -3
    apt-get install -y nodejs 2>&1 | tail -3
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -3
    $PKG install -y nodejs 2>&1 | tail -3
  fi
}

if command -v node &> /dev/null; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    log "Node.js 已安装: ${NODE_VER} ✓"
  else
    warn "Node.js 版本过低 (${NODE_VER})，升级到 20.x"
    install_node
  fi
else
  install_node
fi

command -v node &> /dev/null || error "Node.js 安装失败"
log "Node.js: $(node -v)"

# ============================================================
# 3. npm（Node.js 自带，做检查）
# ============================================================
if ! command -v npm &> /dev/null; then
  log "安装 npm..."
  if [ "$PKG" = "apt" ]; then
    apt-get install -y npm 2>&1 | tail -3
  else
    $PKG install -y npm 2>&1 | tail -3
  fi
fi
command -v npm &> /dev/null || error "npm 安装失败"
log "npm: $(npm -v)"

# ============================================================
# 4. pnpm v9（强制版本检测）
# ============================================================
install_pnpm() {
  log "安装 pnpm v9..."
  npm install -g pnpm@9 2>&1 | tail -3
  hash -r
}

if command -v pnpm &> /dev/null; then
  PNPM_VER=$(pnpm -v 2>/dev/null | cut -d. -f1)
  if [ "$PNPM_VER" = "9" ]; then
    log "pnpm 已安装: $(pnpm -v) ✓"
  else
    warn "pnpm 版本 ($(pnpm -v)) 不匹配，切换到 v9"
    install_pnpm
  fi
else
  install_pnpm
fi

# 再试 corepack
if ! command -v pnpm &> /dev/null; then
  log "尝试 corepack 启用 pnpm..."
  corepack enable 2>/dev/null || true
  corepack prepare pnpm@9 --activate 2>/dev/null || true
  hash -r
fi

command -v pnpm &> /dev/null || error "pnpm 安装失败"
log "pnpm: $(pnpm -v)"

# ============================================================
# 5. PM2（自动检测）
# ============================================================
if command -v pm2 &> /dev/null; then
  log "PM2 已安装: $(pm2 -v) ✓"
else
  log "安装 PM2..."
  npm install -g pm2 2>&1 | tail -3
  hash -r
fi
command -v pm2 &> /dev/null || error "PM2 安装失败"
log "PM2: $(pm2 -v)"

# ============================================================
# 6. Nginx（自动检测）
# ============================================================
if command -v nginx &> /dev/null; then
  log "Nginx 已安装: $(nginx -v 2>&1) ✓"
else
  log "安装 Nginx..."
  if [ "$PKG" = "apt" ]; then
    apt-get install -y nginx 2>&1 | tail -3
  else
    $PKG install -y nginx 2>&1 | tail -3
  fi
fi
command -v nginx &> /dev/null || error "Nginx 安装失败"
log "Nginx: $(nginx -v 2>&1)"

# ============================================================
# 7. 下载并解压源码
# ============================================================
log "从 GitHub Release 下载源码..."
mkdir -p /tmp/telegram-deploy && cd /tmp/telegram-deploy
rm -f telegram-web-client.tar.gz
wget -q --show-progress -O telegram-web-client.tar.gz "${DOWNLOAD_URL}"

log "解压源码到 ${APP_DIR}..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"
tar xzf telegram-web-client.tar.gz --strip-components=1 -C "${APP_DIR}"
rm -rf /tmp/telegram-deploy
log "源码部署完成"

# ============================================================
# 8. 后端依赖 & 构建
# ============================================================
log "安装后端依赖..."
cd "${APP_DIR}/backend"
rm -rf node_modules
pnpm install --prod=false 2>&1 | tail -5

log "构建后端..."
pnpm run build 2>&1 | tail -5

cat > "${APP_DIR}/backend/.env" << EOF
TELEGRAM_API_ID=33960207
TELEGRAM_API_HASH=b4a1d5e99cce9e6f317596dfc25aa38a
BACKEND_PORT=${BACKEND_PORT}
NODE_ENV=production
EOF

log "后端构建完成"

# ============================================================
# 9. 前端依赖 & 构建
# ============================================================
log "安装前端依赖..."
cd "${APP_DIR}/frontend"
rm -rf node_modules
pnpm install 2>&1 | tail -5

log "构建前端..."
pnpm run build 2>&1 | tail -5
log "前端构建完成"

# ============================================================
# 10. 配置 Nginx
# ============================================================
log "配置 Nginx..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/nginx/sites-available/${APP_NAME} << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    root ${APP_DIR}/frontend/dist;
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
    }

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
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/${APP_NAME}.access.log;
    error_log /var/log/nginx/${APP_NAME}.error.log;
}
NGINXEOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}

nginx -t 2>&1 || error "Nginx 配置测试失败"
systemctl enable nginx > /dev/null 2>&1
systemctl restart nginx
log "Nginx 配置完成"

# ============================================================
# 11. 启动后端 (PM2)
# ============================================================
log "启动后端服务..."
pm2 delete ${APP_NAME}-backend 2>/dev/null || true

cd "${APP_DIR}/backend"
pm2 start dist/index.js \
  --name "${APP_NAME}-backend" \
  --env production \
  --max-memory-restart 512M \
  --time

pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1
log "后端服务启动完成"

# ============================================================
# 12. 验证
# ============================================================
sleep 2

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if curl -s http://127.0.0.1:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
  echo -e "  后端服务: ${GREEN}运行中${NC} (端口 ${BACKEND_PORT})"
else
  echo -e "  后端服务: ${RED}启动失败${NC}"
  echo -e "  查看日志: ${YELLOW}pm2 logs ${APP_NAME}-backend${NC}"
fi

if systemctl is-active --quiet nginx; then
  echo -e "  Nginx:    ${GREEN}运行中${NC} (端口 80)"
else
  echo -e "  Nginx:    ${RED}启动失败${NC}"
fi

echo ""
if [ "${DOMAIN}" = "_" ]; then
  SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  echo -e "  访问地址: ${GREEN}http://${SERVER_IP}${NC}"
else
  echo -e "  访问地址: ${GREEN}http://${DOMAIN}${NC}"
fi
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  查看日志:  pm2 logs ${APP_NAME}-backend"
echo "  重启后端:  pm2 restart ${APP_NAME}-backend"
echo "  重启Nginx: systemctl restart nginx"
echo ""
echo -e "${YELLOW}HTTPS (可选):${NC}"
echo "  apt install certbot python3-certbot-nginx"
echo "  certbot --nginx -d ${DOMAIN}"
echo ""
