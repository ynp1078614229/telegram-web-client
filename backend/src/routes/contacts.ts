import { Router, type Router as RouterType } from 'express';
import { telegramService } from '../services/telegram.js';
import { authMiddleware } from '../middleware/auth.js';

const router: RouterType = Router();

// Get contacts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const contacts = await telegramService.getContacts();
    res.json({ success: true, contacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get contacts' });
  }
});

export default router;
