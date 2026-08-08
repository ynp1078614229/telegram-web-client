import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import type { Server as SocketIOServer } from 'socket.io';
import db from '../db/database.js';
import type { Chat, Message, Contact, GroupMember } from '../types/index.js';

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || '';

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
];

function getAvatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

function getDisplayName(user: { firstName?: string; lastName?: string }): string {
  const parts = [user.firstName || '', user.lastName || ''].filter(Boolean);
  return parts.join(' ') || 'Unknown';
}

function getMessageText(msg: Api.Message): string {
  if (msg.message) return msg.message;
  if (msg.media) {
    if (msg.media instanceof Api.MessageMediaPhoto) return '📷 Photo';
    if (msg.media instanceof Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof Api.Document) {
        const videoAttr = doc.attributes.find(
          (a) => a instanceof Api.DocumentAttributeVideo
        );
        if (videoAttr) return '🎥 Video';
        const audioAttr = doc.attributes.find(
          (a) => a instanceof Api.DocumentAttributeAudio
        );
        if (audioAttr && audioAttr instanceof Api.DocumentAttributeAudio) {
          return audioAttr.voice ? '🎤 Voice Message' : '🎵 Audio';
        }
        const stickerAttr = doc.attributes.find(
          (a) => a instanceof Api.DocumentAttributeSticker
        );
        if (stickerAttr) return '🏷️ Sticker';
      }
      return '📎 File';
    }
  }
  return '';
}

function getMessageType(msg: Api.Message): Message['type'] {
  if (!msg.media) return 'text';
  if (msg.media instanceof Api.MessageMediaPhoto) return 'photo';
  if (msg.media instanceof Api.MessageMediaDocument) {
    const doc = msg.media.document;
    if (doc instanceof Api.Document) {
      const videoAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeVideo
      );
      if (videoAttr) return 'video';
      const audioAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeAudio
      );
      if (audioAttr && audioAttr instanceof Api.DocumentAttributeAudio) {
        return audioAttr.voice ? 'voice' : 'document';
      }
      const stickerAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeSticker
      );
      if (stickerAttr) return 'sticker';
    }
    return 'document';
  }
  return 'text';
}

class TelegramService {
  client: TelegramClient | null = null;
  sessionString: string = '';
  io: SocketIOServer | null = null;
  isReady: boolean = false;
  me: Api.User | null = null;

  constructor() {
    // Load saved session
    const row = db.prepare('SELECT value FROM auth_state WHERE key = ?').get('session') as { value: string } | undefined;
    if (row?.value) {
      this.sessionString = row.value;
    }
  }

