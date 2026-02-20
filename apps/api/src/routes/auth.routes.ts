// apps/api/src/routes/auth.routes.ts

import { Router } from 'express';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { Types } from 'mongoose';

import User from '../models/User';
import Unit from '../models/Unit';
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
// ⚠️ nëse e teston jashtë XK, ose e ke serverin në AL, shtoje edhe 'AL' ose hiqe krejt këtë kontroll.
const ALLOWED_LOGIN_COUNTRIES = ['XK'];

/* =====================
   Helpers
===================== */

function normalizeExpires(v: string): SignOptions['expiresIn'] {
  if (/^\d+$/.test(v)) return Number(v);
  return v as unknown as SignOptions['expiresIn'];
}

function getClientIp(req: any): string {
  const xf = req.headers['x-forwarded-for'] as string | undefined;
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return (req.socket?.remoteAddress as string) || req.ip || '';
}

function isPrivateOrLocalIp(ip: string | undefined | null): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;

  // IPv6 mapped IPv4
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtDate(d: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function pickUserAgent(req: any): string {
  const ua = String(req.headers?.['user-agent'] || '').trim();
  return ua || '—';
}

function toCountry(ip: string): string {
  try {
    const geo = ip ? geoip.lookup(ip) : null;
    return geo?.country ?? 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Verifikon password-in me argon2 ose bcrypt (kompatibilitet)
 */
async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  const h = String(hash || '');

  // argon2
  if (h.startsWith('$argon2')) {
    try {
      return await argon2.verify(h, plain);
    } catch {
      return false;
    }
  }

  // bcrypt
  if (h.startsWith('$2a$') || h.startsWith('$2b$') || h.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(plain, h);
    } catch {
      return false;
    }
  }

  // fallback
  try {
    const okA = await argon2.verify(h, plain);
    if (okA) return true;
  } catch { }

  try {
    const okB = await bcrypt.compare(plain, h);
    if (okB) return true;
  } catch { }

  return false;
}

type EmailBoxItem = { label: string; value: string };

function emailBox(items: EmailBoxItem[]) {
  const rows = items
    .map(
      (it) => `<tr>
          <td style="padding:6px 10px;color:#94a3b8;white-space:nowrap;"><b>${it.label}</b></td>
          <td style="padding:6px 10px;color:#0f172a;">${it.value || '—'}</td>
        </tr>`
    )
    .join('');

  return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
      <div style="background:#0b1220;color:#e2e8f0;padding:10px 14px;font-weight:700;letter-spacing:.2px;">
        🔎 Detajet e Aktivitetit
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${rows}
      </table>
    </div>
  `.trim();
}

function buildEmailHtml(opts: {
  title: string;
  intro: string;
  items: EmailBoxItem[];
  footerNote?: string;
  severity?: 'info' | 'warning' | 'danger';
}) {
  const severityColor =
    opts.severity === 'danger' ? '#b91c1c' : opts.severity === 'warning' ? '#b45309' : '#0f172a';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#0b1220;padding:26px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.25);">
      <div style="padding:18px 20px;background:#0b1220;color:#e2e8f0;">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">
          Sistemi i Menaxhimit Ushtarak
        </div>
        <div style="margin-top:6px;font-size:20px;font-weight:800;color:#ffffff;">
          ${opts.title}
        </div>
      </div>
 
      <div style="padding:20px;color:#0f172a;">
        <p style="margin:0 0 12px;line-height:1.55;">
          ${opts.intro}
        </p>
 
        ${emailBox(opts.items)}
 
        <div style="margin-top:14px;padding:12px 14px;border-left:4px solid ${severityColor};background:#f8fafc;border-radius:10px;">
          <div style="font-weight:700;margin-bottom:6px;">Udhëzim sigurie</div>
          <div style="line-height:1.55;color:#334155;">
            Nëse ky aktivitet nuk është kryer nga ju, ju rekomandojmë:
            <ul style="margin:8px 0 0 18px;">
              <li>Ndryshimin e menjëhershëm të fjalëkalimit</li>
              <li>Njoftimin e administratorit të njësisë</li>
              <li>Verifikimin e pajisjeve të autorizuara</li>
            </ul>
          </div>
        </div>
 
        ${opts.footerNote
      ? `<p style="margin:14px 0 0;color:#334155;line-height:1.55;">${opts.footerNote}</p>`
      : ''
    }
 
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;" />
 
        <div style="font-size:12px;color:#64748b;line-height:1.6">
          Ky mesazh është gjeneruar automatikisht nga sistemi. Ju lutemi mos i përgjigjeni këtij emaili.<br/>
          <b>Komanda e Sistemit</b> – Departamenti i Sigurisë së Informacionit
        </div>
      </div>
    </div>
 
    <div style="max-width:640px;margin:12px auto 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;">
      © ${new Date().getFullYear()} Sistemi i Menaxhimit Ushtarak • Konfidencial – vetëm për përdorim të autorizuar
    </div>
  </div>
  `.trim();
}

async function safeSendAdmin(subject: string, html: string) {
  if (!env.ADMIN_EMAIL) return;
  try {
    await sendSecurityAlert(env.ADMIN_EMAIL, subject, html);
  } catch (e) {
    console.error('❌ Dështoi dërgimi i email-it:', e);
  }
}

// ✅ helper: kthe unit-in (code/name) nga unitId
async function getUnitBrief(unitId: any): Promise<{ id: string; code?: string; name?: string } | null> {
  try {
    if (!unitId) return null;

    const u = await (Unit as any).findById(unitId).select('_id code name').lean();
    if (!u) return null;

    return { id: String(u._id), code: u.code, name: u.name };
  } catch {
    return null;
  }
}

/* =====================
      LOGIN
===================== */

r.post('/login', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!username || !password) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'username & password required' });
  }

  const ip = getClientIp(req);
  const ua = pickUserAgent(req);
  const now = new Date();

  // 0️⃣ GEO-BLOCK (vetëm nëse IP s’është private/local)
  if (!isPrivateOrLocalIp(ip)) {
    const country = toCountry(ip);

    if (!ALLOWED_LOGIN_COUNTRIES.includes(country)) {
      const html = buildEmailHtml({
        title: 'NJOFTIM SIGURIE – Tentim Kyçjeje i Bllokuar',
        intro:
          'Ju njoftojmë se sistemi ka bllokuar një tentim kyçjeje nga një vend i paautorizuar, në përputhje me politikat e sigurisë.',
        severity: 'danger',
        items: [
          { label: 'Lloji i aktivitetit', value: 'Tentim kyçjeje (GEO-BLOCK)' },
          { label: 'Username (i dhënë)', value: username },
          { label: 'Data / Ora', value: fmtDate(now) },
          { label: 'Adresa IP', value: ip || '—' },
          { label: 'Vend (Geo-IP)', value: country },
          { label: 'Pajisja / Platforma', value: ua },
        ],
        footerNote:
          'Nëse ky tentim është i dyshimtë, rekomandohet verifikim i menjëhershëm i politikave të aksesit dhe ndryshim i kredencialeve për përdoruesit e prekur.',
      });

      await safeSendAdmin('NJOFTIM SIGURIE – Tentim Kyçjeje i Bllokuar (GEO-BLOCK)', html);

      return res.status(403).json({
        code: 'GEO_BLOCKED',
        message: 'Kyçja nuk lejohet nga vendi juaj.',
      });
    }
  }

  // 1) gjej user-in (exact, pastaj case-insensitive)
  let user = await User.findOne({ username }).exec();
  if (!user) {
    user = await User.findOne({ username: new RegExp(`^${escapeRegExp(username)}$`, 'i') }).exec();
  }

  // 2) Username s’ekziston → alert admin
  if (!user) {
    const html = buildEmailHtml({
      title: 'NJOFTIM SIGURIE – Tentim Kyçjeje i Dyshimtë',
      intro:
        'U regjistrua një tentim kyçjeje me një username që nuk ekziston në sistem. Kjo mund të jetë përpjekje e paautorizuar.',
      severity: 'warning',
      items: [
        { label: 'Lloji i aktivitetit', value: 'Kyçje me username të panjohur' },
        { label: 'Username (i dhënë)', value: username },
        { label: 'Data / Ora', value: fmtDate(now) },
        { label: 'Adresa IP', value: ip || '—' },
        { label: 'Pajisja / Platforma', value: ua },
      ],
    });

    await safeSendAdmin('NJOFTIM SIGURIE – Tentim Kyçjeje me Username të Panohur', html);
    return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  }

  const uAny: any = user;

  // 3) user i bllokuar
  if (uAny.isBlocked) {
    const html = buildEmailHtml({
      title: 'NJOFTIM SIGURIE – Tentim Kyçjeje me Llogari të Bllokuar',
      intro:
        'U regjistrua një tentim kyçjeje në një llogari të bllokuar. Sistemi ka refuzuar aksesin sipas politikave të sigurisë.',
      severity: 'danger',
      items: [
        { label: 'Lloji i aktivitetit', value: 'Tentim kyçjeje (llogari e bllokuar)' },
        { label: 'Username', value: user.username },
        { label: 'Data / Ora', value: fmtDate(now) },
        { label: 'Adresa IP', value: ip || '—' },
        { label: 'Arsye bllokimi', value: String(uAny.blockReason || '—') },
        { label: 'Pajisja / Platforma', value: ua },
      ],
    });

    await safeSendAdmin('NJOFTIM SIGURIE – Tentim Kyçjeje në Llogari të Bllokuar', html);

    return res.status(423).json({
      code: 'USER_BLOCKED',
      message: uAny.blockReason || 'Ky përdorues është bllokuar. Ju lutem kontaktoni administratorin.',
    });
  }

  // 4) verifiko password (argon2 ose bcrypt)
  const valid = await verifyPassword(String(user.passwordHash), password);

  if (!valid) {
    uAny.failedLoginCount = (uAny.failedLoginCount ?? 0) + 1;
    uAny.lastFailedLoginAt = new Date();

    let justBlocked = false;

    if (uAny.failedLoginCount >= MAX_FAILED_LOGINS) {
      uAny.isBlocked = true;
      uAny.blockReason = 'Too many failed login attempts';
      justBlocked = true;
    }

    await user.save();

    // email kur arrin pragun (p.sh. 3 tentativa)
    if (!justBlocked && uAny.failedLoginCount === FAILED_WARNING_THRESHOLD) {
      const html = buildEmailHtml({
        title: 'NJOFTIM SIGURIE – Tentativa të Shumta të Dështuara',
        intro:
          'Sistemi ka regjistruar tentativa të përsëritura kyçjeje me fjalëkalim të pasaktë. Rekomandohet verifikim i menjëhershëm.',
        severity: 'warning',
        items: [
          { label: 'Lloji i aktivitetit', value: 'Tentativa të dështuara (password i pasaktë)' },
          { label: 'Username', value: user.username },
          { label: 'Tentativa të dështuara', value: String(uAny.failedLoginCount) },
          { label: 'Data / Ora', value: fmtDate(now) },
          { label: 'Adresa IP', value: ip || '—' },
          { label: 'Pajisja / Platforma', value: ua },
        ],
      });

      await safeSendAdmin('NJOFTIM SIGURIE – Tentativa të Shumta të Dështuara për Kyçje', html);
    }

    // email kur bllokohet
    if (justBlocked) {
      const html = buildEmailHtml({
        title: 'NJOFTIM SIGURIE – Llogaria u Bllokua',
        intro: 'Për shkak të shumë tentativave të dështuara, sistemi e ka bllokuar llogarinë për arsye sigurie.',
        severity: 'danger',
        items: [
          { label: 'Lloji i aktivitetit', value: 'Bllokim automatik (shumë tentativa të dështuara)' },
          { label: 'Username', value: user.username },
          { label: 'Tentativa të dështuara', value: String(uAny.failedLoginCount) },
          { label: 'Data / Ora', value: fmtDate(now) },
          { label: 'Adresa IP', value: ip || '—' },
          { label: 'Pajisja / Platforma', value: ua },
        ],
        footerNote: 'Rekomandohet ndërhyrje e administratorit për verifikim dhe riaktivizim sipas procedurave.',
      });

      await safeSendAdmin('NJOFTIM SIGURIE – Llogaria u Bllokua (Tentativa të Dështuara)', html);

      return res.status(423).json({
        code: 'USER_BLOCKED',
        message: 'Ky përdorues u bllokua për shkak të shumë tentativave të dështuara. Kontaktoni ADMIN.',
      });
    }

    return res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  }

  // 5) kontrollo kontratën
  if (!uAny.neverExpires) {
    const now2 = new Date();

    if (uAny.contractValidFrom && now2 < uAny.contractValidFrom) {
      return res
        .status(403)
        .json({ code: 'CONTRACT_NOT_ACTIVE_YET', message: 'Ky përdorues nuk ka ende kontratë aktive.' });
    }

    if (uAny.contractValidTo && now2 > uAny.contractValidTo) {
      return res.status(403).json({ code: 'CONTRACT_EXPIRED', message: 'Kontrata e këtij përdoruesi ka skaduar.' });
    }
  }

  // ✅ merr unit info (code/name) për response + email audit
  const unitBrief = await getUnitBrief(user.unitId);

  // 6) IP e re? (audit)
  if (env.ADMIN_EMAIL) {
    try {
      const existingFromThisIp = await LoginAudit.findOne({ userId: user._id, ip }).lean();

      if (!existingFromThisIp) {
        const html = buildEmailHtml({
          title: 'NJOFTIM ZYRTAR – Kyçje nga IP e Re',
          intro:
            'Ju njoftojmë se u regjistrua një kyçje nga një adresë IP e re për këtë llogari. Nëse kjo nuk është iniciuar nga ju, ndiqni udhëzimet e sigurisë.',
          severity: 'info',
          items: [
            { label: 'Lloji i aktivitetit', value: 'Kyçje në sistem (IP e re)' },
            { label: 'Username', value: user.username },
            { label: 'Data / Ora', value: fmtDate(new Date()) },
            { label: 'Adresa IP', value: ip || '—' },
            { label: 'Pajisja / Platforma', value: ua },
            {
              label: 'Njësia',
              value:
                unitBrief?.code || unitBrief?.name
                  ? `${unitBrief?.code ?? ''}${unitBrief?.code && unitBrief?.name ? ' — ' : ''}${unitBrief?.name ?? ''}`
                  : user.unitId
                    ? String(user.unitId)
                    : '—',
            },
          ],
        });

        await safeSendAdmin('NJOFTIM ZYRTAR – Kyçje nga IP e Re', html);
      }
    } catch (e) {
      console.error('❌ Dështoi kontrolli / emaili për IP të re:', e);
    }
  }

  // 7) sukses → reset statistikat
  uAny.lastLogin = new Date();
  uAny.failedLoginCount = 0;
  uAny.lastFailedLoginAt = null;

  await user.save();

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
      userAgent: ua,
    });
  } catch (e) {
    console.error('LoginAudit error (LOGIN):', e);
  }

  // ✅ RETURN: kthe edhe fushat e signature që frontend me bo redirect
  return res.json({
    token,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      unitId: user.unitId ?? null,
      unit: unitBrief, // ✅ (id/code/name)

      mustChangePassword: uAny.mustChangePassword ?? false,

      // ✅ signature fields (E RËNDËSISHME)
      signatureImageUrl: uAny.signatureImageUrl ?? null,
      signatureSignedAt: uAny.signatureSignedAt ?? null,

      // kontrata
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
        userAgent: pickUserAgent(req),
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
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'currentPassword & newPassword required' });
  }

  const user = await User.findById(me.id);
  if (!user) return res.status(404).json({ code: 'NOT_FOUND' });

  const ok = await verifyPassword(String(user.passwordHash), String(currentPassword));
  if (!ok) return res.status(401).json({ code: 'INVALID_CURRENT_PASSWORD' });

  const sameAsOld = await verifyPassword(String(user.passwordHash), String(newPassword));
  if (sameAsOld) {
    return res.status(400).json({
      code: 'PASSWORD_REUSE_NOT_ALLOWED',
      message: 'Fjalëkalimi i ri nuk mund të jetë i njëjtë me fjalëkalimin aktual.',
    });
  }

  user.passwordHash = await argon2.hash(String(newPassword));
  (user as any).mustChangePassword = false;

  await user.save();
  return res.json({ ok: true });
});

