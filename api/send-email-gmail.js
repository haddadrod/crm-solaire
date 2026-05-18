// Fonction serverless Vercel : envoie un email via Gmail API en utilisant
// les credentials OAuth stockés pour l'utilisateur. Renouvelle automatiquement
// l'access_token si expiré.
//
// Variables d'env requises :
//   - GOOGLE_CLIENT_ID
//   - GOOGLE_CLIENT_SECRET
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

// Encode une chaîne UTF-8 en base64url (Gmail API exige base64url)
function base64Url(str) {
  return Buffer.from(str, 'utf-8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Construit un message MIME minimal text/plain pour Gmail API
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
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Refresh token failed: ${JSON.stringify(data)}`);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json(res, 503, { error: 'OAuth Google non configuré côté Vercel.' });
  }

  const { user, admin } = caller;
  const body = req.body || {};
  const { to, subject, text, fromName } = body;
  if (!to) return json(res, 400, { error: 'Destinataire (to) requis.' });
  if (!subject) return json(res, 400, { error: 'Sujet requis.' });
  if (!text) return json(res, 400, { error: 'Corps (text) requis.' });

  // Charge les credentials OAuth de l'utilisateur
  const { data: row, error: rowErr } = await admin.from('storage')
    .select('value')
    .eq('key', `gmail-oauth:${user.id}`)
    .maybeSingle();
  if (rowErr) return json(res, 502, { error: `Lecture storage : ${rowErr.message}` });
  if (!row?.value) {
    return json(res, 400, { error: "Gmail pas connecté. Va dans Réglages → Email d'envoi → 'Connecter Gmail'." });
  }
  let creds;
  try { creds = JSON.parse(row.value); } catch (e) {
    return json(res, 502, { error: 'Credentials OAuth corrompus, reconnecte Gmail.' });
  }
  if (!creds.refreshToken) {
    return json(res, 400, { error: 'Refresh token manquant, reconnecte Gmail.' });
  }

  // Renouvelle l'access_token si expiré (ou s'il expire dans < 60s)
  let accessToken = creds.accessToken;
  const needRefresh = !accessToken || !creds.expiresAt || creds.expiresAt < Date.now() + 60000;
  if (needRefresh) {
    try {
      const refreshed = await refreshAccessToken(creds.refreshToken);
      accessToken = refreshed.accessToken;
      const newCreds = {
        ...creds,
        accessToken,
        expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
      };
      await admin.from('storage').upsert({
        key: `gmail-oauth:${user.id}`,
        value: JSON.stringify(newCreds),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      return json(res, 502, { error: `Renouvellement token Gmail échoué : ${e.message}` });
    }
  }

  // Construit le MIME + envoie via Gmail API
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
