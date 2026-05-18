// Fonction serverless Vercel : assistant IA façon "secrétaire" pour le CRM.
// Reçoit un ordre en langage naturel + un mini-annuaire des clients du dossier,
// renvoie : { targetLocalId, subject, body, reasoning, ambiguous? }
//
// L'utilisateur tape par exemple :
//   "Envoie un mail à Marage pour confirmer la pose mardi prochain"
// Claude :
//   1. identifie le client (parmi les clients fournis)
//   2. rédige sujet + corps de mail dans un ton pro mais cordial
//   3. signale si plusieurs clients matchent (ambiguous=true → on demande à l'user)
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
    targetLocalId: {
      type: 'string',
      description: "localId du client identifié (depuis la liste 'dossiers' fournie). Vide si aucun match clair.",
    },
    ambiguous: {
      type: 'boolean',
      description: "true si plusieurs clients matchent l'ordre (ex: 2 dossiers Martin) ou si l'ordre est trop vague pour choisir.",
    },
    candidateLocalIds: {
      type: 'array',
      items: { type: 'string' },
      description: "Si ambiguous=true, liste des localId candidats (max 5) pour que l'user puisse choisir.",
    },
    subject: {
      type: 'string',
      description: "Sujet de l'email — court et explicite (ex : 'Confirmation de la date de pose').",
    },
    body: {
      type: 'string',
      description: "Corps du mail en français, ton pro et cordial. Format : Bonjour [Prénom],\\n\\n[contenu]\\n\\nCordialement,\\n[nom de l'expéditeur si fourni, sinon laisse '[Ton nom]']. Utilise \\n pour les sauts de ligne.",
    },
    reasoning: {
      type: 'string',
      description: "Brève explication (1 phrase) de comment tu as identifié le client et choisi le contenu — affichée à l'user pour transparence.",
    },
  },
  required: ['targetLocalId', 'ambiguous', 'candidateLocalIds', 'subject', 'body', 'reasoning'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu es la secrétaire d'un commercial qui gère une activité de vente et pose de panneaux solaires en France. L'utilisateur te donne un ordre en français pour envoyer un email à un de ses clients. Tu dois :

1. Identifier le client parmi la liste fournie (par nom, prénom, ID, ou contexte). Si plusieurs clients matchent, mets ambiguous=true et liste les candidates dans candidateLocalIds.

2. Rédiger un sujet d'email court et un corps clair, dans un français professionnel mais cordial (tutoiement seulement si l'ordre le suggère).

3. Tenir compte du contexte du dossier (statut, date de pose si pertinente, etc.) pour personnaliser. N'invente pas de date ou de chiffre qui ne sont pas dans le dossier ou dans l'ordre.

4. Signer "[Ton nom]" — l'utilisateur remplacera par son vrai nom. Sauf si l'ordre donne un nom d'expéditeur.

5. Ne PAS répéter l'ordre dans le corps. Concentre-toi sur ce que le client doit lire.

6. Format du body : utilise des sauts de ligne \\n (pas de balises HTML). Commence par "Bonjour [Prénom]," et finis par "Cordialement,\\n[Ton nom]".

Si l'ordre est trop vague ou si aucun client clairement identifié → ambiguous=true, targetLocalId vide, et reasoning explique ce qui manque.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
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
  // Sécurité : on limite la taille du contexte envoyé à Claude.
  // On envoie nom, prénom, email, statut, dateInsta, financement (max 100 dossiers).
  // Pas de chiffres financiers, pas de tarifs internes.
  const lightDossiers = dossiers.slice(0, 100).map(d => ({
    localId: d.localId,
    nom: d.nom || '',
    prenom: d.prenom || '',
    email: d.email || '',
    telephone: d.telephone || '',
    statut: d.statut || '',
    dateInsta: d.dateInsta || '',
    financement: d.financement || '',
  }));

  const userMsg = [
    `Voici la liste de mes clients (${lightDossiers.length}) :`,
    JSON.stringify(lightDossiers),
    '',
    `Mon ordre : ${command.trim()}`,
    senderName ? `\nSignature à utiliser : ${senderName}` : '',
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
