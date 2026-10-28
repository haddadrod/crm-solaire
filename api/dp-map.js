// Fonction serverless Vercel : relais pour les cartes et le cadastre de l'IGN
// utilisés par le module « DP Mairie ».
//
// Le navigateur charge d'abord les images IGN en direct. Ce relais ne sert que
// de secours si le navigateur refuse l'accès direct (CORS) : sans lui, le
// canvas ne pourrait pas être exporté en PDF.
//
// Sécurité : uniquement les hôtes publics de l'IGN (liste blanche) et
// uniquement pour un utilisateur connecté (JWT Supabase vérifié).
//
// Variables d'environnement (déjà utilisées par les autres fonctions) :
//   - SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_HOSTS = new Set(['data.geopf.fr', 'apicarto.ign.fr', 'api-adresse.data.gouv.fr']);

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
    return data.user;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Méthode non autorisée');
    return;
  }
  const caller = await getCaller(req);
  if (!caller) {
    res.status(401).send('Non connecté');
    return;
  }
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch (e) {
    res.status(400).send('URL invalide');
    return;
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    res.status(400).send('Hôte non autorisé');
    return;
  }
  try {
    const r = await fetch(target.toString(), { headers: { 'User-Agent': 'crm-solaire-dp/1.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  } catch (e) {
    res.status(502).send(`Relais IGN en erreur : ${e.message}`);
  }
}
