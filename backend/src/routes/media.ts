import { Router, type IRouter } from 'express';
import { telegramService } from '../services/telegram.js';
import { Api } from 'telegram/index.js';

const router: IRouter = Router();

// In-memory media cache (key: chatId_msgId_type → Buffer)
const mediaCache = new Map<string, { buffer: Buffer; mime: string }>();
const MAX_CACHE = 100;

// Download queue with concurrency limit
let activeDownloads = 0;
const MAX_CONCURRENT = 2;
const downloadQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

function acquireDownload(): Promise<void> {
  if (activeDownloads < MAX_CONCURRENT) {
    activeDownloads++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    downloadQueue.push({ resolve: () => { activeDownloads++; resolve(); }, reject });
  });
}

function releaseDownload() {
  activeDownloads--;
  if (downloadQueue.length > 0 && activeDownloads < MAX_CONCURRENT) {
    const next = downloadQueue.shift()!;
    next.resolve();
  }
}

// Download media file
router.get('/:chatId/:msgId/:type', async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const msgId = parseInt(req.params.msgId);
    const mediaType = req.params.type;
    const cacheKey = `${chatId}_${msgId}_${mediaType}`;

    // Check cache first
    const cached = mediaCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Media-Cache', 'HIT');
      res.send(cached.buffer);
      return;
    }

    if (!telegramService.isReady || !(telegramService as any).client) {
      res.status(503).json({ error: 'Not connected' });
      return;
    }

    // Wait for download slot (with 15s timeout)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Download queue timeout')), 15000)
    );
    try {
      await Promise.race([acquireDownload(), timeoutPromise]);
    } catch {
      res.status(503).json({ error: 'Server busy, try again later' });
      return;
    }

    try {
      const client = (telegramService as any).client!;

      const messages = await client.getMessages(BigInt(chatId), {
        ids: [new Api.InputMessageID({ id: msgId })],
      });

      const msg = messages[0] as Api.Message;
      if (!msg || !msg.media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      const buffer = await client.downloadMedia(msg, { workers: 1 }) as Buffer;
      if (!buffer) {
        res.status(404).json({ error: 'Download failed' });
        return;
      }

      // Determine MIME type
      let mime = 'application/octet-stream';
      if (mediaType === 'photo') {
        mime = 'image/jpeg';
      } else if (msg.media instanceof Api.MessageMediaDocument) {
        const doc = msg.media.document;
        if (doc instanceof Api.Document && doc.mimeType) {
          mime = doc.mimeType;
        }
      }

      // Cache result (evict oldest if over limit)
      if (mediaCache.size >= MAX_CACHE) {
        const firstKey = mediaCache.keys().next().value;
        if (firstKey) mediaCache.delete(firstKey);
      }
      mediaCache.set(cacheKey, { buffer, mime });

      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Media-Cache', 'MISS');
      res.send(buffer);
    } finally {
      releaseDownload();
    }
  } catch (err: any) {
    console.error('[Media] Download error:', err.message);
    res.status(500).json({ error: 'Download failed' });
  }
});


// Get avatar photo for a chat/user
router.get('/avatar/:chatId', async (req: any, res: any) => {
  const chatId = parseInt(req.params.chatId);
  try {
    const buffer = await telegramService.getAvatar(chatId);
    if (!buffer) {
      return res.status(404).json({ error: 'No avatar' });
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
