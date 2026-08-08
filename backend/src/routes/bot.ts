import { Router, type IRouter } from 'express';
import db from '../db/database.js';

const router: IRouter = Router();

// 获取所有自动回复规则
router.get('/rules', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM auto_reply_logs WHERE rule_id = r.id) as total_matches
      FROM auto_replies r
      ORDER BY r.created_at DESC
    `).all();
    res.json({ success: true, rules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建新规则
router.post('/rules', (req, res) => {
  try {
    const { keyword, match_type, reply_text, is_active, delay_min, delay_max, cooldown, scope } = req.body;
    if (!keyword || !reply_text) {
      res.status(400).json({ error: '关键词和回复内容不能为空' });
      return;
    }
    
    const result = db.prepare(`
      INSERT INTO auto_replies (keyword, match_type, reply_text, is_active, delay_min, delay_max, cooldown, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      keyword, 
      match_type || 'contains', 
      reply_text, 
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      delay_min || 0,
      delay_max || 0,
      cooldown || 0,
      scope || 'private'
    );
    
    const newRule = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, rule: newRule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新规则
router.put('/rules/:id', (req, res) => {
  try {
    const { keyword, match_type, reply_text, is_active, delay_min, delay_max, cooldown, scope } = req.body;
    const ruleId = parseInt(req.params.id);
    
    const existing = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(ruleId) as any;
    if (!existing) {
      res.status(404).json({ error: '规则不存在' });
      return;
    }
    
    db.prepare(`
      UPDATE auto_replies 
      SET keyword = ?, match_type = ?, reply_text = ?, is_active = ?, 
          delay_min = ?, delay_max = ?, cooldown = ?, scope = ?,
          updated_at = strftime('%s','now')
      WHERE id = ?
    `).run(
      keyword !== undefined ? keyword : existing.keyword,
      match_type || existing.match_type,
      reply_text !== undefined ? reply_text : existing.reply_text,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      delay_min !== undefined ? delay_min : existing.delay_min,
      delay_max !== undefined ? delay_max : existing.delay_max,
      cooldown !== undefined ? cooldown : existing.cooldown,
      scope || existing.scope,
      ruleId
    );
    
    const updated = db.prepare('SELECT * FROM auto_replies WHERE id = ?').get(ruleId);
    res.json({ success: true, rule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除规则
router.delete('/rules/:id', (req, res) => {
  try {
    const ruleId = parseInt(req.params.id);
    db.prepare('DELETE FROM auto_reply_logs WHERE rule_id = ?').run(ruleId);
    db.prepare('DELETE FROM auto_reply_cooldowns WHERE rule_id = ?').run(ruleId);
    db.prepare('DELETE FROM auto_replies WHERE id = ?').run(ruleId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取自动回复日志（最近100条）
router.get('/logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT l.*, r.keyword as rule_keyword
      FROM auto_reply_logs l
      LEFT JOIN auto_replies r ON l.rule_id = r.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `).all();
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 清空日志
router.delete('/logs', (req, res) => {
  try {
    db.prepare('DELETE FROM auto_reply_logs').run();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 测试匹配（不实际发送，只检查哪些规则会匹配）
router.post('/test', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: '测试文本不能为空' });
      return;
    }
    
    const rules = db.prepare('SELECT * FROM auto_replies WHERE is_active = 1').all() as any[];
    const matched: any[] = [];
    
    for (const rule of rules) {
      let isMatch = false;
      const keyword = rule.keyword.toLowerCase();
      const inputText = text.toLowerCase();
      
      switch (rule.match_type) {
        case 'exact':
          isMatch = inputText === keyword;
          break;
        case 'starts':
          isMatch = inputText.startsWith(keyword);
          break;
        case 'ends':
          isMatch = inputText.endsWith(keyword);
          break;
        case 'contains':
        default:
          isMatch = inputText.includes(keyword);
          break;
      }
      
      if (isMatch) {
        matched.push({ 
          id: rule.id, keyword: rule.keyword, reply_text: rule.reply_text, 
          match_type: rule.match_type, delay_min: rule.delay_min, delay_max: rule.delay_max,
          cooldown: rule.cooldown, scope: rule.scope
        });
      }
    }
    
    res.json({ success: true, matched, count: matched.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取机器人全局开关状态
router.get('/status', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM auth_state WHERE key = 'bot_enabled'").get() as any;
    const enabled = row ? Number(row.value) === 1 : true;
    res.json({ success: true, enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 设置机器人全局开关
router.put('/status', (req, res) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) {
      res.status(400).json({ error: '缺少 enabled 参数' });
      return;
    }
    const val = enabled ? 1 : 0;
    db.prepare("INSERT OR REPLACE INTO auth_state (key, value) VALUES ('bot_enabled', ?)").run(String(val));
    console.log(`[Bot] Global toggle: ${enabled ? 'ON' : 'OFF'}`);
    res.json({ success: true, enabled: !!enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
