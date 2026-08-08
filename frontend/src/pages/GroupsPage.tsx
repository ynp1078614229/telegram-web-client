import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Chat, Contact } from '../types';
import Avatar from '../components/Avatar';

interface GroupsPageProps {
  onChatSelect: (chatId: number) => void;
  onRefreshChats: () => void;
}

export default function GroupsPage({ onChatSelect, onRefreshChats }: GroupsPageProps) {
  const [groups, setGroups] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await api.chats.getAll();
      setGroups(res.chats.filter((c) => c.type === 'group' || c.type === 'supergroup'));
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
    setLoading(false);
  };

  return (
    <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Groups</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors"
        >
          + New Group
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="skeleton w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-2/3 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm">No groups yet</p>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              onClick={() => onChatSelect(group.id)}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <Avatar name={group.title} color={group.avatarColor} size={48} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{group.title}</p>
                <p className="text-xs text-gray-500 truncate">{group.lastMessage || 'No messages yet'}</p>
              </div>
              {group.unreadCount > 0 && (
                <span className="bg-primary text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                  {group.unreadCount}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadGroups();
            onRefreshChats();
          }}
        />
      )}
    </div>
  );
}

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const [title, setTitle] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.contacts.getAll().then((res) => setContacts(res.contacts)).catch(() => {});
  }, []);

  const toggleUser = (userId: number) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Group name is required');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Select at least one member');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.chats.createGroup(title.trim(), selectedUsers);
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Create New Group</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">群组名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入群组名称"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Members ({selectedUsers.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
              {contacts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无联系人</p>
              ) : (
                contacts.map((contact) => {
                  const name = `${contact.firstName} ${contact.lastName || ''}`.trim();
                  const isSelected = selectedUsers.includes(contact.id);
                  return (
                    <div
                      key={contact.id}
                      onClick={() => toggleUser(contact.id)}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar name={name} color={contact.avatarColor} size={32} />
                      <span className="text-sm flex-1">{name}</span>
                      {isSelected && (
                        <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
