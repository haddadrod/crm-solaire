// Fonction serverless Vercel : pousse une facture prestataire (fournisseur,
// poseur, régie) vers Pennylane via leur API REST v2.
//
// Multi-société : la clé Pennylane est choisie en fonction du champ
// `societe` envoyé dans le body. Convention env Vercel :
//   PENNYLANE_API_KEY_YOLICO  → société Yolico
//   PENNYLANE_API_KEY_ELSUN   → société Elsun
//   PENNYLANE_API_KEY         → fallback générique (compat ancienne config)
//
// Workflow :
//   1. Cherche le fournisseur par nom dans Pennylane (GET /suppliers)
//   2. Upload le PDF de la facture (POST /file_attachments, multipart)
//   3. Crée la facture fournisseur (POST /supplier_invoices/import) avec
//      file_attachment_id + supplier_id + montants
//
// Variables d'environnement requises côté Vercel :
//   - PENNYLANE_API_KEY_YOLICO / PENNYLANE_API_KEY_ELSUN / PENNYLANE_API_KEY
//   - SUPABASE_URL          : pour valider le JWT appelant
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PL_BASE = 'https://app.pennylane.com/api/external/v2';

// Choisit la clé Pennylane en fonction de la société émettrice du dossier.
// Convention : PENNYLANE_API_KEY_<SOCIETE>. Fallback sur PENNYLANE_API_KEY
// pour ne pas casser les pousses existantes le temps que la config Vercel
// soit mise à jour.
function pickApiKey(societe) {
  const norm = String(societe || '').toUpperCase().trim();
  if (norm) {
    const specific = process.env[`PENNYLANE_API_KEY_${norm}`];
    if (specific) return { key: specific, source: `PENNYLANE_API_KEY_${norm}` };
  }
  const generic = process.env.PENNYLANE_API_KEY;
  if (generic) return { key: generic, source: 'PENNYLANE_API_KEY (fallback)' };
  return { key: null, source: null };
}

// 🔐 Tente de lire la clé Pennylane stockée DANS Supabase (configurable depuis
// le CRM par un admin via /api/pennylane-keys). Si trouvée → on l'utilise.
// Sinon → fallback sur pickApiKey() (variables d'env Vercel).
//
// Préfixe `secret-` : exclu de la lecture authenticated par la nouvelle
// politique RLS (SUPABASE_SECRETS_RLS.sql), donc seul le serveur (service_role)
// peut lire ces valeurs.
async function resolveApiKey(societe) {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const norm = String(societe || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (norm) {
      try {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data } = await admin.from('storage').select('value').eq('key', `secret-pennylane-${norm}`).maybeSingle();
        const v = data?.value;
        if (v && String(v).trim()) {
          return { key: String(v).trim(), source: `CRM (secret-pennylane-${norm})` };
        }
      } catch (e) {
        console.error('resolveApiKey from Supabase failed:', e?.message);
      }
    }
  }
  return pickApiKey(societe);
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

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

// Conversion taux TVA → code Pennylane (codes français)
function vatRateCode(tauxTva) {
  const r = parseFloat(tauxTva);
  if (!r || r === 0) return 'exempt';
  if (r === 20) return 'FR_200';
  if (r === 10) return 'FR_100';
  if (r === 5.5 || r === 5) return 'FR_055';
  if (r === 2.1) return 'FR_021';
  return 'FR_200'; // fallback raisonnable
}

// Helper : appel HTTP authentifié à l'API Pennylane.
// La clé est passée explicitement (multi-société) pour éviter une variable
// globale qui se ferait écraser entre 2 invocations Vercel concurrentes.
async function plFetch(apiKey, path, options = {}) {
  const res = await fetch(`${PL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, payload };
}

// Cherche un fournisseur par nom (insensitive). Renvoie son id ou null.
async function findSupplierByName(apiKey, name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 10; page++) {
    const { ok, status, payload } = await plFetch(apiKey, `/suppliers?page=${page}&per_page=100`);
    if (!ok) throw new Error(`Pennylane GET /suppliers ${status} : ${JSON.stringify(payload)}`);
    const items = payload?.items || payload?.data || payload?.suppliers || (Array.isArray(payload) ? payload : []);
    if (!items || items.length === 0) return null;
    const found = items.find((s) => String(s.name || '').trim().toLowerCase() === target);
    if (found) return found.id;
    if (items.length < 100) return null;
  }
  return null;
}

// Crée un fournisseur dans Pennylane (compte de la société) → renvoie son id.
// Appelé quand le fournisseur n'existe pas encore. Pennylane n'exige que le
// `name` (les autres champs comme le pays ne sont pas acceptés ici).
async function createSupplier(apiKey, name) {
  const supplierBody = {
    name: String(name || '').trim(),
  };
  const { ok, status, payload } = await plFetch(apiKey, `/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(supplierBody),
  });
  if (!ok) throw new Error(`Pennylane POST /suppliers ${status} : ${JSON.stringify(payload)}`);
  const id = payload?.id || payload?.supplier?.id || payload?.data?.id;
  if (!id) throw new Error(`Pennylane : id fournisseur manquant après création`);
  return id;
}

