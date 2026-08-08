import type { Request, Response, NextFunction } from 'express';
import { telegramService } from '../services/telegram.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (telegramService.isReady) {
    next();
  } else {
    res.status(401).json({ error: 'Not authorized' });
  }
}