  async init(): Promise<void> {
    const session = new StringSession(this.sessionString);
    this.client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: true,
    });

    if (this.sessionString) {
      try {
        await this.client.connect();
        if (await this.client.isUserAuthorized()) {
          this.me = await this.client.getMe();
          this.isReady = true;
          this.setupEventHandlers();
          console.log('[Telegram] Connected and authorized as', this.me?.firstName);
        }
      } catch (err) {
        console.error('[Telegram] Failed to reconnect:', err);
      }
    }
  }

  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  async sendCode(phone: string): Promise<{ phoneCodeHash: string }> {
    if (!this.client) throw new Error('Client not initialized');
    const result = await this.client.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );
    return { phoneCodeHash: result.phoneCodeHash };
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string): Promise<boolean> {
    if (!this.client) throw new Error('Client not initialized');
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      );
      await this.onAuthorized();
      return true;
    } catch (err: any) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        throw new Error('2FA required - not supported in this client');
      }
      throw err;
    }
  }

  async getQRCode(): Promise<{ token: Buffer; expires: number }> {
    if (!this.client) throw new Error('Client not initialized');
    // Disconnect any existing session for QR login
    if (this.isReady) {
      await this.client.disconnect();
      this.isReady = false;
    }

    const session = new StringSession('');
    this.client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: true,
    });
    await this.client.connect();

    const result = await this.client.invoke(
      new Api.auth.ExportLoginToken({
        apiId: API_ID,
        apiHash: API_HASH,
        exceptIds: [],
      })
    );

    if (result instanceof Api.auth.LoginToken) {
      const qrUrl = `tg://login?token=${result.token.toString('base64url')}`;
      // Generate a simple QR code representation
      const tokenData = Buffer.from(JSON.stringify({
        token: result.token.toString('base64url'),
        expires: result.expires,
        qrUrl,
      }));
      return { token: tokenData, expires: result.expires };
    }
    throw new Error('Unexpected QR login result');
  }

  async checkQRLogin(tokenData: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const data = JSON.parse(tokenData);
      const token = Buffer.from(data.token, 'base64url');

      const result = await this.client.invoke(
        new Api.auth.ImportLoginToken({ token })
      );

      if (result instanceof Api.auth.LoginTokenSuccess) {
        if (result.authorization instanceof Api.auth.Authorization) {
          // Save session
          const sessionStr = (this.client.session as any).save();
          db.prepare('INSERT OR REPLACE INTO auth_state (key, value) VALUES (?, ?)').run('session', sessionStr);
          await this.onAuthorized();
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async onAuthorized(): Promise<void> {
    if (!this.client) return;
    // Save session
    const sessionStr = (this.client.session as any).save();
    db.prepare('INSERT OR REPLACE INTO auth_state (key, value) VALUES (?, ?)').run('session', sessionStr);

    this.me = await this.client.getMe();
    this.isReady = true;
    this.sessionString = sessionStr;
    this.setupEventHandlers();
    await this.syncChats();
    await this.syncContacts();
    console.log('[Telegram] Authorized as', this.me?.firstName);
  }

  setupEventHandlers(): void {
    if (!this.client || !this.isReady) return;

    const newMessageHandler = async (event: any) => {
      try {
        const msg = event.message as Api.Message;
        if (!msg) return;

        const chatEntity = event.chat || (await msg.getChat().catch(() => null));
        if (!chatEntity) return;

        const chatId = Number(chatEntity.id);
        const chat = this.mapChat(chatEntity, msg);
        const message = await this.mapMessage(msg, chatId);

        // Update DB
        this.upsertChat(chat);
        this.insertMessage(message);

        // Emit socket events
        this.io?.emit('new-message', { chat, message });
        this.io?.emit('chat-update', { chat });
      } catch (err) {
        console.error('[Telegram] Error handling new message:', err);
      }
    };

    this.client.addEventHandler(newMessageHandler, new NewMessage({}));
  }

  async syncChats(): Promise<void> {
    if (!this.client || !this.isReady) return;

    try {
      const dialogs = await this.client.getDialogs({ limit: 100 });
      const chats: Chat[] = [];

      for (const dialog of dialogs) {
        const chat = this.mapDialog(dialog);
        chats.push(chat);
        this.upsertChat(chat);
      }

      this.io?.emit('chat-update', { chats });
    } catch (err) {
      console.error('[Telegram] Error syncing chats:', err);
    }
  }

  async syncContacts(): Promise<void> {
    if (!this.client || !this.isReady) return;

    try {
      const result = await this.client.invoke(
        new Api.contacts.GetContacts({ hash: BigInt(0) as any })
      );

      if (result instanceof Api.contacts.Contacts) {
        const contacts: Contact[] = [];
        for (const user of result.users) {
          if (user instanceof Api.User) {
            const contact: Contact = {
              id: Number(user.id),
              firstName: user.firstName || '',
              lastName: user.lastName || '',
              username: user.username || '',
              phone: user.phone || '',
              avatarColor: getAvatarColor(Number(user.id)),
              online: user.status instanceof Api.UserStatusOnline,
              lastSeen: user.status instanceof Api.UserStatusOffline
                ? String(user.status.wasOnline)
                : '',
            };
            contacts.push(contact);
          }
        }

        // Save to DB
        const insert = db.prepare(`
          INSERT OR REPLACE INTO contacts (id, first_name, last_name, username, phone, avatar_color, online, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of contacts) {
          insert.run(c.id, c.firstName, c.lastName || '', c.username || '', c.phone || '', c.avatarColor, c.online ? 1 : 0, c.lastSeen || '');
        }
      }
    } catch (err) {
      console.error('[Telegram] Error syncing contacts:', err);
    }
  }

  mapDialog(dialog: any): Chat {
    const entity = dialog.entity;
    const isUser = entity instanceof Api.User;
    const isChannel = entity instanceof Api.Channel;
    const isChat = entity instanceof Api.Chat;

    let type: Chat['type'] = 'private';
    if (isChannel) {
      type = entity.megagroup ? 'supergroup' : 'channel';
    } else if (isChat) {
      type = 'group';
    }

    const title = isUser
      ? getDisplayName({ firstName: entity.firstName, lastName: entity.lastName })
      : entity.title || 'Unknown';

    return {
      id: Number(entity.id),
      type,
      title: isUser ? '' : title,
      firstName: isUser ? (entity.firstName || '') : '',
      lastName: isUser ? (entity.lastName || '') : '',
      username: entity.username || '',
      avatarColor: getAvatarColor(Number(entity.id)),
      lastMessage: dialog.message?.message || getMessageText(dialog.message) || '',
      lastMessageTime: dialog.message?.date ? dialog.message.date * 1000 : 0,
      unreadCount: dialog.unreadCount || 0,
      pinned: dialog.pinned ? true : false,
      isRead: dialog.unreadCount === 0,
    };
  }

  mapChat(entity: any, msg?: Api.Message): Chat {
    const isUser = entity instanceof Api.User;
    const isChannel = entity instanceof Api.Channel;
    const isChat = entity instanceof Api.Chat;

    let type: Chat['type'] = 'private';
    if (isChannel) {
      type = entity.megagroup ? 'supergroup' : 'channel';
    } else if (isChat) {
      type = 'group';
    }

    const title = isUser
      ? getDisplayName({ firstName: entity.firstName, lastName: entity.lastName })
      : entity.title || 'Unknown';

    return {
      id: Number(entity.id),
      type,
      title: isUser ? '' : title,
      firstName: isUser ? (entity.firstName || '') : '',
      lastName: isUser ? (entity.lastName || '') : '',
      username: entity.username || '',
      avatarColor: getAvatarColor(Number(entity.id)),
      lastMessage: msg ? getMessageText(msg) : '',
      lastMessageTime: msg?.date ? msg.date * 1000 : Date.now(),
      unreadCount: 0,
      pinned: false,
      isRead: true,
    };
  }

  async mapMessage(msg: Api.Message, chatId: number): Promise<Message> {
    const senderId = msg.senderId ? Number(msg.senderId) : undefined;
    let senderName = '';

    if (senderId && this.client) {
      try {
        const sender = await msg.getSender();
        if (sender instanceof Api.User) {
          senderName = getDisplayName({ firstName: sender.firstName, lastName: sender.lastName });
        } else if (sender instanceof Api.Chat) {
          senderName = sender.title || '';
        } else if (sender instanceof Api.Channel) {
          senderName = sender.title || '';
        }
      } catch {
        senderName = 'Unknown';
      }
    }

    let replyToText = '';
    let replyToSender = '';
    if (msg.replyTo?.replyToMsgId) {
      try {
        const repliedMsg = await this.client!.getMessages(msg.chatId!, {
          ids: [new Api.InputMessageID({ id: msg.replyTo.replyToMsgId })],
        });
        if (repliedMsg[0]) {
          replyToText = getMessageText(repliedMsg[0] as Api.Message);
          const replySender = await repliedMsg[0].getSender().catch(() => null);
          if (replySender instanceof Api.User) {
            replyToSender = getDisplayName({ firstName: replySender.firstName, lastName: replySender.lastName });
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      id: msg.id,
      chatId,
      senderId,
      senderName,
      text: getMessageText(msg),
      timestamp: msg.date * 1000,
      isOut: msg.out || false,
      isRead: msg.out ? (msg.mentioned ? false : true) : false,
      type: getMessageType(msg),
      replyToMsgId: msg.replyTo?.replyToMsgId,
      replyToText,
      replyToSender,
    };
  }

  upsertChat(chat: Chat): void {
    db.prepare(`
      INSERT OR REPLACE INTO chats (id, type, title, first_name, last_name, username, avatar_color, last_message, last_message_time, unread_count, pinned, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      chat.id, chat.type, chat.title, chat.firstName || '', chat.lastName || '',
      chat.username || '', chat.avatarColor, chat.lastMessage || '',
      chat.lastMessageTime || 0, chat.unreadCount, chat.pinned ? 1 : 0, chat.isRead ? 1 : 0
    );
  }

  insertMessage(msg: Message): void {
    db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_id, sender_id, sender_name, text, timestamp, is_out, is_read, type, reply_to_msg_id, reply_to_text, reply_to_sender)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.chatId, msg.senderId || null, msg.senderName || '',
      msg.text, msg.timestamp, msg.isOut ? 1 : 0, msg.isRead ? 1 : 0,
      msg.type, msg.replyToMsgId || null, msg.replyToText || '', msg.replyToSender || ''
    );
  }

  // API Methods
  async getChats(): Promise<Chat[]> {
    const rows = db.prepare(`
      SELECT * FROM chats ORDER BY pinned DESC, last_message_time DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      firstName: r.first_name,
      lastName: r.last_name,
      username: r.username,
      avatarColor: r.avatar_color,
      lastMessage: r.last_message,
      lastMessageTime: r.last_message_time,
      unreadCount: r.unread_count,
      pinned: !!r.pinned,
      isRead: !!r.is_read,
    }));
  }

  async getMessages(chatId: number, offset: number = 0, limit: number = 50): Promise<Message[]> {
    const rows = db.prepare(`
      SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).all(chatId, limit, offset) as any[];

    return rows.reverse().map((r) => ({
      id: r.id,
      chatId: r.chat_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      text: r.text,
      timestamp: r.timestamp,
      isOut: !!r.is_out,
      isRead: !!r.is_read,
      type: r.type,
      replyToMsgId: r.reply_to_msg_id,
      replyToText: r.reply_to_text,
      replyToSender: r.reply_to_sender,
      mediaUrl: r.media_url,
      fileName: r.file_name,
      fileSize: r.file_size,
      duration: r.duration,
    }));
  }

  async sendMessage(chatId: number, text: string, replyToMsgId?: number): Promise<Message | null> {
    if (!this.client || !this.isReady) throw new Error('Not authorized');

    const result = await this.client.sendMessage(chatId, {
      message: text,
      replyTo: replyToMsgId ? replyToMsgId : undefined,
    });

    const msg = result as Api.Message;
    const message = await this.mapMessage(msg, chatId);
    this.insertMessage(message);

    // Update chat last message
    db.prepare(`
      UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?
    `).run(message.text, message.timestamp, chatId);

    this.io?.emit('new-message', { message });
    return message;
  }

  async getContacts(): Promise<Contact[]> {
    const rows = db.prepare('SELECT * FROM contacts ORDER BY first_name').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      username: r.username,
      phone: r.phone,
      avatarColor: r.avatar_color,
      online: !!r.online,
      lastSeen: r.last_seen,
    }));
  }

  async getGroupMembers(chatId: number): Promise<GroupMember[]> {
    if (!this.client || !this.isReady) return [];

    try {
      const result: any = await this.client.invoke(
        new Api.channels.GetParticipants({
          channel: chatId,
          filter: new Api.ChannelParticipantsRecent(),
          offset: 0,
          limit: 200,
          hash: BigInt(0) as any,
        })
      );

      if (result && result.users) {
        return result.users
          .filter((u: any) => u instanceof Api.User)
          .map((u: Api.User) => ({
            id: Number(u.id),
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            username: u.username || '',
            avatarColor: getAvatarColor(Number(u.id)),
            role: 'member' as const,
            online: u.status instanceof Api.UserStatusOnline,
          }));
      }
      return [];
    } catch (err) {
      console.error('[Telegram] Error getting group members:', err);
      return [];
    }
  }

  async createGroup(title: string, userIds: number[]): Promise<Chat | null> {
    if (!this.client || !this.isReady) throw new Error('Not authorized');

    const users = userIds.map((id) => new Api.InputUser({
      userId: id as any,
      accessHash: BigInt(0) as any,
    }));

    const result: any = await this.client.invoke(
      new Api.messages.CreateChat({
        users,
        title,
      })
    );

    if (result && result.updates) {
      // Find the chat in the updates
      for (const update of result.updates) {
        if (update instanceof Api.UpdateNewMessage && update.message instanceof Api.Message) {
          const peerId = update.message.peerId as any;
          const chatId = Number(peerId?.chatId || update.message.chatId);
          if (chatId) {
            await this.syncChats();
            const chats = await this.getChats();
            return chats.find((c) => c.id === chatId) || null;
          }
        }
      }
    }

    // Fallback: sync and return latest group
    await this.syncChats();
    const chats = await this.getChats();
    return chats.find((c) => c.type === 'group' || c.type === 'supergroup') || null;
  }

  async togglePinChat(chatId: number, pinned: boolean): Promise<void> {
    db.prepare('UPDATE chats SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, chatId);
  }

  async markChatRead(chatId: number): Promise<void> {
    db.prepare('UPDATE chats SET unread_count = 0, is_read = 1 WHERE id = ?').run(chatId);
    if (this.client && this.isReady) {
      try {
        await this.client.markAsRead(chatId);
      } catch {
        // ignore
      }
    }
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        await this.client.invoke(new Api.auth.LogOut());
      } catch {
        // ignore
      }
      await this.client.disconnect();
    }
    this.client = null;
    this.isReady = false;
    this.me = null;
    this.sessionString = '';
    db.prepare('DELETE FROM auth_state').run();
    db.prepare('DELETE FROM chats').run();
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM contacts').run();
  }

  async checkAuth(): Promise<boolean> {
    return this.isReady;
  }

  getCurrentUser(): { id: number; firstName: string; lastName?: string; username?: string; phone?: string } | null {
    if (!this.me) return null;
    return {
      id: Number(this.me.id),
      firstName: this.me.firstName || '',
      lastName: this.me.lastName || '',
      username: this.me.username || '',
      phone: this.me.phone || '',
    };
  }
}

export const telegramService = new TelegramService();
