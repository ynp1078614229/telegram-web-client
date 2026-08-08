# Telegram Web Client

基于 MTProto 协议的 Telegram 个人版网页客户端，前后端分离架构。

## 项目介绍

这是一个功能完整的 Telegram Web 客户端，通过 gram.js 库实现 MTProto 协议通信，支持消息收发、联系人管理、群组操作等核心功能。前端采用现代 React 技术栈，后端使用 Node.js + Express 提供 RESTful API 和 WebSocket 实时推送。

## 技术栈

### 后端
| 技术 | 说明 |
|------|------|
| Node.js + TypeScript | 运行时与语言 |
| Express | Web 框架 |
| gram.js (telegram) | MTProto 协议客户端 |
| Socket.io | WebSocket 实时通信 |
| Better-SQLite3 | 本地数据缓存 |
| PM2 | 进程管理 |

### 前端
| 技术 | 说明 |
|------|------|
| React 18 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| Socket.io-client | WebSocket 客户端 |
| React Router | 路由管理 |

## 功能特性

- **登录认证**：手机号+验证码登录、QR 码扫码登录
- **聊天列表**：搜索、置顶、未读计数、骨架屏加载
- **聊天窗口**：消息气泡、已读标记（✓/✓✓）、日期分隔、回复引用、滚动加载历史
- **联系人**：在线/离线分组、搜索、点击发起聊天
- **群组**：群组列表、查看成员、创建新群组
- **设置**：个人信息展示、退出登录
- **实时通信**：Socket.io 新消息推送、在线状态同步

## 环境要求

- **Node.js**: >= 18.x（推荐 20.x）
- **pnpm**: >= 8.x
- **操作系统**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **内存**: >= 512MB
- **磁盘**: >= 500MB
- **网络**: 需要能访问 Telegram API 服务器

## Telegram API 凭证获取

### 方式一：使用官方凭证（推荐快速体验）

项目默认使用 Telegram Desktop 官方客户端的 API 凭证，无需额外申请：

```
API_ID=2040
API_HASH=b18441a1ff607e10a989891a54620ff1
```

### 方式二：自行申请

1. 访问 https://my.telegram.org
2. 使用 Telegram 手机号登录
3. 点击 **API development tools**
4. 填写应用信息（App title、Short name 等）
5. 创建后获取 `App api_id` 和 `App api_hash`
6. 填入 `backend/.env` 文件

## 一键部署

### 步骤 1：上传文件

将 `telegram-web-source.zip` 和 `deploy.sh` 上传到服务器同一目录：

```bash
# 方式一：通过 scp
scp telegram-web-source.zip deploy.sh user@your-server:~/

# 方式二：通过 wget（如果文件在 OSS/CDN 上）
wget https://your-cdn.com/telegram-web-source.zip
wget https://your-cdn.com/deploy.sh
```

### 步骤 2：解压源码

```bash
unzip telegram-web-source.zip -d telegram-web
cd telegram-web
```

### 步骤 3：执行部署脚本

```bash
# 基本部署（IP 直接访问）
sudo bash deploy.sh

# 指定域名部署
sudo bash deploy.sh telegram.example.com
```

脚本会自动完成：
- 安装 Node.js、pnpm、PM2、Nginx
- 安装编译工具（better-sqlite3 需要）
- 安装前后端依赖
- 编译 TypeScript
- 配置 Nginx 反向代理
- 启动后端服务
- 健康检查

### 步骤 4：访问

打开浏览器访问 `http://你的服务器IP`，使用 Telegram 手机号登录。

## 手动部署

如果不想使用一键脚本，可以手动部署：

```bash
# 1. 安装依赖
cd backend && pnpm install && cd ..
cd frontend && pnpm install && cd ..

# 2. 配置环境变量
cat > backend/.env << 'EOF'
TELEGRAM_API_ID=2040
TELEGRAM_API_HASH=b18441a1ff607e10a989891a54620ff1
BACKEND_PORT=3001
EOF

# 3. 编译后端
cd backend && pnpm run build && cd ..

# 4. 编译前端
cd frontend && pnpm run build && cd ..

# 5. 启动后端
cd backend && pm2 start dist/index.js --name telegram-web-backend

# 6. 启动前端（生产环境用 Nginx 托管 frontend/dist 静态文件）
cd frontend && npx serve -s dist -l 5000
```

## 项目目录结构

