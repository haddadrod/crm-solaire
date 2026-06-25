// Fonction serverless : gestion des clés API Pennylane par société, depuis le
// CRM. Permet à un admin de poser / modifier / supprimer la clé Pennylane sans
// passer par le dashboard Vercel.
//
// Stockage : Supabase storage, sous des clés préfixées `secret-pennylane-<societe>`.
// Le préfixe `secret-` est exclu de la lecture par les utilisateurs authentifiés
// via une politique RLS dédiée (cf. SUPABASE_SECRETS_RLS.sql) — seul ce
// endpoint (qui utilise la clé service_role) peut les lire.
//
// L'endpoint NE RENVOIE JAMAIS la valeur de la clé au client — uniquement
// l'état (configurée ou pas) + les 4 derniers caractères pour vérification.
//
// Variables d'environnement requises côté Vercel :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function makeAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getCallerAdmin(req, admin) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const role = data.user.user_metadata?.role;
  if (role !== 'admin') return null;
  return data.user;
}

// Normalise un id société (yolico, elsun, ...). Tout sauf alphanumérique
// devient '-'. Empêche d'injecter des préfixes type 'foo' qui escapent du
// namespace secret-pennylane-*.
function normSociete(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function keyFor(societe) {
  const norm = normSociete(societe);
  if (!norm) return null;
  return `secret-pennylane-${norm}`;
}
function ledgerKeyFor(societe) {
  const norm = normSociete(societe);
  if (!norm) return null;
  return `secret-pennylane-${norm}-ledger`;
}

// Audit log append-only — partagé avec api/users.js (clé `users-audit-log`)
async function appendAudit(admin, event) {
  try {
    const { data } = await admin.from('storage').select('value').eq('key', 'users-audit-log').maybeSingle();
    let arr = [];
    if (data?.value) { try { arr = JSON.parse(data.value); if (!Array.isArray(arr)) arr = []; } catch { arr = []; } }
    arr.push({ at: new Date().toISOString(), ...event });
    if (arr.length > 500) arr = arr.slice(-500);
    await admin.from('storage').upsert({ key: 'users-audit-log', value: JSON.stringify(arr), updated_at: new Date().toISOString() });
  } catch (e) {
    console.error('audit-log append failed:', e);
  }
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, { error: 'Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_KEY' });
  }

  try {
    const admin = makeAdminClient();
    const caller = await getCallerAdmin(req, admin);
    if (!caller) return json(res, 403, { error: 'Admin requis' });

    const callerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';
    const actorInfo = { actor_email: caller.email, actor_id: caller.id, actor_ip: callerIp };

    if (req.method === 'GET') {
      // Liste les sociétés demandées (query ?societes=yolico,elsun)
      // ou renvoie tout ce qui commence par secret-pennylane-*.
      // Renvoie 2 trucs par société : la clé API + le ledger_account_id.
      const requested = (req.query?.societes || '').split(',').map(s => s.trim()).filter(Boolean);
      let rows = [];
      if (requested.length > 0) {
        const keys = [
          ...requested.map(keyFor).filter(Boolean),
          ...requested.map(ledgerKeyFor).filter(Boolean),
        ];
        const { data } = await admin.from('storage').select('key, value').in('key', keys);
        rows = data || [];
      } else {
        const { data } = await admin.from('storage').select('key, value').like('key', 'secret-pennylane-%');
        rows = data || [];
      }
      const result = {};
      const ensureSlot = (societe) => {
        if (!result[societe]) {
          result[societe] = { configured: false, last4: '', length: 0, ledgerAccountId: '' };
        }
        return result[societe];
      };
      rows.forEach(r => {
        const rawKey = String(r.key || '');
        const val = r.value || '';
        // Suffixe ledger : secret-pennylane-<societe>-ledger → ledgerAccountId
        const ledgerMatch = rawKey.match(/^secret-pennylane-(.+)-ledger$/);
        if (ledgerMatch) {
          const slot = ensureSlot(ledgerMatch[1]);
          slot.ledgerAccountId = String(val || '').trim();
          return;
        }
        // Sinon = clé API
        const societe = rawKey.replace(/^secret-pennylane-/, '');
        const slot = ensureSlot(societe);
        slot.configured = val.length > 0;
        slot.last4 = val.length >= 4 ? val.slice(-4) : '';
        slot.length = val.length;
      });
      // Reflète aussi les sociétés demandées même si pas configurées (pour l'UI)
      requested.forEach(s => {
        const norm = normSociete(s);
        if (norm) ensureSlot(norm);
      });
      return json(res, 200, { keys: result });
    }

    if (req.method === 'POST') {
      const { societe, apiKey, ledgerAccountId } = req.body || {};
      const norm = normSociete(societe);
      if (!norm) return json(res, 400, { error: 'societe invalide' });

      // 2 modes de POST :
      //  - { societe, apiKey }            → pose/modifie la clé API
      //  - { societe, ledgerAccountId }   → pose/modifie le ledger account id
      //    (chaîne vide accepté pour effacer)
      const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0;
      const hasLedger = typeof ledgerAccountId !== 'undefined';
      if (!hasApiKey && !hasLedger) {
        return json(res, 400, { error: 'apiKey ou ledgerAccountId requis' });
      }

      const responses = {};
      if (hasApiKey) {
        const v = String(apiKey).trim();
        if (v.length < 10) return json(res, 400, { error: 'apiKey trop courte (suspecte)' });
        const { error } = await admin.from('storage').upsert({
          key: keyFor(norm),
          value: v,
          updated_at: new Date().toISOString(),
        });
        if (error) return json(res, 500, { error: error.message });
        await appendAudit(admin, {
          type: 'pennylane_key_set',
          target_societe: norm,
          last4: v.slice(-4),
          ...actorInfo,
        });
        responses.apiKey = { configured: true, last4: v.slice(-4) };
      }
      if (hasLedger) {
        const v = String(ledgerAccountId || '').trim();
        const lk = ledgerKeyFor(norm);
        if (!v) {
          // Vide = on supprime le ledger account id
          await admin.from('storage').delete().eq('key', lk);
          await appendAudit(admin, {
            type: 'pennylane_ledger_cleared',
            target_societe: norm,
            ...actorInfo,
          });
          responses.ledgerAccountId = '';
        } else {
          const { error } = await admin.from('storage').upsert({
            key: lk,
            value: v,
            updated_at: new Date().toISOString(),
          });
          if (error) return json(res, 500, { error: error.message });
          await appendAudit(admin, {
            type: 'pennylane_ledger_set',
            target_societe: norm,
            ledger_account_id: v,
            ...actorInfo,
          });
          responses.ledgerAccountId = v;
        }
      }
      return json(res, 200, { ok: true, ...responses });
    }

    if (req.method === 'DELETE') {
      const societe = req.query?.societe || (req.body && req.body.societe);
      const norm = normSociete(societe);
      if (!norm) return json(res, 400, { error: 'societe invalide' });
      // Supprime à la fois la clé API ET le ledger account id liés.
      const { error } = await admin.from('storage').delete().in('key', [keyFor(norm), ledgerKeyFor(norm)]);
      if (error) return json(res, 500, { error: error.message });
      await appendAudit(admin, {
        type: 'pennylane_key_deleted',
        target_societe: norm,
        ...actorInfo,
      });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('pennylane-keys error:', e);
    return json(res, 500, { error: e?.message || 'Erreur serveur' });
  }
}
