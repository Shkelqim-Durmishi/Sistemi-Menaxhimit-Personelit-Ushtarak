import { Router } from 'express';
import argon2 from 'argon2';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import geoip from 'geoip-lite';

import User from '../models/User';
import { env } from '../config/env';
import { requireAuth, requireRole, AuthUserPayload } from '../middleware/auth';
import LoginAudit from '../models/LoginAudit';
import { sendSecurityAlert } from '../utils/sendEmail';

const r = Router();

// maksimumi tentativave të dështuara
const MAX_FAILED_LOGINS = 5;

// prag për “shumë tentativa të dështuara” (p.sh. 3)
const FAILED_WARNING_THRESHOLD = 3;

// vendet nga lejohet login (p.sh. vetëm Kosovë: XK)
const ALLOWED_LOGIN_COUNTRIES = ['XK'];

// normalizim i expiresIn
function normalizeExpires(v: string): SignOptions['expiresIn'] {
  if (/^\d+$/.test(v)) return Number(v);
  return v as unknown as SignOptions['expiresIn'];
}

// merr IP e klientit
function getClientIp(req: any): string {
  const xf = req.headers['x-forwarded-for'] as string | undefined;
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return (req.socket?.remoteAddress as string) || req.ip || '';
}

// kontrollo nëse IP është lokale / private (dev, LAN)
function isPrivateOrLocalIp(ip: string | undefined | null): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;

  // hiq prefix-in për IPv6 mapped IPv4, p.sh. ::ffff:192.168.0.1
  const clean = ip.startsWith('::ffff:') ? ip.substring(7) : ip;

  return (
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('172.16.') ||
    clean.startsWith('172.17.') ||
    clean.startsWith('172.18.') ||
    clean.startsWith('172.19.') ||
    clean.startsWith('172.20.') ||
    clean.startsWith('172.21.') ||
    clean.startsWith('172.22.') ||
    clean.startsWith('172.23.') ||
    clean.startsWith('172.24.') ||
    clean.startsWith('172.25.') ||
    clean.startsWith('172.26.') ||
    clean.startsWith('172.27.') ||
    clean.startsWith('172.28.') ||
    clean.startsWith('172.29.') ||
    clean.startsWith('172.30.') ||
    clean.startsWith('172.31.')
  );
}

/* =====================
      LOGIN
===================== */

