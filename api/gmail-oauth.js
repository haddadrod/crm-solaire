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
import { ImapFlow } from 'imapflow';

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

// Méthode de connexion d'une boîte : 'imap' (mot de passe d'application) si
// elle a un appPassword, sinon 'oauth' (refreshToken Google).
function boxMethod(b) {
  if (b && b.appPassword) return 'imap';
  if (b && b.refreshToken) return 'oauth';
  return null;
}

// 📦 Helper : lit le storage et renvoie TOUJOURS un array de boîtes valides.
//   - null → []
//   - objet legacy {refreshToken, email...} → [objet]
//   - array → array
// Une boîte est valide si elle a SOIT un refreshToken (OAuth), SOIT un
// appPassword (IMAP / mot de passe d'application).
async function readInboxes(admin, userId) {
  const { data: row } = await admin.from('storage')
    .select('value')
    .eq('key', `gmail-oauth:${userId}`)
    .maybeSingle();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed.filter(b => b && boxMethod(b));
    if (parsed && boxMethod(parsed)) return [parsed];
  } catch (e) {}
  return [];
}

// ─── IMAP (mot de passe d'application) ──────────────────────────────────────
// Bien plus simple côté utilisateur : email + mot de passe d'application
// (16 caractères généré par Google), pas de Google Cloud Console. On lit les
// emails via IMAP (imap.gmail.com:993).

function makeImapClient(inbox) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: inbox.email, pass: inbox.appPassword },
    logger: false,
    // Timeouts courts : on est dans une fonction serverless (budget limité).
    socketTimeout: 20000,
    greetingTimeout: 8000,
  });
}

// Teste la connexion IMAP (au moment de connecter une boîte) → feedback
// immédiat si le mot de passe d'application est faux.
async function imapTestConnection(inbox) {
  const client = makeImapClient(inbox);
  await client.connect();
  await client.logout();
}

