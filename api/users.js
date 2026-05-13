// Fonction serverless Vercel pour la gestion des comptes Supabase.
// La clé service_role reste côté serveur (jamais exposée au navigateur).
//
// Variables d'environnement requises côté Vercel (SANS préfixe VITE_) :
//   - SUPABASE_URL          : URL du projet Supabase
//   - SUPABASE_SERVICE_KEY  : clé service_role (Project Settings → API → service_role)
//
// Le front envoie son JWT utilisateur (header Authorization). On vérifie ici que
// l'appelant est bien connecté ET qu'il a le rôle "admin" avant d'autoriser
// la moindre opération admin.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function requireAdmin(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return { error: 'Missing Authorization header', status: 401 };
  }
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return { error: 'Empty token', status: 401 };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid token', status: 401 };

  const role = data.user.user_metadata?.role;
  if (role !== 'admin') {
    return { error: 'Forbidden: admin role required', status: 403 };
  }
  return { admin, callerId: data.user.id };
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, {
      error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_KEY missing',
    });
  }

  // Bootstrap : autorise la création du tout premier admin tant qu'aucun user
  // n'existe encore dans Supabase. Sans ça, impossible de créer le 1er compte
  // puisque la création exige un appelant déjà admin.
  const bootstrapAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: existing, error: listErr } = await bootstrapAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (listErr) return json(res, 500, { error: listErr.message });
  const isBootstrap = (existing?.users?.length ?? 0) === 0;

  let admin;
  if (isBootstrap && req.method === 'POST') {
    admin = bootstrapAdmin;
  } else {
    const auth = await requireAdmin(req);
    if (auth.error) return json(res, auth.status, { error: auth.error });
    admin = auth.admin;
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      return json(res, 200, { users: data.users });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { email, password, display_name, emoji, role } = body;
      if (!email || !password) return json(res, 400, { error: 'email et password requis' });
      if (String(password).length < 6) return json(res, 400, { error: 'mot de passe min 6 caractères' });

      // En bootstrap, on force le rôle admin pour le 1er compte (sinon plus jamais d'accès).
      const finalRole = isBootstrap ? 'admin' : (role || 'commercial');

      const { data, error } = await admin.auth.admin.createUser({
        email: String(email).trim(),
        password: String(password),
        email_confirm: true,
        user_metadata: {
          display_name: (display_name || String(email).split('@')[0]).trim(),
          emoji: (emoji || '👤').trim(),
          role: finalRole,
        },
      });
      if (error) throw error;
      return json(res, 200, { user: data.user, bootstrapped: isBootstrap });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const { user_id, password, user_metadata } = body;
      if (!user_id) return json(res, 400, { error: 'user_id requis' });
      const updates = {};
      if (password) {
        if (String(password).length < 6) return json(res, 400, { error: 'mot de passe min 6 caractères' });
        updates.password = String(password);
      }
      if (user_metadata && typeof user_metadata === 'object') {
        updates.user_metadata = user_metadata;
      }
      if (Object.keys(updates).length === 0) return json(res, 400, { error: 'rien à mettre à jour' });
      const { data, error } = await admin.auth.admin.updateUserById(user_id, updates);
      if (error) throw error;
      return json(res, 200, { user: data.user });
    }

    if (req.method === 'DELETE') {
      const user_id = req.query?.user_id || (req.body && req.body.user_id);
      if (!user_id) return json(res, 400, { error: 'user_id requis' });
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'Erreur serveur' });
  }
}
