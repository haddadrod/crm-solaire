// Fonction serverless Vercel : assistant IA multi-intentions pour le CRM.
// Reçoit un ordre en langage naturel + un mini-annuaire des clients,
// renvoie une action structurée :
//
//   - intent='email'        → rédige sujet+corps pour le client identifié
//   - intent='open_dossier' → identifie le dossier à ouvrir
//   - intent='answer'       → répond à une question (CA, comptage, stats simples)
//   - intent='ambiguous'    → plusieurs clients possibles, demande à l'user
//
// Exemples d'ordres :
//   "Envoie un mail à Marage pour confirmer la pose"   → email
//   "Ouvre le dossier de Borbeau"                       → open_dossier
//   "Combien de dossiers j'ai en cours ce mois ?"      → answer
//   "Marage est où dans le workflow ?"                  → answer + open_dossier
//
// Variables d'env requises :
//   - ANTHROPIC_API_KEY
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

const SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['email', 'open_dossier', 'answer', 'ambiguous', 'move_status'],
      description: "Type d'action déduite de l'ordre. 'email' pour rédiger un mail, 'open_dossier' pour juste ouvrir un dossier, 'answer' pour répondre à une question/donner une info, 'move_status' pour DÉPLACER un dossier dans le parcours (changer son statut), 'ambiguous' si plusieurs clients matchent ou ordre trop vague.",
    },
    targetLocalId: {
      type: 'string',
      description: "localId du client identifié (depuis la liste 'dossiers'). Vide pour 'answer' sans client précis ou 'ambiguous'.",
    },
    candidateLocalIds: {
      type: 'array',
      items: { type: 'string' },
      description: "Si intent='ambiguous', liste des localId candidats (max 5).",
    },
    subject: {
      type: 'string',
      description: "Sujet de l'email (uniquement si intent='email'). Vide sinon.",
    },
    body: {
      type: 'string',
      description: "Corps du mail (si intent='email') OU réponse à la question (si intent='answer'). Format mail : Bonjour [Prénom],\\n\\n[contenu]\\n\\nCordialement,\\n[Ton nom]. Format réponse : texte libre en français.",
    },
    targetStatutId: {
      type: 'string',
      description: "UNIQUEMENT si intent='move_status' : l'id EXACT du statut cible choisi dans la liste autorisée (ex 'B1_EN_COURS_FINANCEMENT'). Vide sinon.",
    },
    reasoning: {
      type: 'string',
      description: "1 phrase expliquant ce que tu as compris de l'ordre.",
    },
  },
  required: ['intent', 'targetLocalId', 'candidateLocalIds', 'subject', 'body', 'targetStatutId', 'reasoning'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu es l'assistant IA du CRM d'une activité de vente et pose de panneaux solaires en France. L'utilisateur te donne un ordre en français — tu dois deviner ce qu'il veut faire et structurer la réponse.

4 intentions possibles :

1. **intent='email'** — l'ordre dit clairement "envoie un mail", "réponds à", "écris à" un client.
   → Identifie le client, rédige sujet court + corps de mail.
   → Format body : "Bonjour [Prénom],\\n\\n[contenu]\\n\\nCordialement,\\n[Ton nom]"
   → N'invente pas de date ou de chiffre absents du dossier ou de l'ordre.

2. **intent='open_dossier'** — l'ordre dit "ouvre", "montre", "trouve", "va sur" le dossier d'un client.
   → Identifie le client. subject et body vides.

3. **intent='answer'** — l'ordre est une question (combien, quel statut, etc.) ou un constat sans action sur un dossier.
   → Réponds en français dans le champ "body" (1-3 phrases max, pas de mail).
   → Utilise les données fournies (liste dossiers, stats si fournies) pour répondre.
   → targetLocalId optionnel : si la question porte sur 1 client précis, mets son id (le front pourra proposer d'ouvrir le dossier).

4. **intent='ambiguous'** — plusieurs clients matchent l'ordre OU l'ordre est trop vague pour décider.
   → Liste les candidats dans candidateLocalIds. reasoning explique pourquoi.

5. **intent='move_status'** — l'ordre demande de DÉPLACER un dossier dans le parcours / changer son statut
   ("bascule X en financement", "passe X en contrôle qualité", "mets X en pose", "marque X payé/annulé").
   → Identifie le client (targetLocalId). Si plusieurs clients matchent → 'ambiguous' à la place.
   → targetStatutId = l'id EXACT du statut cible parmi cette liste autorisée :
     • A1_CONTROLE_QUALITE — contrôle qualité (CQ)
     • B_A_ENVOYER_BANQUE — à envoyer en financement / en banque
     • B1_EN_COURS_FINANCEMENT — en financement (dossier envoyé à la banque) ← "en financement" par défaut
     • B2_A_ENVOYER_POSE — à programmer en pose
     • B4_EN_COURS_POSE — en cours de pose
     • W_DOSSIER_PAYER — payé
     • W2_ANNULER — annulé
     • C_LITIGE — litige
     • D_SAV — SAV
   → subject/body vides. reasoning = ce que tu déplaces et vers quoi.

⚠️ RÈGLE D'AMBIGUÏTÉ (PRIORITAIRE) — vaut pour 'open_dossier', 'move_status' ET 'email' :
- Si PLUSIEURS clients de la liste correspondent au nom donné (ex : l'ordre dit "Bertrand" et il y a 2+ clients dont le nom OU prénom est "Bertrand"), tu NE choisis JAMAIS arbitrairement.
- Dans ce cas → intent='ambiguous', et mets TOUS les localId correspondants dans candidateLocalIds (pas un seul). reasoning = "Plusieurs clients s'appellent X, lequel ?".
- Tu ne renvoies 'open_dossier'/'move_status'/'email' avec un targetLocalId unique QUE si UN SEUL client correspond sans ambiguïté.

Règles globales :
- Si l'ordre est une question pure ("combien", "quel", "qui", "où est"), c'est 'answer'.
- Si l'ordre commence par un verbe d'envoi de mail, c'est 'email'.
- Si l'ordre dit juste "ouvre", "affiche", "montre" un nom, c'est 'open_dossier'.
- Si l'ordre dit "bascule", "passe", "déplace", "mets", "marque" un dossier vers une étape/statut, c'est 'move_status'.
- En cas de doute entre email et open_dossier, choisis email seulement si "mail", "message", "écris" ou "envoie" est explicite.`;

// ── 💡 Demandes de modification du CRM (codage) ──────────────────────────────
// Le bouton « 💡 Demander une modif » du CRM poste ici. La demande est
// enregistrée dans la table storage (clé `modif-requests`) ET, si un token
// GitHub est configuré (GITHUB_MODIF_TOKEN sur Vercel, scope issues:write sur
// le repo), une issue GitHub mentionnant @claude est créée → l'app Claude Code
// GitHub implémente la modif sur une branche et ouvre une PR (validée par
// l'admin avant merge). Sans token : mode dégradé « boîte à demandes ».
// Routes (mutualisées ici pour ne pas créer une énième fonction api/*.js) :
//   body.action = 'modif_request'      → créer une demande
//   body.action = 'modif_request_list' → lister les demandes
const GITHUB_MODIF_TOKEN = process.env.GITHUB_MODIF_TOKEN;
const GITHUB_MODIF_REPO = process.env.GITHUB_MODIF_REPO || 'haddadrod/crm-solaire';
const MODIF_KEY = 'modif-requests';

async function handleModifRequest(res, body, caller) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const readList = async () => {
    const { data } = await admin.from('storage').select('value').eq('key', MODIF_KEY).maybeSingle();
    if (!data?.value) return [];
    try { const arr = JSON.parse(data.value); return Array.isArray(arr) ? arr : []; } catch { return []; }
  };

  if (body.action === 'modif_request_list') {
    const list = await readList();
    return json(res, 200, { requests: list.slice().reverse(), githubConfigured: !!GITHUB_MODIF_TOKEN });
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_MODIF_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'crm-solaire-modif-request',
  };
  const isAdminCaller = caller.user_metadata?.role === 'admin';

  // ✅ Liste des propositions (PRs ouvertes par le Claude-codeur) à valider —
  // affichée dans le CRM pour que l'admin n'ait pas à aller sur GitHub.
  if (body.action === 'modif_pr_list') {
    if (!GITHUB_MODIF_TOKEN) return json(res, 200, { prs: [] });
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_MODIF_REPO}/pulls?state=open&per_page=30`, { headers: ghHeaders });
    const ghData = await ghRes.json().catch(() => ([]));
    if (!ghRes.ok) return json(res, 502, { error: `GitHub (${ghRes.status}) : ${ghData?.message || 'erreur'}` });
    const prs = (Array.isArray(ghData) ? ghData : [])
      .filter(p => /^claude\/issue-\d+/.test(p.head?.ref || ''))
      .map(p => ({
        number: p.number,
        title: p.title || '',
        url: p.html_url || '',
        branch: p.head?.ref || '',
        issueNumber: parseInt((p.head?.ref || '').match(/^claude\/issue-(\d+)/)?.[1] || '0', 10) || null,
        createdAt: p.created_at || '',
        body: (p.body || '').slice(0, 600),
      }));
    return json(res, 200, { prs, isAdmin: isAdminCaller });
  }

  // 🚀 Valider (= merger) une proposition depuis le CRM. Admin uniquement.
  // Le merge déclenche le déploiement Vercel automatique.
  if (body.action === 'modif_pr_merge') {
    if (!isAdminCaller) return json(res, 403, { error: 'Seul un admin peut valider une mise en ligne.' });
    if (!GITHUB_MODIF_TOKEN) return json(res, 503, { error: 'GITHUB_MODIF_TOKEN non configuré sur Vercel.' });
    const prNumber = parseInt(body.prNumber, 10);
    if (!prNumber) return json(res, 400, { error: 'prNumber requis.' });
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_MODIF_REPO}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({ merge_method: 'squash' }),
    });
    const ghData = await ghRes.json().catch(() => ({}));
    if (!ghRes.ok) {
      // 403 = le token n'a pas les permissions Contents/Pull requests (Read & write).
      const hint = ghRes.status === 403
        ? " — le token GitHub (crm-bouton-modif) n'a pas les permissions « Contents » et « Pull requests » en Read & write. Édite-le sur github.com/settings/personal-access-tokens et ajoute-les."
        : '';
      return json(res, 502, { error: `Validation impossible (${ghRes.status}) : ${ghData?.message || 'erreur GitHub'}${hint}` });
    }
    return json(res, 200, { ok: true, merged: true, sha: ghData.sha || '' });
  }

  const description = String(body.description || '').trim();
  const titre = String(body.titre || '').trim();
  if (description.length < 10) {
    return json(res, 400, { error: 'Décris la modification souhaitée (au moins 10 caractères).' });
  }
  const par = caller.user_metadata?.display_name || (caller.email ? caller.email.split('@')[0] : 'utilisateur');
  const entry = {
    at: new Date().toISOString(),
    par,
    email: caller.email || '',
    titre,
    description,
    status: 'enregistrée',
    issueNumber: null,
    issueUrl: '',
  };

  // 📸 Capture d'écran jointe (data URL compressée côté front). On la stocke
  // dans storage (clé dédiée) et on la fait DÉCRIRE par l'IA de vision : cette
  // description part dans l'issue GitHub pour que le Claude-codeur « voie »
  // où est la modif demandée (les issues GitHub n'acceptent pas d'upload
  // d'image par API — la description texte est le vecteur fiable).
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  if (imageBase64) {
    if (imageBase64.length > 3_000_000) {
      return json(res, 400, { error: 'Capture trop lourde (max ~2 Mo) — recadre ou réduis la qualité.' });
    }
    const imgMatch = imageBase64.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!imgMatch) return json(res, 400, { error: "Format d'image non reconnu." });
    entry.imageKey = `modif-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await admin.from('storage').upsert({ key: entry.imageKey, value: imageBase64, updated_at: new Date().toISOString() });
    if (ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 700,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imgMatch[1] === 'image/jpg' ? 'image/jpeg' : imgMatch[1], data: imgMatch[2] } },
              { type: 'text', text: "Cette capture d'écran d'un CRM accompagne une demande de modification. Décris-la PRÉCISÉMENT pour le développeur qui fera la modif SANS voir l'image : quel écran/onglet/section, quels éléments visibles (titres exacts, boutons, champs, badges, couleurs), et signale tout élément entouré, fléché ou surligné par l'utilisateur. 5 à 8 phrases, en français, factuel." },
            ],
          }],
        });
        const t = msg.content.find(b => b.type === 'text');
        if (t?.text) entry.imageDescription = t.text.trim();
      } catch (e) {
        console.error('modif_request vision error:', e?.message);
      }
    }
  }

  if (GITHUB_MODIF_TOKEN) {
    try {
      const issueTitle = `[CRM] ${titre || description.slice(0, 70)}`;
      const issueBody = [
        `@claude ${description}`,
        ...(entry.imageDescription ? [
          '',
          `📸 **Une capture d'écran est jointe à la demande** (stockée dans le CRM, clé \`${entry.imageKey}\`). Description automatique de la capture :`,
          `> ${entry.imageDescription.replace(/\n/g, '\n> ')}`,
        ] : (entry.imageKey ? ['', `📸 Une capture d'écran est jointe (clé \`${entry.imageKey}\` dans la table storage), mais sa description automatique a échoué.`] : [])),
        '',
        '---',
        `_Demande déposée par **${par}** (${caller.email || 'email inconnu'}) depuis le CRM (bouton « 💡 Demander une modif »)._`,
        '',
        "**Instructions :** lis `CLAUDE.md` et `SUIVI.md` d'abord. Implémente sur une branche `claude/...`, vérifie que `npm run build` passe, puis ouvre une PR vers `main`. Ne pousse JAMAIS directement sur `main` — la PR sera validée par l'admin avant merge.",
      ].join('\n');
      const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_MODIF_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_MODIF_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'crm-solaire-modif-request',
        },
        body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ['demande-crm'] }),
      });
      const ghData = await ghRes.json().catch(() => ({}));
      if (ghRes.ok && ghData.number) {
        entry.status = 'issue créée';
        entry.issueNumber = ghData.number;
        entry.issueUrl = ghData.html_url || '';
      } else {
        entry.status = `erreur GitHub (${ghRes.status}) — demande quand même enregistrée`;
        console.error('modif_request GitHub error:', ghRes.status, ghData?.message);
      }
    } catch (e) {
      entry.status = 'erreur GitHub — demande quand même enregistrée';
      console.error('modif_request GitHub exception:', e?.message);
    }
  }

  let list = await readList();
  list.push(entry);
  if (list.length > 200) list = list.slice(-200);
  await admin.from('storage').upsert({ key: MODIF_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() });
  return json(res, 200, { ok: true, entry, requests: list.slice().reverse(), githubConfigured: !!GITHUB_MODIF_TOKEN });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  // 💡 Demandes de modif : pas besoin d'ANTHROPIC_API_KEY, juste d'être connecté.
  const preBody = req.body || {};
  if (['modif_request', 'modif_request_list', 'modif_pr_list', 'modif_pr_merge'].includes(preBody.action)) {
    const modifCaller = await getCaller(req);
    if (!modifCaller) return json(res, 401, { error: 'Connexion requise.' });
    return handleModifRequest(res, preBody, modifCaller);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(res, 503, { error: "Crédits IA non configurés (ANTHROPIC_API_KEY manquante sur Vercel)." });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const { command, dossiers, senderName } = body;
  if (!command || typeof command !== 'string' || command.trim().length < 3) {
    return json(res, 400, { error: 'Commande trop courte ou manquante.' });
  }
  if (!Array.isArray(dossiers) || dossiers.length === 0) {
    return json(res, 400, { error: 'Aucun dossier fourni en contexte.' });
  }
  // Pour permettre les questions de stats ("combien ce mois"), on envoie un peu
  // plus de dossiers que pour l'email (qui n'a besoin que de chercher un nom).
  // Garde-fou taille : 200 max + champs réduits.
  const lightDossiers = dossiers.slice(0, 200).map(d => ({
    localId: d.localId,
    nom: d.nom || '',
    prenom: d.prenom || '',
    email: d.email || '',
    telephone: d.telephone || '',
    statut: d.statut || '',
    dateInsta: d.dateInsta || '',
    financement: d.financement || '',
    payeClient: !!d.payeClient,
  }));

  const userMsg = [
    `Voici la liste de mes clients (${lightDossiers.length}) :`,
    JSON.stringify(lightDossiers),
    '',
    `Mon ordre : ${command.trim()}`,
    senderName ? `\nSignature à utiliser pour les mails : ${senderName}` : '',
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) return json(res, 502, { error: 'Réponse IA vide.' });
    let parsed;
    try { parsed = JSON.parse(textBlock.text); }
    catch (e) { return json(res, 502, { error: 'Réponse IA non parseable.' }); }
    return json(res, 200, { data: parsed });
  } catch (e) {
    const msg = e?.message || 'Erreur IA';
    if (e?.status === 401) return json(res, 502, { error: 'Clé API Anthropic invalide.' });
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 400 && /credit|balance|insufficient/i.test(msg)) {
      return json(res, 502, { error: 'Crédits IA épuisés.' });
    }
    console.error('ai-email-assistant error:', msg);
    return json(res, 502, { error: `Erreur IA : ${msg}` });
  }
}
