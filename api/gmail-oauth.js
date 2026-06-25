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

// 🌍 Boîtes PARTAGÉES (toute l'équipe) — clé globale unique, pas par-user.
// Sert aux boîtes de RÉCUPÉRATION de factures (ex : comptabilite@…) : tu
// connectes une fois, et tous les utilisateurs du CRM peuvent scanner /
// chercher dedans. À distinguer des boîtes OAuth perso (envoi d'emails) qui
// restent sous gmail-oauth:<userId>.
const SHARED_INBOX_KEY = 'gmail-shared-inboxes';

// 🚫 Liste noire des expéditeurs (partagée équipe) — emails qu'on ne veut
// plus jamais voir dans le scan/search de factures. Ex : Onlineprinters,
// EDF facture habitat, etc. Comparaison par email (lowercased) OU par
// domaine (si l'entrée commence par '@').
const IGNORED_SENDERS_KEY = 'gmail-ignored-senders';

// 📥 Attachments DÉJÀ IMPORTÉS (partagée équipe). Chaque entrée est une
// clé `<inboxEmail>|<messageId>|<attachmentId>` qu'on a déjà rattachée à
// un dossier. Sert à NE PAS les re-proposer aux prochains scans —
// fonctionne même quand le n° de facture est trop court pour un match
// direct côté IA (ex : "27", "8", refusés par findByFactureNo).
const IMPORTED_ATTS_KEY = 'gmail-imported-attachments';

async function readImportedAttachments(admin) {
  const { data: row } = await admin.from('storage')
    .select('value')
    .eq('key', IMPORTED_ATTS_KEY)
    .maybeSingle();
  if (!row?.value) return new Set();
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return new Set(parsed.map(s => String(s || '')).filter(Boolean));
  } catch (e) {}
  return new Set();
}

async function writeImportedAttachments(admin, setOrList) {
  const arr = Array.from(setOrList || []).map(s => String(s || '')).filter(Boolean);
  if (arr.length === 0) {
    await admin.from('storage').delete().eq('key', IMPORTED_ATTS_KEY);
    return;
  }
  // Cap : on garde les 5000 derniers pour ne pas exploser la taille de la ligne.
  // 5000 × ~80 chars = 400 Ko, largement sous la limite Supabase.
  const capped = arr.slice(-5000);
  await admin.from('storage').upsert({
    key: IMPORTED_ATTS_KEY,
    value: JSON.stringify(capped),
    updated_at: new Date().toISOString(),
  });
}

function attachmentKey(inboxEmail, messageId, attachmentId) {
  return `${String(inboxEmail || '').toLowerCase()}|${String(messageId || '')}|${String(attachmentId || '')}`;
}

// Extrait l'email pur d'une chaîne « Name <foo@bar.com>, Other <x@y.com> ».
function extractFirstEmail(header) {
  const m = String(header || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

async function readIgnoredSenders(admin) {
  const { data: row } = await admin.from('storage')
    .select('value')
    .eq('key', IGNORED_SENDERS_KEY)
    .maybeSingle();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed.map(s => String(s || '').toLowerCase()).filter(Boolean);
  } catch (e) {}
  return [];
}

async function writeIgnoredSenders(admin, list) {
  const normalized = Array.from(new Set((list || []).map(s => String(s || '').toLowerCase()).filter(Boolean)));
  if (normalized.length === 0) {
    await admin.from('storage').delete().eq('key', IGNORED_SENDERS_KEY);
    return;
  }
  await admin.from('storage').upsert({
    key: IGNORED_SENDERS_KEY,
    value: JSON.stringify(normalized),
    updated_at: new Date().toISOString(),
  });
}

// True si `senderEmail` est dans la liste noire. Une entrée peut être un
// email exact (foo@bar.com) ou un domaine (@bar.com → tous les expéditeurs
// du domaine bar.com sont blacklistés).
function isSenderIgnored(senderEmail, ignored) {
  const e = String(senderEmail || '').toLowerCase();
  if (!e || !ignored || ignored.length === 0) return false;
  for (const entry of ignored) {
    if (entry.startsWith('@')) {
      if (e.endsWith(entry)) return true;
    } else if (e === entry) {
      return true;
    }
  }
  return false;
}

async function readSharedInboxes(admin) {
  const { data: row } = await admin.from('storage')
    .select('value')
    .eq('key', SHARED_INBOX_KEY)
    .maybeSingle();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed)) return parsed.filter(b => b && boxMethod(b));
    if (parsed && boxMethod(parsed)) return [parsed];
  } catch (e) {}
  return [];
}