```
telegram-web/
├── backend/                    # 后端
│   ├── src/
│   │   ├── index.ts           # 服务入口（Express + Socket.io）
│   │   ├── services/
│   │   │   └── telegram.ts    # gram.js MTProto 客户端封装
│   │   ├── db/
│   │   │   └── database.ts    # SQLite 数据库连接与 Schema
│   │   ├── routes/
│   │   │   ├── auth.ts        # 认证路由（登录/登出/QR码）
│   │   │   ├── chats.ts       # 聊天路由（消息收发/历史）
│   │   │   └── contacts.ts    # 联系人路由
│   │   ├── middleware/
│   │   │   └── auth.ts        # 认证中间件
│   │   └── types/
│   │       └── index.ts       # TypeScript 类型定义
│   ├── data/                   # SQLite 数据目录（运行时生成）
│   ├── .env                    # 环境变量配置
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # 前端
│   ├── src/
│   │   ├── main.tsx           # 入口文件
│   │   ├── App.tsx            # 根组件（路由配置）
│   │   ├── index.css          # 全局样式
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx  # 登录页（手机号/QR码）
│   │   │   ├── ChatPage.tsx   # 聊天主页
│   │   │   ├── ContactsPage.tsx # 联系人页
│   │   │   ├── GroupsPage.tsx # 群组页
│   │   │   └── SettingsPage.tsx # 设置页
│   │   ├── components/
│   │   │   ├── Sidebar.tsx    # 侧边栏（聊天列表）
│   │   │   ├── ChatWindow.tsx # 聊天窗口（消息列表+输入）
│   │   │   └── Avatar.tsx     # 头像组件
│   │   ├── services/
│   │   │   ├── api.ts         # REST API 客户端
│   │   │   └── socket.ts      # Socket.io 客户端
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── types/             # TypeScript 类型
│   │   └── utils/             # 工具函数
│   ├── public/                 # 静态资源
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── deploy.sh                   # 一键部署脚本
├── .coze                       # 项目配置
├── AGENTS.md                   # 项目规范文档
└── DESIGN.md                   # 设计规范文档
```

## API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/send-code | 发送验证码 |
| POST | /api/auth/verify-code | 验证码验证 |
| POST | /api/auth/qr-login | 获取 QR 码 |
| POST | /api/auth/qr-check | 检查 QR 登录状态 |
| GET | /api/auth/check | 检查登录状态 |
| POST | /api/auth/logout | 退出登录 |
| GET | /api/chats | 获取聊天列表 |
| GET | /api/chats/:id/messages | 获取消息（分页） |
| POST | /api/chats/:id/messages | 发送消息 |
| GET | /api/contacts | 获取联系人 |
| GET | /api/chats/:id/members | 获取群组成员 |
| POST | /api/chats/create-group | 创建群组 |
| GET | /api/health | 健康检查 |

### WebSocket 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| new-message | Server → Client | 新消息推送 |
| chat-update | Server → Client | 聊天列表更新 |
| message-read | Server → Client | 消息已读状态 |
| user-status | Server → Client | 用户在线状态 |

## 常见问题排查

### 1. 后端启动失败：better-sqlite3 找不到

```
Error: better_sqlite3.node: cannot open shared object file
```

**原因**：原生模块未编译或架构不匹配。

**解决**：
```bash
cd backend
rm -rf node_modules
pnpm install
pnpm rebuild better-sqlite3
pm2 restart telegram-web-backend
```

### 2. 页面显示 "Cannot GET /"

**原因**：Nginx 未正确配置或前端未构建。

**解决**：
```bash
# 检查前端构建产物
ls frontend/dist/index.html

# 重新构建前端
cd frontend && pnpm run build

# 重启 Nginx
sudo systemctl restart nginx
```

### 3. API 返回 HTML 而非 JSON

**原因**：Nginx 未正确代理 /api 请求到后端。

**解决**：
```bash
# 检查后端是否运行
pm2 status
curl http://127.0.0.1:3001/api/health

# 检查 Nginx 配置
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Telegram 连接超时

**原因**：服务器无法访问 Telegram API 服务器。

**解决**：
- 确认服务器网络正常
- 部分地区可能需要配置代理
- 在 `.env` 中添加代理配置：
  ```
  TELEGRAM_PROXY=http://proxy:port
  ```

### 5. 登录时 QR 码不显示

**原因**：Telegram API 凭证无效或网络问题。

**解决**：
```bash
# 查看后端日志
pm2 logs telegram-web-backend --lines 50

# 检查 API 凭证
cat backend/.env
```

### 6. WebSocket 连接失败

**原因**：Nginx 未正确配置 WebSocket 代理。

**解决**：确认 Nginx 配置中包含 `/socket.io/` 的 proxy_pass 和 upgrade 头。

## 常用运维命令

```bash
# 查看后端日志
pm2 logs telegram-web-backend

# 重启后端
pm2 restart telegram-web-backend

# 重启 Nginx
sudo systemctl restart nginx

# 查看服务状态
pm2 status

# 停止所有服务
pm2 stop all

# 重新部署（更新代码后）
cd /opt/telegram-web
# 更新代码...
cd backend && pnpm install && pnpm run build
cd ../frontend && pnpm install && pnpm run build
pm2 restart telegram-web-backend
sudo systemctl restart nginx
```

## HTTPS 配置

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书（需要域名已解析到服务器）
sudo certbot --nginx -d telegram.example.com

# 自动续期
sudo certbot renew --dry-run
```

## License

MIT
