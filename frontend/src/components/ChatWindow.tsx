import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from '../types';
import Avatar from './Avatar';
import { formatMessageTime, formatDateSeparator } from '../utils/format';
import { api } from '../services/api';

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  onSendMessage: (text: string, replyToMsgId?: number) => void;
  onDeleteMessage: (messageId: number) => void;
  onEditMessage: (messageId: number, newText: string) => void;
  onSendMedia: (file: File, caption?: string) => void;
  onLoadMore: () => void;
  user: any;
  onBack?: () => void;
}

export default function ChatWindow({ chat, messages, loading, onSendMessage, onDeleteMessage, onEditMessage, onSendMedia, onLoadMore, user, onBack }: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [userStatus, setUserStatus] = useState<{ online: boolean; lastSeen?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    // Scroll to bottom when switching chats (even during loading)
    scrollToBottom('auto');
    // Also scroll again after a tick in case messages are still rendering
    const timer = setTimeout(() => scrollToBottom('auto'), 100);
    return () => clearTimeout(timer);
  }, [chat?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => scrollToBottom('auto'));
    }
  }, [messages.length]);

  // 获取用户在线状态
  useEffect(() => {
    if (chat && chat.type === 'private' && chat.id) {
      api.chats.getUserStatus(chat.id).then(res => {
        if (res.success) {
          setUserStatus({ online: res.online, lastSeen: res.lastSeen });
        }
      }).catch(() => {});
    } else {
      setUserStatus(null);
    }
  }, [chat?.id]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    if (messagesContainerRef.current.scrollTop === 0 && messages.length > 0) {
      onLoadMore();
    }
  };

  const handleSend = () => {
    if (editingMessage) {
      const text = inputText.trim();
      if (!text) return;
      onEditMessage(editingMessage.id, text);
      setEditingMessage(null);
      setInputText('');
      return;
    }
    const text = inputText.trim();
    if (!text) return;
    onSendMessage(text, replyTo?.id);
    setInputText('');
    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setReplyTo(null);
      setEditingMessage(null);
      setInputText('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMedia(file);
      e.target.value = '';
    }
  };

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center chat-bg">
        <div className="text-center text-gray-500">
          <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-lg font-medium">选择一个聊天开始消息</p>
        </div>
      </div>
    );
  }

  const chatName = chat.type === 'private'
    ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || 'Unknown'
    : chat.title || 'Unknown';

  const statusText = chat.type === 'private'
    ? (userStatus?.online ? '在线' : userStatus?.lastSeen || '离线')
    : chat.type === 'supergroup' || chat.type === 'group' ? '群组' : chat.type === 'channel' ? '频道' : '';

  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const dateStr = formatDateSeparator(msg.timestamp);
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
        {onBack && (
          <button onClick={onBack} className="mr-2 md:hidden text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <Avatar name={chatName} color={chat.avatarColor} size={36} />
        <div className="ml-3">
          <h2 className="font-medium text-gray-900 text-sm">{chatName}</h2>
          <p className={`text-xs ${userStatus?.online ? 'text-primary' : 'text-gray-500'}`}>
            {statusText}
          </p>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto chat-bg px-4 py-2"
        onScroll={handleScroll}
      >
        {loading && messages.length === 0 ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className={`skeleton rounded-xl ${i % 2 === 0 ? 'w-48' : 'w-36'} h-10`} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex justify-center my-3">
                  <span className="bg-black/10 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                    {group.date}
                  </span>
                </div>
                {group.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    chatType={chat.type}
                    currentUserId={user?.id}
                    onReply={() => { setReplyTo(msg); setEditingMessage(null); setInputText(''); }}
                    onEdit={() => { setEditingMessage(msg); setReplyTo(null); setInputText(msg.text); }}
                    onDelete={() => onDeleteMessage(msg.id)}
                    onCopy={() => navigator.clipboard.writeText(msg.text || '')}
                  />
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {replyTo && !editingMessage && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="flex-1 border-l-2 border-primary pl-3 min-w-0">
            <p className="text-xs text-primary font-medium">回复 {replyTo.senderName || 'User'}</p>
            <p className="text-xs text-gray-500 truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {editingMessage && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="flex-1 border-l-2 border-yellow-500 pl-3 min-w-0">
            <p className="text-xs text-yellow-600 font-medium">编辑消息</p>
            <p className="text-xs text-gray-500 truncate">{editingMessage.text}</p>
          </div>
          <button onClick={() => { setEditingMessage(null); setInputText(''); }} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
        />
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-gray-400 hover:text-gray-600 p-2 shrink-0"
            title="发送文件"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 resize-none border-none outline-none text-sm py-2 max-h-32 overflow-y-auto"
            style={{ minHeight: '24px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="text-primary hover:text-primary-dark p-2 shrink-0 disabled:opacity-30 transition-opacity"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  chatType: string;
  currentUserId: number;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

function MessageBubble({ message, chatType, currentUserId, onReply, onEdit, onDelete, onCopy }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const isOut = message.isOut;
  const showSender = !isOut && (chatType === 'group' || chatType === 'supergroup');
  const isOwnMessage = message.senderId === currentUserId;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 200);
    setMenuPos({ x, y });
    setShowMenu(true);
  };

  const handleMenuAction = (action: () => void) => {
    action();
    setShowMenu(false);
  };

  return (
    <div
      className={`flex mb-1 ${isOut ? 'justify-end' : 'justify-start'} group`}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`relative max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm ${
          isOut ? 'bg-tg-bubble-out text-gray-900' : 'bg-tg-bubble-in text-gray-900'
        }`}
      >
        {message.replyToText && (
          <div className="border-l-2 border-primary/50 pl-2 mb-1 bg-black/5 rounded-r-md py-1 px-2 max-h-16 overflow-hidden">
            <p className="text-xs text-primary font-medium truncate">{message.replyToSender || 'User'}</p>
            <p className="text-xs text-gray-500 truncate line-clamp-2">{message.replyToText}</p>
          </div>
        )}

        {showSender && message.senderName && (
          <p className="text-xs font-medium text-primary mb-0.5">{message.senderName}</p>
        )}

        {message.type === 'photo' && message.mediaUrl && (
          <div className="mb-1">
            <img
              src={message.mediaUrl}
              alt="照片"
              className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              style={{ maxHeight: '300px', objectFit: 'cover' }}
              loading="lazy"
              onClick={() => window.open(message.mediaUrl, '_blank')}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {message.type === 'sticker' && message.mediaUrl && (
          <img src={message.mediaUrl} alt="贴纸" className="w-32 h-32 object-contain" loading="lazy" />
        )}

        {['video','document','voice'].includes(message.type) && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-sm">
              {message.type === 'video' && '🎥'}
              {message.type === 'document' && '📎'}
              {message.type === 'voice' && '🎤'}
            </span>
            <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              {message.fileName || message.type}
            </a>
          </div>
        )}

        {message.type === 'system' && (
          <p className="text-xs text-gray-400 italic text-center">{message.text}</p>
        )}

        {message.type === 'text' && message.text && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        )}

        {message.type === 'photo' && message.text && message.text !== '📷 Photo' && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        )}

        <div className="flex items-center gap-1 justify-end mt-0.5">
          <span className="text-[10px] text-gray-400">
            {formatMessageTime(message.timestamp)}
          </span>
          {isOut && (
            <span className={`text-[10px] ${message.isRead ? 'text-primary' : 'text-gray-400'}`}>
              {message.isRead ? '✓✓' : '✓'}
            </span>
          )}
        </div>

        <button
          onClick={onReply}
          className="absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full shadow-md p-1 hover:bg-gray-50"
          style={{ [isOut ? 'left' : 'right']: '-8px' }}
          title="回复"
        >
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
      </div>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              onClick={() => handleMenuAction(onReply)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              回复
            </button>
            {message.text && (
              <button
                onClick={() => handleMenuAction(onCopy)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                复制
              </button>
            )}
            {isOwnMessage && message.type === 'text' && (
              <button
                onClick={() => handleMenuAction(onEdit)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                编辑
              </button>
            )}
            {isOwnMessage && (
              <button
                onClick={() => handleMenuAction(onDelete)}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
