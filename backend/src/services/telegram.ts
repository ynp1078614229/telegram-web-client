import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { computeCheck } from 'telegram/Password.js';
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
  qrNeeds2fa: boolean = false;
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

  private async ensureClient(): Promise<void> {
    if (!this.client) {
      const session = new StringSession('');
      this.client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 5, useWSS: true });
      await this.client.connect();
    }
  }

  async sendCode(phone: string): Promise<{ phoneCodeHash: string }> {
    await this.ensureClient();
    const result = await this.client!.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );
    return { phoneCodeHash: result.phoneCodeHash };
  }

  async verifyCode(phone: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; needs2FA: boolean }> {
    await this.ensureClient();
    try {
      await this.client!.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      );
      await this.onAuthorized();
      return { success: true, needs2FA: false };
    } catch (err: any) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        console.log('[Auth] 2FA required for phone:', phone);
        return { success: false, needs2FA: true };
      }
      throw err;
    }
  }

  async verify2FA(password: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    try {
      const pwdResult = await this.client.invoke(new Api.account.GetPassword());
      console.log('[Auth] Got password SRP info, srpId:', pwdResult.srpId?.toString());
      const inputCheck = await computeCheck(pwdResult, password);
      const result = await this.client.invoke(
        new Api.auth.CheckPassword({ password: inputCheck })
      );
      console.log('[Auth] 2FA check result type:', result.className);
      if (result instanceof Api.auth.Authorization) {
        await this.onAuthorized();
        return true;
      }
      throw new Error('Unexpected 2FA result: ' + result.className);
    } catch (err: any) {
      console.error('[Auth] 2FA verify error:', err.errorMessage || err.message);
      if (err.errorMessage === 'PASSWORD_HASH_INVALID') {
        throw new Error('密码错误，请重新输入');
      }
      throw err;
    }
  }

  async getQRCode(): Promise<{ token: Buffer; expires: number }> {
    this.qrNeeds2fa = false;
    // Disconnect any existing client
    if (this.client) {
      try { await this.client.disconnect(); } catch {}
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
      const tokenData = Buffer.from(JSON.stringify({
        token: result.token.toString('base64url'),
        expires: result.expires,
        qrUrl,
      }));
      return { token: tokenData, expires: result.expires };
    }
    throw new Error('Unexpected QR login result');
  }

  async checkQRLogin(): Promise<boolean | 'expired' | 'need_2fa'> {
    if (!this.client) {
      console.log('[Auth] checkQR: client is null');
      return false;
    }
    if (this.qrNeeds2fa) {
      return 'need_2fa';
    }
    try {
      const result = await this.client.invoke(
        new Api.auth.ExportLoginToken({
          apiId: API_ID,
          apiHash: API_HASH,
          exceptIds: [],
        })
      );
      console.log('[Auth] ExportLoginToken check result:', result.className);

      if (result instanceof Api.auth.LoginTokenSuccess) {
        if (result.authorization instanceof Api.auth.Authorization) {
          console.log('[Auth] QR login success!');
          await this.onAuthorized();
          return true;
        }
        console.log('[Auth] QR LoginTokenSuccess but unexpected authorization type:', (result.authorization as any)?.className);
        return false;
      } else if (result instanceof Api.auth.LoginToken) {
        console.log('[Auth] QR login still waiting for scan...');
        return false;
      } else if (result instanceof Api.auth.LoginTokenMigrateTo) {
        console.log('[Auth] QR login needs DC migration to DC', result.dcId);
        
        // Use GramJS built-in _switchDC to migrate client to the target DC
        await (this.client as any)._switchDC(result.dcId);
        console.log('[Auth] Switched to DC', result.dcId, ', now importing token...');
        
        // Now import the login token on the correct DC
        const importResult = await this.client.invoke(
          new Api.auth.ImportLoginToken({ token: result.token })
        );
        console.log('[Auth] ImportLoginToken result:', (importResult as any).className);
        
        if (importResult instanceof Api.auth.LoginTokenSuccess) {
          if (importResult.authorization instanceof Api.auth.Authorization) {
            console.log('[Auth] QR login success after DC migration!');
            await this.onAuthorized();
            return true;
          }
        }
        
        console.log('[Auth] ImportLoginToken unexpected result type');
        return false;
      }
      
      console.log('[Auth] Unexpected QR result type:', (result as any).className);
      return false;
    } catch (err: any) {
      const msg = err.errorMessage || err.message || String(err);
      console.log('[Auth] QR check error:', msg);
      if (msg.includes('SESSION_PASSWORD_NEEDED')) {
        console.log('[Auth] Account has 2FA enabled, needs password');
        this.qrNeeds2fa = true;
        return 'need_2fa';
      }
      if (msg.includes('TOKEN_EXPIRED')) {
        console.log('[Auth] QR token expired');
        return 'expired';
      }
      console.log('[Auth] Non-fatal error, keeping same QR:', msg);
      return false;
    }
  }

  async onAuthorized(): Promise<void> {
    if (!this.client) return;
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
        
        const existing = db.prepare("SELECT id FROM messages WHERE id = ?").get(msg.id);
        if (existing) {
          const chat = this.mapChat(chatEntity, msg);
          const message = await this.mapMessage(msg, chatId);
          this.upsertChat(chat);
          db.prepare("UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?")
            .run(message.text, message.timestamp, chatId);
          return;
        }

        const chat = this.mapChat(chatEntity, msg);
        const message = await this.mapMessage(msg, chatId);

        this.upsertChat(chat);
        this.insertMessage(message);

        const isOutgoing = msg.out === true;
        if (!isOutgoing) {
          db.prepare('UPDATE chats SET unread_count = unread_count + 1, is_read = 0 WHERE id = ?').run(chatId);
          const row = db.prepare('SELECT unread_count FROM chats WHERE id = ?').get(chatId) as any;
          if (row) {
            chat.unreadCount = row.unread_count || 1;
            chat.isRead = false;
          }
          
          if (message.text) {
            const senderName = message.senderName || `${chat.firstName} ${chat.lastName}`.trim() || 'Unknown';
            let actualSenderId = chatId;
            if (chat.type !== 'private' && msg.senderId) {
              actualSenderId = Number(msg.senderId);
            }
            this.checkAutoReply(chatId, message.text, actualSenderId, senderName, chat.type || 'private').catch(err => 
              console.error('[AutoReply] Trigger error:', err)
            );
          }
        }

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

      if (chats.length > 0) { this.io?.emit('chat-update', { chats }); }
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


  /**
   * 确保 entity 已解析并缓存到 gramJS session 中。
   * 新登录的 session 缓存为空，直接用数字 ID 调 getMessages 等操作会报
   * "Could not find the input entity for PeerUser"。
   * 此方法先尝试 getEntity（走缓存），失败则通过 API 获取并缓存。
   */
  async ensureEntity(chatId: number): Promise<any> {
    if (!this.client) return null;
    try {
      // 先从缓存/API 获取 entity（gramJS 内部会缓存结果）
      const entity = await this.client.getEntity(chatId);
      if (entity) return entity;
    } catch {
      // getEntity 失败，尝试用 getInputEntity 强制解析
    }
    try {
      // 对于 private chat (peerId = userId)，通过 users.getUsers 获取
      const result = await this.client.invoke(
        new Api.users.GetUsers({
          id: [new Api.InputUser({ userId: chatId as any, accessHash: BigInt(0) as any })],
        })
      );
      if (result && result.length > 0) {
        // gramJS 会自动缓存返回的 entity
        return result[0];
      }
    } catch {
      // 最终 fallback：尝试通过 contacts 解析
    }
    try {
      const resolved = await this.client.invoke(
        new Api.contacts.ResolveUsername({ username: String(chatId) })
      );
      return resolved;
    } catch {
      console.error('[Telegram] ensureEntity: cannot resolve entity for', chatId);
      return null;
    }
  }

  // Avatar download with cache (1 hour TTL)
  private avatarCache: Map<number, { buffer: Buffer; ts: number }> = new Map();

  async getAvatar(chatId: number): Promise<Buffer | null> {
    const cached = this.avatarCache.get(chatId);
    if (cached && Date.now() - cached.ts < 3600000) return cached.buffer;
    if (!this.client) return null;
    try {
      const entity = await this.ensureEntity(chatId);
      if (!entity) return null;
      const photo = (entity as any).photo;
      if (!photo || photo.className === 'UserProfilePhotoEmpty' || photo.className === 'ChatPhotoEmpty') return null;
      const raw = await this.client.downloadProfilePhoto(entity);
      const buffer = typeof raw === "string" ? Buffer.from(raw) : raw as Buffer;
      if (buffer && buffer.length > 0) {
        this.avatarCache.set(chatId, { buffer, ts: Date.now() });
        return buffer;
      }
      return null;
    } catch (e: any) {
      console.log('[Avatar] Error for', chatId, ':', e.message);
      return null;
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

    const msgType = getMessageType(msg);
    let mediaUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let duration: number | undefined;

    if (msg.media) {
      if (msg.media instanceof Api.MessageMediaPhoto) {
        mediaUrl = `/api/media/${chatId}/${msg.id}/photo`;
      } else if (msg.media instanceof Api.MessageMediaDocument) {
        const doc = msg.media.document;
        if (doc instanceof Api.Document) {
          fileSize = Number(doc.size);
          const nameAttr = doc.attributes.find(a => a instanceof Api.DocumentAttributeFilename);
          const videoAttr = doc.attributes.find(a => a instanceof Api.DocumentAttributeVideo);
          const audioAttr = doc.attributes.find(a => a instanceof Api.DocumentAttributeAudio);
          if (nameAttr) fileName = (nameAttr as any).fileName;
          if (videoAttr) duration = (videoAttr as any).duration;
          if (audioAttr) duration = (audioAttr as any).duration;
          mediaUrl = `/api/media/${chatId}/${msg.id}/document`;
        }
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
      type: msgType,
      replyToMsgId: msg.replyTo?.replyToMsgId,
      replyToText,
      replyToSender,
      mediaUrl,
      fileName,
      fileSize,
      duration,
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
      INSERT OR REPLACE INTO messages (id, chat_id, sender_id, sender_name, text, timestamp, is_out, is_read, type, reply_to_msg_id, reply_to_text, reply_to_sender, media_url, file_name, file_size, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.chatId, msg.senderId || null, msg.senderName || '',
      msg.text, msg.timestamp, msg.isOut ? 1 : 0, msg.isRead ? 1 : 0,
      msg.type, msg.replyToMsgId || null, msg.replyToText || '', msg.replyToSender || '',
      msg.mediaUrl || '', msg.fileName || '', msg.fileSize || 0, msg.duration || 0
    );
  }

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
    const localCount = (db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE chat_id = ?").get(chatId) as any).cnt;

    if (localCount === 0 && this.client && this.isReady) {
      try {
        console.log("[Telegram] No local messages for chat", chatId, "- fetching from API");
        // 先确保 entity 已解析，避免 "Could not find the input entity" 错误
        await this.ensureEntity(chatId);
        const apiMessages = await this.client.getMessages(chatId, { limit: 50 });
        for (const msg of apiMessages) {
          try {
            const mapped = await this.mapMessage(msg as any, chatId);
            this.insertMessage(mapped);
          } catch (e) { /* skip */ }
        }
        console.log("[Telegram] Cached", apiMessages.length, "messages for chat", chatId);
      } catch (err) {
        console.error("[Telegram] Error fetching messages:", err);
        throw err;
      }
    }

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
      mediaUrl: r.media_url || (r.type === 'photo' || r.type === 'sticker' ? `/api/media/${r.chat_id}/${r.id}/photo` : (['video','document','voice'].includes(r.type) ? `/api/media/${r.chat_id}/${r.id}/document` : '')),
      fileName: r.file_name,
      fileSize: r.file_size,
      duration: r.duration,
    }));
  }

  async sendMessage(chatId: number, text: string, replyToMsgId?: number): Promise<Message | null> {
    if (!this.client || !this.isReady) throw new Error('Not authorized');

    await this.ensureEntity(chatId);
    const result = await this.client.sendMessage(chatId, {
      message: text,
      replyTo: replyToMsgId ? replyToMsgId : undefined,
    });

    const msg = result as Api.Message;
    const message = await this.mapMessage(msg, chatId);
    this.insertMessage(message);

    db.prepare(`
      UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?
    `).run(message.text, message.timestamp, chatId);

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

    await this.syncChats();
    const chats = await this.getChats();
    return chats.find((c) => c.type === 'group' || c.type === 'supergroup') || null;
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    if (!this.client || !this.isReady) throw new Error("Not authorized");
    
    await this.ensureEntity(chatId);
    await this.client.deleteMessages(chatId, [messageId], {
      revoke: true,
    });
    
    db.prepare("DELETE FROM messages WHERE id = ? AND chat_id = ?").run(messageId, chatId);
    this.io?.emit("message-deleted", { chatId, messageId });
  }

  async editMessage(chatId: number, messageId: number, newText: string): Promise<Message | null> {
    if (!this.client || !this.isReady) throw new Error("Not authorized");
    
    await this.ensureEntity(chatId);
    await this.client.editMessage(chatId, {
      message: messageId,
      text: newText,
    });
    
    db.prepare("UPDATE messages SET text = ? WHERE id = ? AND chat_id = ?").run(newText, messageId, chatId);
    
    const msg = await this.client.getMessages(chatId, { ids: [new Api.InputMessageID({ id: messageId })] });
    if (msg[0]) {
      const mapped = await this.mapMessage(msg[0] as Api.Message, chatId);
      this.io?.emit("message-edited", { chatId, message: mapped });
      return mapped;
    }
    return null;
  }

  async sendMedia(chatId: number, fileBuffer: Buffer, fileName: string, caption?: string): Promise<Message | null> {
    if (!this.client || !this.isReady) throw new Error("Not authorized");
    
    await this.ensureEntity(chatId);
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
    
    const attributes = [new Api.DocumentAttributeFilename({ fileName })];
    
    const result = await this.client.sendFile(chatId, {
      file: fileBuffer,
      caption: caption || "",
      forceDocument: !isImage,
      attributes,
    });
    
    const msg = result as Api.Message;
    const message = await this.mapMessage(msg, chatId);
    this.insertMessage(message);
    
    db.prepare("UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?")
      .run(message.text, message.timestamp, chatId);
    
    return message;
  }

  async getUserStatus(userId: number): Promise<{ online: boolean; lastSeen?: string }> {
    if (!this.client || !this.isReady) return { online: false };
    
    try {
      const user = await this.ensureEntity(userId);
      if (user instanceof Api.User && user.status) {
        if (user.status instanceof Api.UserStatusOnline) {
          return { online: true };
        } else if (user.status instanceof Api.UserStatusRecently) {
          return { online: false, lastSeen: "最近在线" };
        } else if (user.status instanceof Api.UserStatusLastWeek) {
          return { online: false, lastSeen: "一周内" };
        } else if (user.status instanceof Api.UserStatusLastMonth) {
          return { online: false, lastSeen: "一个月内" };
        } else if (user.status instanceof Api.UserStatusOffline && user.status.wasOnline) {
          const lastSeen = new Date(user.status.wasOnline * 1000);
          return { online: false, lastSeen: lastSeen.toLocaleString("zh-CN") };
        }
      }
      return { online: false };
    } catch {
      return { online: false };
    }
  }

  async forwardMessage(fromChatId: number, toChatId: number, messageId: number): Promise<Message | null> {
    if (!this.client || !this.isReady) throw new Error("Not authorized");
    
    await this.ensureEntity(fromChatId);
    await this.ensureEntity(toChatId);
    const result = await this.client.forwardMessages(toChatId, {
      messages: [messageId],
      fromPeer: fromChatId,
    });
    
    if (result[0]) {
      const msg = result[0] as Api.Message;
      const message = await this.mapMessage(msg, toChatId);
      this.insertMessage(message);
      return message;
    }
    return null;
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
    this.io?.emit('chat-update', { chat: { id: chatId, unreadCount: 0, isRead: true } as any });
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

  async checkAutoReply(chatId: number, text: string, senderId: number, senderName: string, chatType: string): Promise<void> {
    if (!this.client || !this.isReady || !text) return;
    
    const botRow = db.prepare("SELECT value FROM auth_state WHERE key = 'bot_enabled'").get() as any;
    if (botRow && Number(botRow.value) !== 1) return;
    
    try {
      const rules = db.prepare('SELECT * FROM auto_replies WHERE is_active = 1 ORDER BY priority DESC').all() as any[];
      const now = Math.floor(Date.now() / 1000);
      const matched: any[] = [];
      
      for (const rule of rules) {
        const scopes = (rule.scope || 'private').split(',');
        const isBoth = scopes.includes('both');
        if (chatType === 'private' && !isBoth && !scopes.includes('private')) continue;
        if ((chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') && !isBoth && !scopes.includes('group')) continue;
        
        if (this.matchRule(rule, text)) {
          if (rule.cooldown > 0) {
            const cdRow = db.prepare('SELECT last_replied_at FROM auto_reply_cooldowns WHERE rule_id = ? AND user_id = ?').get(rule.id, senderId) as any;
            if (cdRow && (now - cdRow.last_replied_at) < rule.cooldown) {
              console.log(`[AutoReply] Rule ${rule.id} skipped: cooldown for user ${senderId}`);
              continue;
            }
          }
          matched.push(rule);
        }
      }
      
      if (matched.length === 0) return;
      
      // 按优先级排序，取最高优先级的规则，同优先级随机选一条
      matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const maxPriority = matched[0].priority || 0;
      const topRules = matched.filter(r => (r.priority || 0) === maxPriority);
      const rule = topRules[Math.floor(Math.random() * topRules.length)];
      
      // 模板变量替换
      const replyText = this.processTemplate(rule.reply_text, {
        name: senderName,
        keyword: rule.keyword,
        input: text,
      });
      
      console.log(`[AutoReply] Matched rule ${rule.id} (priority=${rule.priority}): "${rule.keyword}" -> ${chatType === 'private' ? 'reply in chat' : 'DM user'} ${senderId}`);
      
      const dMin = rule.delay_min || 0;
      const dMax = rule.delay_max || 0;
      let delay = 0;
      if (dMax > dMin) {
        delay = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;
      } else if (dMin > 0) {
        delay = dMin;
      }
      
      const doReply = async () => {
        try {
          if (chatType === 'private') {
            await this.client!.sendMessage(chatId, { message: replyText });
          } else {
            await this.client!.sendMessage(senderId, { message: replyText });
            console.log(`[AutoReply] Sent DM to user ${senderId} (triggered from group ${chatId})`);
          }
          
          db.prepare('UPDATE auto_replies SET match_count = match_count + 1 WHERE id = ?').run(rule.id);
          
          if (rule.cooldown > 0) {
            db.prepare('INSERT OR REPLACE INTO auto_reply_cooldowns (rule_id, user_id, last_replied_at) VALUES (?, ?, ?)').run(rule.id, senderId, now);
          }
          
          db.prepare(`
            INSERT INTO auto_reply_logs (rule_id, from_user_id, from_user_name, keyword, reply_text)
            VALUES (?, ?, ?, ?, ?)
          `).run(rule.id, senderId, senderName, rule.keyword, replyText);
        } catch (sendErr) {
          console.error('[AutoReply] Send error:', sendErr);
        }
      };
      
      if (delay > 0) {
        console.log(`[AutoReply] Delaying ${delay}s before reply`);
        setTimeout(doReply, delay * 1000);
      } else {
        await doReply();
      }
    } catch (err) {
      console.error('[AutoReply] Error:', err);
    }
  }

  // 多关键词匹配（支持 any/all 模式）
  private matchRule(rule: any, inputText: string): boolean {
    const keywords = rule.keyword.split(/[,，]/).map((k: string) => k.trim().toLowerCase()).filter(Boolean);
    const text = inputText.toLowerCase();
    if (keywords.length === 0) return false;
    
    const matchMode = rule.match_mode || 'any';
    
    if (matchMode === 'all') {
      return keywords.every((kw: string) => this.matchSingle(rule.match_type, text, kw));
    } else {
      return keywords.some((kw: string) => this.matchSingle(rule.match_type, text, kw));
    }
  }

  private matchSingle(matchType: string, text: string, keyword: string): boolean {
    switch (matchType) {
      case 'exact': return text === keyword;
      case 'starts': return text.startsWith(keyword);
      case 'ends': return text.endsWith(keyword);
      case 'regex':
        try { return new RegExp(keyword).test(text); } catch { return false; }
      case 'contains':
      default: return text.includes(keyword);
    }
  }

  // 模板变量替换
  private processTemplate(template: string, vars: { name: string; keyword: string; input: string }): string {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let result = template;
    
    // {random:选项1|选项2|选项3}
    result = result.replace(/\{random:([^}]+)\}/g, (_, options) => {
      const opts = options.split('|').map((o: string) => o.trim());
      return opts[Math.floor(Math.random() * opts.length)];
    });
    
    // 基础变量
    result = result.replace(/\{name\}/g, vars.name || '朋友');
    result = result.replace(/\{keyword\}/g, vars.keyword);
    result = result.replace(/\{input\}/g, vars.input);
    result = result.replace(/\{time\}/g, now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    result = result.replace(/\{date\}/g, now.toLocaleDateString('zh-CN'));
    result = result.replace(/\{weekday\}/g, '星期' + weekdays[now.getDay()]);
    
    return result;
  }
}

export const telegramService = new TelegramService();