// Scan IMAP : liste les messages récents (60j) avec pièce jointe PDF.
async function imapScan(inbox, maxMessages = 60) {
  const client = makeImapClient(inbox);
  await client.connect();
  const messages = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
      const uids = await client.search({ since }, { uid: true });
      const recent = (uids || []).slice(-maxMessages);
      if (recent.length === 0) return [];
      for await (const msg of client.fetch(recent, { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
        const attachments = [];
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node.childNodes)) node.childNodes.forEach(walk);
          const fname = node.dispositionParameters?.filename || node.parameters?.name || '';
          if (fname && /\.pdf$/i.test(fname)) {
            attachments.push({
              attachmentId: node.part || '1', // numéro de part IMAP (ex '2', '1.2')
              filename: fname,
              sizeBytes: node.size || 0,
            });
          }
        };
        walk(msg.bodyStructure);
        if (attachments.length > 0) {
          messages.push({
            messageId: String(msg.uid), // côté IMAP = UID
            subject: msg.envelope?.subject || '(sans sujet)',
            from: (msg.envelope?.from || []).map(a => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', '),
            internalDate: msg.internalDate ? new Date(msg.internalDate).getTime().toString() : '',
            attachments,
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (e) {}
  }
  return messages;
}

// Télécharge une pièce jointe IMAP (par UID + numéro de part) → base64.
async function imapFetchAttachment(inbox, uid, part) {
  const client = makeImapClient(inbox);
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const dl = await client.download(uid, part, { uid: true });
      if (!dl?.content) throw new Error('Pièce jointe introuvable');
      const chunks = [];
      for await (const chunk of dl.content) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      return { base64: buf.toString('base64'), sizeBytes: buf.length };
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (e) {}
  }
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
          inboxes: inboxes.map(b => {
            const method = boxMethod(b);
            return {
              email: b.email,
              connectedAt: b.connectedAt || null,
              method, // 'imap' (mot de passe d'application) ou 'oauth'
              // Scan dispo : toujours pour IMAP ; pour OAuth il faut le scope lecture.
              canScan: method === 'imap'
                ? true
                : (b.scopes || []).some(s => s.includes('gmail.readonly')),
            };
          }),
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

    // ───── POST : actions de scan / fetch / imap-connect ─────
    const action = (req.query?.action || '').toString();
    const body = req.body || {};

    // 🔑 Connexion par mot de passe d'application (IMAP) — la voie simple
    // sans Google Cloud Console. On teste la connexion puis on stocke la boîte.
    if (action === 'imap-connect') {
      const email = (body.email || '').toString().trim().toLowerCase();
      const appPassword = (body.appPassword || '').toString().replace(/\s+/g, ''); // Google affiche le code par groupes de 4 → on retire les espaces
      if (!email || !appPassword) {
        return json(res, 400, { error: 'Email et mot de passe d\'application requis.' });
      }
      if (appPassword.length < 12) {
        return json(res, 400, { error: 'Le mot de passe d\'application Google fait 16 caractères. Vérifie ce que tu as collé.' });
      }
      const candidate = { email, appPassword };
      try {
        await imapTestConnection(candidate);
      } catch (e) {
        return json(res, 400, {
          error: `Connexion IMAP échouée : ${e?.message || 'vérifie l\'email + le mot de passe d\'application'}. (La validation en 2 étapes doit être activée sur ce compte Google.)`,
        });
      }
      // Connexion OK → on stocke (en ajoutant ou remplaçant si l'email existe).
      const inboxes = await readInboxes(admin, userId);
      const stored = {
        email,
        appPassword,
        method: 'imap',
        connectedAt: new Date().toISOString(),
      };
      const idx = inboxes.findIndex(b => (b.email || '').toLowerCase() === email);
      if (idx >= 0) inboxes[idx] = stored; else inboxes.push(stored);
      await writeInboxes(admin, userId, inboxes);
      return json(res, 200, { data: { connected: true, email } });
    }

    if (action === 'scan') {
      const inboxes = await readInboxes(admin, userId);
      if (inboxes.length === 0) {
        return json(res, 200, { data: { results: [], errors: [], notes: 'Aucune boîte Gmail connectée.' } });
      }
      const results = [];
      const errors = [];
      // Scan séquentiel par boîte (parallèle = risque de quota / timeout).
      for (const inbox of inboxes) {
        const method = boxMethod(inbox);
        // ── Boîte IMAP (mot de passe d'application) ──
        if (method === 'imap') {
          try {
            const enriched = await imapScan(inbox, 60);
            results.push({ email: inbox.email, messages: enriched, count: enriched.length, method: 'imap' });
          } catch (e) {
            errors.push({ email: inbox.email, error: e?.message || 'Scan IMAP échoué' });
          }
          continue;
        }
        // ── Boîte OAuth ──
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          errors.push({ email: inbox.email, error: 'OAuth Google non configuré (variables Vercel).' });
          continue;
        }
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
            method: 'oauth',
          });
        } catch (e) {
          errors.push({ email: inbox.email, error: e?.message || 'Scan échoué' });
        }
      }
      return json(res, 200, { data: { results, errors } });
    }

    if (action === 'fetch-attachment') {
      const { email: inboxEmail, messageId, attachmentId } = body;
      if (!inboxEmail || !messageId || !attachmentId) {
        return json(res, 400, { error: 'email, messageId, attachmentId requis.' });
      }
      const inboxes = await readInboxes(admin, userId);
      const inbox = inboxes.find(b => (b.email || '').toLowerCase() === String(inboxEmail).toLowerCase());
      if (!inbox) return json(res, 404, { error: 'Boîte Gmail non trouvée.' });
      const method = boxMethod(inbox);
      // ── IMAP : download par UID (messageId) + numéro de part (attachmentId) ──
      if (method === 'imap') {
        const { base64, sizeBytes } = await imapFetchAttachment(inbox, parseInt(messageId, 10), attachmentId);
        return json(res, 200, { data: { base64, sizeBytes, mimeType: 'application/pdf' } });
      }
      // ── OAuth ──
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return json(res, 503, { error: 'OAuth Google non configuré.' });
      }
      const accessToken = await ensureAccessToken(admin, userId, inbox, inboxes);
      const { base64, sizeBytes } = await getAttachment(accessToken, messageId, attachmentId);
      return json(res, 200, { data: { base64, sizeBytes, mimeType: 'application/pdf' } });
    }

    return json(res, 400, { error: `Action inconnue : ${action || '(vide)'}. Utilise scan, fetch-attachment ou imap-connect.` });
  } catch (e) {
    console.error('gmail-oauth error:', e?.message || e);
    return json(res, 502, { error: e?.message || 'Erreur Gmail OAuth' });
  }
}
