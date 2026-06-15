// Fonction serverless Vercel : envoi d'email avec deux providers possibles,
// sélectionnés via le champ `provider` du body :
//
//   - provider: 'gmail-oauth' → utilise l'API Gmail officielle avec les
//     credentials OAuth stockés pour l'utilisateur. Renouvelle automatiquement
//     l'access_token si expiré.
//
//   - provider: 'smtp' (ou absent, valeur par défaut) → utilise nodemailer
//     avec un mot de passe d'application (Gmail, Outlook, OVH, etc.) saisi
//     par l'utilisateur dans Réglages → Email d'envoi.
//
// Variables d'env requises :
//   - SUPABASE_URL                : pour valider le JWT appelant
//   - SUPABASE_SERVICE_KEY        : clé service_role Supabase
//   - GOOGLE_CLIENT_ID / SECRET   : uniquement pour provider 'gmail-oauth'

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function getCaller(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return { user: data.user, admin };
  } catch (e) {
    return null;
  }
}

// ─── Provider : Gmail OAuth ──────────────────────────────────────────────

function base64Url(str) {
  return Buffer.from(str, 'utf-8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildMime({ from, to, subject, text, replyTo }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  return headers.join('\r\n') + '\r\n\r\n' + (text || '');
}

async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Refresh token failed: ${JSON.stringify(data)}`);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function sendViaGmailOAuth(res, { user, admin }, body) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json(res, 503, { error: 'OAuth Google non configuré côté Vercel.' });
  }
  const { to, subject, text, fromName } = body;
  if (!to) return json(res, 400, { error: 'Destinataire (to) requis.' });
  if (!subject) return json(res, 400, { error: 'Sujet requis.' });
  if (!text) return json(res, 400, { error: 'Corps (text) requis.' });

  const { data: row, error: rowErr } = await admin.from('storage')
    .select('value')
    .eq('key', `gmail-oauth:${user.id}`)
    .maybeSingle();
  if (rowErr) return json(res, 502, { error: `Lecture storage : ${rowErr.message}` });
  if (!row?.value) {
    return json(res, 400, { error: "Gmail pas connecté. Va dans Réglages → Email d'envoi → 'Connecter Gmail'." });
  }
  // 📦 Format storage : ARRAY de boîtes Gmail (multi-comptes) depuis la
  //   migration multi-Gmail. Compat ascendante : si on lit l'ancien format
  //   objet (1 seul compte), on le wrap en array.
  let inboxes = [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) inboxes = parsed;
    else if (parsed && parsed.refreshToken) inboxes = [parsed]; // legacy
  } catch (e) {
    return json(res, 502, { error: 'Credentials OAuth corrompus, reconnecte Gmail.' });
  }
  if (inboxes.length === 0) {
    return json(res, 400, { error: 'Aucune boîte Gmail connectée. Va dans Réglages → Email d\'envoi.' });
  }
  // Sélection de l'expéditeur : si le body précise `fromEmail`, on l'utilise.
  // Sinon, on prend la 1re boîte connectée (rétro-compat avec l'existant).
  const fromEmail = (body.fromEmail || '').trim().toLowerCase();
  let creds = fromEmail
    ? inboxes.find(b => (b.email || '').toLowerCase() === fromEmail)
    : inboxes[0];
  if (!creds) {
    return json(res, 400, { error: `Boîte ${fromEmail || '(non précisée)'} non trouvée parmi les Gmail connectés.` });
  }
  if (!creds.refreshToken) {
    return json(res, 400, { error: 'Refresh token manquant, reconnecte Gmail.' });
  }

  let accessToken = creds.accessToken;
  const needRefresh = !accessToken || !creds.expiresAt || creds.expiresAt < Date.now() + 60000;
  if (needRefresh) {
    try {
      const refreshed = await refreshAccessToken(creds.refreshToken);
      accessToken = refreshed.accessToken;
      // Met à jour les credentials de la boîte courante DANS l'array, et
      // réécrit l'array complet. Évite d'écraser les AUTRES boîtes.
      const idx = inboxes.findIndex(b => (b.email || '').toLowerCase() === (creds.email || '').toLowerCase());
      if (idx >= 0) {
        inboxes[idx] = {
          ...creds,
          accessToken,
          expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
        };
        creds = inboxes[idx];
      }
      await admin.from('storage').upsert({
        key: `gmail-oauth:${user.id}`,
        value: JSON.stringify(inboxes),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      return json(res, 502, { error: `Renouvellement token Gmail échoué : ${e.message}` });
    }
  }

  const from = fromName ? `"${fromName.replace(/"/g, '\\"')}" <${creds.email}>` : creds.email;
  const mime = buildMime({ from, to, subject, text });
  const raw = base64Url(mime);

  try {
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const sendPayload = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      return json(res, 502, {
        error: `Gmail API ${sendRes.status} : ${sendPayload?.error?.message || JSON.stringify(sendPayload)}`,
      });
    }
    return json(res, 200, {
      data: {
        messageId: sendPayload?.id,
        from: creds.email,
        to,
      },
    });
  } catch (e) {
    return json(res, 502, { error: `Envoi Gmail échoué : ${e.message}` });
  }
}

