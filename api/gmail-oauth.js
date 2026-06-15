// Fonction serverless Vercel : gère les boîtes Gmail connectées (multi-comptes)
// + scan des factures reçues et téléchargement des pièces jointes PDF.
//
// Pourquoi tout dans un seul fichier ? Limite 12 fonctions serverless sur le
// plan Hobby de Vercel — on est au max. Tout est donc dispatché via
// `?action=` sur ce même endpoint plutôt que de créer un nouveau fichier.
//
//   GET     /api/gmail-oauth                       → liste des boîtes Gmail
//                                                    connectées (sans tokens)
//   DELETE  /api/gmail-oauth                       → supprime TOUTES les boîtes
//   DELETE  /api/gmail-oauth?email=foo@bar.com     → supprime UNE boîte
//   POST    /api/gmail-oauth?action=scan           → scan toutes les boîtes
//                                                    pour PDFs récents
//                                                    (factures prestataires)
//   POST    /api/gmail-oauth?action=fetch-attachment
//                  body: { email, messageId, attachmentId }
//                                                  → renvoie le PDF en base64
//
// Variables d'env requises :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY
//   - GOOGLE_CLIENT_ID
//   - GOOGLE_CLIENT_SECRET  (pour refresh access tokens)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function getUserIdFromAuth(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { error: { status: 401, msg: 'Unauthorized' } };
  const token = authHeader.slice('Bearer '.length).trim();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return { error: { status: 401, msg: 'Token invalide' } };
  return { userId: userData.user.id, admin };
}

// 📦 Helper : lit le storage et renvoie TOUJOURS un array de boîtes.
//   - null → []
//   - objet legacy {refreshToken, email...} → [objet]
//   - array → array
async function readInboxes(admin, userId) {
  const { data: row } = await admin.from('storage')
    .select('value')
    .eq('key', `gmail-oauth:${userId}`)
    .maybeSingle();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed.filter(b => b && b.refreshToken);
    if (parsed && parsed.refreshToken) return [parsed];
  } catch (e) {}
  return [];
}

async function writeInboxes(admin, userId, inboxes) {
  if (!inboxes || inboxes.length === 0) {
    await admin.from('storage').delete().eq('key', `gmail-oauth:${userId}`);
    return;
  }
  await admin.from('storage').upsert({
    key: `gmail-oauth:${userId}`,
    value: JSON.stringify(inboxes),
    updated_at: new Date().toISOString(),
  });
}

// 🔄 Renouvelle un access token Google à partir du refresh token.
async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'refresh failed');
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
}

// S'assure qu'une inbox a un access token valide. Renouvelle si besoin et
// renvoie le token utilisable. Persiste les nouveaux tokens en passant.
async function ensureAccessToken(admin, userId, inbox, allInboxes) {
  const needRefresh = !inbox.accessToken || !inbox.expiresAt || inbox.expiresAt < Date.now() + 60000;
  if (!needRefresh) return inbox.accessToken;
  const { accessToken, expiresIn } = await refreshAccessToken(inbox.refreshToken);
  inbox.accessToken = accessToken;
  inbox.expiresAt = Date.now() + expiresIn * 1000;
  await writeInboxes(admin, userId, allInboxes);
  return accessToken;
}

// 🔍 Liste les messages Gmail récents avec pièces jointes PDF.
// Critère : reçus dans les 60 derniers jours, has:attachment, filename:pdf
// (filtre Gmail natif, plus efficace que parser tous les messages).
async function listMessagesWithPdf(accessToken, maxResults = 50) {
  const q = encodeURIComponent('newer_than:60d has:attachment filename:pdf');
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gmail list failed');
  return data.messages || [];
}

// 📩 Récupère les métadonnées d'un message (sujet, expéditeur, date, attachments).
async function getMessageMeta(accessToken, messageId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gmail get failed');
  const headers = (data.payload?.headers || []).reduce((acc, h) => {
    acc[h.name.toLowerCase()] = h.value;
    return acc;
  }, {});
  // Cherche récursivement les pièces jointes PDF.
  const attachments = [];
  const walkParts = (parts) => {
    (parts || []).forEach(p => {
      if (p.parts) walkParts(p.parts);
      if (p.filename && /\.pdf$/i.test(p.filename) && p.body?.attachmentId) {
        attachments.push({
          attachmentId: p.body.attachmentId,
          filename: p.filename,
          sizeBytes: p.body.size || 0,
          mimeType: p.mimeType || 'application/pdf',
        });
      }
    });
  };
  walkParts(data.payload?.parts);
  // Le payload racine peut aussi être l'attachement si single-part PDF.
  if (data.payload?.filename && /\.pdf$/i.test(data.payload.filename) && data.payload.body?.attachmentId) {
    attachments.push({
      attachmentId: data.payload.body.attachmentId,
      filename: data.payload.filename,
      sizeBytes: data.payload.body.size || 0,
      mimeType: data.payload.mimeType || 'application/pdf',
    });
  }
  return {
    messageId,
    subject: headers['subject'] || '(sans sujet)',
    from: headers['from'] || '',
    date: headers['date'] || '',
    internalDate: data.internalDate || '',
    attachments,
  };
}

