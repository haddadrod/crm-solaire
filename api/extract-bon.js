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

// IDs de produits que le CRM connaît (synchro avec PRODUITS_DEFAULT du front)
const PRODUIT_IDS = ['PANNEAU_SOLAIRE', 'PERGOLA', 'POMPE_A_CHALEUR', 'CLIMATISATION', 'BALLON_THERMO', 'BATTERIE', 'ISOLATION', 'VMC', 'AUTRE'];

// Schéma de sortie structurée — l'IA est contrainte de renvoyer exactement ces champs.
// Construit dynamiquement pour inclure 'societe' enum si availableSocietes fourni.
function buildExtractionSchema(availableSocietes = []) {
  const socIds = availableSocietes.map(s => s.id).filter(Boolean);
  const props = {
    nom: { type: 'string', description: 'Nom de famille du client' },
    prenom: { type: 'string', description: 'Prénom du client' },
    adresse: { type: 'string', description: "Adresse (numéro et rue), sans code postal ni ville" },
    codePostal: { type: 'string', description: 'Code postal' },
    ville: { type: 'string', description: 'Ville' },
    telephone: { type: 'string', description: 'Numéro de téléphone' },
    email: { type: 'string', description: 'Adresse email si présente, sinon vide' },
    // Liste des produits/équipements présents sur le BC (un dossier peut combiner
    // plusieurs équipements : panneaux solaires + pergola + ballon thermo, etc.)
    produits: {
      type: 'array',
      description: "Liste de TOUS les produits/équipements présents sur le bon de commande. Un dossier peut combiner plusieurs équipements (ex : panneaux solaires + pergola). Pour chaque ligne du tableau de prestations, ajoute une entrée.",
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: PRODUIT_IDS, description: `Type parmi : ${PRODUIT_IDS.join(', ')}. Pour la pergola, utilise 'PERGOLA'.` },
          label: { type: 'string', description: "Libellé tel que présent sur le BC." },
          puissance: { type: 'number', description: "Puissance en Wc — UNIQUEMENT pour PANNEAU_SOLAIRE / PERGOLA solaire. Sinon 0." },
          quantite: { type: 'number', description: "Quantité (1 par défaut). 6 pour 6 climatisations." },
        },
        required: ['type', 'label', 'puissance', 'quantite'],
        additionalProperties: false,
      },
    },
    // [LEGACY] Conservés pour rétrocompat avec l'ancien front
    produit: { type: 'string', description: "[LEGACY] 1er produit en texte libre (ex: panneaux solaires)." },
    puissance: { type: 'string', description: '[LEGACY] Puissance en Wc du 1er produit solaire, sinon vide.' },
    montantTTC: { type: 'number', description: 'Montant total TTC en euros (nombre, sans symbole ni espace)' },
    montantHT: { type: 'number', description: 'Montant HT en euros si indiqué, sinon 0' },
    financement: { type: 'string', description: 'Organisme de financement / banque si indiqué, sinon vide' },
    dateSignature: { type: 'string', description: 'Date de signature au format AAAA-MM-JJ si présente, sinon vide' },
    // 🏦 Détails du prêt (bloc "PAIEMENT AVEC FINANCEMENT" du BC). Tous à 0/vide si comptant.
    montantPret: { type: 'number', description: 'Montant du prêt en euros (champ "Montant du prêt"). 0 si comptant.' },
    reportMois: { type: 'number', description: 'Report en mois (champ "Report : X mois"). 0 si non indiqué.' },
    tauxDebiteur: { type: 'number', description: 'Taux débiteur fixe en % (ex 6.39). 0 si non indiqué.' },
    taeg: { type: 'number', description: 'TAEG (Taux annuel effectif global) en % (ex 6.58). 0 si non indiqué.' },
    nbEcheances: { type: 'number', description: "Nombre d'échéances (ex 180). 0 si non indiqué." },
    montantEcheance: { type: 'number', description: "Montant d'une échéance en euros (ex 312). 0 si non indiqué." },
    periodicite: { type: 'string', enum: ['', 'Mensuelle', 'Bimestrielle', 'Trimestrielle', 'Semestrielle', 'Annuelle'], description: "Périodicité des échéances. Vide si non indiqué — souvent 'Mensuelle' par défaut sur les BC." },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'], description: 'Niveau de confiance global de la lecture' },
    remarques: { type: 'string', description: 'Champs illisibles ou incertains à vérifier (court), sinon vide' },
  };
  const required = [
    'nom', 'prenom', 'adresse', 'codePostal', 'ville', 'telephone', 'email',
    'produits', 'produit', 'puissance', 'montantTTC', 'montantHT', 'financement',
    'dateSignature',
    'montantPret', 'reportMois', 'tauxDebiteur', 'taeg', 'nbEcheances', 'montantEcheance', 'periodicite',
    'confiance', 'remarques',
  ];
  if (socIds.length > 0) {
    props.societe = {
      type: 'string',
      enum: ['', ...socIds],
      description: `Identifiant de la société émettrice du bon de commande. Regarde le LOGO en haut, la raison sociale, le SIRET. Valeurs : ${availableSocietes.map(s => `'${s.id}' (${s.label})`).join(', ')}. Si pas sûr, mets ''.`,
    };
    required.push('societe');
  }
  return { type: 'object', properties: props, required, additionalProperties: false };
}

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
  const { imageBase64, mediaType, storagePath, availableSocietes } = body;
  if ((!imageBase64 && !storagePath) || !mediaType) {
    return json(res, 400, { error: 'Fichier manquant (imageBase64 ou storagePath requis).' });
  }
  const socList = Array.isArray(availableSocietes)
    ? availableSocietes
        .filter(s => s && typeof s.id === 'string' && typeof s.label === 'string' && s.id && s.label)
        .map(s => ({ id: s.id, label: s.label }))
        .slice(0, 10)
    : [];
  const isImage = /^image\/(jpeg|png|webp|gif)$/.test(mediaType);
  const isPdf = mediaType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json(res, 400, { error: 'Format non supporté (JPEG, PNG, WebP, GIF ou PDF).' });
  }

  // Si le client a uploadé d'abord dans le bucket et nous envoie juste le path,
  // on télécharge le fichier ici (bypass la limite 4 Mo du body Vercel).
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
    // Pour un PDF on utilise le bloc "document" (Claude lit chaque page nativement) ;
    // pour une image, on utilise le bloc "image".
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: buildExtractionSchema(socList) },
      },
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: INSTRUCTIONS + (socList.length > 0 ? `\n\nSOCIÉTÉS DISPONIBLES : ${socList.map(s => `${s.id} (${s.label})`).join(', ')}. Identifie la société émettrice via le LOGO / raison sociale / SIRET / pied de page. Renvoie l'identifiant exact dans 'societe'.` : ''),
            },
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
