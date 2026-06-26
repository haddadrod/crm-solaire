// 🕐 Cron quotidien : pré-analyse IA des PDFs Gmail.
//
// But : éviter de payer l'IA à chaque scan/recherche.
// 1× par jour, on parcourt toutes les boîtes connectées, on liste les PDFs
// récents, on extrait via l'IA ceux qui ne sont PAS encore en cache
// (gmail-ia:<key>), puis on stocke le résultat. Le scan / recherche / Tri
// Factures consomment ensuite ce cache → instantané, gratuit.
//
// Idempotent : si la fonction est ré-invoquée, elle skip les PDFs déjà
// analysés (cache hit) et reprend là où elle s'est arrêtée.
//
// Auth : Vercel envoie `Authorization: Bearer <CRON_SECRET>` automatiquement
// pour les routes listées dans vercel.json → crons. On vérifie.
//
// Limites :
// - Vercel Pro = 60s max par invocation → on cap à 50 PDFs par run pour
//   ne pas se faire timeout. Le run suivant continue.
// - Window : 60 derniers jours par défaut (configurable via ?days=).

import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const PERSONAL_INBOXES_KEY_PREFIX = 'gmail-inbox:';
const SHARED_INBOXES_KEY = 'gmail-shared-inboxes';
const IA_CACHE_PREFIX = 'gmail-ia:';

const MAX_PDFS_PER_RUN = 100; // cap (peut être bumpé via ?max=)
const MAX_BASE64_BYTES = 4_000_000; // 4 Mo PDF max envoyé à l'IA
const PARALLEL = 3; // PDFs analysés en parallèle (Anthropic rate-limit safe)

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function attachmentKey(inboxEmail, messageId, attachmentId) {
  return `${String(inboxEmail || '').toLowerCase()}|${String(messageId || '')}|${String(attachmentId || '')}`;
}
function iaCacheKey(inboxEmail, messageId, attachmentId) {
  return `${IA_CACHE_PREFIX}${attachmentKey(inboxEmail, messageId, attachmentId)}`;
}

function makeAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readSharedInboxes(admin) {
  const { data } = await admin.from('storage').select('value').eq('key', SHARED_INBOXES_KEY).maybeSingle();
  if (!data?.value) return [];
  try { const arr = JSON.parse(data.value); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

function boxMethod(b) {
  return b?.appPassword ? 'imap' : (b?.refreshToken ? 'oauth' : 'imap');
}

// IMAP : liste les UIDs récents qui ont des PDFs.
async function imapListPdfs(inbox, sinceDays = 60) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: inbox.email, pass: inbox.appPassword },
    logger: false, socketTimeout: 20000, greetingTimeout: 8000,
  });
  await client.connect();
  const results = []; // { uid, attachmentId (part), filename }
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
      const uids = await client.search({ since }, { uid: true });
      const recent = (uids || []).slice(-500); // cap raisonnable
      for await (const msg of client.fetch(recent, { uid: true, bodyStructure: true }, { uid: true })) {
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node.childNodes)) node.childNodes.forEach(walk);
          const fname = node.dispositionParameters?.filename || node.parameters?.name || '';
          const mtype = `${node.type || ''}/${node.subtype || ''}`.toLowerCase();
          if ((fname && /\.pdf$/i.test(fname)) || mtype === 'application/pdf' || mtype === 'application/x-pdf') {
            results.push({
              uid: String(msg.uid),
              attachmentId: node.part || '1',
              filename: fname || `attachment-${node.part || '1'}.pdf`,
            });
          }
        };
        walk(msg.bodyStructure);
      }
    } finally { lock.release(); }
  } finally { try { await client.logout(); } catch (e) {} }
  return results;
}

async function imapFetchPdf(inbox, uid, part) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: inbox.email, pass: inbox.appPassword },
    logger: false, socketTimeout: 30000, greetingTimeout: 8000,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const dl = await client.download(parseInt(uid, 10), part, { uid: true });
      const chunks = [];
      for await (const c of dl.content) chunks.push(c);
      const buf = Buffer.concat(chunks);
      return buf.toString('base64');
    } finally { lock.release(); }
  } finally { try { await client.logout(); } catch (e) {} }
}

