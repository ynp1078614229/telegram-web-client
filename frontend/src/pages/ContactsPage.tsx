import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Contact } from '../types';
import Avatar from '../components/Avatar';

interface ContactsPageProps {
  onChatSelect: (chatId: number) => void;
}

export default function ContactsPage({ onChatSelect }: ContactsPageProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const res = await api.contacts.getAll();
      setContacts(res.contacts);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
    setLoading(false);
  };

  const filtered = contacts.filter((c) => {
    const name = `${c.firstName} ${c.lastName || ''}`.trim();
    return name.toLowerCase().includes(search.toLowerCase()) ||
      (c.username || '').toLowerCase().includes(search.toLowerCase());
  });

  const onlineContacts = filtered.filter((c) => c.online);
  const offlineContacts = filtered.filter((c) => !c.online);

  return (
    <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="skeleton w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-2/3 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {onlineContacts.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-primary uppercase tracking-wide">
                  Online - {onlineContacts.length}
                </div>
                {onlineContacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    onClick={() => onChatSelect(contact.id)}
                  />
                ))}
              </div>
            )}
            {offlineContacts.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Offline - {offlineContacts.length}
                </div>
                {offlineContacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    onClick={() => onChatSelect(contact.id)}
                  />
                ))}
              </div>
            )}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <p className="text-sm">No contacts found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ContactItemProps {
  contact: Contact;
  onClick: () => void;
}

function ContactItem({ contact, onClick }: ContactItemProps) {
  const name = `${contact.firstName} ${contact.lastName || ''}`.trim() || 'Unknown';

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
    >
      <Avatar name={name} color={contact.avatarColor} size={48} online={contact.online} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{name}</p>
        <p className="text-xs text-gray-500 truncate">
          {contact.online ? (
            <span className="text-green-500">在线</span>
          ) : (
            contact.lastSeen ? `最后上线 ${contact.lastSeen}` : '离线'
          )}
        </p>
      </div>
    </div>
  );
}