r.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ code: 'VALIDATION_ERROR', message: 'username & password required' });
  }

  const ip = getClientIp(req);

  // 0️⃣ GEO-BLOCK: nëse IP nuk është lokale/private → kontrollo vendin
  if (!isPrivateOrLocalIp(ip)) {
    const geo = ip ? geoip.lookup(ip) : null;
    const country = geo?.country ?? 'UNKNOWN';

    if (!ALLOWED_LOGIN_COUNTRIES.includes(country)) {
      // dërgo email adminit
      if (env.ADMIN_EMAIL) {
        try {
          await sendSecurityAlert(
            env.ADMIN_EMAIL,
            '⛔ Tentim kyçje nga vend i paautorizuar',
            `
              <h2>Tentim kyçje i bllokuar (GEO-BLOCK)</h2>
              <p>U detektua një tentim kyçje nga një vend që nuk lejohet.</p>
              <ul>
                <li><b>Username (i dhënë):</b> ${username}</li>
                <li><b>IP:</b> ${ip || 'e panjohur'}</li>
                <li><b>Vend (Geo-IP):</b> ${country}</li>
                <li><b>Koha:</b> ${new Date().toLocaleString()}</li>
              </ul>
            `.trim()
          );
        } catch (e) {
          console.error('❌ Dështoi dërgimi i email-it (geo-block):', e);
        }
      }

      return res.status(403).json({
        code: 'GEO_BLOCKED',
        message: 'Kyçja nuk lejohet nga vendi juaj.',
      });
    }
  }

  const user = await User.findOne({ username });

  // 1️⃣ Username nuk ekziston → dërgo email adminit
  if (!user) {
    if (env.ADMIN_EMAIL) {
      try {
        await sendSecurityAlert(
          env.ADMIN_EMAIL,
          '⚠️ Tentim kyçje me username të panjohur',
          `
            <h2>Tentim kyçje i dyshimtë</h2>
            <p>U detektua një tentim kyçje me username që <b>NUK</b> ekziston në sistem.</p>
            <ul>
              <li><b>Username:</b> ${username}</li>
              <li><b>IP:</b> ${ip || 'e panjohur'}</li>
              <li><b>Koha:</b> ${new Date().toLocaleString()}</li>
            </ul>
          `.trim()
        );
      } catch (e) {
        console.error('❌ Dështoi dërgimi i email-it (unknown username):', e);
      }
    }

    return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  }

  // kontrolli i bllokimit
  const uAny: any = user;

  if (uAny.isBlocked) {
    // (opsionale) email kur provon dikush me user të bllokuar
    if (env.ADMIN_EMAIL) {
      try {
        await sendSecurityAlert(
          env.ADMIN_EMAIL,
          '⚠️ Tentim kyçje me përdorues të bllokuar',
          `
            <h2>Tentim kyçje me user të bllokuar</h2>
            <ul>
              <li><b>Username:</b> ${user.username}</li>
              <li><b>IP:</b> ${ip || 'e panjohur'}</li>
              <li><b>Arsye bllokimi:</b> ${uAny.blockReason || '—'}</li>
              <li><b>Koha:</b> ${new Date().toLocaleString()}</li>
            </ul>
          `.trim()
        );
      } catch (e) {
        console.error('❌ Dështoi dërgimi i email-it (blocked user login try):', e);
      }
    }

    return res.status(423).json({
      code: 'USER_BLOCKED',
      message:
        uAny.blockReason ||
        'Ky përdorues është bllokuar. Ju lutem kontaktoni administratorin.',
    });
  }

  const valid = await argon2.verify(user.passwordHash, password);

  if (!valid) {
    // 2️⃣ Password i gabuar → rrit count, dërgo email nëse arrin pragun
    uAny.failedLoginCount = (uAny.failedLoginCount ?? 0) + 1;
    uAny.lastFailedLoginAt = new Date();

    let justBlocked = false;

    if (uAny.failedLoginCount >= MAX_FAILED_LOGINS) {
      uAny.isBlocked = true;
      uAny.blockReason = 'Too many failed login attempts';
      justBlocked = true;
    }

    await user.save();

    // 2a) Nqs sapo kalon pragun (p.sh. 3 tentativa të dështuara) → email
    if (!justBlocked && uAny.failedLoginCount === FAILED_WARNING_THRESHOLD && env.ADMIN_EMAIL) {
      try {
        await sendSecurityAlert(
          env.ADMIN_EMAIL,
          '⚠️ Shumë tentativa të dështuara për kyçje',
          `
            <h2>Tentativa të shumta kyçjeje me password të gabuar</h2>
            <ul>
              <li><b>Username:</b> ${user.username}</li>
              <li><b>Tentativa të dështuara:</b> ${uAny.failedLoginCount}</li>
              <li><b>IP e fundit:</b> ${ip || 'e panjohur'}</li>
              <li><b>Koha e fundit:</b> ${new Date().toLocaleString()}</li>
            </ul>
          `.trim()
        );
      } catch (e) {
        console.error('❌ Dështoi dërgimi i email-it (failed attempts threshold):', e);
      }
    }

    // 3️⃣ Nëse sapo u bllokua → email i veçantë
    if (justBlocked && env.ADMIN_EMAIL) {
      try {
        await sendSecurityAlert(
          env.ADMIN_EMAIL,
          '⛔ Përdoruesi u bllokua (shumë tentativa të dështuara)',
          `
            <h2>Përdoruesi u bllokua</h2>
            <ul>
              <li><b>Username:</b> ${user.username}</li>
              <li><b>IP e fundit:</b> ${ip || 'e panjohur'}</li>
              <li><b>Tentativa të dështuara gjithsej:</b> ${uAny.failedLoginCount}</li>
              <li><b>Koha:</b> ${new Date().toLocaleString()}</li>
            </ul>
          `.trim()
        );
      } catch (e) {
        console.error('❌ Dështoi dërgimi i email-it (user blocked):', e);
      }

      return res.status(423).json({
        code: 'USER_BLOCKED',
        message:
          'Ky përdorues u bllokua për shkak të shumë tentativave të dështuara. Kontaktoni ADMIN.',
      });
    }

    return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  }

  // kontrolli i kontratës
  const now = new Date();

  if (!uAny.neverExpires) {
    if (uAny.contractValidFrom && now < uAny.contractValidFrom) {
      return res.status(403).json({
        code: 'CONTRACT_NOT_ACTIVE_YET',
        message: 'Ky përdorues nuk ka ende kontratë aktive.',
      });
    }

    if (uAny.contractValidTo && now > uAny.contractValidTo) {
      return res.status(403).json({
        code: 'CONTRACT_EXPIRED',
        message: 'Kontrata e këtij përdoruesi ka skaduar.',
      });
    }
  }

  // 4️⃣ Kontrollo IP të RE për këtë user (s’ka pasur login me këtë IP më herët)
  if (env.ADMIN_EMAIL) {
    try {
      const existingFromThisIp = await LoginAudit.findOne({
        userId: user._id,
        ip,
      }).lean();

      if (!existingFromThisIp) {
        await sendSecurityAlert(
          env.ADMIN_EMAIL,
          'ℹ️ Kyçje nga IP e re',
          `
            <h2>Kyçje nga një IP e re për përdoruesin</h2>
            <ul>
              <li><b>Username:</b> ${user.username}</li>
              <li><b>IP e re:</b> ${ip || 'e panjohur'}</li>
              <li><b>Koha:</b> ${new Date().toLocaleString()}</li>
            </ul>
          `.trim()
        );
      }
    } catch (e) {
      console.error('❌ Dështoi kontrolli / emaili për IP të re:', e);
    }
  }

  // NUK e ndalojmë login-in kur mustChangePassword = true.
  // Frontend-i (Login.tsx) e lexon user.mustChangePassword dhe hap hapin 2 për ndryshim password-i.

  // login i suksesshëm → reset statistikat
  uAny.lastLogin = new Date();
  uAny.failedLoginCount = 0;
  uAny.lastFailedLoginAt = null;
  await user.save();

  // përgatisim payload
  const payload: AuthUserPayload = {
    id: String(user._id),
    username: user.username,
    role: user.role as any,
    unitId: user.unitId ? String(user.unitId) : null,
  };

  const secret: Secret = env.JWT_SECRET;
  const token = jwt.sign(payload, secret, { expiresIn: normalizeExpires(env.JWT_EXPIRES) });

  // audit LOGIN
  try {
    await LoginAudit.create({
      userId: user._id,
      username: user.username,
      role: user.role,
      unitId: user.unitId ?? null,
      type: 'LOGIN',
      ip,
      userAgent: req.headers['user-agent'] || '',
    });
  } catch (e) {
    console.error('LoginAudit error (LOGIN):', e);
  }

  // kthejmë edhe mustChangePassword + kontratën
  res.json({
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      unitId: user.unitId ?? null,
      mustChangePassword: uAny.mustChangePassword ?? false,
      contractValidFrom: uAny.contractValidFrom ?? null,
      contractValidTo: uAny.contractValidTo ?? null,
      neverExpires: uAny.neverExpires ?? true,
    },
  });
});

