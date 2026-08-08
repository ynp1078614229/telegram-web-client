import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/telegram.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: Database.Database = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'private',
    title TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    username TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#2AABEE',
    last_message TEXT DEFAULT '',
    last_message_time INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER,
    sender_name TEXT DEFAULT '',
    text TEXT DEFAULT '',
    timestamp INTEGER NOT NULL,
    is_out INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    type TEXT DEFAULT 'text',
    reply_to_msg_id INTEGER,
    reply_to_text TEXT DEFAULT '',
    reply_to_sender TEXT DEFAULT '',
    media_url TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    PRIMARY KEY (id, chat_id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    username TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#2AABEE',
    online INTEGER DEFAULT 0,
    last_seen TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS auth_state (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_chats_last_message_time ON chats(last_message_time DESC);
`);

export default db;
