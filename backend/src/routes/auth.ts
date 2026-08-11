import { Router, type Router as RouterType } from 'express';
import { telegramService } from '../services/telegram.js';

const router: RouterType = Router();

// Send verification code
router.post('/send-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }
    const result = await telegramService.sendCode(phone);
    res.json({ success: true, phoneCodeHash: result.phoneCodeHash });
  } catch (err: any) {
    console.error('[Auth] send-code error:', err);
    res.status(500).json({ error: err.message || 'Failed to send code' });
  }
});

// Verify code
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code, phoneCodeHash } = req.body;
    if (!phone || !code || !phoneCodeHash) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = await telegramService.verifyCode(phone, code, phoneCodeHash);
    if (result.needs2FA) {
      res.json({ success: false, needs2FA: true });
      return;
    }
    if (result.success) {
      const user = telegramService.getCurrentUser();
      res.json({ success: true, user });
    }
  } catch (err: any) {
    console.error('[Auth] verify-code error:', err);
    res.status(500).json({ error: err.message || 'Verification failed' });
  }
});

// Verify 2FA password
router.post('/verify-2fa', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }
    await telegramService.verify2FA(password);
    const user = telegramService.getCurrentUser();
    res.json({ success: true, user });
  } catch (err: any) {
    console.error('[Auth] verify-2fa error:', err);
    res.status(500).json({ error: err.message || '2FA verification failed' });
  }
});

// QR code login
router.post('/qr-login', async (req, res) => {
  try {
    const result = await telegramService.getQRCode();
    const data = JSON.parse(result.token.toString());
    res.json({
      success: true,
      token: data.token,
      qrUrl: data.qrUrl,
      expires: result.expires,
    });
  } catch (err: any) {
    console.error('[Auth] qr-login error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate QR code' });
  }
});

// Check QR login status
router.post('/qr-check', async (req, res) => {
  try {
    const result = await telegramService.checkQRLogin();
    if (result === true) {
      const user = telegramService.getCurrentUser();
      res.json({ success: true, user });
    } else if (result === 'need_2fa') {
      res.json({ success: false, needs2FA: true });
    } else if (result === 'expired') {
      // Token expired - frontend should regenerate QR
      res.status(400).json({ success: false, error: 'QR_EXPIRED' });
    } else {
      // Still waiting for scan (including TIMEOUT errors - just retry)
      res.json({ success: false });
    }
  } catch (err: any) {
    console.log('[Auth] qr-check unexpected error:', err.message);
    res.json({ success: false });
  }
});

// Check auth status
router.get('/check', async (req, res) => {
  try {
    const isAuth = await telegramService.checkAuth();
    if (isAuth) {
      const user = telegramService.getCurrentUser();
      res.json({ authorized: true, user });
    } else {
      res.json({ authorized: false });
    }
  } catch (err: any) {
    res.json({ authorized: false });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    await telegramService.logout();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Logout failed' });
  }
});

export default router;
