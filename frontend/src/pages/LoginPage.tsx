import { useState, useEffect, useCallback } from 'react';


import QRCode from 'qrcode';


import { api } from '../services/api';





interface LoginPageProps {


  onLoginSuccess: (user: any) => void;


}





type LoginMode = 'phone' | 'qr';





export default function LoginPage({ onLoginSuccess }: LoginPageProps) {


  const [mode, setMode] = useState<LoginMode>('phone');


  const [phone, setPhone] = useState('+');


  const [code, setCode] = useState('');


  const [phoneCodeHash, setPhoneCodeHash] = useState('');


  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');


  const [password, setPassword] = useState('');


  const [loading, setLoading] = useState(false);


  const [error, setError] = useState('');


  const [qrData, setQrData] = useState<string>('');


  const [qrImage, setQrImage] = useState<string>('');


  const [qrToken, setQrToken] = useState<string>('');


  const [qrPolling, setQrPolling] = useState(false);

  const [qrNeeds2FA, setQrNeeds2FA] = useState(false);





  // Generate QR code locally when qrData changes


  useEffect(() => {


    if (qrData) {


      QRCode.toDataURL(qrData, { width: 200, margin: 2 })


        .then(url => setQrImage(url))


        .catch(err => console.error('QR generation failed:', err));


    } else {


      setQrImage('');


    }


  }, [qrData]);





  const handleSendCode = async () => {


    if (!phone || phone.length < 5) {


      setError('Please enter a valid phone number');


      return;


    }


    setLoading(true);


    setError('');


    try {


      const res = await api.auth.sendCode(phone);


      setPhoneCodeHash(res.phoneCodeHash);


      setStep('code');


    } catch (err: any) {


      setError(err.message || 'Failed to send code');


    }


    setLoading(false);


  };





  const handleVerifyCode = async () => {


    if (!code || code.length < 3) {


      setError('Please enter the verification code');


      return;


    }


    setLoading(true);


    setError('');


    try {


      const res = await api.auth.verifyCode(phone, code, phoneCodeHash);


      if (res.success && res.user) {


        onLoginSuccess(res.user);


      } else if (res.needs2FA) {


        setStep('2fa');


        setError('');


      }


    } catch (err: any) {


      setError(err.message || 'Verification failed');


    }


    setLoading(false);


  };





  const handleVerify2FA = async () => {


    if (!password) {


      setError('Please enter your 2FA password');


      return;


    }


    setLoading(true);


    setError('');


    try {


      const res = await api.auth.verify2FA(password);


      if (res.success && res.user) {


        onLoginSuccess(res.user);


      }


    } catch (err: any) {


      setError(err.message || 'Password verification failed');


    }


    setLoading(false);


  };





  const startQRLogin = useCallback(async () => {


    try {


      const res = await api.auth.qrLogin();


      if (res.success) {


        setQrData(res.qrUrl);


        setQrToken(res.token);


        setQrPolling(true);


      }


    } catch (err: any) {


      setError(err.message || 'Failed to generate QR code');


    }


  }, []);





  useEffect(() => {


    if (mode === 'qr' && !qrPolling && !qrNeeds2FA) {


      startQRLogin();


    }


  }, [mode, qrPolling, qrNeeds2FA, startQRLogin]);





  useEffect(() => {


    if (!qrPolling || !qrToken) return;


    const interval = setInterval(async () => {


      try {


        const res = await api.auth.qrCheck();


        if (res.success && res.user) {


          setQrPolling(false);


          onLoginSuccess(res.user);


        } else if (res.needs2FA) {
          setQrPolling(false);
          setQrNeeds2FA(true);
        }


      } catch (err: any) {


        // Only regenerate QR when token actually expired, not on transient errors


        if (err.message && err.message.includes('QR_EXPIRED')) {


          console.log('[QR] Token expired, regenerating...');


          startQRLogin();


        } else {


          // Connection error or timeout - keep same QR code, will retry next interval


          console.log('[QR] Check failed (will retry):', err.message);


        }


      }


    }, 3000);


    return () => clearInterval(interval);


  }, [qrPolling, qrToken, onLoginSuccess, startQRLogin]);





  return (


    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">


      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">


        {/* Logo */}


        <div className="flex flex-col items-center mb-8">


          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-4">


            <svg viewBox="0 0 24 24" className="w-10 h-10 text-white fill-current">


              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.99-1.74 6.65-2.89 7.99-3.44 3.81-1.58 4.6-1.86 5.12-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/>


            </svg>


          </div>


          <h1 className="text-2xl font-bold text-gray-800">Telegram Web</h1>


          <p className="text-gray-500 text-sm mt-1">登录你的账号</p>


        </div>





        {/* Mode tabs */}


        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">


          <button


            onClick={() => { setMode('phone'); setStep('phone'); setError(''); }}


            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${


              mode === 'phone' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'


            }`}


          >


            Phone Number


          </button>


          <button


            onClick={() => { setMode('qr'); setError(''); setQrPolling(false); setQrNeeds2FA(false); setPassword(''); }}


            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${


              mode === 'qr' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'


            }`}


          >


            QR Code


          </button>


        </div>





        {error && (


          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">


            {error}


          </div>


        )}





        {/* Phone login - step 1: enter phone */}


        {mode === 'phone' && step === 'phone' && (


          <div className="space-y-4">


            <div>


              <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>


              <input


                type="tel"


                value={phone}


                onChange={(e) => setPhone(e.target.value)}


                placeholder="+手机号"


                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"


                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}


              />


            </div>


            <button


              onClick={handleSendCode}


              disabled={loading}


              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"


            >


              {loading ? 'Sending...' : 'Send Code'}


            </button>


          </div>


        )}





        {/* Phone login - step 2: enter code */}


        {mode === 'phone' && step === 'code' && (


          <div className="space-y-4">


            <div>


              <label className="block text-sm font-medium text-gray-700 mb-1">


                Verification Code


              </label>


              <p className="text-xs text-gray-500 mb-2">


                Code sent to {phone}


                <button onClick={() => setStep('phone')} className="text-primary ml-2 hover:underline">


                  Change number


                </button>


              </p>


              <input


                type="text"


                value={code}


                onChange={(e) => setCode(e.target.value)}


                placeholder="Enter code"


                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center text-lg tracking-widest"


                maxLength={6}


                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}


                autoFocus


              />


            </div>


            <button


              onClick={handleVerifyCode}


              disabled={loading}


              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"


            >


              {loading ? 'Verifying...' : 'Verify'}


            </button>


          </div>


        )}





        {/* Phone login - step 3: 2FA password */}


        {mode === 'phone' && step === '2fa' && (


          <div className="space-y-4">


            <div>


              <label className="block text-sm font-medium text-gray-700 mb-1">


                两步验证密码


              </label>


              <p className="text-xs text-gray-500 mb-2">


                你的账号启用了两步验证，请输入密码


              </p>


              <input


                type="password"


                value={password}


                onChange={(e) => setPassword(e.target.value)}


                placeholder="输入两步验证密码"


                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center text-lg tracking-widest"


                onKeyDown={(e) => e.key === 'Enter' && handleVerify2FA()}


                autoFocus


              />


            </div>


            <button


              onClick={handleVerify2FA}


              disabled={loading}


              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"


            >


              {loading ? 'Verifying...' : 'Verify Password'}


            </button>


          </div>


        )}





                {/* QR Code login - 2FA password */}
        {mode === 'qr' && qrNeeds2FA && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                两步验证密码
              </label>
              <p className="text-xs text-gray-500 mb-2">
                你的账号启用了两步验证，请输入密码完成登录
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入两步验证密码"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center text-lg tracking-widest"
                onKeyDown={(e) => e.key === 'Enter' && handleVerify2FA()}
                autoFocus
              />
            </div>
            <button
              onClick={handleVerify2FA}
              disabled={loading}
              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Password'}
            </button>
            <button
              onClick={() => { setQrNeeds2FA(false); setError(''); setPassword(''); startQRLogin(); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              返回二维码登录
            </button>
          </div>
        )}

{/* QR Code login */}


        {mode === 'qr' && !qrNeeds2FA && (


          <div className="qr-container">


            <div className="w-64 h-64 bg-gray-100 rounded-xl flex items-center justify-center mb-4 border-2 border-gray-200">


              {qrImage ? (


                <div className="text-center p-4">


                  <div className="w-48 h-48 mx-auto bg-white rounded-lg flex items-center justify-center border">


                    <img


                      src={qrImage}


                      alt="QR Code"


                      className="w-44 h-44"


                    />


                  </div>


                </div>


              ) : (


                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />


              )}


            </div>


            <p className="text-gray-600 text-sm text-center">


              打开 Telegram 扫描此二维码登录


            </p>


            {qrPolling && (


              <p className="text-primary text-xs mt-2 animate-pulse text-center">


                等待扫描...


              </p>


            )}


          </div>


        )}


      </div>


    </div>


  );


}


