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

// 📥 Set des attachments déjà rattachés à un dossier dans le CRM. On les
//    skip aussi (en plus du cache IA) — pas la peine de payer Claude pour
//    re-analyser une facture qui est déjà liée à un dossier.
async function readImportedAttachmentsSet(admin) {
  const { data } = await admin.from('storage').select('value').eq('key', 'gmail-imported-attachments').maybeSingle();
  if (!data?.value) return new Set();
  try {
    const arr = JSON.parse(data.value);
    if (Array.isArray(arr)) return new Set(arr.map(String));
  } catch (e) {}
  return new Set();
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

// 🤖 Appel direct à Claude pour extraire un MAX d'infos utiles : client,
//    n° facture, montants (HT/TTC/TVA), date, adresse, téléphone, BL,
//    description. Cette richesse permet à la recherche locale de matcher
//    sur n'importe quel champ (ex : on cherche par téléphone ou ville).
//    Modèle Haiku 4.5 → rapide et bon marché pour de l'extraction structurée.
const EXTRACT_PROMPT = `Extract structured data from this French invoice/facture PDF.
Reply ONLY with a JSON object (no markdown, no explanation). Use "" for unknown strings, 0 for unknown numbers.

{
  "referenceChantier": "<client name on whom the invoice is — for sub-contractor invoices, this is the END client (the homeowner), not the company being invoiced>",
  "factureNo": "<invoice number, e.g. FAC-2026-1447>",
  "dateFacture": "<YYYY-MM-DD, invoice date>",
  "fournisseur": "<supplier name (the one issuing the invoice)>",
  "montantHt": <number, total HT excluding VAT, in euros>,
  "montantTtc": <number, total TTC including VAT, in euros>,
  "montantTva": <number, total VAT amount, in euros>,
  "tauxTva": <number, VAT rate as percent (20, 10, 5.5, 2.1 or 0)>,
  "adresseClient": "<street address of the client / chantier>",
  "villeClient": "<city of the client / chantier>",
  "codePostalClient": "<postal code of the client / chantier>",
  "telephoneClient": "<phone of the client if mentioned>",
  "emailClient": "<email of the client if mentioned>",
  "numeroBl": "<delivery note number / BL if mentioned>",
  "numeroCommande": "<purchase order number if mentioned>",
  "description": "<short 1-line description of what is billed, e.g. 'Installation panneaux solaires 6kW + onduleur'>"
}`;

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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: EXTRACT_PROMPT },
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
    dateFacture: String(parsed.dateFacture || ''),
    fournisseur: String(parsed.fournisseur || ''),
    montantHt: Number(parsed.montantHt) || 0,
    montantTtc: Number(parsed.montantTtc) || 0,
    montantTva: Number(parsed.montantTva) || 0,
    tauxTva: Number(parsed.tauxTva) || 0,
    adresseClient: String(parsed.adresseClient || ''),
    villeClient: String(parsed.villeClient || ''),
    codePostalClient: String(parsed.codePostalClient || ''),
    telephoneClient: String(parsed.telephoneClient || ''),
    emailClient: String(parsed.emailClient || ''),
    numeroBl: String(parsed.numeroBl || ''),
    numeroCommande: String(parsed.numeroCommande || ''),
    description: String(parsed.description || ''),
  };
}

// 📦 Upload du PDF brut dans le bucket Supabase Storage `gmail-archive`.
//    Rangé PAR FOURNISSEUR pour browse facile (comme un drive) :
//      gmail-archive/IONERGIK/FAC-2026-1447__msg123__att456.pdf
//      gmail-archive/FLEX/F-2026-0625917__msg789__att012.pdf
//    Si pas de fournisseur extrait → ranger dans _unknown.
const ARCHIVE_BUCKET = 'gmail-archive';

