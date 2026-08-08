import { useState, useEffect } from 'react';

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const [status, setStatus] = useState<'checking' | 'setup' | 'verify' | 'authorized'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['X-Access-Token'] = token;
      
      const res = await fetch('/api/access/status', { headers });
      const data = await res.json();
      
      if (data.needsSetup) {
        setStatus('setup');
      } else if (data.needsPassword) {
        localStorage.removeItem('access_token');
        setStatus('verify');
      } else {
        setStatus('authorized');
      }
    } catch {
      setStatus('authorized');
    }
  };

  const handleSetup = async () => {
    if (password.length < 4) { setError('密码至少4位'); return; }
    if (password !== confirmPassword) { setError('两次密码不一致'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/access/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('access_token', data.token);
        setStatus('authorized');
      } else { setError(data.error || '设置失败'); }
    } catch (err: any) { setError(err.message || '设置失败'); }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!password) { setError('请输入密码'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('access_token', data.token);
        setStatus('authorized');
      } else { setError(data.error || '验证失败'); }
    } catch (err: any) { setError(err.message || '验证失败'); }
    setLoading(false);
  };

  if (status === 'checking') {
    return (
      <div className="h-screen flex items-center justify-center bg-tg-bg">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'authorized') {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 mx-4">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">
            {status === 'setup' ? '设置访问密码' : '需要验证'}
          </h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            {status === 'setup' 
              ? '首次访问，请设置一个密码保护此应用' 
              : '新设备访问，请输入管理员密码'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={status === 'setup' ? '设置密码（至少4位）' : '输入管理员密码'}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center"
            onKeyDown={(e) => { if (e.key === 'Enter') status === 'setup' ? handleSetup() : handleVerify(); }}
            autoFocus
          />
          {status === 'setup' && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认密码"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center"
              onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
            />
          )}
          <button
            onClick={status === 'setup' ? handleSetup : handleVerify}
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? '处理中...' : status === 'setup' ? '设置并进入' : '验证'}
          </button>
        </div>
      </div>
    </div>
  );
}
