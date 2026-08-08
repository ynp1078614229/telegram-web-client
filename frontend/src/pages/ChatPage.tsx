import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { getSocket, disconnectSocket } from '../services/socket';
import type { Chat, Message, Contact } from '../types';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import ContactsPage from './ContactsPage';
import GroupsPage from './GroupsPage';
import SettingsPage from './SettingsPage';

interface ChatPageProps {
  user: any;
  onLogout: () => void;
}

type NavTab = 'chats' | 'contacts' | 'groups' | 'settings';

export default function ChatPage({ user, onLogout }: ChatPageProps) {
  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Load chats
  useEffect(() => {
    loadChats();
  }, []);

  // Socket events
  useEffect(() => {
    const socket = getSocket();

    socket.on('new-message', (data: { chat?: Chat; message: Message }) => {
      if (data.message.chatId === selectedChatId) {
        setMessages((prev) => [...prev, data.message]);
      }
      if (data.chat) {
        setChats((prev) => {
          const filtered = prev.filter((c) => c.id !== data.chat!.id);
          return [data.chat!, ...filtered];
        });
      }
    });

    socket.on('chat-update', (data: { chat?: Chat; chats?: Chat[] }) => {
      if (data.chats) {
        setChats(data.chats);
      } else if (data.chat) {
        setChats((prev) => {
          const filtered = prev.filter((c) => c.id !== data.chat!.id);
          return [data.chat!, ...filtered];
        });
      }
    });

    socket.on('message-read', (data: { chatId: number; messageId: number }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId && m.chatId === data.chatId
            ? { ...m, isRead: true }
            : m
        )
      );
    });

    return () => {
      socket.off('new-message');
      socket.off('chat-update');
      socket.off('message-read');
    };
  }, [selectedChatId]);

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const res = await api.chats.getAll();
      setChats(res.chats);
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
    setLoadingChats(false);
  };

  const loadMessages = async (chatId: number, offset = 0) => {
    setLoadingMessages(true);
    try {
      const res = await api.chats.getMessages(chatId, offset);
      if (offset === 0) {
        setMessages(res.messages);
      } else {
        setMessages((prev) => [...res.messages, ...prev]);
      }
      // Mark as read
      api.chats.markRead(chatId).catch(() => {});
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
    setLoadingMessages(false);
  };

  const handleSelectChat = (chatId: number) => {
    setSelectedChatId(chatId);
    setMessages([]);
    loadMessages(chatId);
  };

  const handleSendMessage = async (text: string, replyToMsgId?: number) => {
    if (!selectedChatId) return;
    try {
      const res = await api.chats.sendMessage(selectedChatId, text, replyToMsgId);
      if (res.message) {
        setMessages((prev) => [...prev, res.message]);
        // Update chat list
        setChats((prev) => {
          const chat = prev.find((c) => c.id === selectedChatId);
          if (!chat) return prev;
          const updated = { ...chat, lastMessage: text, lastMessageTime: Date.now() };
          const filtered = prev.filter((c) => c.id !== selectedChatId);
          return [updated, ...filtered];
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleLoadMore = () => {
    if (!selectedChatId) return;
    loadMessages(selectedChatId, messages.length);
  };

  const handleTogglePin = async (chatId: number, pinned: boolean) => {
    try {
      await api.chats.togglePin(chatId, pinned);
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, pinned } : c))
      );
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const renderContent = () => {
    switch (activeTab) {
      case 'contacts':
        return <ContactsPage onChatSelect={(id) => { setActiveTab('chats'); handleSelectChat(id); }} />;
      case 'groups':
        return <GroupsPage onChatSelect={(id) => { setActiveTab('chats'); handleSelectChat(id); }} onRefreshChats={loadChats} />;
      case 'settings':
        return <SettingsPage user={user} onLogout={onLogout} />;
      default:
        return (
          <div className="flex flex-1 h-full">
            <Sidebar
              chats={chats}
              selectedChatId={selectedChatId}
              loading={loadingChats}
              onSelectChat={handleSelectChat}
              onTogglePin={handleTogglePin}
            />
            <ChatWindow
              chat={selectedChat || null}
              messages={messages}
              loading={loadingMessages}
              onSendMessage={handleSendMessage}
              onLoadMore={handleLoadMore}
              user={user}
            />
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-tg-bg">
      {/* Top navigation */}
      <div className="bg-white border-b border-gray-200 flex items-center px-4 h-14 shrink-0">
        <div className="flex items-center gap-1">
          {[
            { key: 'chats' as const, icon: ChatIcon, label: 'Chats' },
            { key: 'contacts' as const, icon: ContactIcon, label: 'Contacts' },
            { key: 'groups' as const, icon: GroupIcon, label: 'Groups' },
            { key: 'settings' as const, icon: SettingsIcon, label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
