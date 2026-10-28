// Fonction Vercel : relais pour les cartes et le cadastre de l'IGN.
// Sert seulement de secours si le navigateur refuse l'accès direct (CORS).
// Réservé aux utilisateurs connectés, et uniquement vers les services publics IGN / BAN.
//
// Utilise les mêmes variables que le site : VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const ALLOWED_HOSTS = new Set(['data.geopf.fr', 'apicarto.ign.fr', 'api-adresse.data.gouv.fr']);

async function isLoggedIn(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.getUser(h.slice(7).trim());
    return !error && !!data?.user;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Méthode non autorisée');
  if (!(await isLoggedIn(req))) return res.status(401).send('Non connecté');
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch (e) {
    return res.status(400).send('URL invalide');
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(400).send('Hôte non autorisé');
  }
  try {
    const r = await fetch(target.toString(), { headers: { 'User-Agent': 'dp-mairie/1.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.send(buf);
  } catch (e) {
    return res.status(502).send(`Relais IGN en erreur : ${e.message}`);
  }
}
