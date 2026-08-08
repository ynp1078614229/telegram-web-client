const BASE_URL = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // Check if response is JSON before parsing
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
      request<{ success: boolean; user: any }>('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone, code, phoneCodeHash }),
      }),
    qrLogin: () =>
      request<{ success: boolean; token: string; qrUrl: string; expires: number }>('/auth/qr-login', {
        method: 'POST',
      }),
    qrCheck: (token: string) =>
      request<{ success: boolean; user?: any }>('/auth/qr-check', {
        method: 'POST',
        body: JSON.stringify({ token }),
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
};
