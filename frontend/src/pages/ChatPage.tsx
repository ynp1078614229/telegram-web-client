import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getSocket, disconnectSocket } from '../services/socket';
import type { Chat, Message, Contact } from '../types';
import Sidebar from '../components/Sidebar';
import { Link } from 'react-router-dom';
import ChatWindow from '../components/ChatWindow';
import ErrorBoundary from '../components/ErrorBoundary';
import ContactsPage from './ContactsPage';
import GroupsPage from './GroupsPage';
import SettingsPage from './SettingsPage';
import BotSettingsPage from './BotSettingsPage';

interface ChatPageProps {
  user: any;
  onLogout: () => void;
}

type NavTab = 'chats' | 'contacts' | 'groups' | 'settings' | 'bot';

export default function ChatPage({ user, onLogout }: ChatPageProps) {
  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadChats(); }, []);
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on('new-message', (data: { chat?: Chat; message: Message }) => {
      const isIncoming = !data.message.isOut;
      const isOtherChat = data.message.chatId !== selectedChatId;
      if (data.message.chatId === selectedChatId) {
        setMessages((prev) => [...prev, data.message]);
      }
      if (data.chat) {
        setChats((prev) => {
          const existing = prev.find((c) => c.id === data.chat!.id);
          if (existing) {
            const merged = { ...existing, lastMessage: data.chat!.lastMessage || existing.lastMessage, lastMessageTime: data.chat!.lastMessageTime || existing.lastMessageTime, unreadCount: isIncoming && isOtherChat ? (existing.unreadCount || 0) + 1 : existing.unreadCount };
            if (isIncoming && isOtherChat) { const f = prev.filter((c) => c.id !== data.chat!.id); return [merged, ...f]; }
            return prev.map((c) => c.id === data.chat!.id ? merged : c);
          }
          const f = prev.filter((c) => c.id !== data.chat!.id);
          return [data.chat!, ...f];
        });
      }
      if (isIncoming && isOtherChat && 'Notification' in window && Notification.permission === 'granted') {
        const chatName = data.chat?.title || `${data.chat?.firstName || ''} ${data.chat?.lastName || ''}`.trim() || '新消息';
        const msgText = data.message.text || (data.message.mediaUrl ? '📷 图片' : '新消息');
        try {
          const notif = new Notification(chatName, { body: msgText.length > 100 ? msgText.slice(0, 100) + '...' : msgText, icon: '/favicon.ico', tag: `chat-${data.message.chatId}` });
          notif.onclick = () => { window.focus(); handleSelectChat(data.message.chatId); notif.close(); };
        } catch (e) { console.error('Notification error:', e); }
      }
    });
    socket.on('chat-update', (data: { chat?: Chat; chats?: Chat[] }) => {
      if (data.chats && data.chats.length > 0) { setChats(data.chats); }
      else if (data.chat) { setChats((prev) => prev.map((c) => c.id === data.chat!.id ? { ...c, ...data.chat! } : c)); }
    });
    socket.on('message-read', (data: { chatId: number; messageId: number }) => {
      setMessages((prev) => prev.map((m) => m.id === data.messageId && m.chatId === data.chatId ? { ...m, isRead: true } : m));
    });
    socket.on('message-deleted', (data: { chatId: number; messageId: number }) => {
      if (data.chatId === selectedChatId) { setMessages((prev) => prev.filter((m) => m.id !== data.messageId)); }
    });
    socket.on('connect', () => { loadChats(); });
    socket.on('message-edited', (data: { chatId: number; message: Message }) => {
      if (data.chatId === selectedChatId) { setMessages((prev) => prev.map((m) => m.id === data.message.id ? data.message : m)); }
    });
    return () => { socket.off('new-message'); socket.off('chat-update'); socket.off('message-read'); socket.off('message-deleted'); socket.off('connect'); socket.off('message-edited'); };
  }, [selectedChatId]);

  const loadChats = async () => { setLoadingChats(true); try { const res = await api.chats.getAll(); setChats(res.chats); } catch (err) { console.error('Failed to load chats:', err); } setLoadingChats(false); };
  const loadMessages = async (chatId: number, offset = 0) => { setLoadingMessages(true); try { const res = await api.chats.getMessages(chatId, offset); if (offset === 0) { setMessages(res.messages); } else { setMessages((prev) => [...res.messages, ...prev]); } api.chats.markRead(chatId).catch(() => {}); } catch (err) { console.error('Failed to load messages:', err); } setLoadingMessages(false); };
  const handleSelectChat = (chatId: number) => { setSelectedChatId(chatId); setMessages([]); loadMessages(chatId); setShowMobileChat(true); setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0, isRead: true } : c))); };
  const handleSendMessage = async (text: string, replyToMsgId?: number) => { if (!selectedChatId) return; try { const res = await api.chats.sendMessage(selectedChatId, text, replyToMsgId); if (res.message) { setMessages((prev) => [...prev, res.message]); setChats((prev) => prev.map((c) => c.id === selectedChatId ? { ...c, lastMessage: text, lastMessageTime: Date.now() } : c)); } } catch (err) { console.error('Failed to send message:', err); } };
  const handleDeleteMessage = async (messageId: number) => { if (!selectedChatId) return; try { await api.chats.deleteMessage(selectedChatId, messageId); setMessages((prev) => prev.filter((m) => m.id !== messageId)); } catch (err) { console.error('Failed to delete message:', err); } };
  const handleEditMessage = async (messageId: number, newText: string) => { if (!selectedChatId) return; try { const res = await api.chats.editMessage(selectedChatId, messageId, newText); if (res.message) { setMessages((prev) => prev.map((m) => m.id === messageId ? res.message : m)); } } catch (err) { console.error('Failed to edit message:', err); } };
  const handleSendMedia = async (file: File, caption?: string) => { if (!selectedChatId) return; try { const res = await api.chats.sendMedia(selectedChatId, file, caption); if (res.error) { alert('发送失败: ' + res.error); return; } if (res.message) { setMessages((prev) => [...prev, res.message]); setChats((prev) => prev.map((c) => c.id === selectedChatId ? { ...c, lastMessage: res.message.text || '📷 媒体文件', lastMessageTime: Date.now() } : c)); } } catch (err: any) { alert('发送失败: ' + (err.message || '未知错误')); } };
  const handleLoadMore = () => { if (!selectedChatId) return; loadMessages(selectedChatId, messages.length); };
  const handleTogglePin = async (chatId: number, pinned: boolean) => { try { await api.chats.togglePin(chatId, pinned); setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pinned } : c))); } catch (err) { console.error('Failed to toggle pin:', err); } };
  const handleBack = () => { setShowMobileChat(false); setSelectedChatId(null); };

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const tabs = [
    { key: 'chats' as const, icon: ChatIcon, label: '聊天' },
    { key: 'contacts' as const, icon: ContactIcon, label: '联系人' },
    { key: 'groups' as const, icon: GroupIcon, label: '群组' },
    { key: 'settings' as const, icon: SettingsIcon, label: '设置' },
    { key: 'bot' as const, icon: () => <span className="text-lg"></span>, label: '机器人' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'contacts': return <ContactsPage onChatSelect={(id) => { setActiveTab('chats'); handleSelectChat(id); }} />;
      case 'groups': return <GroupsPage onChatSelect={(id) => { setActiveTab('chats'); handleSelectChat(id); }} onRefreshChats={loadChats} />;
      case 'settings': return <SettingsPage user={user} onLogout={onLogout} />;
      case 'bot': return <BotSettingsPage />;
      default: return (
        <div className="flex flex-1 h-full overflow-hidden">
          <div className={showMobileChat ? 'hidden md:flex' : 'flex'}>
            <Sidebar chats={chats} selectedChatId={selectedChatId} loading={loadingChats} onSelectChat={handleSelectChat} onTogglePin={handleTogglePin} />
          </div>
          <div className={showMobileChat ? "flex flex-1 min-w-0" : "hidden md:flex md:flex-1 md:min-w-0"}>
            <ErrorBoundary>
              <ChatWindow chat={selectedChat || null} messages={messages} loading={loadingMessages} onSendMessage={handleSendMessage} onDeleteMessage={handleDeleteMessage} onEditMessage={handleEditMessage} onSendMedia={handleSendMedia} onLoadMore={handleLoadMore} user={user} onBack={handleBack} />
            </ErrorBoundary>
          </div>
        </div>
      );
    }
  };

  // 手机端进入聊天时隐藏底部tab栏
  const showTabBar = !showMobileChat || activeTab !== 'chats';

  return (
    <div className="h-[100dvh] flex flex-col bg-tg-bg">
      {/* 主内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {renderContent()}
      </div>

      {/* 底部 Tab 栏 - 手机端底部固定，桌面端隐藏 */}
      {showTabBar && (
        <div
          className="md:hidden bg-white border-t border-gray-200 flex items-center justify-around shrink-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setShowMobileChat(false); }}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 min-w-[56px] transition-all ${
                activeTab === tab.key
                  ? 'text-primary'
                  : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <tab.icon />
              <span className="text-[10px] leading-tight">{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>; }
function ContactIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 0 014 0zM7 10a2 2 0 11-4 0 2 0 014 0z" /></svg>; }
function GroupIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>; }
function SettingsIcon() { return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