// ─── Provider : SMTP (mot de passe d'application) ────────────────────────

async function sendViaSmtp(res, body) {
  const { to, subject, text, html, smtpUser, smtpPass, fromName, replyTo } = body;
  if (!to) return json(res, 400, { error: 'Destinataire (to) requis.' });
  if (!subject) return json(res, 400, { error: 'Sujet requis.' });
  if (!text && !html) return json(res, 400, { error: 'Corps (text ou html) requis.' });
  if (!smtpUser) return json(res, 400, { error: "Email expéditeur (smtpUser) requis — configure-le dans Réglages → Email d'envoi." });
  if (!smtpPass) return json(res, 400, { error: "Mot de passe d'application Gmail (smtpPass) requis — configure-le dans Réglages → Email d'envoi." });

  const detectSmtp = (email) => {
    const d = String(email || '').toLowerCase().split('@')[1] || '';
    if (d === 'outlook.com' || d === 'hotmail.com' || d === 'live.com' || d === 'msn.com') return { host: 'smtp-mail.outlook.com', port: 587, secure: false };
    if (d === 'yahoo.com' || d === 'yahoo.fr') return { host: 'smtp.mail.yahoo.com', port: 465, secure: true };
    if (d.endsWith('ovh.fr') || d.endsWith('ovh.com') || d.endsWith('ovh.net')) return { host: 'ssl0.ovh.net', port: 465, secure: true };
    if (d === 'orange.fr' || d === 'wanadoo.fr') return { host: 'smtp.orange.fr', port: 465, secure: true };
    if (d === 'free.fr') return { host: 'smtp.free.fr', port: 465, secure: true };
    if (d === 'sfr.fr') return { host: 'smtp.sfr.fr', port: 465, secure: true };
    return { host: 'smtp.gmail.com', port: 465, secure: true };
  };
  const smtp = detectSmtp(smtpUser);

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const from = fromName ? `"${fromName.replace(/"/g, '\\"')}" <${smtpUser}>` : smtpUser;
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    });

    return json(res, 200, {
      data: {
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
      },
    });
  } catch (e) {
    const msg = e?.message || 'Erreur SMTP';
    if (/Invalid login|535-5.7.8/.test(msg)) {
      return json(res, 502, { error: "Authentification Gmail refusée. Vérifie l'email et le mot de passe d'application (pas le vrai password Google)." });
    }
    if (/Application-specific password required/.test(msg)) {
      return json(res, 502, { error: 'Gmail exige un mot de passe d\'application. Génère-le sur Google Account → Sécurité.' });
    }
    console.error('send-email error:', msg);
    return json(res, 502, { error: `Envoi email échoué : ${msg}` });
  }
}

// ─── Routeur principal ───────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  if (body.provider === 'gmail-oauth') {
    return sendViaGmailOAuth(res, caller, body);
  }
  return sendViaSmtp(res, body);
}