async function writeSharedInboxes(admin, inboxes) {
  if (!inboxes || inboxes.length === 0) {
    await admin.from('storage').delete().eq('key', SHARED_INBOX_KEY);
    return;
  }
  await admin.from('storage').upsert({
    key: SHARED_INBOX_KEY,
    value: JSON.stringify(inboxes),
    updated_at: new Date().toISOString(),
  });
}

// 📥 Liste combinée pour le SCAN/SEARCH/FETCH : boîtes partagées (équipe) +
// boîtes perso de l'utilisateur courant. Dédupliquée par email (le partagé
// gagne). C'est la liste où l'on cherche les factures.
async function readAllReadableInboxes(admin, userId) {
  const shared = await readSharedInboxes(admin);
  const mine = await readInboxes(admin, userId);
  const seen = new Set(shared.map(b => (b.email || '').toLowerCase()));
  const merged = [...shared];
  for (const b of mine) {
    const e = (b.email || '').toLowerCase();
    if (e && !seen.has(e)) { seen.add(e); merged.push(b); }
  }
  return merged;
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

// Heuristique : ce PDF ressemble-t-il à une facture/avoir, ou à autre chose
// (relevé de compte, relance, contrat, BL, devis…) ? Combine nom de fichier
// + sujet du mail. On préfère un faux négatif (rater une facture exotique)
// à un faux positif (importer un relevé de compte dans le tri factures).
function isLikelyFacture(filename, subject) {
  const text = `${filename || ''} ${subject || ''}`.toLowerCase();
  // Exclusions fortes : si l'un de ces mots apparaît, c'est PAS une facture.
  if (/relev[eé]|statement|relance|reminder|retard|contrat\b|attestation|certificat|certificate|devis|quote|bon[\s_-]de[\s_-]commande|bon[\s_-]de[\s_-]livraison|delivery[\s_-]note|bulletin[\s_-]de[\s_-]paie|fiche[\s_-]de[\s_-]paie|newsletter/.test(text)) return false;
  // Positifs explicites : facture, invoice, avoir, credit note…
  if (/facture|invoice|avoir\b|credit[\s_-]note|note[\s_-]de[\s_-]cr[eé]dit|proforma/.test(text)) return true;
  // Préfixes numériques classiques : FAC00001, INV-2024-001, AV2024-001
  if (/(^|[\s_-])(fac\d|inv\d|av\d|avoir|fact[_-])/i.test(filename || '')) return true;
  return false;
}

// Scan IMAP : liste les messages récents (60j) avec pièce jointe PDF
// ressemblant à une facture/avoir (filtre côté serveur via isLikelyFacture).
async function imapScan(inbox, maxMessages = 60, ignoredSenders = [], importedSet = new Set(), sinceDays = 60) {
  const client = makeImapClient(inbox);
  await client.connect();
  const messages = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const days = Math.max(1, Math.min(1095, Number(sinceDays) || 60)); // cap : 3 ans
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);
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
        const subject = msg.envelope?.subject || '(sans sujet)';
        // 🚫 Filtre liste noire d'expéditeurs (équipe). Skip si premier
        //    expéditeur du message est dans la liste.
        const senderEmail = (msg.envelope?.from?.[0]?.address || '').toLowerCase();
        if (isSenderIgnored(senderEmail, ignoredSenders)) continue;
        // 🧹 Filtre serveur : on ne garde que les pièces qui ressemblent à
        //    une facture/avoir + qui n'ont pas DÉJÀ été importées.
        const factureAtts = attachments.filter(a => {
          if (importedSet.has(attachmentKey(inbox.email, msg.uid, a.attachmentId))) return false;
          return isLikelyFacture(a.filename, subject);
        });
        if (factureAtts.length > 0) {
          messages.push({
            messageId: String(msg.uid), // côté IMAP = UID
            subject,
            from: (msg.envelope?.from || []).map(a => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', '),
            fromEmail: senderEmail, // l'adresse pure (utile pour blacklister depuis le front)
            internalDate: msg.internalDate ? new Date(msg.internalDate).getTime().toString() : '',
            attachments: factureAtts,
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

// Recherche IMAP par mot-clé (text = sujet+from+body) sur 180 derniers jours.
// Sert aux boutons « 🔍 Gmail » sur une ligne dossier/prestataire : on ne
// scanne pas tout, on cible un nom (client ou prestataire).
// `lenient=true` (par défaut pour les recherches explicites) : accepte les
//   PDFs par mimeType + skip le filtre isLikelyFacture.
async function imapSearch(inbox, query, maxMessages = 20, ignoredSenders = [], importedSet = new Set(), lenient = true, debug = null) {
  const client = makeImapClient(inbox);
  await client.connect();
  const messages = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 365 * 24 * 3600 * 1000);
      // 🚀 Gmail X-GM-RAW : utilise la SYNTAXE de recherche Gmail web (qui
      //    indexe aussi le contenu OCR des PDFs). Bien plus puissant que
      //    le TEXT IMAP standard, qui rate les noms uniquement présents
      //    dans les pièces jointes ou dans du HTML encodé.
      //    Fallback sur { text } si X-GM-RAW pas supporté (rare).
      let uids = [];
      const steps = [];
      try {
        uids = await client.search({ gmailRaw: `${query} newer_than:365d` }, { uid: true });
        steps.push(`gmailRaw=${(uids || []).length}`);
      } catch (e) {
        steps.push(`gmailRaw=ERR(${e?.message || 'unknown'})`);
        uids = [];
      }
      // Fallback 1 : TEXT IMAP standard (subject+from+body, sans OCR PDF)
      if (!uids || uids.length === 0) {
        try {
          uids = await client.search({ since, text: query }, { uid: true });
          steps.push(`text=${(uids || []).length}`);
        } catch (e) {
          steps.push(`text=ERR(${e?.message || 'unknown'})`);
          uids = [];
        }
      }
      // Fallback 2 : OR explicite sur subject/from/to (au cas où text:
      //    aurait été décodé bizarrement par certains serveurs)
      if (!uids || uids.length === 0) {
        try {
          uids = await client.search({ since, or: [
            { subject: query }, { from: query }, { to: query }, { body: query }
          ] }, { uid: true });
          steps.push(`or=${(uids || []).length}`);
        } catch (e) {
          steps.push(`or=ERR(${e?.message || 'unknown'})`);
          uids = [];
        }
      }
      if (debug) debug.steps = steps;
      const recent = (uids || []).slice(-maxMessages);
      if (debug) { debug.totalUids = (uids || []).length; debug.fetchedCount = recent.length; debug.ignoredBySender = 0; debug.noPdf = 0; debug.allFiltered = 0; debug.sampleSubjects = []; debug.sampleFilenames = []; }
      if (recent.length === 0) return [];
      for await (const msg of client.fetch(recent, { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
        const attachments = [];
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node.childNodes)) node.childNodes.forEach(walk);
          const fname = node.dispositionParameters?.filename || node.parameters?.name || '';
          const mtype = `${node.type || ''}/${node.subtype || ''}`.toLowerCase();
          const isPdfByExt = fname && /\.pdf$/i.test(fname);
          const isPdfByMime = lenient && (mtype === 'application/pdf' || mtype === 'application/x-pdf');
          if (isPdfByExt || isPdfByMime) {
            attachments.push({
              attachmentId: node.part || '1',
              filename: fname || `attachment-${node.part || '1'}.pdf`,
              sizeBytes: node.size || 0,
            });
          }
        };
        walk(msg.bodyStructure);
        const senderEmail = (msg.envelope?.from?.[0]?.address || '').toLowerCase();
        if (debug && debug.sampleSubjects.length < 5) {
          debug.sampleSubjects.push(`${msg.envelope?.subject || '(sans sujet)'} | from ${senderEmail} | ${attachments.length} pdf`);
          attachments.forEach(a => { if (debug.sampleFilenames.length < 10) debug.sampleFilenames.push(a.filename); });
        }
        // 🔓 En recherche EXPLICITE (lenient) : on NE skip PAS les expéditeurs
        //    blacklistés. La blacklist sert au scan automatique (anti-spam),
        //    mais si l'user tape un nom, il veut voir ces mails quand même.
        if (!lenient && isSenderIgnored(senderEmail, ignoredSenders)) { if (debug) debug.ignoredBySender++; continue; }
        const subject = msg.envelope?.subject || '(sans sujet)';
        if (attachments.length === 0 && debug) debug.noPdf++;
        // 🔓 En lenient : on garde TOUTES les pièces (même déjà importées) et
        //    on les marque `alreadyImported` → l'UI affiche un badge au lieu
        //    de les cacher. Sinon une recherche ne ramène jamais les factures
        //    déjà attachées au CRM (cas IONERGIK : tout est déjà importé).
        const factureAtts = attachments
          .map(a => ({ ...a, alreadyImported: importedSet.has(attachmentKey(inbox.email, msg.uid, a.attachmentId)) }))
          .filter(a => {
            if (lenient) return true;
            if (a.alreadyImported) return false;
            return isLikelyFacture(a.filename, subject);
          });
        if (attachments.length > 0 && factureAtts.length === 0 && debug) debug.allFiltered++;
        if (factureAtts.length > 0) {
          messages.push({
            messageId: String(msg.uid),
            subject,
            from: (msg.envelope?.from || []).map(a => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', '),
            fromEmail: senderEmail,
            internalDate: msg.internalDate ? new Date(msg.internalDate).getTime().toString() : '',
            attachments: factureAtts,
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
// ⚠️ Les boîtes OAuth ne vivent QUE dans le store PERSO (gmail-oauth:userId).
// On relit donc CE store, on met à jour la boîte par email, et on réécrit
// seulement le perso — sans jamais y mélanger les boîtes partagées (IMAP).
async function ensureAccessToken(admin, userId, inbox /*, allInboxes (ignoré) */) {
  const needRefresh = !inbox.accessToken || !inbox.expiresAt || inbox.expiresAt < Date.now() + 60000;
  if (!needRefresh) return inbox.accessToken;
  const { accessToken, expiresIn } = await refreshAccessToken(inbox.refreshToken);
  inbox.accessToken = accessToken;
  inbox.expiresAt = Date.now() + expiresIn * 1000;
  const mine = await readInboxes(admin, userId);
  const idx = mine.findIndex(b => (b.email || '').toLowerCase() === (inbox.email || '').toLowerCase());
  if (idx >= 0) {
    mine[idx] = { ...mine[idx], accessToken: inbox.accessToken, expiresAt: inbox.expiresAt };
    await writeInboxes(admin, userId, mine);
  }
  return accessToken;
}

// 🔍 Liste les messages Gmail récents avec pièces jointes PDF.
// Critère : reçus dans les 60 derniers jours, has:attachment, filename:pdf
// (filtre Gmail natif, plus efficace que parser tous les messages).
async function listMessagesWithPdf(accessToken, maxResults = 50, sinceDays = 60) {
  const days = Math.max(1, Math.min(1095, Number(sinceDays) || 60));
  const q = encodeURIComponent(`newer_than:${days}d has:attachment filename:pdf`);
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gmail list failed');
  return data.messages || [];
}

// 📩 Récupère les métadonnées d'un message (sujet, expéditeur, date, attachments).
// `lenient=true` : utilisé pour la recherche explicite (boutons 🔍 Gmail) — on
//   accepte les PDFs par mimeType (pas seulement .pdf en fin de nom) et on
//   skip le filtre isLikelyFacture (user a tapé un nom, il veut tout voir).
async function getMessageMeta(accessToken, messageId, ignoredSenders = [], importedSet = new Set(), inboxEmail = '', lenient = false) {
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
  // En mode lenient : accepte mimeType application/pdf même si le nom ne finit pas par .pdf.
  const isPdfPart = (p) => {
    if (!p?.body?.attachmentId) return false;
    if (p.filename && /\.pdf$/i.test(p.filename)) return true;
    if (lenient && (p.mimeType === 'application/pdf' || p.mimeType === 'application/x-pdf')) return true;
    return false;
  };
  const attachments = [];
  const walkParts = (parts) => {
    (parts || []).forEach(p => {
      if (p.parts) walkParts(p.parts);
      if (isPdfPart(p)) {
        attachments.push({
          attachmentId: p.body.attachmentId,
          filename: p.filename || `attachment-${p.body.attachmentId.slice(0, 8)}.pdf`,
          sizeBytes: p.body.size || 0,
          mimeType: p.mimeType || 'application/pdf',
        });
      }
    });
  };
  walkParts(data.payload?.parts);
  // Le payload racine peut aussi être l'attachement si single-part PDF.
  if (isPdfPart(data.payload)) {
    attachments.push({
      attachmentId: data.payload.body.attachmentId,
      filename: data.payload.filename || `attachment-${data.payload.body.attachmentId.slice(0, 8)}.pdf`,
      sizeBytes: data.payload.body.size || 0,
      mimeType: data.payload.mimeType || 'application/pdf',
    });
  }
  const subject = headers['subject'] || '(sans sujet)';
  const fromHeader = headers['from'] || '';
  const senderEmail = extractFirstEmail(fromHeader);
  // 🚫 Liste noire d'expéditeurs — uniquement pour le scan auto. En recherche
  //    explicite (lenient), on ne filtre PAS : l'user a tapé un nom, il veut
  //    voir ces mails même si l'expéditeur est blacklisté (cas vosfactures.fr).
  if (!lenient && isSenderIgnored(senderEmail, ignoredSenders)) {
    return { messageId, subject, from: fromHeader, fromEmail: senderEmail, date: headers['date'] || '', internalDate: data.internalDate || '', attachments: [] };
  }
  // 🧹 Filtre : on garde uniquement les pièces qui ressemblent à une facture
  //    ou un avoir, et qui n'ont pas DÉJÀ été importées.
  //    En lenient : on garde TOUT (même déjà importé → badge côté UI) car
  //    l'user a explicitement tapé un nom/numéro et veut tout voir.
  const factureAtts = attachments
    .map(a => ({ ...a, alreadyImported: importedSet.has(attachmentKey(inboxEmail, messageId, a.attachmentId)) }))
    .filter(a => {
      if (lenient) return true;
      if (a.alreadyImported) return false;
      return isLikelyFacture(a.filename, subject);
    });
  return {
    messageId,
    subject,
    from: fromHeader,
    fromEmail: senderEmail,
    date: headers['date'] || '',
    internalDate: data.internalDate || '',
    attachments: factureAtts,
  };
}

// 🔎 Recherche Gmail par mot-clé (180j max). Utilise la syntaxe de requête
// Gmail directement → q='MIQUEL has:attachment filename:pdf newer_than:180d'.
async function searchMessagesWithPdf(accessToken, query, maxResults = 20) {
  // 🔍 Recherche étendue : on ne force PAS filename:pdf (les PDFs sans .pdf
  // dans le nom étaient ratés) ni une fenêtre courte (180j → 365j). Le N°
  // facture est souvent uniquement dans le PDF, pas dans le sujet, donc on
  // cherche aussi par mot-clé général. has:attachment seul est plus large.
  const q = encodeURIComponent(`${query} has:attachment newer_than:365d`);
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gmail search failed');
  let msgs = data.messages || [];
  // 🪂 Fallback : si rien trouvé, on retente SANS has:attachment (cas où la
  // facture est en lien dans l'email, ou le filtre Gmail rate les attachments).
  if (msgs.length === 0) {
    const q2 = encodeURIComponent(`${query} newer_than:365d`);
    const r2 = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q2}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (r2.ok) {
      const d2 = await r2.json();
      msgs = d2.messages || [];
    }
  }
  return msgs;
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
    // Combine les boîtes PARTAGÉES (équipe, récupération factures) + les
    // boîtes perso (OAuth envoi). Chaque boîte est taguée `shared`.
    if (req.method === 'GET') {
      // 🔁 Migration : toute boîte IMAP encore rangée dans le store perso de
      // l'utilisateur (ancien comportement) est déplacée vers le partagé pour
      // que toute l'équipe y ait accès. Idempotent.
      try {
        const mineRaw = await readInboxes(admin, userId);
        const imapMine = mineRaw.filter(b => boxMethod(b) === 'imap');
        if (imapMine.length > 0) {
          const shared0 = await readSharedInboxes(admin);
          const sharedEmails0 = new Set(shared0.map(b => (b.email || '').toLowerCase()));
          let changed = false;
          for (const b of imapMine) {
            const e = (b.email || '').toLowerCase();
            if (e && !sharedEmails0.has(e)) { shared0.push(b); sharedEmails0.add(e); changed = true; }
          }
          if (changed) await writeSharedInboxes(admin, shared0);
          // Retire les boîtes IMAP du store perso (elles vivent désormais en partagé).
          const onlyOauth = mineRaw.filter(b => boxMethod(b) !== 'imap');
          if (onlyOauth.length !== mineRaw.length) await writeInboxes(admin, userId, onlyOauth);
        }
      } catch (e) { /* migration best-effort, on n'échoue pas le GET */ }

      const shared = await readSharedInboxes(admin);
      const mine = await readInboxes(admin, userId);
      const sharedEmails = new Set(shared.map(b => (b.email || '').toLowerCase()));
      const tagged = [
        ...shared.map(b => ({ b, shared: true })),
        ...mine.filter(b => !sharedEmails.has((b.email || '').toLowerCase())).map(b => ({ b, shared: false })),
      ];
      return json(res, 200, {
        data: {
          connected: tagged.length > 0,
          // Compat ascendante avec l'ancien shape { email, connectedAt }
          email: tagged[0]?.b?.email || null,
          connectedAt: tagged[0]?.b?.connectedAt || null,
          inboxes: tagged.map(({ b, shared }) => {
            const method = boxMethod(b);
            return {
              email: b.email,
              connectedAt: b.connectedAt || null,
              method, // 'imap' (mot de passe d'application) ou 'oauth'
              shared,  // true = partagée avec toute l'équipe
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
    // Cherche dans les boîtes partagées ET perso (une boîte partagée peut
    // être déconnectée par n'importe quel membre de l'équipe).
    if (req.method === 'DELETE') {
      const targetEmail = (req.query?.email || '').toString().trim().toLowerCase();
      if (!targetEmail) {
        // Sans email : on ne vide QUE les boîtes perso de l'utilisateur (on ne
        // débranche pas par accident toute l'équipe des boîtes partagées).
        await writeInboxes(admin, userId, []);
        return json(res, 200, { data: { disconnected: 'all' } });
      }
      // Retire la boîte des deux stores si présente.
      const shared = await readSharedInboxes(admin);
      const sharedNext = shared.filter(b => (b.email || '').toLowerCase() !== targetEmail);
      if (sharedNext.length !== shared.length) await writeSharedInboxes(admin, sharedNext);
      const mine = await readInboxes(admin, userId);
      const mineNext = mine.filter(b => (b.email || '').toLowerCase() !== targetEmail);
      if (mineNext.length !== mine.length) await writeInboxes(admin, userId, mineNext);
      return json(res, 200, { data: { disconnected: targetEmail, remaining: sharedNext.length + mineNext.length } });
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
      // Connexion OK → on stocke dans les boîtes PARTAGÉES (récupération de
      // factures = ressource d'équipe). Tous les utilisateurs pourront
      // scanner / chercher dedans. On ajoute ou remplace si l'email existe.
      const inboxes = await readSharedInboxes(admin);
      const stored = {
        email,
        appPassword,
        method: 'imap',
        connectedAt: new Date().toISOString(),
        connectedBy: userId, // info : qui a connecté la boîte
      };
      const idx = inboxes.findIndex(b => (b.email || '').toLowerCase() === email);
      if (idx >= 0) inboxes[idx] = stored; else inboxes.push(stored);
      await writeSharedInboxes(admin, inboxes);
      return json(res, 200, { data: { connected: true, email, shared: true } });
    }

    if (action === 'scan') {
      const inboxes = await readAllReadableInboxes(admin, userId);
      if (inboxes.length === 0) {
        return json(res, 200, { data: { results: [], errors: [], notes: 'Aucune boîte Gmail connectée.' } });
      }
      // 📅 Période de scan paramétrable depuis l'UI (60j par défaut, 1095j max).
      const sinceDays = Math.max(1, Math.min(1095, Number(body.sinceDays) || 60));
      const ignoredSenders = await readIgnoredSenders(admin);
      const importedSet = await readImportedAttachments(admin);
      const results = [];
      const errors = [];
      // Scan séquentiel par boîte (parallèle = risque de quota / timeout).
      for (const inbox of inboxes) {
        const method = boxMethod(inbox);
        // ── Boîte IMAP (mot de passe d'application) ──
        if (method === 'imap') {
          try {
            // maxMessages monte jusqu'à 200 sur les périodes étendues pour
            // limiter le risque de manquer des factures anciennes.
            const cap = Math.min(200, Math.max(60, Math.round(sinceDays * 1.5)));
            const enriched = await imapScan(inbox, cap, ignoredSenders, importedSet, sinceDays);
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
          const accessToken = await ensureAccessToken(admin, userId, inbox);
          const cap = Math.min(200, Math.max(60, Math.round(sinceDays * 1.5)));
          const messages = await listMessagesWithPdf(accessToken, cap, sinceDays);
          // Récupère les métadonnées de chaque message (sujet, attachments).
          const enriched = [];
          for (const m of messages) {
            try {
              const meta = await getMessageMeta(accessToken, m.id, ignoredSenders, importedSet, inbox.email);
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

    // 🔍 Recherche ciblée : un mot-clé (nom client ou prestataire) → PDFs matching
    //    sur 180 jours, toutes boîtes confondues. Utilisé par les boutons
    //    « 🔍 Gmail » sur les lignes Poseur/Régie/Fournisseur et Factures manquantes.
    if (action === 'search') {
      const query = (body.query || '').toString().trim();
      if (query.length < 2) {
        return json(res, 400, { error: 'Requête trop courte (2 caractères min).' });
      }
      const inboxes = await readAllReadableInboxes(admin, userId);
      if (inboxes.length === 0) {
        return json(res, 200, { data: { results: [], errors: [], notes: 'Aucune boîte Gmail connectée.' } });
      }
      const ignoredSenders = await readIgnoredSenders(admin);
      const importedSet = await readImportedAttachments(admin);
      const results = [];
      const errors = [];
      for (const inbox of inboxes) {
        const method = boxMethod(inbox);
        if (method === 'imap') {
          try {
            const dbg = {};
            const enriched = await imapSearch(inbox, query, 40, ignoredSenders, importedSet, true, dbg);
            results.push({ email: inbox.email, messages: enriched, count: enriched.length, method: 'imap', debug: dbg });
          } catch (e) {
            errors.push({ email: inbox.email, error: e?.message || 'Recherche IMAP échouée' });
          }
          continue;
        }
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          errors.push({ email: inbox.email, error: 'OAuth Google non configuré (variables Vercel).' });
          continue;
        }
        const canScan = (inbox.scopes || []).some(s => s.includes('gmail.readonly'));
        if (!canScan) {
          errors.push({ email: inbox.email, error: 'Pas de scope lecture — reconnecte cette boîte.' });
          continue;
        }
        try {
          const accessToken = await ensureAccessToken(admin, userId, inbox);
          const messages = await searchMessagesWithPdf(accessToken, query, 20);
          const enriched = [];
          for (const m of messages) {
            try {
              // lenient=true : user a explicitement tapé un nom/N° → on
              // accepte tous les PDFs (pas seulement ceux qui matchent
              // isLikelyFacture). Sinon devis/BL/etc. sont droppés alors
              // qu'ils peuvent être ce que cherche l'utilisateur.
              const meta = await getMessageMeta(accessToken, m.id, ignoredSenders, importedSet, inbox.email, true);
              if (meta.attachments.length > 0) enriched.push(meta);
            } catch (e) {}
          }
          results.push({ email: inbox.email, messages: enriched, count: enriched.length, method: 'oauth' });
        } catch (e) {
          errors.push({ email: inbox.email, error: e?.message || 'Recherche OAuth échouée' });
        }
      }
      return json(res, 200, { data: { query, results, errors } });
    }

    if (action === 'fetch-attachment') {
      const { email: inboxEmail, messageId, attachmentId } = body;
      if (!inboxEmail || !messageId || !attachmentId) {
        return json(res, 400, { error: 'email, messageId, attachmentId requis.' });
      }
      const inboxes = await readAllReadableInboxes(admin, userId);
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
      const accessToken = await ensureAccessToken(admin, userId, inbox);
      const { base64, sizeBytes } = await getAttachment(accessToken, messageId, attachmentId);
      return json(res, 200, { data: { base64, sizeBytes, mimeType: 'application/pdf' } });
    }

    // 🚫 GET de la liste noire (pour l'UI Réglages)
    if (action === 'ignored-list') {
      const list = await readIgnoredSenders(admin);
      return json(res, 200, { data: { ignored: list } });
    }

    // 🚫 Ajoute un expéditeur (email ou domaine '@bar.com') à la liste noire.
    if (action === 'ignore-sender') {
      const sender = String(body.sender || '').trim().toLowerCase();
      if (!sender || (!sender.includes('@'))) {
        return json(res, 400, { error: 'Email ou domaine (commençant par @) requis.' });
      }
      const list = await readIgnoredSenders(admin);
      if (!list.includes(sender)) list.push(sender);
      await writeIgnoredSenders(admin, list);
      return json(res, 200, { data: { ignored: list } });
    }

    // 🚫 Retire un expéditeur de la liste noire.
    if (action === 'unignore-sender') {
      const sender = String(body.sender || '').trim().toLowerCase();
      const list = await readIgnoredSenders(admin);
      const next = list.filter(s => s !== sender);
      await writeIgnoredSenders(admin, next);
      return json(res, 200, { data: { ignored: next } });
    }

    // 📥 Marque un attachment Gmail comme déjà importé (rattaché à un dossier).
    //    Les futurs scans/searches le filtreront. body.entries = array de
    //    {inboxEmail, messageId, attachmentId} pour pouvoir batcher plusieurs
    //    confirms en un seul appel (utile à la fin d'un gros import).
    if (action === 'mark-imported') {
      const entries = Array.isArray(body.entries) ? body.entries : (body.inboxEmail ? [body] : []);
      if (entries.length === 0) {
        return json(res, 400, { error: 'entries (ou inboxEmail/messageId/attachmentId) requis.' });
      }
      const set = await readImportedAttachments(admin);
      for (const e of entries) {
        if (!e || !e.inboxEmail || !e.messageId || !e.attachmentId) continue;
        set.add(attachmentKey(e.inboxEmail, e.messageId, e.attachmentId));
      }
      await writeImportedAttachments(admin, set);
      return json(res, 200, { data: { count: set.size } });
    }

    // 🔓 Démarque (un, plusieurs, ou TOUT). Utile quand des factures ont été
    //    marquées à tort comme « déjà importé » via l'auto-skip heuristique.
    //    Body : { entries: [...] } pour ciblé, ou { all: true } pour tout vider.
    if (action === 'unmark-imported') {
      if (body.all === true) {
        await writeImportedAttachments(admin, new Set());
        return json(res, 200, { data: { count: 0, cleared: true } });
      }
      const entries = Array.isArray(body.entries) ? body.entries : (body.inboxEmail ? [body] : []);
      if (entries.length === 0) {
        return json(res, 400, { error: 'entries ou all=true requis.' });
      }
      const set = await readImportedAttachments(admin);
      for (const e of entries) {
        if (!e || !e.inboxEmail || !e.messageId || !e.attachmentId) continue;
        set.delete(attachmentKey(e.inboxEmail, e.messageId, e.attachmentId));
      }
      await writeImportedAttachments(admin, set);
      return json(res, 200, { data: { count: set.size } });
    }

    return json(res, 400, { error: `Action inconnue : ${action || '(vide)'}. Utilise scan, search, fetch-attachment, imap-connect, ignored-list, ignore-sender, unignore-sender, mark-imported ou unmark-imported.` });
  } catch (e) {
    console.error('gmail-oauth error:', e?.message || e);
    return json(res, 502, { error: e?.message || 'Erreur Gmail OAuth' });
  }
}