/* =====================
   CHANGE PASSWORD FIRST LOGIN (pa token)
===================== */

r.post('/change-password-first', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body ?? {};

  const uName = String(username ?? '').trim();
  const oldPw = String(oldPassword ?? '');
  const newPw = String(newPassword ?? '');

  if (!uName || !oldPw || !newPw) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'username, oldPassword & newPassword required',
    });
  }

  let user = await User.findOne({ username: uName }).exec();
  if (!user) {
    user = await User.findOne({ username: new RegExp(`^${escapeRegExp(uName)}$`, 'i') }).exec();
  }

  if (!user) return res.status(401).json({ code: 'INVALID_CREDENTIALS' });

  const uAny: any = user;

  if (uAny.isBlocked) {
    return res.status(423).json({
      code: 'USER_BLOCKED',
      message: uAny.blockReason || 'Ky përdorues është bllokuar. Ju lutem kontaktoni administratorin.',
    });
  }

  if (!uAny.mustChangePassword) {
    return res.status(400).json({
      code: 'NOT_REQUIRED',
      message: 'Ky përdorues nuk e ka të shënuar që duhet ta ndryshojë fjalëkalimin në hyrjen e parë.',
    });
  }

  const okOld = await verifyPassword(String(user.passwordHash), oldPw);
  if (!okOld) {
    return res.status(401).json({
      code: 'INVALID_OLD_PASSWORD',
      message: 'Fjalëkalimi i vjetër nuk është i saktë.',
    });
  }

  const sameAsOld = await verifyPassword(String(user.passwordHash), newPw);
  if (sameAsOld) {
    return res.status(400).json({
      code: 'PASSWORD_REUSE_NOT_ALLOWED',
      message: 'Fjalëkalimi i ri nuk mund të jetë i njëjtë me fjalëkalimin e vjetër që ju është dhënë nga administratori.',
    });
  }

  // kontrata (opsionale)
  const now = new Date();

  if (!uAny.neverExpires) {
    if (uAny.contractValidFrom && now < uAny.contractValidFrom) {
      return res
        .status(403)
        .json({ code: 'CONTRACT_NOT_ACTIVE_YET', message: 'Ky përdorues nuk ka ende kontratë aktive.' });
    }

    if (uAny.contractValidTo && now > uAny.contractValidTo) {
      return res.status(403).json({ code: 'CONTRACT_EXPIRED', message: 'Kontrata e këtij përdoruesi ka skaduar.' });
    }
  }

  user.passwordHash = await argon2.hash(newPw);
  uAny.mustChangePassword = false;
  uAny.failedLoginCount = 0;
  uAny.lastFailedLoginAt = null;

  await user.save();
  return res.json({ ok: true });
});

