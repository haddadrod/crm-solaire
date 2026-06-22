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

// 🛡️ Journal d'audit append-only des actions sensibles sur les comptes
// (création, modification, suppression, reset mot de passe). Stocké dans la
// table storage sous la clé `users-audit-log` (JSON array, max 500 entrées
// gardées — les plus anciennes sont tronquées pour ne pas grossir sans fin).
async function appendAuditLog(admin, event) {
  try {
    const { data } = await admin.from('storage').select('value').eq('key', 'users-audit-log').maybeSingle();
    let arr = [];
    if (data?.value) { try { arr = JSON.parse(data.value); if (!Array.isArray(arr)) arr = []; } catch { arr = []; } }
    arr.push({ at: new Date().toISOString(), ...event });
    if (arr.length > 500) arr = arr.slice(-500);
    await admin.from('storage').upsert({ key: 'users-audit-log', value: JSON.stringify(arr), updated_at: new Date().toISOString() });
  } catch (e) {
    // On ne fait pas échouer l'action si le log foire — c'est secondaire.
    console.error('audit-log append failed:', e);
  }
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, {
      error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_KEY missing',
    });
  }

  // ⚠️ TOUT le corps est sous try/catch. Avant, makeAdmin() + listUsers() +
  // getCallerUser() étaient hors du try : une SUPABASE_URL malformée (typo,
  // espace, https:// manquant) faisait crasher la fonction AVANT toute réponse
  // → Vercel renvoyait un 500 non-JSON et l'UI affichait juste « Erreur 500 »
  // sans le vrai motif. Maintenant on renvoie toujours un JSON exploitable.
  try {
    const admin = makeAdmin();

    // 🛡️ Mode bootstrap : EXCLUSIVEMENT tant qu'aucun user avec role=admin
    // n'existe en base (peu importe qu'il se soit connecté ou non). Dès qu'un
    // admin existe → mode bootstrap définitivement fermé. Sinon, un admin créé
    // depuis le Supabase Dashboard et qui ne s'est jamais connecté laissait la
    // porte ouverte à des créations de comptes sans aucune authentification —
    // vecteur potentiel d'apparition d'un compte non sollicité.
    const { data: listAll, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return json(res, 500, { error: listErr.message });
    const allUsers = listAll?.users || [];
    const anyAdmin = allUsers.some(u => u.user_metadata?.role === 'admin');
    const isBootstrap = !anyAdmin;

    // Caller (peut être null si pas connecté ou pas de JWT)
    const caller = await getCallerUser(req, admin);
    const isAdmin = !!(caller && caller.user_metadata?.role === 'admin');

    // IP de l'appelant pour l'audit (Vercel met l'IP dans x-forwarded-for)
    const callerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';
    const actorInfo = {
      actor_email: caller?.email || (isBootstrap ? '(bootstrap)' : '(anonymous)'),
      actor_id: caller?.id || null,
      actor_ip: callerIp,
    };

    // 👥 Roster d'équipe — liste LIGHT accessible à TOUT utilisateur connecté
    // (pas seulement les admins). Sert au chat équipe pour afficher la liste
    // des collègues. On ne renvoie QUE des champs non sensibles : nom affiché,
    // emoji, rôle. Pas d'email, pas de téléphone, pas d'id. Court-circuite la
    // garde admin ci-dessous.
    if (req.method === 'GET' && req.query?.scope === 'roster') {
      if (!caller) return json(res, 401, { error: 'JWT requis' });
      const roster = allUsers.map(u => {
        const m = u.user_metadata || {};
        return {
          name: m.display_name || (u.email ? u.email.split('@')[0] : '') || '(sans nom)',
          emoji: m.emoji || '👤',
          role: m.role || 'commercial',
        };
      }).filter(r => r.name && r.name !== '(sans nom)');
      return json(res, 200, { roster });
    }

    // Garde-fou : hors bootstrap, toute opération exige un admin.
    if (!isBootstrap && !isAdmin) {
      if (!caller) return json(res, 401, { error: 'JWT requis' });
      return json(res, 403, { error: 'Forbidden: admin role required' });
    }

    if (req.method === 'GET') {
      // 📜 Audit log — admin only. Renvoyé sur demande pour ne pas alourdir le GET normal.
      if (req.query?.scope === 'audit') {
        const { data } = await admin.from('storage').select('value').eq('key', 'users-audit-log').maybeSingle();
        let log = [];
        if (data?.value) { try { log = JSON.parse(data.value) || []; } catch {} }
        return json(res, 200, { log: Array.isArray(log) ? log.slice().reverse() : [] });
      }
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
        await appendAuditLog(admin, {
          type: 'bootstrap_self_admin',
          target_user_id: caller.id,
          target_email: caller.email,
          ...actorInfo,
        });
        return json(res, 200, { user: updated.user, bootstrapped_self: true });
      }

      // Création normale (bootstrap → 1er admin, ou admin connecté → autre user)
      const { email, password, display_name, emoji, role, linkedTo, tel, prenom } = body;
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
      // Téléphone (WhatsApp/SMS) — optionnel, surtout utilisé pour les rôles
      // poseur/régie afin que le CRM puisse relancer le prestataire via wa.me.
      if (tel) {
        userMeta.tel = String(tel).trim();
      }
      // Prénom — séparé de display_name (= nom de famille / affichage)
      if (prenom) {
        userMeta.prenom = String(prenom).trim();
      }

      // 🛡️ Audit : qui a créé ce user et quand. Empêche les créations « anonymes ».
      userMeta.created_by_email = actorInfo.actor_email;
      userMeta.created_by_id = actorInfo.actor_id || null;
      userMeta.created_by_ip = actorInfo.actor_ip || '';
      userMeta.created_at_iso = new Date().toISOString();

      const { data, error } = await admin.auth.admin.createUser({
        email: String(email).trim(),
        password: String(password),
        email_confirm: true,
        user_metadata: userMeta,
      });
      if (error) throw error;
      await appendAuditLog(admin, {
        type: 'user_created',
        target_user_id: data.user?.id,
        target_email: data.user?.email,
        target_role: finalRole,
        bootstrap: isBootstrap,
        ...actorInfo,
      });
      return json(res, 200, { user: data.user, bootstrapped: isBootstrap });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const { user_id, password, user_metadata, email } = body;
      if (!user_id) return json(res, 400, { error: 'user_id requis' });
      const updates = {};
      const changes = [];
      if (password) {
        if (String(password).length < 6) return json(res, 400, { error: 'mot de passe min 6 caractères' });
        updates.password = String(password);
        changes.push('password');
      }
      if (user_metadata && typeof user_metadata === 'object') {
        // 🛡️ On fusionne sur l'existant pour préserver created_by_* et autre audit
        // déjà posé. Puis on stamp last_modified_*.
        const existing = allUsers.find(u => u.id === user_id);
        const existingMeta = existing?.user_metadata || {};
        const merged = {
          ...existingMeta,
          ...user_metadata,
          last_modified_by_email: actorInfo.actor_email,
          last_modified_by_id: actorInfo.actor_id || null,
          last_modified_at_iso: new Date().toISOString(),
        };
        updates.user_metadata = merged;
        // Détecte les champs modifiés pour le log
        Object.keys(user_metadata).forEach(k => {
          if (JSON.stringify(existingMeta[k]) !== JSON.stringify(user_metadata[k])) changes.push(`meta.${k}`);
        });
      }
      if (email && typeof email === 'string' && email.trim()) {
        const e = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return json(res, 400, { error: 'email invalide' });
        updates.email = e;
        updates.email_confirm = true; // pas de mail de confirmation, on fait confiance à l'admin
        changes.push('email');
      }
      if (Object.keys(updates).length === 0) return json(res, 400, { error: 'rien à mettre à jour' });
      const { data, error } = await admin.auth.admin.updateUserById(user_id, updates);
      if (error) throw error;
      const target = allUsers.find(u => u.id === user_id);
      await appendAuditLog(admin, {
        type: changes.includes('password') ? 'user_password_reset' : 'user_modified',
        target_user_id: user_id,
        target_email: target?.email || data.user?.email || '',
        changes,
        ...actorInfo,
      });
      return json(res, 200, { user: data.user });
    }

    if (req.method === 'DELETE') {
      const user_id = req.query?.user_id || (req.body && req.body.user_id);
      if (!user_id) return json(res, 400, { error: 'user_id requis' });
      const target = allUsers.find(u => u.id === user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      await appendAuditLog(admin, {
        type: 'user_deleted',
        target_user_id: user_id,
        target_email: target?.email || '',
        target_role: target?.user_metadata?.role || '',
        ...actorInfo,
      });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    // Message actionnable pour les erreurs de connexion Supabase : c'est
    // presque toujours une variable d'env Vercel mal remplie sur CE projet.
    const msg = e?.message || 'Erreur serveur';
    const looksLikeConnIssue = /fetch failed|invalid url|enotfound|econnrefused|getaddrinfo/i.test(msg);
    return json(res, 500, {
      error: looksLikeConnIssue
        ? `Connexion Supabase impossible (${msg}) — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans les variables Vercel de ce projet, puis Redeploy.`
        : msg,
    });
  }
}
