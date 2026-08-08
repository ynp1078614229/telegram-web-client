import { useState, useEffect, useRef } from 'react';
import type { Chat, Message } from '../types';
import Avatar from './Avatar';
import { formatMessageTime, formatDateSeparator } from '../utils/format';

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  onSendMessage: (text: string, replyToMsgId?: number) => void;
  onLoadMore: () => void;
  user: any;
}

export default function ChatWindow({ chat, messages, loading, onSendMessage, onLoadMore, user }: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [chat?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    if (messagesContainerRef.current.scrollTop === 0 && messages.length > 0) {
      prevScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
      onLoadMore();
    }
  };

  const handleSend = () => {
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
  };

  // No chat selected
  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center chat-bg">
        <div className="text-center text-gray-500">
          <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-lg font-medium">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  const chatName = chat.type === 'private'
    ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || 'Unknown'
    : chat.title || 'Unknown';

  // Group messages by date
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
      {/* Chat header */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
        <Avatar
          name={chatName}
          color={chat.avatarColor}
          size={36}
        />
        <div className="ml-3">
          <h2 className="font-medium text-gray-900 text-sm">{chatName}</h2>
          <p className="text-xs text-gray-500">
            {chat.type === 'private' ? 'online' : chat.type === 'supergroup' ? 'supergroup' : chat.type}
          </p>
        </div>
      </div>

      {/* Messages area */}
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
                {/* Date separator */}
                <div className="flex justify-center my-3">
                  <span className="bg-black/10 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                    {group.date}
                  </span>
                </div>
                {/* Messages */}
                {group.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    chatType={chat.type}
                    onReply={() => setReplyTo(msg)}
                  />
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="flex-1 border-l-2 border-primary pl-3">
            <p className="text-xs text-primary font-medium">
              {replyTo.senderName || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">{replyTo.text}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <button className="text-gray-400 hover:text-gray-600 p-2 shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
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
  onReply: () => void;
}

function MessageBubble({ message, chatType, onReply }: MessageBubbleProps) {
  const isOut = message.isOut;
  const showSender = !isOut && (chatType === 'group' || chatType === 'supergroup');

  return (
    <div className={`flex mb-1 ${isOut ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`relative max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm ${
          isOut
            ? 'bg-tg-bubble-out text-gray-900'
            : 'bg-tg-bubble-in text-gray-900'
        }`}
      >
        {/* Reply quote */}
        {message.replyToText && (
          <div className="border-l-2 border-primary/50 pl-2 mb-1 bg-black/5 rounded-r-md py-1 px-2">
            <p className="text-xs text-primary font-medium truncate">{message.replyToSender || 'User'}</p>
            <p className="text-xs text-gray-500 truncate">{message.replyToText}</p>
          </div>
        )}

        {/* Sender name */}
        {showSender && message.senderName && (
          <p className="text-xs font-medium text-primary mb-0.5">{message.senderName}</p>
        )}

        {/* Message type indicator */}
        {message.type !== 'text' && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-sm">
              {message.type === 'photo' && '📷'}
              {message.type === 'video' && '🎥'}
              {message.type === 'document' && '📎'}
              {message.type === 'voice' && '🎤'}
              {message.type === 'sticker' && '🏷️'}
            </span>
            <span className="text-xs text-gray-500">{message.text}</span>
          </div>
        )}

        {/* Text content */}
        {message.type === 'text' && message.text && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        )}

        {/* Time and read status */}
        <div className={`flex items-center gap-1 justify-end mt-0.5 ${isOut ? '' : ''}`}>
          <span className="text-[10px] text-gray-400">
            {formatMessageTime(message.timestamp)}
          </span>
          {isOut && (
            <span className={`text-[10px] ${message.isRead ? 'text-primary' : 'text-gray-400'}`}>
              {message.isRead ? '✓✓' : '✓'}
            </span>
          )}
        </div>

        {/* Reply button on hover */}
        <button
          onClick={onReply}
          className="absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full shadow-md p-1 hover:bg-gray-50"
          style={{ [isOut ? 'left' : 'right']: '-8px' }}
        >
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
