// Supprime les credentials Gmail OAuth de l'utilisateur courant.
// Pour révoquer aussi côté Google, l'utilisateur doit aller sur
// myaccount.google.com/permissions → CRM Solaire → Supprimer l'accès.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
    await admin.from('storage').delete().eq('key', `gmail-oauth:${userId}`);
    return json(res, 200, { data: { disconnected: true } });
  } catch (e) {
    return json(res, 502, { error: e?.message || 'Erreur déconnexion' });
  }
}
