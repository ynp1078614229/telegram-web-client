import multer from 'multer';
import { Router, type Router as RouterType } from 'express';
import { telegramService } from '../services/telegram.js';
import { authMiddleware } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router: RouterType = Router();

// Get chat list
router.get('/', authMiddleware, async (req, res) => {
  try {
    const chats = await telegramService.getChats();
    res.json({ success: true, chats });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get chats' });
  }
});

// Get messages for a chat
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await telegramService.getMessages(chatId, offset, limit);
    res.json({ success: true, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get messages' });
  }
});

// Send message
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const { text, replyToMsgId } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }
    const message = await telegramService.sendMessage(chatId, text, replyToMsgId);
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// Get group members
router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const members = await telegramService.getGroupMembers(chatId);
    res.json({ success: true, members });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get members' });
  }
});

// Toggle pin
router.post('/:id/toggle-pin', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const { pinned } = req.body;
    await telegramService.togglePinChat(chatId, pinned);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle pin' });
  }
});

// Mark as read
router.post('/:id/mark-read', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    await telegramService.markChatRead(chatId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mark read' });
  }
});

// Create group
router.post('/create-group', authMiddleware, async (req, res) => {
  try {
    const { title, userIds } = req.body;
    if (!title || !userIds?.length) {
      res.status(400).json({ error: 'Title and at least one user are required' });
      return;
    }
    const chat = await telegramService.createGroup(title, userIds);
    res.json({ success: true, chat });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

// 删除消息
router.delete('/:chatId/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const messageId = parseInt(req.params.messageId);
    await telegramService.deleteMessage(chatId, messageId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete message' });
  }
});

// 编辑消息
router.put('/:chatId/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const messageId = parseInt(req.params.messageId);
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Message text is required' });
      return;
    }
    const message = await telegramService.editMessage(chatId, messageId, text);
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to edit message' });
  }
});

// 发送媒体文件（图片/文件）
router.post('/:id/media', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const caption = req.body.caption || '';
    const message = await telegramService.sendMedia(chatId, file.buffer, file.originalname, caption);
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send media' });
  }
});

// 获取用户在线状态
router.get('/user/:id/status', authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const status = await telegramService.getUserStatus(userId);
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get user status' });
  }
});

// 转发消息
router.post('/:toChatId/forward/:fromChatId/:messageId', authMiddleware, async (req, res) => {
  try {
    const toChatId = parseInt(req.params.toChatId);
    const fromChatId = parseInt(req.params.fromChatId);
    const messageId = parseInt(req.params.messageId);
    const message = await telegramService.forwardMessage(fromChatId, toChatId, messageId);
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to forward message' });
  }
});

export default router;