// 📥 Télécharge le contenu d'une pièce jointe (Gmail renvoie en base64url
// → on convertit en base64 standard pour le frontend).
async function getAttachment(accessToken, messageId, attachmentId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gmail attachment failed');
  // Convertit base64url Gmail → base64 standard.
  const base64 = String(data.data || '').replace(/-/g, '+').replace(/_/g, '/');
  return { base64, sizeBytes: data.size || 0 };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const auth = await getUserIdFromAuth(req);
    if (auth.error) return json(res, auth.error.status, { error: auth.error.msg });
    const { userId, admin } = auth;

    // ───── GET : liste des boîtes connectées (sans tokens) ─────
    if (req.method === 'GET') {
      const inboxes = await readInboxes(admin, userId);
      return json(res, 200, {
        data: {
          connected: inboxes.length > 0,
          // Compat ascendante avec l'ancien shape { email, connectedAt }
          email: inboxes[0]?.email || null,
          connectedAt: inboxes[0]?.connectedAt || null,
          inboxes: inboxes.map(b => ({
            email: b.email,
            connectedAt: b.connectedAt || null,
            // Précise si la lecture (scan factures) est dispo pour cette boîte.
            canScan: (b.scopes || []).some(s => s.includes('gmail.readonly')),
          })),
        },
      });
    }

    // ───── DELETE : supprime UNE boîte (avec ?email=) ou toutes ─────
    if (req.method === 'DELETE') {
      const targetEmail = (req.query?.email || '').toString().trim().toLowerCase();
      if (!targetEmail) {
        await writeInboxes(admin, userId, []);
        return json(res, 200, { data: { disconnected: 'all' } });
      }
      const inboxes = await readInboxes(admin, userId);
      const next = inboxes.filter(b => (b.email || '').toLowerCase() !== targetEmail);
      await writeInboxes(admin, userId, next);
      return json(res, 200, { data: { disconnected: targetEmail, remaining: next.length } });
    }

    // ───── POST : actions de scan / fetch ─────
    const action = (req.query?.action || '').toString();
    const body = req.body || {};

    if (action === 'scan') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return json(res, 503, { error: 'OAuth Google non configuré (variables Vercel).' });
      }
      const inboxes = await readInboxes(admin, userId);
      if (inboxes.length === 0) {
        return json(res, 200, { data: { results: [], notes: 'Aucune boîte Gmail connectée.' } });
      }
      const results = [];
      const errors = [];
      // Scan séquentiel par boîte (parallèle = risque de quota Gmail trop vite).
      for (const inbox of inboxes) {
        // Seulement les boîtes avec scope readonly.
        const canScan = (inbox.scopes || []).some(s => s.includes('gmail.readonly'));
        if (!canScan) {
          errors.push({ email: inbox.email, error: 'Pas de scope lecture — reconnecte cette boîte pour activer le scan.' });
          continue;
        }
        try {
          const accessToken = await ensureAccessToken(admin, userId, inbox, inboxes);
          const messages = await listMessagesWithPdf(accessToken, 60);
          // Récupère les métadonnées de chaque message (sujet, attachments).
          const enriched = [];
          for (const m of messages) {
            try {
              const meta = await getMessageMeta(accessToken, m.id);
              if (meta.attachments.length > 0) enriched.push(meta);
            } catch (e) {
              // Un message qui foire ne casse pas le reste.
            }
          }
          results.push({
            email: inbox.email,
            messages: enriched,
            count: enriched.length,
          });
        } catch (e) {
          errors.push({ email: inbox.email, error: e?.message || 'Scan échoué' });
        }
      }
      return json(res, 200, { data: { results, errors } });
    }

    if (action === 'fetch-attachment') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return json(res, 503, { error: 'OAuth Google non configuré.' });
      }
      const { email: inboxEmail, messageId, attachmentId } = body;
      if (!inboxEmail || !messageId || !attachmentId) {
        return json(res, 400, { error: 'email, messageId, attachmentId requis.' });
      }
      const inboxes = await readInboxes(admin, userId);
      const inbox = inboxes.find(b => (b.email || '').toLowerCase() === String(inboxEmail).toLowerCase());
      if (!inbox) return json(res, 404, { error: 'Boîte Gmail non trouvée.' });
      const accessToken = await ensureAccessToken(admin, userId, inbox, inboxes);
      const { base64, sizeBytes } = await getAttachment(accessToken, messageId, attachmentId);
      return json(res, 200, { data: { base64, sizeBytes, mimeType: 'application/pdf' } });
    }

    return json(res, 400, { error: `Action inconnue : ${action || '(vide)'}. Utilise scan ou fetch-attachment.` });
  } catch (e) {
    console.error('gmail-oauth error:', e?.message || e);
    return json(res, 502, { error: e?.message || 'Erreur Gmail OAuth' });
  }
}
