// Endpoint de synchronisation : reçoit les modifs faites dans les Google
// Sheets (Yolico + Elsun) et les applique au dossier correspondant côté
// CRM. Conçu pour être appelé depuis un Google Apps Script onEdit().
//
// Architecture cible (Phase 1) :
//   - Le sheet reste la référence pendant la transition.
//   - Pour chaque cellule modifiée dans le sheet, Apps Script envoie ici
//     la ligne entière mappée vers la structure dossier.
//   - On retrouve le dossier par `id` (= numéro Chelly de la colonne B).
//   - On merge les champs reçus dans le dossier existant. Pas de création.
//
// Sécurité : token partagé (Bearer) stocké côté Vercel dans la variable
// d'env SHEET_SYNC_SECRET, et côté Apps Script dans les Script Properties.
// Sans le bon token → 401.
//
// Limite stratégique : on n'accepte les pushes QUE pour les sociétés
// 'yolico' et 'elsun' (cf scope d'aujourd'hui). Toute autre `societe` est
// rejetée (404). Évite qu'un script malveillant push n'importe où.
//
// Variables d'env requises côté Vercel :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY
//   - SHEET_SYNC_SECRET   ← le secret partagé avec Apps Script

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SHEET_SYNC_SECRET = process.env.SHEET_SYNC_SECRET;

const ALLOWED_SOCIETES = new Set(['yolico', 'elsun']);

// Champs autorisés à être patchés depuis le sheet. Tout autre champ envoyé
// est ignoré silencieusement — protège contre les pushes accidentels qui
// écraseraient des champs gérés exclusivement côté CRM (documents, photos
// chantier, historique, tokens, etc.).
const SYNCABLE_FIELDS = new Set([
  // Identité client
  'nom', 'prenom', 'telephone', 'email', 'adresse', 'codePostal', 'ville',
  // Workflow
  'statut', 'statutPose', 'consuel', 'statutConsuel', 'accordDef',
  // Dates
  'dateSignature', 'dateInsta', 'datePoseTerminee', 'dateEnvoiFin',
  'dateRetourFin', 'dateAccord', 'dateConsuel', 'payeClientDate',
  'datePaiementBanque',
  // Financement / argent
  'financement', 'montantTotal', 'montantHtCustom', 'tauxTvaVente',
  'payeClient', 'statutFin', 'observationBanque',
  // Produit
  'puissance', 'produits',
  // Prestataires (tableaux complets — atomique)
  'fournisseurs', 'regies', 'poseurs',
  // Méta import
  'idAncienCrm', 'societe',
]);

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function makeAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function checkAuth(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h || !h.startsWith('Bearer ')) return false;
  const token = h.slice('Bearer '.length).trim();
  if (!token || !SHEET_SYNC_SECRET) return false;
  return token === SHEET_SYNC_SECRET;
}

export default async function handler(req, res) {
  // CORS pour Apps Script (qui appelle depuis script.google.com).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  // Garde-fou d'env — message explicite si une variable manque côté Vercel.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, { error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_KEY missing' });
  }
  if (!SHEET_SYNC_SECRET) {
    return json(res, 500, { error: 'Server misconfigured: SHEET_SYNC_SECRET missing (sync désactivée)' });
  }

  if (!checkAuth(req)) {
    return json(res, 401, { error: 'Bad or missing Bearer token' });
  }

  try {
    const body = req.body || {};
    const { id, societe, fields } = body;

    if (!id || typeof id !== 'string' && typeof id !== 'number') {
      return json(res, 400, { error: 'id requis (= numéro de dossier, colonne B du sheet)' });
    }
    if (!societe || !ALLOWED_SOCIETES.has(String(societe).toLowerCase())) {
      return json(res, 400, { error: `societe invalide. Attendu: ${[...ALLOWED_SOCIETES].join(' | ')}` });
    }
    if (!fields || typeof fields !== 'object') {
      return json(res, 400, { error: 'fields requis (objet des champs à patcher)' });
    }

    const idStr = String(id).trim();
    const societeNorm = String(societe).toLowerCase();

    // Lit la valeur actuelle de la clé dossiers-data.
    const admin = makeAdmin();
    const { data: row, error: getErr } = await admin
      .from('storage')
      .select('value')
      .eq('key', 'dossiers-data')
      .maybeSingle();
    if (getErr) throw new Error('Lecture dossiers-data : ' + getErr.message);
    if (!row?.value) return json(res, 404, { error: 'dossiers-data introuvable (CRM vide ?)' });

    let dossiers;
    try { dossiers = JSON.parse(row.value); } catch (e) { throw new Error('dossiers-data corrompu : ' + e.message); }
    if (!Array.isArray(dossiers)) return json(res, 500, { error: 'dossiers-data n\'est pas un tableau' });

    // Trouve le dossier par id + société. On filtre aussi par société pour
    // éviter qu'un id Yolico (ex: 68975) collisionne avec un id Elsun du
    // même numéro (chaque sheet est indépendant côté Chelly).
    const idx = dossiers.findIndex(d => d && String(d.id || '').trim() === idStr && (d.societe || '').toLowerCase() === societeNorm);
    if (idx === -1) {
      return json(res, 404, {
        error: `Aucun dossier trouvé pour id=${idStr} societe=${societeNorm}`,
        hint: 'Le dossier doit déjà exister côté CRM (créé via l\'import initial). La sync ne crée pas de nouveaux dossiers.',
      });
    }

    // Filtre les champs : on ne touche QUE ce qui est autorisé.
    const sanitized = {};
    let appliedCount = 0;
    const ignored = [];
    for (const [k, v] of Object.entries(fields)) {
      if (SYNCABLE_FIELDS.has(k)) {
        sanitized[k] = v;
        appliedCount += 1;
      } else {
        ignored.push(k);
      }
    }

    if (appliedCount === 0) {
      return json(res, 200, {
        ok: true,
        applied: 0,
        ignored,
        note: 'Aucun champ syncable dans le payload — rien à appliquer.',
      });
    }

    // Merge : champs scalaires écrasés, tableaux remplacés en entier (atomique).
    const before = dossiers[idx];
    const now = new Date().toISOString();
    dossiers[idx] = {
      ...before,
      ...sanitized,
      // Trace que ce dossier a été touché par la sync (pour debug + UI future).
      lastSyncedFromSheetAt: now,
      modifiedAt: now,
      modifiedBy: '[sheet-sync]',
    };

    const newJson = JSON.stringify(dossiers);
    const { error: setErr } = await admin
      .from('storage')
      .upsert({ key: 'dossiers-data', value: newJson, updated_at: now });
    if (setErr) throw new Error('Écriture dossiers-data : ' + setErr.message);

    return json(res, 200, {
      ok: true,
      id: idStr,
      societe: societeNorm,
      applied: appliedCount,
      ignored,
      syncedAt: now,
    });
  } catch (e) {
    const msg = e?.message || 'Erreur serveur';
    return json(res, 500, { error: msg });
  }
}
