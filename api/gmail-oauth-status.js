// Renvoie le statut de la connexion Gmail OAuth pour l'utilisateur courant.
// Ne renvoie JAMAIS les tokens — juste l'email + date de connexion.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json(res, 401, { error: 'Token invalide' });
    const userId = userData.user.id;
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
  } catch (e) {
    return json(res, 502, { error: e?.message || 'Erreur statut' });
  }
}