/* =====================
      LOGOUT
===================== */

r.post('/logout', requireAuth, async (req: any, res) => {
  const user = req.user as AuthUserPayload | undefined;

  if (user) {
    try {
      await LoginAudit.create({
        userId: user.id,
        username: user.username,
        role: user.role,
        unitId: user.unitId ?? null,
        type: 'LOGOUT',
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
      });
    } catch (e) {
      console.error('LoginAudit error (LOGOUT):', e);
    }
  }

  return res.json({ ok: true });
});

/* =====================
   CHANGE PASSWORD (me token)
===================== */

r.post('/change-password', requireAuth, async (req: any, res) => {
  const me = req.user as AuthUserPayload;
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'currentPassword & newPassword required',
    });
  }

  const user = await User.findById(me.id);
  if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

  const ok = await argon2.verify(user.passwordHash, currentPassword);
  if (!ok) return res.status(401).json({ code: 'INVALID_CURRENT_PASSWORD' });

  // ❗ MOS LEJO FJALËKALIM TË RI TË NJËJTË ME TË VJETRIN
  const sameAsOld = await argon2.verify(user.passwordHash, newPassword);
  if (sameAsOld) {
    return res.status(400).json({
      code: 'PASSWORD_REUSE_NOT_ALLOWED',
      message: 'Fjalëkalimi i ri nuk mund të jetë i njëjtë me fjalëkalimin aktual.',
    });
  }

  user.passwordHash = await argon2.hash(newPassword);
  (user as any).mustChangePassword = false;

  await user.save();

  return res.json({ ok: true });
});

/* =====================
   CHANGE PASSWORD FIRST LOGIN (pa token)
===================== */

