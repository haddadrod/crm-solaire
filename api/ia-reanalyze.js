// 🔄 Re-analyse IA : force la re-extraction Claude sur des PDFs déjà en cache.
//
// Utile quand le prompt IA a été amélioré et qu'on veut bénéficier de la
// nouvelle extraction sur d'anciennes entrées (ex : EcoNegoce → Référence
// Chantier maintenant correctement extraite).
//
// Body : { entries: [{inboxEmail, messageId, attachmentId}, ...] }
//   Cap 25 entrées par appel (timeout Vercel + budget Claude rate-limit).
//
// Auth : admin via Bearer Supabase JWT.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const IA_CACHE_PREFIX = 'gmail-ia:';
const ARCHIVE_BUCKET = 'gmail-archive';
const PARALLEL = 3;

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

// 📦 Range PDF sanitization (idem cron pour cohérence)
function sanitizeSegment(s, fallback) {
  let out = String(s || '').trim();
  if (!out) return fallback;
  out = out.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
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

// 🤖 Même prompt que le cron — un seul endroit serait mieux mais Vercel
//    serverless ne partage pas facilement entre fichiers sans bundling.
const EXTRACT_PROMPT = `Analyze this French PDF document.
First, IDENTIFY THE DOCUMENT TYPE — be strict.

═══ FACTURE vs AVOIR ═══
"facture" = original invoice (supplier issues it, positive amount due).
"avoir" = credit note (supplier reduces a previous invoice).

⚠️ THE NUMBER FORMAT IS NOT RELIABLE — many suppliers use the same prefix (F-, FV-, FAC-) for both factures AND avoirs. ALWAYS look at the actual document content:
  - Title/header contains "AVOIR", "NOTE DE CRÉDIT", "CREDIT NOTE", "AVOIR-FACTURE" → avoir
  - Description/object/subject mentions "Avoir" (e.g. "Avoir - Commission client...") → avoir
  - Total amount is NEGATIVE → avoir
  - References "facture initiale" / "facture rectifiée" → likely avoir
  - Otherwise → facture

═══ NOT-A-FACTURE (other types) ═══
- "relance" / "rappel" / "reminder" / "impayé" / "mise en demeure" → relance
- "releve de compte" / "statement" → releve
- "devis" / "quote" → devis
- "bon de livraison" / "BL" → bon_livraison
- "bon de commande" / "PO" → bon_commande
- courriers, contrats, attestations, fiches techniques, mandats, notices → matching type or "autre"

═══ MONTANTS — ALWAYS EXTRACT ═══
- montantHt = total HT, montantTtc = total TTC, montantTva = total VAT
- For AVOIRS: use POSITIVE numbers (absolute values)
- If TVA 20% and only one amount given, derive: TTC = HT × 1.20

═══ OUTPUT ═══
Reply ONLY with a JSON object (no markdown). Use "" for unknown strings, 0 for unknown numbers.

{
  "documentType": "<facture | avoir | relance | devis | bon_livraison | bon_commande | courrier | releve | contrat | attestation | fiche_technique | autre>",
  "referenceChantier": "<END client name — the HOMEOWNER. NOT the reseller (ELSOL/YOLICO/SARL ELSOL). PRIORITY: (1) Field 'Référence Chantier' / 'Réf chantier' / 'Installateur' / 'Site' even if just last name like 'Brillard'. (2) 'Bénéficiaire' / 'Réf client final'. (3) Delivery address ≠ billing address. (4) Last resort billed client. NEVER return reseller name>",
  "factureNo": "<invoice/avoir number>",
  "dateFacture": "<YYYY-MM-DD>",
  "fournisseur": "<supplier name>",
  "montantHt": <number>,
  "montantTtc": <number>,
  "montantTva": <number>,
  "tauxTva": <number, 20|10|5.5|2.1|0>,
  "adresseClient": "<street address>",
  "villeClient": "<city>",
  "codePostalClient": "<postal code>",
  "telephoneClient": "<phone if mentioned>",
  "emailClient": "<email if mentioned>",
  "numeroBl": "<BL number>",
  "numeroCommande": "<PO number>",
  "description": "<short 1-line description>"
}`;

async function extractFromPdf(base64) {
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
  let documentType = String(parsed.documentType || 'autre').toLowerCase().trim();
  const description = String(parsed.description || '');
  if (documentType === 'facture' && /\bavoir\b|note\s+de\s+cr[eé]dit|credit\s+note/i.test(description)) {
    documentType = 'avoir';
  }
  let montantHt = Number(parsed.montantHt) || 0;
  let montantTtc = Number(parsed.montantTtc) || 0;
  const tauxTva = Number(parsed.tauxTva) || 0;
  if (montantHt === 0 && montantTtc > 0 && tauxTva > 0) {
    montantHt = Math.round((montantTtc / (1 + tauxTva / 100)) * 100) / 100;
  } else if (montantTtc === 0 && montantHt > 0 && tauxTva > 0) {
    montantTtc = Math.round((montantHt * (1 + tauxTva / 100)) * 100) / 100;
  } else if (montantTtc === 0 && montantHt > 0 && tauxTva === 0) {
    montantTtc = montantHt;
  }
  let montantTva = Number(parsed.montantTva) || 0;
  if (montantTva === 0 && montantHt > 0 && montantTtc > 0) {
    montantTva = Math.round((montantTtc - montantHt) * 100) / 100;
  }
  return {
    documentType,
    refChantier: String(parsed.referenceChantier || ''),
    factureNo: String(parsed.factureNo || ''),
    dateFacture: String(parsed.dateFacture || ''),
    fournisseur: String(parsed.fournisseur || ''),
    montantHt: Math.abs(montantHt),
    montantTtc: Math.abs(montantTtc),
    montantTva: Math.abs(montantTva),
    tauxTva,
    adresseClient: String(parsed.adresseClient || ''),
    villeClient: String(parsed.villeClient || ''),
    codePostalClient: String(parsed.codePostalClient || ''),
    telephoneClient: String(parsed.telephoneClient || ''),
    emailClient: String(parsed.emailClient || ''),
    numeroBl: String(parsed.numeroBl || ''),
    numeroCommande: String(parsed.numeroCommande || ''),
    description,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
    return json(res, 500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY / ANTHROPIC_API_KEY manquants' });
  }
  // Auth admin
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = authHeader.slice('Bearer '.length).trim();
  let user;
  try {
    const { data } = await admin.auth.getUser(token);
    user = data?.user;
  } catch (e) { return json(res, 401, { error: 'Unauthorized' }); }
  if (!user || user.user_metadata?.role !== 'admin') return json(res, 403, { error: 'Admin requis' });

  const body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {});
  const entries = Array.isArray(body.entries) ? body.entries.slice(0, 25) : [];
  if (entries.length === 0) return json(res, 400, { error: 'entries[] requis (max 25 par appel)' });

  const startedAt = Date.now();
  const stats = { processed: 0, errors: [], durationMs: 0 };

  const processOne = async (e) => {
    if (Date.now() - startedAt > 55_000) return; // safety
    try {
      const cacheK = iaCacheKey(e.inboxEmail, e.messageId, e.attachmentId);
      const { data: row } = await admin.from('storage').select('value').eq('key', cacheK).maybeSingle();
      const cached = row?.value ? JSON.parse(row.value) : null;
      const sp = cached?.storagePath;
      if (!sp) { stats.errors.push({ ...e, error: 'PDF non archivé (storagePath manquant) — fais un nouveau cron pour le récupérer' }); return; }
      const { data: blob, error: dlErr } = await admin.storage.from(ARCHIVE_BUCKET).download(sp);
      if (dlErr || !blob) { stats.errors.push({ ...e, error: `Bucket : ${dlErr?.message || 'download failed'}` }); return; }
      const ab = await blob.arrayBuffer();
      const base64 = Buffer.from(ab).toString('base64');
      // Re-IA
      const ia = await extractFromPdf(base64);
      // Si pas une facture/avoir → on garde le notFacture flag pour ne pas
      //   polluer le drive. Sinon overwrite.
      if (ia.documentType !== 'facture' && ia.documentType !== 'avoir') {
        await admin.from('storage').upsert({
          key: cacheK,
          value: JSON.stringify({
            notFacture: true,
            documentType: ia.documentType,
            originalFilename: cached?.originalFilename || '',
            analyzedAt: new Date().toISOString(),
            reanalyzedAt: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        });
        stats.processed++;
        return;
      }
      // Si fournisseur a changé → on re-range le PDF dans le bon dossier
      let newSp = sp;
      const newPath = archivePath(ia.fournisseur, ia.factureNo, e.messageId, e.attachmentId);
      if (newPath !== sp) {
        try {
          const buf = Buffer.from(base64, 'base64');
          const { error } = await admin.storage.from(ARCHIVE_BUCKET).upload(newPath, buf, {
            contentType: 'application/pdf', upsert: true,
          });
          if (!error) {
            // Supprime l'ancien (best-effort, pas critique)
            await admin.storage.from(ARCHIVE_BUCKET).remove([sp]).catch(() => {});
            newSp = newPath;
          }
        } catch (e2) { /* on garde l'ancien path */ }
      }
      await admin.from('storage').upsert({
        key: cacheK,
        value: JSON.stringify({
          ...ia,
          storagePath: newSp,
          originalFilename: cached?.originalFilename || '',
          analyzedAt: cached?.analyzedAt || new Date().toISOString(),
          reanalyzedAt: new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      });
      stats.processed++;
    } catch (err) {
      stats.errors.push({ ...e, error: err?.message || 'unknown' });
    }
  };

  // Batch parallèle de PARALLEL
  for (let i = 0; i < entries.length; i += PARALLEL) {
    if (Date.now() - startedAt > 55_000) break;
    await Promise.allSettled(entries.slice(i, i + PARALLEL).map(processOne));
  }
  stats.durationMs = Date.now() - startedAt;
  return json(res, 200, { data: stats });
}
