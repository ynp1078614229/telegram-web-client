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

- **登录认证**：手机号+验证码登录、QR 码扫码登录（支持 DC 迁移）、2FA 两步验证
- **聊天列表**：搜索、置顶、未读计数、骨架屏加载
- **聊天窗口**：消息气泡、已读标记（✓/✓✓）、日期分隔、回复引用、滚动加载历史
- **联系人**：在线/离线分组、搜索、点击发起聊天
- **群组**：群组列表、查看成员、创建新群组
- **设置**：个人信息展示、退出登录
- **实时通信**：Socket.io 新消息推送、在线状态同步
- **全中文界面**：所有界面文本已汉化
- **浏览器通知**：桌面通知推送
- **移动端适配**：响应式布局

## 一键部署（推荐）

无需克隆仓库，一行命令完成部署：

```bash
curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash
```

绑定域名部署：

```bash
curl -sL https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash -s -- telegram.example.com
```

也可以用 wget：

```bash
wget -qO- https://raw.githubusercontent.com/ynp1078614229/telegram-web-client/main/deploy.sh | bash
```

部署完成后打开浏览器访问 `http://你的服务器IP`，使用 Telegram 手机号或扫码登录。

### 脚本自动完成的工作

- 安装 Node.js 20、pnpm、PM2、Nginx、编译工具
- 从 GitHub 拉取最新源码
- 自动写入 Telegram API 配置（已内置）
- 安装前后端依赖并编译
- 配置 Nginx 反向代理 + WebSocket
- PM2 启动后端 + 开机自启
- 健康检查

## 手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/ynp1078614229/telegram-web-client.git
cd telegram-web-client

# 2. 安装依赖
cd backend && pnpm install && cd ..
cd frontend && pnpm install && cd ..

# 3. 配置环境变量（API 已内置，可按需修改）
vim backend/.env

# 4. 编译
cd backend && pnpm run build && cd ..
cd frontend && pnpm run build && cd ..

# 5. 启动后端
pm2 start backend/dist/index.js --name telegram-backend

# 6. Nginx 托管 frontend/dist 静态文件（参考 deploy.sh 中的 Nginx 配置）
```

## 环境要求

- **操作系统**: Ubuntu 20.04+ / Debian 11+
- **内存**: >= 512MB
- **磁盘**: >= 500MB
- **网络**: 需要能访问 Telegram API 服务器

## 常用运维命令

```bash
pm2 logs telegram-backend        # 查看日志
pm2 restart telegram-backend     # 重启后端
sudo systemctl restart nginx     # 重启 Nginx
pm2 status                       # 查看服务状态
```

## HTTPS 配置（可选）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d telegram.example.com
```

## License

MIT