/* =====================
      REGISTER (ADMIN)
===================== */

r.post('/register', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { username, password, role, unitId, contractValidFrom, contractValidTo, neverExpires, mustChangePassword } =
    req.body ?? {};

  const uName = String(username ?? '').trim();
  const pw = String(password ?? '');
  const rRole = String(role ?? '').trim();

  if (!uName || !pw || !rRole) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'username, password & role required' });
  }

  const exists = await User.findOne({ username: uName });
  if (exists) return res.status(409).json({ code: 'USERNAME_EXISTS' });

  const passwordHash = await argon2.hash(pw);

  let contractFromDate: Date | null = null;
  let contractToDate: Date | null = null;

  let neverExp = true;
  if (typeof neverExpires === 'boolean') neverExp = neverExpires;

  if (contractValidFrom) {
    const d = new Date(contractValidFrom);
    if (!isNaN(d.getTime())) contractFromDate = d;
  }

  if (contractValidTo) {
    const d = new Date(contractValidTo);
    if (!isNaN(d.getTime())) contractToDate = d;
  }

  const unitObj = unitId && Types.ObjectId.isValid(String(unitId)) ? new Types.ObjectId(String(unitId)) : null;

  const u: any = await User.create({
    username: uName,
    passwordHash,
    role: rRole,
    unitId: unitObj,

    isBlocked: false,
    blockReason: '',
    failedLoginCount: 0,
    lastFailedLoginAt: null,

    contractValidFrom: neverExp ? null : contractFromDate,
    contractValidTo: neverExp ? null : contractToDate,
    neverExpires: neverExp,

    mustChangePassword: !!mustChangePassword,

    // ✅ signature default
    signatureImageUrl: null,
    signatureSignedAt: null,
  });

  const unitBrief = await getUnitBrief(u.unitId);

  return res.status(201).json({
    id: u._id,
    username: u.username,
    role: u.role,
    unitId: u.unitId ?? null,
    unit: unitBrief,
  });
});

export default r;