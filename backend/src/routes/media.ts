import { Router, type IRouter } from 'express';
import { telegramService } from '../services/telegram.js';
import { Api } from 'telegram/index.js';

const router: IRouter = Router();

// Download media file
router.get('/:chatId/:msgId/:type', async (req, res) => {
  try {
    const chatId = BigInt(req.params.chatId);
    const msgId = parseInt(req.params.msgId);
    const mediaType = req.params.type;

    if (!telegramService.isReady || !(telegramService as any).client) {
      res.status(503).json({ error: 'Not connected' });
      return;
    }

    const client = (telegramService as any).client!;

    // Get the message to access its media
    const messages = await client.getMessages(chatId, {
      ids: [new Api.InputMessageID({ id: msgId })],
    });

    const msg = messages[0] as Api.Message;
    if (!msg || !msg.media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    // Download the file buffer
    const buffer = await client.downloadMedia(msg, {
      workers: 1,
    }) as Buffer;

    if (!buffer) {
      res.status(404).json({ error: 'Download failed' });
      return;
    }

    // Set content type
    if (mediaType === 'photo') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (msg.media instanceof Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof Api.Document && doc.mimeType) {
        res.setHeader('Content-Type', doc.mimeType);
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err: any) {
    console.error('[Media] Download error:', err.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
