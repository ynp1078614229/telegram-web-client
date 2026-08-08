const BASE_URL = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`Server returned non-JSON response (status: ${res.status}). Backend may be unavailable.`);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  auth: {
    sendCode: (phone: string) =>
      request<{ success: boolean; phoneCodeHash: string }>('/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    verifyCode: (phone: string, code: string, phoneCodeHash: string) =>
      request<{ success: boolean; user?: any; needs2FA?: boolean }>('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone, code, phoneCodeHash }),
      }),
    verify2FA: (password: string) =>
      request<{ success: boolean; user: any }>('/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    qrLogin: () =>
      request<{ success: boolean; token: string; qrUrl: string; expires: number }>('/auth/qr-login', {
        method: 'POST',
      }),
    qrCheck: () =>
      request<{ success: boolean; user?: any; error?: string }>('/auth/qr-check', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    check: () =>
      request<{ authorized: boolean; user?: any }>('/auth/check'),
    logout: () =>
      request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },
  chats: {
    getAll: () =>
      request<{ success: boolean; chats: any[] }>('/chats'),
    getMessages: (chatId: number, offset = 0, limit = 50) =>
      request<{ success: boolean; messages: any[] }>(`/chats/${chatId}/messages?offset=${offset}&limit=${limit}`),
    sendMessage: (chatId: number, text: string, replyToMsgId?: number) =>
      request<{ success: boolean; message: any }>(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, replyToMsgId }),
      }),
    deleteMessage: (chatId: number, messageId: number) =>
      request<{ success: boolean }>(`/chats/${chatId}/messages/${messageId}`, {
        method: 'DELETE',
      }),
    editMessage: (chatId: number, messageId: number, text: string) =>
      request<{ success: boolean; message: any }>(`/chats/${chatId}/messages/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ text }),
      }),
    sendMedia: (chatId: number, file: File, caption?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (caption) formData.append('caption', caption);
      return fetch(`/api/chats/${chatId}/media`, {
        method: 'POST',
        body: formData,
      }).then(r => r.json());
    },
    getUserStatus: (userId: number) =>
      request<{ success: boolean; online: boolean; lastSeen?: string }>(`/chats/user/${userId}/status`),
    forwardMessage: (fromChatId: number, toChatId: number, messageId: number) =>
      request<{ success: boolean; message: any }>(`/chats/${toChatId}/forward/${fromChatId}/${messageId}`, {
        method: 'POST',
      }),
    getMembers: (chatId: number) =>
      request<{ success: boolean; members: any[] }>(`/chats/${chatId}/members`),
    togglePin: (chatId: number, pinned: boolean) =>
      request<{ success: boolean }>(`/chats/${chatId}/toggle-pin`, {
        method: 'POST',
        body: JSON.stringify({ pinned }),
      }),
    markRead: (chatId: number) =>
      request<{ success: boolean }>(`/chats/${chatId}/mark-read`, {
        method: 'POST',
      }),
    createGroup: (title: string, userIds: number[]) =>
      request<{ success: boolean; chat: any }>('/chats/create-group', {
        method: 'POST',
        body: JSON.stringify({ title, userIds }),
      }),
  },
  contacts: {
    getAll: () =>
      request<{ success: boolean; contacts: any[] }>('/contacts'),
  },
  bot: {
    getRules: () => request<{ success: boolean; rules: any[] }>('/bot/rules'),
    createRule: (keyword: string, match_type: string, reply_text: string, is_active?: boolean, delay_min?: number, delay_max?: number, cooldown?: number, scope?: string) =>
      request<{ success: boolean; rule: any }>('/bot/rules', {
        method: 'POST',
        body: JSON.stringify({ keyword, match_type, reply_text, is_active, delay_min, delay_max, cooldown, scope }),
      }),
    updateRule: (id: number, data: { keyword?: string; match_type?: string; reply_text?: string; is_active?: boolean; delay_min?: number; delay_max?: number; cooldown?: number; scope?: string }) =>
      request<{ success: boolean; rule: any }>(`/bot/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteRule: (id: number) =>
      request<{ success: boolean }>(`/bot/rules/${id}`, { method: 'DELETE' }),
    getLogs: () => request<{ success: boolean; logs: any[] }>('/bot/logs'),
    clearLogs: () => request<{ success: boolean }>('/bot/logs', { method: 'DELETE' }),
    testMatch: (text: string) =>
      request<{ success: boolean; matched: any[]; count: number }>('/bot/test', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    getStatus: () =>
      request<{ success: boolean; enabled: boolean }>('/bot/status'),
    setStatus: (enabled: boolean) =>
      request<{ success: boolean; enabled: boolean }>('/bot/status', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
  },
};
