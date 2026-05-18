// Fonction serverless Vercel : pousse une facture prestataire (fournisseur,
// poseur, régie) vers Pennylane via leur API REST v2.
//
// Workflow :
//   1. Cherche le fournisseur par nom dans Pennylane (GET /suppliers)
//   2. Upload le PDF de la facture (POST /file_attachments, multipart)
//   3. Crée la facture fournisseur (POST /supplier_invoices/import) avec
//      file_attachment_id + supplier_id + montants
//
// Variables d'environnement requises côté Vercel :
//   - PENNYLANE_API_KEY     : clé Bearer générée dans Pennylane → Réglages → API
//   - SUPABASE_URL          : pour valider le JWT appelant
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase

import { createClient } from '@supabase/supabase-js';

const PENNYLANE_API_KEY = process.env.PENNYLANE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PL_BASE = 'https://app.pennylane.com/api/external/v2';

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

// Helper : appel HTTP authentifié à l'API Pennylane
async function plFetch(path, options = {}) {
  const res = await fetch(`${PL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${PENNYLANE_API_KEY}`,
      ...(options.headers || {}),
    },
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, payload };
}

// Cherche un fournisseur par nom (insensitive). Renvoie son id ou null.
async function findSupplierByName(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  // Pagination simple — on parcourt les pages jusqu'à trouver
  for (let page = 1; page <= 10; page++) {
    const { ok, status, payload } = await plFetch(`/suppliers?page=${page}&per_page=100`);
    if (!ok) throw new Error(`Pennylane GET /suppliers ${status} : ${JSON.stringify(payload)}`);
    const items = payload?.items || payload?.data || payload?.suppliers || (Array.isArray(payload) ? payload : []);
    if (!items || items.length === 0) return null;
    const found = items.find((s) => String(s.name || '').trim().toLowerCase() === target);
    if (found) return found.id;
    if (items.length < 100) return null;
  }
  return null;
}

// Upload un PDF en multipart vers /file_attachments → renvoie l'id du fichier.
async function uploadPdfAttachment(base64, fileName) {
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  form.append('file', blob, fileName || 'facture.pdf');
  const res = await fetch(`${PL_BASE}/file_attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PENNYLANE_API_KEY}` },
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
  if (!PENNYLANE_API_KEY) {
    return json(res, 503, { error: "Pennylane non configuré : ajoute la variable PENNYLANE_API_KEY dans Vercel." });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const {
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
    // 1. Cherche le fournisseur Pennylane par nom
    const supplierId = await findSupplierByName(supplierName);
    if (!supplierId) {
      return json(res, 404, {
        error: `Fournisseur "${supplierName}" introuvable dans Pennylane. Crée-le d'abord dans Pennylane (avec son nom exact) puis réessaie.`,
      });
    }

    // 2. Upload le PDF
    const fileAttachmentId = await uploadPdfAttachment(pdfBase64, fileName || `${factureNo}.pdf`);

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

    const { ok, status, payload } = await plFetch(`/supplier_invoices/import`, {
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
        pennylaneStatus: payload?.status || 'imported',
      },
    });
  } catch (e) {
    console.error('pennylane-push-facture error:', e?.message || e);
    return json(res, 502, { error: e?.message || 'Erreur Pennylane' });
  }
}
