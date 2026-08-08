#!/bin/bash
# ============================================
# Telegram Web Client - 一键部署脚本
# ============================================
# 用法: sudo bash deploy.sh [域名]
# 示例: sudo bash deploy.sh telegram.example.com
# ============================================

set -e

DOMAIN=${1:-_}
BACKEND_PORT=3001
FRONTEND_PORT=5000
DEPLOY_DIR="/opt/telegram-web"
NODE_VERSION="20"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo "============================================"
echo "  Telegram Web Client - 一键部署脚本"
echo "============================================"
echo "  域名: $DOMAIN"
echo "  后端端口: $BACKEND_PORT"
echo "  前端端口: $FRONTEND_PORT"
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    error "请使用 sudo 或 root 用户运行此脚本"
fi

# ---- 1. 系统更新 ----
info "更新系统包..."
apt-get update -qq

# ---- 2. 安装 Node.js ----
if command -v node &>/dev/null; then
    info "Node.js 已安装: $(node -v)"
else
    info "安装 Node.js ${NODE_VERSION}.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    info "Node.js 安装完成: $(node -v)"
fi

# ---- 3. 安装 pnpm ----
if command -v pnpm &>/dev/null; then
    info "pnpm 已安装: $(pnpm -v)"
else
    info "安装 pnpm..."
    npm install -g pnpm
    info "pnpm 安装完成: $(pnpm -v)"
fi

# ---- 4. 安装 PM2 ----
if command -v pm2 &>/dev/null; then
    info "PM2 已安装: $(pm2 -v)"
else
    info "安装 PM2..."
    npm install -g pm2
    info "PM2 安装完成: $(pm2 -v)"
fi

# ---- 5. 安装 Nginx ----
if command -v nginx &>/dev/null; then
    info "Nginx 已安装: $(nginx -v 2>&1)"
else
    info "安装 Nginx..."
    apt-get install -y nginx
    info "Nginx 安装完成"
fi

# ---- 6. 安装编译工具（better-sqlite3 需要）----
info "安装编译工具..."
apt-get install -y build-essential python3

# ---- 7. 部署源码 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$DEPLOY_DIR" ]; then
    info "备份旧版本..."
    mv "$DEPLOY_DIR" "${DEPLOY_DIR}.bak.$(date +%s)" 2>/dev/null || true
fi

info "复制源码到 $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"
cp -r "$SCRIPT_DIR/backend" "$DEPLOY_DIR/"
cp -r "$SCRIPT_DIR/frontend" "$DEPLOY_DIR/"
cp -f "$SCRIPT_DIR/.coze" "$DEPLOY_DIR/" 2>/dev/null || true
cp -f "$SCRIPT_DIR/AGENTS.md" "$DEPLOY_DIR/" 2>/dev/null || true
cp -f "$SCRIPT_DIR/DESIGN.md" "$DEPLOY_DIR/" 2>/dev/null || true

# ---- 8. 配置环境变量 ----
info "配置环境变量..."
cat > "$DEPLOY_DIR/backend/.env" << ENVEOF
# Telegram API 凭证
# 从 https://my.telegram.org/apps 获取
# 或使用 Telegram Desktop 官方凭证（已预填）
TELEGRAM_API_ID=2040
TELEGRAM_API_HASH=b18441a1ff607e10a989891a54620ff1

# 服务端口
BACKEND_PORT=${BACKEND_PORT}
ENVEOF
info ".env 文件已创建"

# ---- 9. 安装后端依赖 ----
info "安装后端依赖..."
cd "$DEPLOY_DIR/backend"
rm -rf node_modules
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ---- 10. 编译原生模块 ----
info "编译原生模块 (better-sqlite3)..."
pnpm rebuild better-sqlite3

# ---- 11. 编译后端 TypeScript ----
info "编译后端 TypeScript..."
pnpm run build
info "后端构建完成"

# ---- 12. 安装前端依赖 ----
info "安装前端依赖..."
cd "$DEPLOY_DIR/frontend"
rm -rf node_modules
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ---- 13. 构建前端 ----
info "构建前端生产版本..."
pnpm run build
info "前端构建完成"

# ---- 14. 配置 Nginx ----
info "配置 Nginx..."
cat > /etc/nginx/sites-available/telegram-web << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    # 前端静态文件
    root ${DEPLOY_DIR}/frontend/dist;
    index index.html;

    # 前端路由 (SPA)
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
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;

        # 后端不可用时返回 JSON 而非 HTML
        error_page 502 503 504 =500 @api_error;
    }

    location @api_error {
        default_type application/json;
        add_header Access-Control-Allow-Origin *;
        return 502 '{"error": "Backend service is unavailable"}';
    }

    # WebSocket 代理
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

    # 静态资源缓存
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

# ---- 15. 启动后端 ----
info "启动后端服务..."
cd "$DEPLOY_DIR/backend"
pm2 delete telegram-web-backend 2>/dev/null || true
pm2 start dist/index.js \
    --name telegram-web-backend \
    --env production \
    --max-memory-restart 512M \
    --time

# 等待启动
sleep 5

# ---- 16. 健康检查 ----
echo ""
echo "============================================"
echo "  部署完成!"
echo "============================================"
echo ""

HEALTH=$(curl -s --max-time 5 http://127.0.0.1:${BACKEND_PORT}/api/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"ok"'; then
    echo -e "  后端服务: ${GREEN}运行中${NC}"
else
    echo -e "  后端服务: ${RED}启动失败${NC}"
    echo "  查看日志: pm2 logs telegram-web-backend"
fi

echo -e "  Nginx:    ${GREEN}运行中 (端口 80)${NC}"
echo ""

# 获取服务器 IP
SERVER_IP=$(curl -4 -s ifconfig.me 2>/dev/null || curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo "  访问地址: http://${SERVER_IP}"
echo ""

echo "常用命令:"
echo "  查看后端日志:  pm2 logs telegram-web-backend"
echo "  重启后端:      pm2 restart telegram-web-backend"
echo "  重启 Nginx:    systemctl restart nginx"
echo "  查看状态:      pm2 status"
echo ""

echo "HTTPS 配置 (可选):"
echo "  apt install certbot python3-certbot-nginx"
echo "  certbot --nginx -d ${DOMAIN}"
echo ""

# PM2 开机自启
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
