import Avatar from '../components/Avatar';

interface SettingsPageProps {
  user: any;
  onLogout: () => void;
}

export default function SettingsPage({ user, onLogout }: SettingsPageProps) {
  const name = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'
    : 'User';

  const AVATAR_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  const avatarColor = user ? AVATAR_COLORS[user.id % AVATAR_COLORS.length] : '#2AABEE';

  return (
    <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Profile header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex flex-col items-center">
          <Avatar name={name} color={avatarColor} size={80} />
          <h2 className="mt-3 font-semibold text-lg text-gray-900">{name}</h2>
          {user?.username && (
            <p className="text-sm text-gray-500">@{user.username}</p>
          )}
          {user?.phone && (
            <p className="text-sm text-gray-500 mt-1">{user.phone}</p>
          )}
        </div>
      </div>

      {/* Settings menu */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Account
          </div>

          <div className="px-3 py-2">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">个人信息</p>
                <p className="text-xs text-gray-500">{name}</p>
              </div>
            </div>

            {user?.phone && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">手机号</p>
                  <p className="text-xs text-gray-500">{user.phone}</p>
                </div>
              </div>
            )}

            {user?.username && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">用户名</p>
                  <p className="text-xs text-gray-500">@{user.username}</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 mt-2 pt-2">
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              General
            </div>
            <div className="px-3">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">外观</p>
                  <p className="text-xs text-gray-500">浅色主题</p>
                </div>
              </div>

              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">通知</p>
                  <p className="text-xs text-gray-500">已开启</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 mt-2 pt-2 px-3 pb-4">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-medium">退出登录</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
