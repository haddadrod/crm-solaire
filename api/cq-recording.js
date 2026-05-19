// Fonction serverless Vercel : webhook ONOFF Business.
// Quand un appel sortant CQ se termine et qu'un enregistrement est dispo,
// ONOFF nous envoie ici un POST avec callRecordingUrl. On télécharge l'audio,
// on le dépose dans Supabase Storage, et on remplit auto le champ `vocalCQUrl`
// du dossier qui matche le numéro appelé.
//
// Variables d'env requises (sans préfixe VITE_) :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY
//   - ONOFF_WEBHOOK_TOKEN   : secret partagé avec ONOFF (Bearer ou X-Onoff-Token)
//
// Côté ONOFF (admin.onoffbusiness.com) :
//   1. Activer "Enregistrement des appels" pour la ligne CQ
//   2. Aller dans Webhooks → ajouter https://<vercel-domain>/api/cq-recording
//   3. Header : Authorization: Bearer <ONOFF_WEBHOOK_TOKEN>
//
// Payload attendu (cf. docs.onoffbusiness.com/webhook/reference/send-call-log) :
//   { eventName, callDirection: "outbound"|"inbound", externalNumber, onoffUserName,
//     callRecordingUrl, callStarted, callDuration, ... }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ONOFF_WEBHOOK_TOKEN = process.env.ONOFF_WEBHOOK_TOKEN;

const BUCKET = 'dossier-documents';
const RECORDING_FOLDER = 'onoff-recordings';
const SIGNED_URL_DURATION_SEC = 60 * 60 * 24 * 365; // 1 an

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

// Doit rester strictement aligné avec normalizePhoneE164 côté front (DossierSaisie.jsx).
function normalizePhoneE164(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s;
  if (s.startsWith('33') && s.length >= 11) return '+' + s;
  if (s.startsWith('0') && s.length === 10) return '+33' + s.slice(1);
  return s;
}

async function readJsonKey(admin, key) {
  const { data } = await admin.from('storage').select('value').eq('key', key).maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value); } catch (e) { return null; }
}

async function writeJsonKey(admin, key, value) {
  return admin.from('storage').upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
}

