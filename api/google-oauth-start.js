// Fonction serverless Vercel : démarre le flow OAuth Google pour autoriser
// le CRM à envoyer des emails depuis le Gmail de l'utilisateur.
//
// Flow :
//   1. Le frontend appelle /api/google-oauth-start?token=<JWT_SUPABASE>
//   2. On valide le JWT, on extrait l'user_id
//   3. On construit l'URL d'autorisation Google avec state=user_id
//   4. On redirige (302) vers Google
//   5. Google montre la consent screen → utilisateur clique Autoriser
//   6. Google redirige vers /api/google-oauth-callback?code=...&state=user_id
//
// Variables d'env requises :
//   - GOOGLE_CLIENT_ID
//   - GOOGLE_REDIRECT_URI  (ex: https://crm-solaire.vercel.app/api/google-oauth-callback)
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function html(res, status, body) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return html(res, 405, 'Method Not Allowed');
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return html(res, 503, 'OAuth Google non configuré : ajoute GOOGLE_CLIENT_ID + GOOGLE_REDIRECT_URI dans Vercel.');
  }

  // Le JWT Supabase est passé en query (impossible d'envoyer un header
  // sur un window.location.href). Court-vivant (1h), HTTPS uniquement.
  const token = (req.query?.token || '').toString().trim();
  if (!token) return html(res, 401, 'Token manquant.');

  let userId;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return html(res, 401, 'Token invalide.');
    userId = data.user.id;
  } catch (e) {
    return html(res, 502, 'Erreur validation token.');
  }

  // Construit l'URL d'autorisation Google
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
  ];
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',   // pour obtenir un refresh_token
    prompt: 'consent',        // force la consent screen → refresh_token garanti
    state: userId,            // on retrouve l'user dans le callback
    include_granted_scopes: 'true',
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.writeHead(302, { Location: url });
  res.end();
}