/**
 * POST /api/auth/change-password-first
 * Body: { username: string, oldPassword: string, newPassword: string }
 *
 * Për user-at e rinj/ të resetuar që kanë mustChangePassword = true.
 */
r.post('/change-password-first', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body ?? {};

  if (!username || !oldPassword || !newPassword) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'username, oldPassword & newPassword required',
    });
  }

  const user = await User.findOne({ username });
  if (!user) {
    // mos zbulo shumë – njësoj si invalid credentials
    return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  }

  const uAny: any = user;

  // nëse është i bllokuar, mos lejo
  if (uAny.isBlocked) {
    return res.status(423).json({
      code: 'USER_BLOCKED',
      message:
        uAny.blockReason ||
        'Ky përdorues është bllokuar. Ju lutem kontaktoni administratorin.',
    });
  }

  // duhet realisht të ketë mustChangePassword = true
  if (!uAny.mustChangePassword) {
    return res.status(400).json({
      code: 'NOT_REQUIRED',
      message:
        'Ky përdorues nuk e ka të shënuar që duhet ta ndryshojë fjalëkalimin në hyrjen e parë.',
    });
  }

  // verifiko password-in e vjetër (atë që ia ka dhënë admini)
  const okOld = await argon2.verify(user.passwordHash, oldPassword);
  if (!okOld) {
    return res.status(401).json({
      code: 'INVALID_OLD_PASSWORD',
      message: 'Fjalëkalimi i vjetër nuk është i saktë.',
    });
  }

  // ❗ MOS LEJO ME PËRDOR TË NJËJTIN PASSWORD QË KA DHËNË ADMINI
  const sameAsOld = await argon2.verify(user.passwordHash, newPassword);
  if (sameAsOld) {
    return res.status(400).json({
      code: 'PASSWORD_REUSE_NOT_ALLOWED',
      message:
        'Fjalëkalimi i ri nuk mund të jetë i njëjtë me fjalëkalimin e vjetër që ju është dhënë nga administratori.',
    });
  }

  // opsionale: mundesh me kontrollu edhe kontratën këtu
  const now = new Date();

  if (!uAny.neverExpires) {
    if (uAny.contractValidFrom && now < uAny.contractValidFrom) {
      return res.status(403).json({
        code: 'CONTRACT_NOT_ACTIVE_YET',
        message: 'Ky përdorues nuk ka ende kontratë aktive.',
      });
    }

    if (uAny.contractValidTo && now > uAny.contractValidTo) {
      return res.status(403).json({
        code: 'CONTRACT_EXPIRED',
        message: 'Kontrata e këtij përdoruesi ka skaduar.',
      });
    }
  }

  // vendos password-in e ri, hiq mustChangePassword
  user.passwordHash = await argon2.hash(newPassword);
  uAny.mustChangePassword = false;
  uAny.failedLoginCount = 0;
  uAny.lastFailedLoginAt = null;

  await user.save();

  return res.json({ ok: true });
});

/* =====================
      REGISTER (ADMIN)
===================== */

r.post(
  '/register',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const {
      username,
      password,
      role,
      unitId,
      contractValidFrom,
      contractValidTo,
      neverExpires,
      mustChangePassword,
    } = req.body ?? {};

    if (!username || !password || !role) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'username, password & role required',
      });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ code: 'USERNAME_EXISTS' });

    const passwordHash = await argon2.hash(password);

    // kontrata
    let contractFromDate: Date | null = null;
    let contractToDate: Date | null = null;
    let neverExp = true;

    if (typeof neverExpires === 'boolean') {
      neverExp = neverExpires;
    }

    if (contractValidFrom) {
      const d = new Date(contractValidFrom);
      if (!isNaN(d.getTime())) contractFromDate = d;
    }

    if (contractValidTo) {
      const d = new Date(contractValidTo);
      if (!isNaN(d.getTime())) contractToDate = d;
    }

    // krijojmë user-in
    const u: any = await User.create({
      username,
      passwordHash,
      role,
      unitId: unitId || null,
      isBlocked: false,
      blockReason: '',
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      contractValidFrom: contractFromDate,
      contractValidTo: contractToDate,
      neverExpires: neverExp,
      mustChangePassword: !!mustChangePassword,
    });

    res.status(201).json({
      id: u._id,
      username: u.username,
      role: u.role,
      unitId: u.unitId ?? null,
    });
  }
);

export default r;