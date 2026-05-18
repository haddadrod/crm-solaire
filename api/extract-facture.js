// Fonction serverless Vercel : lecture d'une facture de prestataire
// (poseur / régie / fournisseur) via Claude vision/document.
// Le front envoie la facture (PDF ou image), on extrait les champs
// principaux et on renvoie un JSON pour pré-remplir les champs du dossier.
//
// Variables d'environnement requises côté Vercel (SANS préfixe VITE_) :
//   - ANTHROPIC_API_KEY     : clé API Anthropic (console.anthropic.com)
//   - SUPABASE_URL          : URL du projet Supabase (pour valider le JWT appelant)
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase

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

// Schéma strict : Claude renvoie exactement ces champs (ou vide).
const FACTURE_SCHEMA = {
  type: 'object',
  properties: {
    fournisseur: { type: 'string', description: "Raison sociale en haut de la facture (l'entité qui a émis la facture, pas le destinataire). Ex : 'ECO NEGOCE', 'IONERGIK', 'SOLAR PRO'." },
    factureNo: { type: 'string', description: "Numéro de facture (champs typiques : 'Facture n°', 'N° facture', 'Numéro'). Garde le format d'origine (FA2026-0145, 2026/03/012, etc.)." },
    bl: { type: 'string', description: "Numéro de bon de livraison s'il est mentionné sur la facture (champs : 'BL', 'B/L', 'Bon de livraison n°'). Sinon vide." },
    dateFacture: { type: 'string', description: "Date d'émission de la facture au format AAAA-MM-JJ. Si pas trouvée, vide." },
    montantHt: { type: 'number', description: "Total HT en euros (nombre, sans symbole ni espace). Si seul un TTC est lisible, mets 0 et précise dans remarques." },
    montantTtc: { type: 'number', description: "Total TTC en euros." },
    tauxTva: { type: 'number', description: "Taux de TVA appliqué en pourcentage (ex : 20, 10, 5.5, 0). 0 si auto-entrepreneur / société étrangère sans TVA." },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'], description: "Niveau de confiance global de la lecture." },
    remarques: { type: 'string', description: "Notes brèves : champs illisibles, incohérences, ou contexte utile. Sinon vide." },
  },
  required: ['fournisseur', 'factureNo', 'bl', 'dateFacture', 'montantHt', 'montantTtc', 'tauxTva', 'confiance', 'remarques'],
  additionalProperties: false,
};

const INSTRUCTIONS = `Tu lis une facture émise par un prestataire (fournisseur de matériel solaire, poseur, ou régie commerciale) pour une entreprise française de pose de panneaux solaires.

Extrais ces informations depuis la facture :
- fournisseur : raison sociale de l'émetteur (en haut de la facture, pas le destinataire)
- factureNo : numéro de facture exactement comme écrit
- bl : numéro de bon de livraison s'il est mentionné, sinon vide
- dateFacture : date d'émission au format AAAA-MM-JJ
- montantHt : total HT en euros (nombre)
- montantTtc : total TTC en euros (nombre)
- tauxTva : taux de TVA en pourcentage (20, 10, 5.5, ou 0 pour auto-entrepreneur / sans TVA)
- confiance : 'haute' / 'moyenne' / 'faible' selon la lisibilité
- remarques : court texte si quelque chose mérite vérification, sinon vide

Règles :
- Enlève espaces, symboles € et séparateurs de milliers des montants.
- Si une info est absente ou illisible, mets une chaîne vide (ou 0 pour les montants) et signale dans 'remarques'.
- N'invente jamais une valeur — en cas de doute, laisse vide.
- Si la facture est sans TVA (auto-entrepreneur, société étrangère hors UE), mets tauxTva: 0.`;

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
  const { imageBase64, mediaType, storagePath } = body;
  if ((!imageBase64 && !storagePath) || !mediaType) {
    return json(res, 400, { error: 'Fichier manquant (imageBase64 ou storagePath requis).' });
  }
  const isImage = /^image\/(jpeg|png|webp|gif)$/.test(mediaType);
  const isPdf = mediaType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json(res, 400, { error: 'Format non supporté (JPEG, PNG, WebP, GIF ou PDF).' });
  }

  // Bypass de la limite 4 Mo du body Vercel : si on a juste un path bucket,
  // on télécharge côté serveur.
  let fileBase64 = imageBase64;
  if (!fileBase64 && storagePath) {
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: blob, error: dlErr } = await admin.storage
        .from('dossier-documents')
        .download(storagePath);
      if (dlErr || !blob) {
        return json(res, 502, { error: `Lecture du fichier impossible : ${dlErr?.message || 'inconnu'}` });
      }
      const arrayBuffer = await blob.arrayBuffer();
      fileBase64 = Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
      return json(res, 502, { error: `Téléchargement bucket échoué : ${e.message}` });
    }
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: FACTURE_SCHEMA },
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
    if (e?.status === 401) return json(res, 502, { error: 'Clé API Anthropic invalide.' });
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 400 && /credit|balance|insufficient/i.test(msg)) {
      return json(res, 502, { error: 'Crédits IA épuisés — recharge sur console.anthropic.com.' });
    }
    if (e?.status === 413) return json(res, 502, { error: 'Facture trop lourde — réessaie avec une image plus petite ou un PDF compressé.' });
    console.error('extract-facture error:', msg);
    return json(res, 502, { error: `Erreur IA : ${msg}` });
  }
}
