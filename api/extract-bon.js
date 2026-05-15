// Fonction serverless Vercel : lecture d'un bon de commande manuscrit via l'IA
// de vision Claude. Le front envoie une photo (base64), on extrait les champs
// du client + de la vente, et on renvoie un JSON structuré pour pré-remplir
// le formulaire de dossier.
//
// Variables d'environnement requises côté Vercel (SANS préfixe VITE_) :
//   - ANTHROPIC_API_KEY     : clé API Anthropic (console.anthropic.com)
//   - SUPABASE_URL          : URL du projet Supabase (pour valider le JWT appelant)
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase
//
// La clé Anthropic reste côté serveur — jamais exposée au navigateur.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

// Vérifie que l'appelant est un utilisateur Supabase authentifié.
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

// Schéma de sortie structurée — l'IA est contrainte de renvoyer exactement ces champs.
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: 'string', description: 'Nom de famille du client' },
    prenom: { type: 'string', description: 'Prénom du client' },
    adresse: { type: 'string', description: "Adresse (numéro et rue), sans code postal ni ville" },
    codePostal: { type: 'string', description: 'Code postal' },
    ville: { type: 'string', description: 'Ville' },
    telephone: { type: 'string', description: 'Numéro de téléphone' },
    email: { type: 'string', description: 'Adresse email si présente, sinon vide' },
    produit: { type: 'string', description: 'Ce qui a été vendu (ex: panneaux solaires, ballon thermodynamique)' },
    puissance: { type: 'string', description: 'Puissance en Wc si panneaux solaires, juste le nombre (ex: "6000")' },
    montantTTC: { type: 'number', description: 'Montant total TTC en euros (nombre, sans symbole ni espace)' },
    montantHT: { type: 'number', description: 'Montant HT en euros si indiqué, sinon 0' },
    financement: { type: 'string', description: 'Organisme de financement / banque si indiqué, sinon vide' },
    dateSignature: { type: 'string', description: 'Date de signature au format AAAA-MM-JJ si présente, sinon vide' },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'], description: 'Niveau de confiance global de la lecture' },
    remarques: { type: 'string', description: 'Champs illisibles ou incertains à vérifier (court), sinon vide' },
  },
  required: [
    'nom', 'prenom', 'adresse', 'codePostal', 'ville', 'telephone', 'email',
    'produit', 'puissance', 'montantTTC', 'montantHT', 'financement',
    'dateSignature', 'confiance', 'remarques',
  ],
  additionalProperties: false,
};

const INSTRUCTIONS = `Tu lis des bons de commande manuscrits d'une entreprise française de vente et pose de panneaux solaires.
Extrais les informations du client et de la vente depuis l'image.

Règles :
- Les montants sont en euros : enlève les espaces, symboles et séparateurs de milliers, renvoie des nombres simples.
- Si une info est absente ou illisible, mets une chaîne vide (ou 0 pour les montants) et signale-le brièvement dans "remarques".
- "puissance" : uniquement le nombre en Wc si ce sont des panneaux solaires (ex: "6000" pour 6000 Wc).
- "confiance" : "haute" si tout est net et lisible, "moyenne" si quelques doutes, "faible" si l'image est globalement difficile à lire.
- N'invente jamais une valeur : en cas de doute, laisse vide et explique dans "remarques".`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return json(res, 503, {
      error: "Crédits IA non configurés : ajoute la variable ANTHROPIC_API_KEY dans Vercel.",
    });
  }

  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const { imageBase64, mediaType } = body;
  if (!imageBase64 || !mediaType) {
    return json(res, 400, { error: 'Fichier manquant.' });
  }
  const isImage = /^image\/(jpeg|png|webp|gif)$/.test(mediaType);
  const isPdf = mediaType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json(res, 400, { error: 'Format non supporté (JPEG, PNG, WebP, GIF ou PDF).' });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    // Pour un PDF on utilise le bloc "document" (Claude lit chaque page nativement) ;
    // pour une image, on utilise le bloc "image".
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: INSTRUCTIONS },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || !textBlock.text) {
      return json(res, 502, { error: 'Réponse IA vide.' });
    }
    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (e) {
      return json(res, 502, { error: 'Réponse IA non exploitable.' });
    }
    return json(res, 200, { data: parsed });
  } catch (e) {
    const msg = e?.message || 'Erreur IA';
    if (e?.status === 401) return json(res, 502, { error: 'Clé API Anthropic invalide — vérifie ANTHROPIC_API_KEY dans Vercel.' });
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 400 && /credit|balance|insufficient/i.test(msg)) {
      return json(res, 502, { error: 'Crédits IA épuisés — recharge sur console.anthropic.com.' });
    }
    if (e?.status === 413) return json(res, 502, { error: 'Image trop lourde — reprends une photo plus petite.' });
    console.error('extract-bon error:', msg);
    return json(res, 502, { error: `Erreur IA : ${msg}` });
  }
}
