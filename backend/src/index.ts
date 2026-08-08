import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import contactRoutes from './routes/contacts.js';
import mediaRoutes from './routes/media.js';
import botRoutes from './routes/bot.js';
import { telegramService } from './services/telegram.js';

const PORT = parseInt(process.env.BACKEND_PORT || '3001');

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/bot', botRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', authorized: telegramService.isReady });
});

// Catch-all for /api/* routes - return JSON instead of HTML 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

// Set IO reference in telegram service
telegramService.setIO(io);

// Start server
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[Server] Backend running on port ${PORT}`);

  // Initialize Telegram client
  try {
    await telegramService.init();
  } catch (err) {
    console.error('[Server] Failed to init Telegram client:', err);
  }
});
