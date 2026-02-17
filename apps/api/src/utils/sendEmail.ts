// apps/api/src/utils/sendEmail.ts

import nodemailer from 'nodemailer';
import { env } from '../config/env';

/* =========================
   Helpers
========================= */

function escapeHtml(v: any) {
    const s = String(v ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

type BoxItem = { label: string; value: string };

function box(items: BoxItem[], title = 'Të dhënat') {
    const rows = items
        .map(
            (it) => `
      <tr>
        <td style="padding:7px 10px;color:#94a3b8;white-space:nowrap;"><b>${escapeHtml(it.label)}</b></td>
        <td style="padding:7px 10px;color:#0f172a;">${it.value ? escapeHtml(it.value) : '—'}</td>
      </tr>
    `
        )
        .join('');

    return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">
      <div style="background:#0b1220;color:#e2e8f0;padding:10px 14px;font-weight:800;letter-spacing:.2px;">
        ${escapeHtml(title)}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${rows}
      </table>
    </div>
  `.trim();
}

function emailShell(opts: {
    title: string;
    subtitle?: string;
    contentHtml: string;
    severity?: 'info' | 'warning' | 'danger';
}) {
    const sevColor =
        opts.severity === 'danger' ? '#b91c1c' : opts.severity === 'warning' ? '#b45309' : '#0f172a';

    return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#0b1220;padding:26px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.25);">
      <div style="padding:18px 20px;background:#0b1220;color:#e2e8f0;">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">
          Komanda e Sistemit • Sistemi i Menaxhimit Ushtarak
        </div>
        <div style="margin-top:6px;font-size:20px;font-weight:900;color:#ffffff;">
          ${escapeHtml(opts.title)}
        </div>
        ${opts.subtitle
            ? `<div style="margin-top:6px;font-size:13px;color:#cbd5e1;line-height:1.45">${escapeHtml(opts.subtitle)}</div>`
            : ''
        }
      </div>
 
      <div style="padding:20px;color:#0f172a;">
        ${opts.contentHtml}
 
        <div style="margin-top:16px;padding:12px 14px;border-left:4px solid ${sevColor};background:#f8fafc;border-radius:10px;">
          <div style="font-weight:800;margin-bottom:6px;">Njoftim</div>
          <div style="line-height:1.55;color:#334155;">
            Ky mesazh është gjeneruar automatikisht nga sistemi. Ju lutemi mos i përgjigjeni këtij emaili.
          </div>
        </div>
 
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;" />
 
        <div style="font-size:12px;color:#64748b;line-height:1.65">
          <b>Departamenti i Sigurisë së Informacionit</b><br/>
          Sistemi i Menaxhimit Ushtarak<br/>
          Data: ${escapeHtml(fmtDate(new Date()))}
        </div>
      </div>
    </div>
 
    <div style="max-width:680px;margin:12px auto 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5;">
      © ${new Date().getFullYear()} Sistemi i Menaxhimit Ushtarak • Konfidencial – vetëm për përdorim të autorizuar
    </div>
  </div>
  `.trim();
}

/* =========================
   Transporter
========================= */

function makeTransporter() {
    const port = Number(env.SMTP_PORT);
    const secure = port === 465; // 465 SSL, 587 STARTTLS

    return nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    });
}

/* =========================
   Security Alert (Admin)
========================= */

export async function sendSecurityAlert(to: string, subject: string, html: string) {
    const transporter = makeTransporter();

    try {
        const info = await transporter.sendMail({
            from: `"Sistemi Ushtarak" <${env.SMTP_USER}>`,
            to,
            subject,
            html,
        });

        return info;
    } catch (err) {
        console.error('❌ Gabim gjatë dërgimit të email-it:', err);
        throw err;
    }
}

/* =========================
   New User Credentials
========================= */

export async function sendNewUserCredentials(opts: {
    to: string;
    username: string;
    tempPassword: string;
    role: string;
    unitLabel?: string;
}) {
    const { to, username, tempPassword, role, unitLabel } = opts;

    const subject = 'Kredencialet tuaja për qasje në sistem';

    const content = `
    <p style="margin:0 0 12px;line-height:1.6;color:#0f172a;">
      I nderuar / e nderuar,<br/>
      Ju njoftojmë se llogaria juaj është krijuar me sukses në <b>Sistemin e Menaxhimit Ushtarak</b>.
      Më poshtë gjeni kredencialet për qasje:
    </p>
 
    ${box(
        [
            { label: 'Username', value: username },
            { label: 'Fjalëkalimi i përkohshëm', value: tempPassword },
            { label: 'Roli', value: role },
            ...(unitLabel ? [{ label: 'Njësia', value: unitLabel }] : []),
        ],
        'Kredencialet e Qasjes'
    )}
 
    <div style="margin-top:14px;padding:12px 14px;border-left:4px solid #b45309;background:#fff7ed;border-radius:10px;">
      <div style="font-weight:900;margin-bottom:6px;color:#7c2d12;">⚠️ E RËNDËSISHME</div>
      <div style="line-height:1.6;color:#7c2d12;">
        Për arsye sigurie, gjatë hyrjes së parë në sistem do t’ju kërkohet të ndryshoni fjalëkalimin.
        Ju lutemi mos e ndani këtë informacion me persona të paautorizuar.
      </div>
    </div>
 
    <p style="margin:14px 0 0;line-height:1.6;color:#334155;">
      Nëse nuk keni kërkuar krijimin e kësaj llogarie, ju lutemi kontaktoni menjëherë administratorin.
    </p>
 
    <p style="margin:14px 0 0;line-height:1.6;color:#0f172a;">
      Me respekt,<br/>
      <b>Sistemi Ushtarak</b><br/>
      Departamenti i IT-së
    </p>
  `.trim();

    const html = emailShell({
        title: 'Kredencialet e Llogarisë',
        subtitle: 'Njoftim zyrtar për krijimin e llogarisë dhe qasjen në sistem.',
        contentHtml: content,
        severity: 'warning',
    });

    const transporter = makeTransporter();

    try {
        const info = await transporter.sendMail({
            from: `"Sistemi Ushtarak" <${env.SMTP_USER}>`,
            to,
            subject,
            html,
        });

        return info;
    } catch (err) {
        console.error('❌ Gabim gjatë dërgimit të email-it (kredenciale):', err);
        throw err;
    }
}