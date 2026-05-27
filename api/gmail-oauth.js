// Fonction serverless Vercel : gère le statut et la déconnexion Gmail OAuth.
//
//   - GET    /api/gmail-oauth → statut de la connexion (ne renvoie JAMAIS
//     les tokens, juste l'email + date de connexion)
//   - DELETE /api/gmail-oauth → supprime les credentials de l'utilisateur
//     (pour révoquer aussi côté Google, l'utilisateur doit aller sur
//     myaccount.google.com/permissions → CRM Solaire → Supprimer l'accès)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function getUserIdFromAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: { status: 401, msg: 'Unauthorized' } };
  const token = authHeader.slice('Bearer '.length).trim();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { error: { status: 401, msg: 'Token invalide' } };
  return { userId: userData.user.id, admin };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const auth = await getUserIdFromAuth(req);
    if (auth.error) return json(res, auth.error.status, { error: auth.error.msg });
    const { userId, admin } = auth;

    if (req.method === 'GET') {
      const { data: row } = await admin.from('storage').select('value').eq('key', `gmail-oauth:${userId}`).maybeSingle();
      if (!row?.value) return json(res, 200, { data: { connected: false } });
      let creds = null;
      try { creds = JSON.parse(row.value); } catch (e) {}
      if (!creds?.refreshToken) return json(res, 200, { data: { connected: false } });
      return json(res, 200, {
        data: {
          connected: true,
          email: creds.email || null,
          connectedAt: creds.connectedAt || null,
        },
      });
    }

    // DELETE
    await admin.from('storage').delete().eq('key', `gmail-oauth:${userId}`);
    return json(res, 200, { data: { disconnected: true } });
  } catch (e) {
    return json(res, 502, { error: e?.message || 'Erreur Gmail OAuth' });
  }
}
