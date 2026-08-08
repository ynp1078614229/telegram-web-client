import { Router, type Router as RouterType } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router: RouterType = Router();

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'access_config.json');

interface AccessConfig {
  password_hash: string;
  token: string;
  setup_done: boolean;
}

function loadConfig(): AccessConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveConfig(config: AccessConfig): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'tg_web_salt_2026').digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// 检查访问状态
router.get('/status', (req, res) => {
  const config = loadConfig();
  
  if (!config || !config.setup_done) {
    res.json({ needsSetup: true, needsPassword: false });
    return;
  }
  
  const token = req.headers['x-access-token'] as string;
  if (token && token === config.token) {
    res.json({ needsSetup: false, needsPassword: false });
    return;
  }
  
  res.json({ needsSetup: false, needsPassword: true });
});

// 首次设置密码
router.post('/setup', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    res.status(400).json({ error: '密码至少4位' });
    return;
  }
  
  const config = loadConfig();
  if (config && config.setup_done) {
    res.status(400).json({ error: '密码已设置' });
    return;
  }
  
  const newConfig: AccessConfig = {
    password_hash: hashPassword(password),
    token: generateToken(),
    setup_done: true,
  };
  saveConfig(newConfig);
  
  res.json({ success: true, token: newConfig.token });
});

// 验证密码
router.post('/verify', (req, res) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: '请输入密码' });
    return;
  }
  
  const config = loadConfig();
  if (!config || !config.setup_done) {
    res.status(400).json({ error: '密码未设置' });
    return;
  }
  
  if (hashPassword(password) !== config.password_hash) {
    res.status(403).json({ error: '密码错误' });
    return;
  }
  
  res.json({ success: true, token: config.token });
});

// 重置密码
router.post('/reset', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 4) {
    res.status(400).json({ error: '参数不完整，新密码至少4位' });
    return;
  }
  
  const config = loadConfig();
  if (!config || !config.setup_done) {
    res.status(400).json({ error: '密码未设置' });
    return;
  }
  
  const token = req.headers['x-access-token'] as string;
  if (!token || token !== config.token) {
    res.status(403).json({ error: '需要先验证当前密码' });
    return;
  }
  
  if (hashPassword(oldPassword) !== config.password_hash) {
    res.status(403).json({ error: '旧密码错误' });
    return;
  }
  
  const newConfig: AccessConfig = {
    password_hash: hashPassword(newPassword),
    token: generateToken(),
    setup_done: true,
  };
  saveConfig(newConfig);
  
  res.json({ success: true, token: newConfig.token });
});

export default router;
