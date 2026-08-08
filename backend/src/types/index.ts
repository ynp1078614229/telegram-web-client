import type { Api } from 'telegram';

export interface User {
  id: number;
  phone?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatarColor?: string;
  lastSeen?: string;
  online?: boolean;
}

export interface Chat {
  id: number;
  type: 'private' | 'group' | 'channel' | 'supergroup';
  title: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  avatarColor?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  pinned: boolean;
  isRead: boolean;
}

export interface Message {
  id: number;
  chatId: number;
  senderId?: number;
  senderName?: string;
  text: string;
  timestamp: number;
  isOut: boolean;
  isRead: boolean;
  type: 'text' | 'photo' | 'video' | 'document' | 'voice' | 'sticker' | 'system';
  replyToMsgId?: number;
  replyToText?: string;
  replyToSender?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

export interface Contact {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatarColor: string;
  online: boolean;
  lastSeen?: string;
}

export interface GroupMember {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  avatarColor: string;
  role: 'creator' | 'admin' | 'member';
  online: boolean;
}

export interface AuthState {
  phoneCodeHash?: string;
  phone?: string;
  isAuthorized: boolean;
  userId?: number;
}

export interface SendMessagePayload {
  text: string;
  replyToMsgId?: number;
}

export interface CreateGroupPayload {
  title: string;
  userIds: number[];
}
