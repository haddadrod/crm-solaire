// Fonction serverless Vercel : reçoit le callback OAuth Google après
// l'autorisation par l'utilisateur, échange le code contre un refresh_token,
// et stocke les credentials dans Supabase scopés à l'user_id (state).
//
// Variables d'env requises :
//   - GOOGLE_CLIENT_ID
//   - GOOGLE_CLIENT_SECRET
//   - GOOGLE_REDIRECT_URI
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function html(res, status, body) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(body);
}

// Page minimaliste qui redirige vers / avec un flag de résultat
function redirectHome(res, params) {
  const qs = new URLSearchParams(params).toString();
  res.writeHead(302, { Location: `/?${qs}` });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return html(res, 405, 'Method Not Allowed');
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return html(res, 503, 'OAuth Google non configuré.');
  }

  const code = (req.query?.code || '').toString();
  const state = (req.query?.state || '').toString();
  const error = (req.query?.error || '').toString();

  if (error) {
    return redirectHome(res, { gmail_error: error });
  }
  if (!code || !state) {
    return redirectHome(res, { gmail_error: 'missing_code_or_state' });
  }

  try {
    // 1. Vérifier que le state (user_id) est valide
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(state);
    if (userErr || !userData?.user) {
      return redirectHome(res, { gmail_error: 'invalid_state_user' });
    }
    const userId = userData.user.id;

    // 2. Échanger le code contre tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      console.error('Google token exchange failed:', tokens);
      return redirectHome(res, { gmail_error: tokens.error || 'token_exchange_failed' });
    }

    // 3. Récupérer l'email de l'utilisateur Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();
    const gmailEmail = userInfo?.email;
    if (!gmailEmail) {
      return redirectHome(res, { gmail_error: 'userinfo_failed' });
    }

    // 4. Stocker les credentials dans Supabase (clé scopée à l'user_id CRM)
    const stored = {
      email: gmailEmail,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      connectedAt: new Date().toISOString(),
    };
    const { error: setErr } = await admin.from('storage').upsert({
      key: `gmail-oauth:${userId}`,
      value: JSON.stringify(stored),
      updated_at: new Date().toISOString(),
    });
    if (setErr) {
      console.error('Storage upsert failed:', setErr);
      return redirectHome(res, { gmail_error: 'storage_failed' });
    }

    return redirectHome(res, { gmail_connected: 1, gmail_email: gmailEmail });
  } catch (e) {
    console.error('oauth callback error:', e?.message || e);
    return redirectHome(res, { gmail_error: 'callback_exception' });
  }
}
