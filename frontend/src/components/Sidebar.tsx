import { useState } from 'react';
import type { Chat } from '../types';
import Avatar from './Avatar';
import { formatTime } from '../utils/format';

interface SidebarProps {
  chats: Chat[];
  selectedChatId: number | null;
  loading: boolean;
  onSelectChat: (chatId: number) => void;
  onTogglePin: (chatId: number, pinned: boolean) => void;
  onBotClick?: () => void;
}

export default function Sidebar({ chats, selectedChatId, loading, onSelectChat, onTogglePin, onBotClick }: SidebarProps) {
  const [search, setSearch] = useState('');

  const filteredChats = chats.filter((chat) => {
    const name = chat.title || `${chat.firstName || ''} ${chat.lastName || ''}`.trim();
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col shrink-0 h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索聊天..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="skeleton w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">暂无聊天</p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isSelected={chat.id === selectedChatId}
              onClick={() => onSelectChat(chat.id)}
              onTogglePin={() => onTogglePin(chat.id, !chat.pinned)}
            />
          ))
        )}
      
</div>
    </div>
  );
}

interface ChatItemProps {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
  onTogglePin: () => void;
}

function ChatItem({ chat, isSelected, onClick, onTogglePin }: ChatItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const name = chat.type === 'private'
    ? `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || '未知'
    : chat.title || '未知';

  return (
    <div
      className={`relative flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(!showMenu);
      }}
    >
      <Avatar
        name={name}
        color={chat.avatarColor}
        size={48}
        online={false}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 text-sm truncate">
            {chat.type !== 'private' && (
              <span className="text-gray-400 mr-1">
                {chat.type === 'supergroup' ? '📢' : chat.type === 'channel' ? '📣' : '👥'}
              </span>
            )}
            {name}
          </span>
          <span className="text-xs text-gray-400 shrink-0 ml-2">
            {chat.lastMessageTime ? formatTime(chat.lastMessageTime) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-gray-500 truncate pr-2">
            {chat.lastMessage || '暂无消息'}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {chat.pinned && (
              <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3a1 1 0 011 1v4.586l2.707 2.707a1 1 0 01-1.414 1.414L10 10.414l-2.293 2.293a1 1 0 01-1.414-1.414L9 8.586V4a1 1 0 011-1z" />
                <path fillRule="evenodd" d="M3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
            {chat.unreadCount > 0 && (
              <span className="bg-primary text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-full z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[150px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
                setShowMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {chat.pinned ? '取消置顶' : '置顶'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
