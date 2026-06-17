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
      enum: ['email', 'open_dossier', 'answer', 'ambiguous'],
      description: "Type d'action déduite de l'ordre. 'email' pour rédiger un mail, 'open_dossier' pour juste ouvrir un dossier, 'answer' pour répondre à une question/donner une info, 'ambiguous' si plusieurs clients matchent ou ordre trop vague.",
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
    reasoning: {
      type: 'string',
      description: "1 phrase expliquant ce que tu as compris de l'ordre.",
    },
  },
  required: ['intent', 'targetLocalId', 'candidateLocalIds', 'subject', 'body', 'reasoning'],
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

Règles globales :
- Si l'ordre est une question pure ("combien", "quel", "qui", "où est"), c'est 'answer'.
- Si l'ordre commence par un verbe d'envoi de mail, c'est 'email'.
- Si l'ordre dit juste "ouvre", "affiche", "montre" un nom, c'est 'open_dossier'.
- En cas de doute entre email et open_dossier, choisis email seulement si "mail", "message", "écris" ou "envoie" est explicite.`;

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