export default async function handler(req, res) {
  // CORS — l'admin ONOFF (admin.onoffbusiness.com) lance peut-être une
  // requête depuis le navigateur pour valider l'URL avant d'enregistrer le
  // webhook. Sans réponse CORS appropriée le test échoue.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Onoff-Token');
  res.setHeader('Access-Control-Max-Age', '86400');

  // OPTIONS : preflight CORS — on répond 204 sans body.
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  // GET / HEAD : ping de validation utilisé par ONOFF (et navigateur) pour
  // vérifier que l'endpoint existe avant d'enregistrer le webhook. On répond
  // 200 OK sans auth — il n'y a aucun traitement, juste un "je suis là".
  if (req.method === 'GET' || req.method === 'HEAD') {
    return json(res, 200, { ok: true, endpoint: 'cq-recording', accepts: 'POST' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 503, { error: 'Supabase non configuré côté serveur.' });
  }
  if (!ONOFF_WEBHOOK_TOKEN) {
    return json(res, 503, { error: 'Webhook non configuré (ONOFF_WEBHOOK_TOKEN manquant).' });
  }

  // Authentification du webhook : on accepte le token dans
  //   - Authorization: Bearer <token>
  //   - X-API-Key: <token>
  //   - X-Onoff-Token: <token>
  //   - ?key=<token> en query string
  // ONOFF ne documente pas publiquement comment leur champ "API key" est
  // transmis ; cette tolérance évite d'avoir à deviner.
  const auth = req.headers['authorization'] || '';
  const xApi = req.headers['x-api-key'] || '';
  const xOnoff = req.headers['x-onoff-token'] || '';
  const qkey = (req.query && req.query.key) || '';
  const provided = (
    auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() :
    String(xApi || xOnoff || qkey || '').trim()
  );
  if (!provided || provided !== ONOFF_WEBHOOK_TOKEN) {
    return json(res, 401, { error: 'Webhook non autorisé.' });
  }

  const payload = req.body || {};
  const {
    callRecordingUrl,
    externalNumber,
    callDirection,
    callDuration,
    callStarted,
    onoffUserName,
    eventName,
  } = payload;

  // Pas d'enregistrement → on accuse réception (ONOFF nous envoie aussi des appels sans recording).
  if (!callRecordingUrl) {
    return json(res, 200, { ok: true, note: 'No callRecordingUrl in payload (call not recorded).' });
  }
  if (!externalNumber) {
    return json(res, 200, { ok: true, note: 'No externalNumber, cannot match a dossier.' });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Cherche un appel CQ en attente qui matche le numéro.
  const pending = (await readJsonKey(admin, 'pending-onoff-calls')) || [];
  const now = Date.now();
  const normExternal = normalizePhoneE164(externalNumber);
  const matches = (Array.isArray(pending) ? pending : [])
    .filter(c => c && c.expiresAt > now && c.telephone === normExternal && c.type === 'cq')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const target = matches[0];

  // 2) Aucun match → on garde la trace en "orphelin" pour rattachement manuel.
  if (!target) {
    const orphans = (await readJsonKey(admin, 'orphan-onoff-calls')) || [];
    const list = Array.isArray(orphans) ? orphans : [];
    list.push({
      externalNumber,
      normalizedExternal: normExternal,
      callRecordingUrl,
      callDirection,
      callDuration,
      callStarted,
      onoffUserName,
      eventName,
      receivedAt: new Date().toISOString(),
    });
    const capped = list.length > 100 ? list.slice(-100) : list;
    await writeJsonKey(admin, 'orphan-onoff-calls', capped);
    return json(res, 200, { ok: true, orphan: true, note: 'No matching dossier found, stored as orphan.' });
  }

  // 3) Télécharge l'audio depuis ONOFF.
  let audioBuffer;
  let contentType = 'audio/mpeg';
  try {
    const r = await fetch(callRecordingUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    contentType = r.headers.get('content-type') || contentType;
    const ab = await r.arrayBuffer();
    audioBuffer = Buffer.from(ab);
  } catch (e) {
    return json(res, 502, { error: `Téléchargement enregistrement échoué : ${e.message}` });
  }

  // Devine l'extension à partir du content-type ou de l'URL.
  let ext = 'mp3';
  if (/mpeg/.test(contentType)) ext = 'mp3';
  else if (/wav/.test(contentType)) ext = 'wav';
  else if (/m4a|aac|mp4/.test(contentType)) ext = 'm4a';
  else if (/ogg/.test(contentType)) ext = 'ogg';
  else {
    const m = callRecordingUrl.match(/\.(mp3|m4a|wav|ogg|aac)(?:[?#]|$)/i);
    if (m) ext = m[1].toLowerCase();
  }

  // 4) Upload dans Supabase Storage.
  const safeId = String(target.dossierLocalId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `${RECORDING_FOLDER}/${safeId}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, audioBuffer, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    return json(res, 502, { error: `Upload Supabase échoué : ${upErr.message}` });
  }
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_DURATION_SEC);
  if (signErr || !signed?.signedUrl) {
    return json(res, 502, { error: `Génération URL signée échouée : ${signErr?.message || 'inconnu'}` });
  }
  const audioUrl = signed.signedUrl;

  // 5) Attache au dossier ciblé.
  const dossiers = (await readJsonKey(admin, 'dossiers-data')) || [];
  if (!Array.isArray(dossiers)) {
    return json(res, 200, { ok: true, error: 'dossiers-data introuvable ou corrompu.' });
  }
  const idx = dossiers.findIndex(d => d && d.localId === target.dossierLocalId);
  if (idx === -1) {
    return json(res, 200, { ok: true, error: 'Dossier supprimé entre temps, enregistrement déposé mais non rattaché.', path: storagePath });
  }
  const today = new Date().toISOString().split('T')[0];
  dossiers[idx] = {
    ...dossiers[idx],
    vocalCQUrl: audioUrl,
    dateControleQualite: dossiers[idx].dateControleQualite || today,
    onoffCallMeta: {
      callStarted,
      callDuration,
      callDirection,
      onoffUserName,
      externalNumber,
      storagePath,
      attachedAt: new Date().toISOString(),
    },
  };
  await writeJsonKey(admin, 'dossiers-data', dossiers);

  // 6) Retire l'appel des "en attente".
  const remaining = pending.filter(c => c && (c.dossierLocalId !== target.dossierLocalId || c.createdAt !== target.createdAt));
  await writeJsonKey(admin, 'pending-onoff-calls', remaining);

  return json(res, 200, {
    ok: true,
    attached: target.dossierLocalId,
    path: storagePath,
    duration: callDuration,
  });
}