// OAuth Gmail : refresh + list/fetch (simplifié — pas le full impl, on
// laisse OAuth pour plus tard si nécessaire ; pour l'instant focus IMAP qui
// est ce que le user utilise actuellement — cf. screenshots Yolico/Elsun).
async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || `OAuth refresh ${r.status}`);
  return d.access_token;
}

async function oauthListPdfs(accessToken, sinceDays = 60) {
  const days = Math.max(1, Math.min(1095, sinceDays));
  const q = encodeURIComponent(`has:attachment newer_than:${days}d`);
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=500`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Gmail list failed');
  const ids = (d.messages || []).map(m => m.id);
  const results = [];
  for (const id of ids) {
    const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const md = await mr.json();
    if (!mr.ok) continue;
    const walk = (parts) => {
      (parts || []).forEach(p => {
        if (p.parts) walk(p.parts);
        const isPdf = (p.filename && /\.pdf$/i.test(p.filename)) || p.mimeType === 'application/pdf';
        if (isPdf && p.body?.attachmentId) {
          results.push({ uid: id, attachmentId: p.body.attachmentId, filename: p.filename || `att.pdf` });
        }
      });
    };
    walk(md.payload?.parts);
    if (md.payload?.body?.attachmentId && (md.payload?.filename && /\.pdf$/i.test(md.payload.filename) || md.payload?.mimeType === 'application/pdf')) {
      results.push({ uid: id, attachmentId: md.payload.body.attachmentId, filename: md.payload.filename || 'att.pdf' });
    }
  }
  return results;
}

async function oauthFetchPdf(accessToken, messageId, attachmentId) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Gmail attachment failed');
  return String(d.data || '').replace(/-/g, '+').replace(/_/g, '/');
}

// 🤖 Appel direct à Claude pour extraire {referenceChantier, factureNo,
//    montantHt, fournisseur} d'un PDF facture. Évite de passer par
//    /api/extract-pdf (qui exigerait un JWT user, qu'on n'a pas en cron).
async function extractFromPdf(base64) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquant');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // Haiku 4.5 — rapide & pas cher pour ce job
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Extract from this invoice. Reply ONLY with a JSON object: {"referenceChantier": "client name", "factureNo": "invoice number", "montantHt": number_in_euros_excluding_tax, "fournisseur": "supplier name"}. Use empty string or 0 if unknown. NO other text.' },
        ],
      }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || `Claude ${r.status}`);
  const text = d.content?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Pas de JSON dans la réponse Claude');
  const parsed = JSON.parse(m[0]);
  return {
    refChantier: String(parsed.referenceChantier || ''),
    factureNo: String(parsed.factureNo || ''),
    montantHt: Number(parsed.montantHt) || 0,
    fournisseur: String(parsed.fournisseur || ''),
  };
}

export default async function handler(req, res) {
  // Auth cron Vercel : vérifie le header CRON_SECRET. Accepte aussi GET
  // manuel avec ?secret=... pour pouvoir tester depuis le navigateur.
  const authHeader = req.headers['authorization'] || '';
  const expected = CRON_SECRET ? `Bearer ${CRON_SECRET}` : '';
  const secretQuery = req.query?.secret || '';
  const okHeader = expected && authHeader === expected;
  const okQuery = CRON_SECRET && secretQuery === CRON_SECRET;
  if (!okHeader && !okQuery) return json(res, 401, { error: 'Unauthorized' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, { error: 'SUPABASE_URL/SUPABASE_SERVICE_KEY manquants' });
  }
  if (!ANTHROPIC_API_KEY) {
    return json(res, 500, { error: 'ANTHROPIC_API_KEY manquant' });
  }

  const days = Math.max(1, Math.min(365, parseInt(req.query?.days || '60', 10)));
  const cap = Math.max(1, Math.min(200, parseInt(req.query?.max || String(MAX_PDFS_PER_RUN), 10)));

  const startedAt = Date.now();
  const admin = makeAdmin();
  const stats = {
    inboxes: 0,
    pdfsListed: 0,
    pdfsAlreadyCached: 0,
    pdfsAnalyzed: 0,
    pdfsErrored: 0,
    errors: [],
  };

  try {
    // Pour le cron, on traite UNIQUEMENT les boîtes partagées (équipe). Les
    // boîtes perso (un seul user) sortent du scope cron.
    const shared = await readSharedInboxes(admin);
    stats.inboxes = shared.length;

    for (const inbox of shared) {
      if (stats.pdfsAnalyzed >= cap) break;
      const method = boxMethod(inbox);
      let pdfs = [];
      try {
        if (method === 'imap') {
          pdfs = await imapListPdfs(inbox, days);
        } else {
          if (!inbox.refreshToken) { stats.errors.push({ email: inbox.email, error: 'Pas de refreshToken' }); continue; }
          const at = await refreshAccessToken(inbox.refreshToken);
          pdfs = await oauthListPdfs(at, days);
        }
      } catch (e) {
        stats.errors.push({ email: inbox.email, error: `list: ${e?.message || 'unknown'}` });
        continue;
      }
      stats.pdfsListed += pdfs.length;

      // 🔎 Check cache : on ne ré-analyse pas ce qui est déjà connu.
      const keys = pdfs.map(p => iaCacheKey(inbox.email, p.uid, p.attachmentId));
      const cached = new Set();
      const CHUNK = 500;
      for (let i = 0; i < keys.length; i += CHUNK) {
        const slice = keys.slice(i, i + CHUNK);
        const { data: rows } = await admin.from('storage').select('key').in('key', slice);
        for (const r of rows || []) cached.add(r.key);
      }
      stats.pdfsAlreadyCached += cached.size;
      const todo = pdfs.filter(p => !cached.has(iaCacheKey(inbox.email, p.uid, p.attachmentId)));

      // 🤖 Analyse parallèle (PARALLEL en concurrence, Anthropic rate-limit safe).
      let accessToken = null; // refresh une seule fois si OAuth
      const processOne = async (pdf) => {
        if (stats.pdfsAnalyzed >= cap) return;
        if (Date.now() - startedAt > 280_000) return; // safety vs maxDuration 300s
        try {
          let base64;
          if (method === 'imap') {
            base64 = await imapFetchPdf(inbox, pdf.uid, pdf.attachmentId);
          } else {
            if (!accessToken) accessToken = await refreshAccessToken(inbox.refreshToken);
            base64 = await oauthFetchPdf(accessToken, pdf.uid, pdf.attachmentId);
          }
          if (!base64) throw new Error('PDF vide');
          if (base64.length * 0.75 > MAX_BASE64_BYTES) {
            stats.errors.push({ email: inbox.email, filename: pdf.filename, error: 'PDF trop volumineux (skip)' });
            return;
          }
          const ia = await extractFromPdf(base64);
          const k = iaCacheKey(inbox.email, pdf.uid, pdf.attachmentId);
          await admin.from('storage').upsert({
            key: k,
            value: JSON.stringify({ ...ia, analyzedAt: new Date().toISOString() }),
            updated_at: new Date().toISOString(),
          });
          stats.pdfsAnalyzed++;
        } catch (e) {
          stats.pdfsErrored++;
          if (stats.errors.length < 20) {
            stats.errors.push({ email: inbox.email, filename: pdf.filename, error: e?.message || 'extract' });
          }
        }
      };
      // Batch parallèle
      for (let i = 0; i < todo.length; i += PARALLEL) {
        if (stats.pdfsAnalyzed >= cap) break;
        if (Date.now() - startedAt > 280_000) break;
        await Promise.allSettled(todo.slice(i, i + PARALLEL).map(processOne));
      }
    }
  } catch (e) {
    stats.errors.push({ global: e?.message || 'unknown' });
  }

  const durationMs = Date.now() - startedAt;
  return json(res, 200, { data: { ...stats, durationMs } });
}