// Normalise un nom (fournisseur, n° facture) en segment de path sûr et lisible.
function sanitizeSegment(s, fallback) {
  let out = String(s || '').trim();
  if (!out) return fallback;
  // Enlève accents, met en majuscules pour groupement (FLEX == flex == Flex)
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // Garde uniquement alphanum, espaces → _, et quelques séparateurs OK
  out = out.replace(/[^A-Z0-9._\- ]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_');
  out = out.replace(/^[_.-]+|[_.-]+$/g, '');
  return out.slice(0, 60) || fallback;
}

function archivePath(fournisseur, factureNo, messageId, attachmentId) {
  const supplier = sanitizeSegment(fournisseur, '_unknown');
  const inv = sanitizeSegment(factureNo, '_no_facno');
  const msg = String(messageId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 30);
  const att = String(attachmentId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 30);
  return `${supplier}/${inv}__${msg}__${att}.pdf`;
}

async function uploadToArchive(admin, path, base64) {
  try {
    const buf = Buffer.from(base64, 'base64');
    const { error } = await admin.storage.from(ARCHIVE_BUCKET).upload(path, buf, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) {
      // Si le bucket n'existe pas, on tente de le créer (idempotent).
      if (/not found|does not exist/i.test(error.message)) {
        await admin.storage.createBucket(ARCHIVE_BUCKET, { public: false }).catch(() => {});
        const retry = await admin.storage.from(ARCHIVE_BUCKET).upload(path, buf, {
          contentType: 'application/pdf', upsert: true,
        });
        if (retry.error) return null;
        return path;
      }
      return null;
    }
    return path;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  // Auth — 3 chemins acceptés :
  //   1. Header `Authorization: Bearer <CRON_SECRET>` (Vercel cron auto)
  //   2. ?secret=<CRON_SECRET> dans l'URL (test manuel)
  //   3. Bearer <supabase JWT> d'un user ADMIN (bouton « Lancer » dans le CRM)
  const authHeader = req.headers['authorization'] || '';
  const expected = CRON_SECRET ? `Bearer ${CRON_SECRET}` : '';
  const secretQuery = req.query?.secret || '';
  const okHeader = expected && authHeader === expected;
  const okQuery = CRON_SECRET && secretQuery === CRON_SECRET;

  let okAdmin = false;
  if (!okHeader && !okQuery && authHeader.startsWith('Bearer ') && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const adm = makeAdmin();
      const token = authHeader.slice('Bearer '.length).trim();
      const { data } = await adm.auth.getUser(token);
      if (data?.user?.user_metadata?.role === 'admin') okAdmin = true;
    } catch (e) { /* unauthorized */ }
  }

  if (!okHeader && !okQuery && !okAdmin) return json(res, 401, { error: 'Unauthorized' });

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

    // Set des attachments déjà ATTACHÉS à un dossier CRM. On les skip aussi
    // (en plus du cache IA) pour ne pas re-payer Claude pour rien.
    const importedSet = await readImportedAttachmentsSet(admin);
    stats.pdfsAlreadyInCrm = 0;

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
      // Filtre 1 : skip ce qui est déjà en cache IA
      // Filtre 2 : skip ce qui est déjà attaché à un dossier (importedSet)
      const todo = pdfs.filter(p => {
        const cacheK = iaCacheKey(inbox.email, p.uid, p.attachmentId);
        if (cached.has(cacheK)) return false;
        const importedK = `${(inbox.email || '').toLowerCase()}|${p.uid}|${p.attachmentId}`;
        if (importedSet.has(importedK)) { stats.pdfsAlreadyInCrm++; return false; }
        return true;
      });

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
          // IA d'abord → on apprend le fournisseur → on peut ranger le PDF
          //    dans le bon dossier du bucket (gmail-archive/IONERGIK/…).
          const ia = await extractFromPdf(base64);
          const path = archivePath(ia.fournisseur, ia.factureNo, pdf.uid, pdf.attachmentId);
          const storagePath = await uploadToArchive(admin, path, base64);
          const k = iaCacheKey(inbox.email, pdf.uid, pdf.attachmentId);
          await admin.from('storage').upsert({
            key: k,
            value: JSON.stringify({
              ...ia,
              storagePath: storagePath || '',
              originalFilename: pdf.filename || '',
              analyzedAt: new Date().toISOString(),
            }),
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