// Upload un PDF en multipart vers /file_attachments → renvoie l'id du fichier.
async function uploadPdfAttachment(apiKey, base64, fileName) {
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  form.append('file', blob, fileName || 'facture.pdf');
  const res = await fetch(`${PL_BASE}/file_attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(`Pennylane POST /file_attachments ${res.status} : ${JSON.stringify(payload)}`);
  const id = payload?.id || payload?.file_attachment?.id || payload?.data?.id;
  if (!id) throw new Error(`Pennylane file_attachment id manquant dans la réponse`);
  return id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const {
    societe,
    supplierName,
    factureNo,
    dateFacture,
    montantHt,
    montantTtc,
    tauxTva,
    fileBase64,
    fileName,
    storagePath,
  } = body;

  // Sélection de la clé selon la société émettrice — d'abord Supabase (CRM),
  // sinon variables d'env Vercel (legacy).
  const { key: apiKey, source: keySource } = await resolveApiKey(societe);
  if (!apiKey) {
    return json(res, 503, {
      error: societe
        ? `Pennylane non configuré pour la société "${societe}". Va dans Réglages → 🔐 Clés Pennylane pour la renseigner.`
        : 'Pennylane non configuré. Va dans Réglages → 🔐 Clés Pennylane.',
    });
  }

  if (!supplierName) return json(res, 400, { error: 'supplierName requis.' });
  if (!factureNo) return json(res, 400, { error: 'factureNo requis (N° de la facture).' });
  if (!dateFacture) return json(res, 400, { error: 'dateFacture requis (AAAA-MM-JJ).' });
  if (!fileBase64 && !storagePath) return json(res, 400, { error: 'Fichier requis (fileBase64 ou storagePath).' });

  // Récupère le PDF en base64 (depuis le body ou depuis le bucket)
  let pdfBase64 = fileBase64;
  if (!pdfBase64 && storagePath) {
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: blob, error: dlErr } = await admin.storage.from('dossier-documents').download(storagePath);
      if (dlErr || !blob) return json(res, 502, { error: `Lecture bucket impossible : ${dlErr?.message || 'inconnu'}` });
      const ab = await blob.arrayBuffer();
      pdfBase64 = Buffer.from(ab).toString('base64');
    } catch (e) {
      return json(res, 502, { error: `Téléchargement bucket échoué : ${e.message}` });
    }
  }

  try {
    // 1. Cherche le fournisseur Pennylane par nom (dans le compte de la société).
    //    S'il n'existe pas, on le crée automatiquement avec ce nom.
    let supplierId = await findSupplierByName(apiKey, supplierName);
    let supplierCreated = false;
    if (!supplierId) {
      supplierId = await createSupplier(apiKey, supplierName);
      supplierCreated = true;
    }

    // 2. Upload le PDF
    const fileAttachmentId = await uploadPdfAttachment(apiKey, pdfBase64, fileName || `${factureNo}.pdf`);

    // 3. Crée la facture fournisseur. La somme des invoice_lines doit
    //    correspondre au currency_amount sinon Pennylane renvoie 422.
    const ht = (parseFloat(montantHt) || 0).toFixed(2);
    const ttc = (parseFloat(montantTtc) || 0).toFixed(2);
    const tax = (parseFloat(montantTtc - montantHt) || 0).toFixed(2);
    const vatCode = vatRateCode(tauxTva);
    // Échéance par défaut : 30 jours après date facture
    const deadline = (() => {
      try {
        const d = new Date(dateFacture);
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      } catch (e) { return dateFacture; }
    })();

    const invoiceBody = {
      supplier_id: supplierId,
      file_attachment_id: fileAttachmentId,
      date: dateFacture,
      deadline,
      currency_amount_before_tax: ht,
      currency_tax: tax,
      currency_amount: ttc,
      label: factureNo,
      invoice_lines: [
        {
          currency_amount: ttc,
          currency_tax: tax,
          vat_rate: vatCode,
        },
      ],
    };

    const { ok, status, payload } = await plFetch(apiKey, `/supplier_invoices/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceBody),
    });
    if (!ok) {
      return json(res, 502, {
        error: `Pennylane POST /supplier_invoices/import ${status} : ${JSON.stringify(payload)}`,
      });
    }
    const invoiceId = payload?.id || payload?.invoice?.id || payload?.data?.id;
    return json(res, 200, {
      data: {
        pennylaneInvoiceId: invoiceId,
        pennylaneSupplierId: supplierId,
        pennylaneSupplierCreated: supplierCreated, // true si on l'a créé à la volée
        pennylaneStatus: payload?.status || 'imported',
        pennylaneAccount: keySource, // utile pour vérifier qu'on a tapé sur le bon compte
      },
    });
  } catch (e) {
    console.error('pennylane-push-facture error:', e?.message || e);
    return json(res, 502, { error: e?.message || 'Erreur Pennylane' });
  }
}
