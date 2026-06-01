// Endpoint public pour le lien chantier envoyé au poseur.
// - GET ?token=...   : renvoie les infos du chantier (lecture seule).
// - POST ?token=...  : upload d'une photo prise sur place (body JSON avec dataUrl).
//
// Le token est généré côté CRM, stocké sur le dossier (`poseurToken`). On scanne
// la liste des dossiers (clé `dossiers-data` dans la table key/value) pour
// trouver celui qui a ce token. C'est suffisant tant qu'on est sur 1000-2000
// dossiers max — au-delà on passera par un index.
//
// Le token sert d'auth : sans token valide, rien n'est accessible. Le poseur
// n'a pas besoin d'avoir un compte Supabase.

import { createClient } from '@supabase/supabase-js';

// Variables d'env. Aligné sur les autres endpoints (send-email.js, users.js,
// etc.) qui utilisent SUPABASE_SERVICE_KEY (et pas SUPABASE_SERVICE_ROLE_KEY).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'dossier-documents';

// Init paresseuse du client Supabase : on ne le crée qu'à la 1ère requête.
// Si on l'instanciait au top-level avec une variable d'env manquante, le
// chargement du module ferait planter le déploiement Vercel entier.
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  _supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

function bad(res, code, error) {
  return res.status(code).json({ error });
}

async function loadDossierByToken(supabase, token) {
  const { data, error } = await supabase
    .from('storage')
    .select('value')
    .eq('key', 'dossiers-data')
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return { list: [], idx: -1 };
  const list = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  if (!Array.isArray(list)) return { list: [], idx: -1 };
  const idx = list.findIndex(d => d && d.poseurToken === token);
  return { list, idx };
}

async function saveDossiers(supabase, list) {
  const { error } = await supabase.from('storage').upsert({
    key: 'dossiers-data',
    value: JSON.stringify(list),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  if (!supabase) {
    return bad(res, 500, 'Configuration serveur manquante (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
  }

  const token = (req.query && req.query.token) || (req.body && req.body.token);
  if (!token || typeof token !== 'string' || token.length < 16) {
    return bad(res, 400, 'Token invalide');
  }

  try {
    const { list, idx } = await loadDossierByToken(supabase, token);
    if (idx === -1) return bad(res, 404, 'Lien introuvable ou expiré');
    const d = list[idx];

    if (req.method === 'GET') {
      return res.status(200).json({
        nom: d.nom || '',
        prenom: d.prenom || '',
        adresse: d.adresse || '',
        codePostal: d.codePostal || '',
        ville: d.ville || '',
        telephone: d.telephone || '',
        email: d.email || '',
        dateInsta: d.dateInsta || '',
        produits: d.produits || [],
        puissance: d.puissance || 0,
        typeToit: d.typeToit || '',
        orientationPanneaux: d.orientationPanneaux || '',
        instructionsPose: d.instructionsPose || '',
        photosChantier: d.photosChantier || [],
        poseSignature: d.poseSignature || null,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // ✍️ Signature client (PV de réception de pose). On stocke l'image PNG
      // de la signature dans le bucket + un objet poseSignature sur le dossier
      // (nom du signataire, date, IP approximative pour traçabilité légère).
      if (body.action === 'signature') {
        const { dataUrl, signerName } = body;
        if (!dataUrl) return bad(res, 400, 'Signature manquante');
        const sm = String(dataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (!sm) return bad(res, 400, 'Format de signature invalide');
        const sigBuffer = Buffer.from(sm[2], 'base64');
        if (sigBuffer.length > 2 * 1024 * 1024) return bad(res, 413, 'Signature trop lourde');
        const sigPath = `chantier-signatures/${token}/${Date.now()}-pv.png`;
        const { error: sigErr } = await supabase.storage.from(BUCKET).upload(sigPath, sigBuffer, {
          contentType: sm[1],
          upsert: false,
        });
        if (sigErr) return bad(res, 500, 'Upload signature : ' + sigErr.message);
        const poseSignature = {
          path: sigPath,
          signerName: String(signerName || `${d.nom || ''} ${d.prenom || ''}`).trim().slice(0, 120),
          signedAt: new Date().toISOString(),
          signedFrom: 'lien-poseur',
        };
        list[idx] = { ...d, poseSignature };
        await saveDossiers(supabase, list);
        return res.status(200).json({ ok: true, poseSignature });
      }

      const { name, dataUrl } = body;
      if (!name || !dataUrl) return bad(res, 400, 'Photo manquante');
      const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return bad(res, 400, 'Format de photo invalide');
      const contentType = m[1];
      const buffer = Buffer.from(m[2], 'base64');
      if (buffer.length > 8 * 1024 * 1024) {
        return bad(res, 413, 'Photo trop lourde (max 8 Mo)');
      }
      if (!contentType.startsWith('image/')) {
        return bad(res, 415, 'Seules les images sont acceptées');
      }

      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const path = `chantier-photos/${token}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType,
        upsert: false,
      });
      if (upErr) return bad(res, 500, 'Upload Supabase : ' + upErr.message);

      const photo = {
        path,
        name: safeName,
        uploadedAt: new Date().toISOString(),
        uploadedFrom: 'lien-poseur',
        size: buffer.length,
        contentType,
      };
      const updated = { ...d, photosChantier: [...(d.photosChantier || []), photo] };
      list[idx] = updated;
      await saveDossiers(supabase, list);

      return res.status(200).json({ ok: true, photosChantier: updated.photosChantier });
    }

    return bad(res, 405, 'Méthode non autorisée');
  } catch (e) {
    console.error('chantier handler error:', e);
    return bad(res, 500, e.message || 'Erreur serveur');
  }
}
