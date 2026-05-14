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
//
// Mode "bootstrap" : tant qu'aucun user n'a `user_metadata.role === 'admin'`,
// l'API accepte :
//   - GET (lister les users) sans auth → permet à l'UI de montrer l'état
//   - POST sans auth → création du 1er admin (rôle forcé à admin)
//   - POST avec body.bootstrap_self=true et un JWT valide → promeut le caller
//     existant en admin (cas d'un user déjà créé manuellement dans Supabase)
// Dès qu'un admin existe, toutes les routes redeviennent protégées.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function makeAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getCallerUser(req, admin) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, {
      error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_KEY missing',
    });
  }

  const admin = makeAdmin();

  // Détection du mode bootstrap : on considère qu'il n'y a pas encore d'admin
  // *effectif* tant qu'aucun user avec role=admin ne s'est connecté au moins
  // une fois. Cela couvre le cas d'un admin créé par erreur dans Supabase
  // (orphelin, jamais utilisé) qui empêcherait un user légitime de revendiquer
  // le rôle. Dès qu'un admin s'est connecté ne serait-ce qu'une fois, le mode
  // bootstrap se ferme et toutes les routes redeviennent protégées.
  const { data: listAll, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return json(res, 500, { error: listErr.message });
  const allUsers = listAll?.users || [];
  const activeAdmins = allUsers.filter(u => u.user_metadata?.role === 'admin' && u.last_sign_in_at);
  const isBootstrap = activeAdmins.length === 0;

  // Caller (peut être null si pas connecté ou pas de JWT)
  const caller = await getCallerUser(req, admin);
  const isAdmin = !!(caller && caller.user_metadata?.role === 'admin');

  // Garde-fou : hors bootstrap, toute opération exige un admin.
  if (!isBootstrap && !isAdmin) {
    if (!caller) return json(res, 401, { error: 'JWT requis' });
    return json(res, 403, { error: 'Forbidden: admin role required' });
  }

  try {
    if (req.method === 'GET') {
      // En bootstrap, on renvoie aussi la liste (utile pour que l'UI affiche
      // l'état "aucun admin yet" et propose le bouton de promotion).
      return json(res, 200, { users: allUsers, bootstrap: isBootstrap });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Action spéciale en bootstrap : promouvoir le caller en admin
      // (s'il existe déjà comme user Supabase mais sans rôle).
      if (isBootstrap && body.bootstrap_self === true) {
        if (!caller) return json(res, 401, { error: 'JWT requis pour bootstrap_self' });
        const newMeta = {
          ...(caller.user_metadata || {}),
          role: 'admin',
          display_name:
            caller.user_metadata?.display_name ||
            (caller.email ? caller.email.split('@')[0] : 'Admin'),
          emoji: caller.user_metadata?.emoji || '👑',
        };
        const { data: updated, error: upErr } = await admin.auth.admin.updateUserById(caller.id, {
          user_metadata: newMeta,
        });
        if (upErr) throw upErr;
        return json(res, 200, { user: updated.user, bootstrapped_self: true });
      }

      // Création normale (bootstrap → 1er admin, ou admin connecté → autre user)
      const { email, password, display_name, emoji, role, linkedTo } = body;
      if (!email || !password) return json(res, 400, { error: 'email et password requis' });
      if (String(password).length < 6) return json(res, 400, { error: 'mot de passe min 6 caractères' });

      const finalRole = isBootstrap ? 'admin' : (role || 'commercial');

      const userMeta = {
        display_name: (display_name || String(email).split('@')[0]).trim(),
        emoji: (emoji || '👤').trim(),
        role: finalRole,
      };
      // Rattachement poseur/régie : nom de l'entité dont ce compte voit les dossiers.
      if ((finalRole === 'poseur' || finalRole === 'regie') && linkedTo) {
        userMeta.linkedTo = String(linkedTo).trim();
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: String(email).trim(),
        password: String(password),
        email_confirm: true,
        user_metadata: userMeta,
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
