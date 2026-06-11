// Fonction serverless Vercel : extraction structurée via Claude vision.
// Couvre deux cas d'usage selon `type` dans le body :
//   - type: 'bon'     → bon de commande client (extrait coordonnées, produits,
//                       montants, financement, etc.)
//   - type: 'facture' → facture prestataire (extrait fournisseur, n°, dates,
//                       montants HT/TTC/TVA)
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

// ============================================================================
//                         SCHEMA + PROMPT : BON DE COMMANDE
// ============================================================================
const PRODUIT_IDS = ['PANNEAU_SOLAIRE', 'PERGOLA', 'POMPE_A_CHALEUR', 'CLIMATISATION', 'BALLON_THERMO', 'BATTERIE', 'ISOLATION', 'VMC', 'AUTRE'];

function buildBonSchema(availableSocietes = []) {
  const socIds = availableSocietes.map(s => s.id).filter(Boolean);
  const props = {
    nom: { type: 'string', description: 'Nom de famille du client' },
    prenom: { type: 'string', description: 'Prénom du client' },
    adresse: { type: 'string', description: "Adresse (numéro et rue), sans code postal ni ville" },
    codePostal: { type: 'string', description: 'Code postal' },
    ville: { type: 'string', description: 'Ville' },
    telephone: { type: 'string', description: 'Numéro de téléphone' },
    email: { type: 'string', description: 'Adresse email si présente, sinon vide' },
    produits: {
      type: 'array',
      description: "Liste de TOUS les produits/équipements présents sur le bon de commande. RÈGLE CRITIQUE : 'panneaux solaires installés sur une pergola' = DEUX produits SÉPARÉS (1 ligne PANNEAU_SOLAIRE avec sa puissance Wc + 1 ligne PERGOLA quantité 1), pas un seul produit fusionné. Une pergola seule (sans solaire) = 1 ligne PERGOLA. Des panneaux seuls (sur toiture) = 1 ligne PANNEAU_SOLAIRE. Idem pour les combinaisons : panneaux + PAC + ballon thermo = 3 lignes distinctes.",
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: PRODUIT_IDS, description: `Type parmi : ${PRODUIT_IDS.join(', ')}. PERGOLA = la structure elle-même (jamais avec une puissance Wc, mettre puissance=0). Pour les panneaux POSÉS SUR la pergola, créer une ligne séparée PANNEAU_SOLAIRE avec la puissance.` },
          label: { type: 'string', description: "Libellé tel que présent sur le BC (ex : 'Panneaux solaires 6000 Wc' ou 'Pergola bioclimatique 4x3m')." },
          puissance: { type: 'number', description: "Puissance en Wc — UNIQUEMENT pour PANNEAU_SOLAIRE. Pour une PERGOLA mettre TOUJOURS 0 (même si la pergola est solaire — la puissance va sur la ligne PANNEAU_SOLAIRE séparée)." },
          quantite: { type: 'number', description: "Quantité (1 par défaut). 6 pour 6 climatisations." },
        },
        required: ['type', 'label', 'puissance', 'quantite'],
        additionalProperties: false,
      },
    },
    typeToiture: { type: 'string', enum: ['', 'tuile', 'ardoise', 'tole', 'zinc', 'fibro', 'bac_acier', 'pergola', 'autre'], description: "Type de toiture / support, UNIQUEMENT si coché ou écrit sur le BC. Sinon ''. Si pergola = laisser '' (l'info est déjà dans le produit PERGOLA)." },
    orientationPanneaux: { type: 'string', enum: ['', 'portrait', 'paysage', 'les_deux'], description: "Orientation des panneaux, UNIQUEMENT si coché sur le BC. Sinon ''." },
    produit: { type: 'string', description: "[LEGACY] 1er produit en texte libre (ex: panneaux solaires)." },
    puissance: { type: 'string', description: '[LEGACY] Puissance en Wc du 1er produit solaire, sinon vide.' },
    montantTTC: { type: 'number', description: 'Montant total TTC en euros (nombre, sans symbole ni espace)' },
    montantHT: { type: 'number', description: 'Montant HT en euros si indiqué, sinon 0' },
    financement: { type: 'string', description: 'Organisme de financement / banque si indiqué, sinon vide' },
    dateSignature: { type: 'string', description: 'Date de signature au format AAAA-MM-JJ si présente, sinon vide' },
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
    'typeToiture', 'orientationPanneaux',
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

const BON_INSTRUCTIONS = `Tu lis des bons de commande manuscrits d'une entreprise française de vente et pose de panneaux solaires.
Extrais les informations du client et de la vente depuis l'image.

Règles :
- Les montants sont en euros : enlève les espaces, symboles et séparateurs de milliers, renvoie des nombres simples.
- Si une info est absente ou illisible, mets une chaîne vide (ou 0 pour les montants) et signale-le brièvement dans "remarques".
- "puissance" : uniquement le nombre en Wc si ce sont des panneaux solaires (ex: "6000" pour 6000 Wc).
- 🚨 RÈGLE PRODUITS : si le BC contient des "panneaux solaires sur pergola" (la pergola sert de support aux panneaux), tu DOIS retourner DEUX produits séparés : 1) PANNEAU_SOLAIRE avec sa puissance Wc, 2) PERGOLA quantité 1 avec puissance=0. Ne fusionne JAMAIS en un seul produit "Pergola photovoltaïque". Idem pour toute combinaison de produits (panneaux + PAC + ballon thermo = 3 lignes distinctes). Une seule exception : pergola SEULE sans panneaux = 1 ligne PERGOLA.
- 🏠 typeToiture / orientationPanneaux : ne remplis QUE si tu vois clairement la case cochée ou l'écriture sur le BC. Sinon laisse ''. N'invente JAMAIS. Si pergola dans les produits, laisse typeToiture='' (l'info est dans le produit PERGOLA).
- "confiance" : "haute" si tout est net et lisible, "moyenne" si quelques doutes, "faible" si l'image est globalement difficile à lire.
- N'invente jamais une valeur : en cas de doute, laisse vide et explique dans "remarques".`;

// ============================================================================
//                         SCHEMA + PROMPT : FACTURE
// ============================================================================
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

const FACTURE_INSTRUCTIONS = `Tu lis une facture émise par un prestataire (fournisseur de matériel solaire, poseur, ou régie commerciale) pour une entreprise française de pose de panneaux solaires.

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

// ============================================================================
//                 MATCHING : RATTACHER UNE FACTURE À UN DOSSIER
// ============================================================================
//
// Une fois la facture extraite (fournisseur + n° + date + HT), on cherche
// dans la liste des dossiers CRM auquel elle se rattache, ET sur quelle ligne
// précise (poseur #N, régie #N, ou fournisseur #N).
//
// Approche :
//   1. Pré-filtrage local (sans IA, économique) : ne garde que les dossiers
//      dont au moins un prestataire (parmi poseurs/régies/fournisseurs) a un
//      nom qui ressemble au "fournisseur" extrait. On utilise une normalisation
//      simple (uppercase, retrait des accents/espaces, fuzzy match).
//   2. On ne garde QUE les prestataires sans facture (factureFile/Url vides),
//      car on cherche à rattacher une facture manquante.
//   3. Les ~30 meilleurs candidats sont envoyés à Claude avec la facture
//      extraite. Claude propose 1 à 3 matchs triés par confiance.
//
// Note : la pré-filtration côté serveur évite d'envoyer 700 dossiers à
// l'IA — on garde le coût bas et la précision haute.

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      description: "1 à 3 propositions de rattachement, triées par confiance décroissante. Vide si aucun candidat ne convient.",
      items: {
        type: 'object',
        properties: {
          localId: { type: 'string', description: "localId du dossier proposé (exactement comme dans la liste candidats)." },
          type: { type: 'string', enum: ['fournisseurs', 'regies', 'poseurs'], description: "Type de la liste où se trouve le prestataire." },
          index: { type: 'number', description: "Index dans la liste (0-based)." },
          confidence: { type: 'number', description: "Score de confiance entre 0 et 1 (1 = match certain)." },
          reasoning: { type: 'string', description: "Courte explication (1 phrase) : pourquoi ce match." },
        },
        required: ['localId', 'type', 'index', 'confidence', 'reasoning'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: "Note globale : pourquoi pas de match, ou ambiguïté, ou info utile pour le comptable. Vide si proposal[0] est franchement certaine." },
  },
  required: ['proposals', 'notes'],
  additionalProperties: false,
};

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Fuzzy match : un nom A "ressemble" à un nom B si :
//   - A normalisé contient B normalisé (ou inverse), OU
//   - leurs 4 premiers caractères significatifs sont identiques
function fuzzyMatchName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ka = na.replace(/\s/g, '').slice(0, 4);
  const kb = nb.replace(/\s/g, '').slice(0, 4);
  return ka.length >= 4 && ka === kb;
}

// Une ligne prestataire est "facture présente" si l'un de ces champs est rempli.
function hasFactureLine(p) {
  return !!(p?.factureFile || p?.facturePdfUrl || p?.factureExternalUrl);
}

// Construit la liste compacte des candidats à envoyer à Claude.
// Ne garde que les dossiers posés (statutPose === 'visite_ok') où au moins
// 1 prestataire correspondant au fournisseur extrait n'a pas encore de facture.
function buildCandidates(dossiers, extracted) {
  const target = extracted?.fournisseur || '';
  if (!target) return [];

  const out = [];
  for (const d of dossiers || []) {
    if (!d || d.statutPose !== 'visite_ok') continue;

    const matchingLines = [];
    const checkLine = (kind, arr) => {
      (arr || []).forEach((p, idx) => {
        if (!p || !p.nom) return;
        if (hasFactureLine(p)) return;
        if (!fuzzyMatchName(p.nom, target)) return;
        matchingLines.push({
          type: kind,
          index: idx,
          nom: p.nom,
          htCustom: Number(p.htCustom) || 0,
          factureNo: p.factureNo || '',
          bl: p.bl || '',
          paye: !!p.paye,
        });
      });
    };
    checkLine('fournisseurs', d.fournisseurs);
    checkLine('regies', d.regies);
    checkLine('poseurs', d.poseurs);

    if (matchingLines.length === 0) continue;

    out.push({
      localId: String(d.localId || ''),
      idChelly: String(d.id || ''),
      client: `${d.nom || ''} ${d.prenom || ''}`.trim(),
      ville: d.ville || '',
      societe: d.societe || '',
      dateInsta: d.dateInsta || '',
      montantTotal: Number(d.montantTotal) || 0,
      puissance: d.puissance || '',
      lines: matchingLines,
    });
  }

  // Tri : on met devant les dossiers dont la date de pose est la plus proche
  // de la date facture (les matchs temporels sont souvent les bons).
  const facDate = extracted?.dateFacture || '';
  if (facDate) {
    const fd = new Date(facDate).getTime();
    if (!isNaN(fd)) {
      out.sort((a, b) => {
        const da = a.dateInsta ? Math.abs(new Date(a.dateInsta).getTime() - fd) : Infinity;
        const db = b.dateInsta ? Math.abs(new Date(b.dateInsta).getTime() - fd) : Infinity;
        return da - db;
      });
    }
  }

  return out.slice(0, 30); // cap à 30 pour rester économique côté tokens IA
}

function buildMatchInstructions(extracted, candidates) {
  const facLine = [
    `Émetteur: ${extracted.fournisseur || '(non lu)'}`,
    `N° facture: ${extracted.factureNo || '(non lu)'}`,
    `Date: ${extracted.dateFacture || '(non lue)'}`,
    `HT: ${extracted.montantHt || 0}€`,
    `TTC: ${extracted.montantTtc || 0}€`,
    `BL: ${extracted.bl || '(non lu)'}`,
  ].join('\n');

  // Sérialise les candidats de façon compacte et lisible par l'IA.
  const candidatesJson = JSON.stringify(candidates, null, 2);

  return `Tu cherches à quel dossier client cette facture prestataire doit être rattachée dans un CRM.

FACTURE EXTRAITE :
${facLine}

DOSSIERS CANDIDATS (pré-filtrés sur le nom de l'émetteur) :
${candidatesJson}

RÈGLES DE MATCHING :
- Chaque candidat est un dossier + des lignes prestataires (poseurs/régies/fournisseurs) sans facture.
- Tu choisis la meilleure combinaison (localId, type, index) — pas juste le dossier, aussi la BONNE LIGNE.
- Critères forts par ordre de priorité :
  1. Nom du prestataire (lines[*].nom) qui correspond exactement à l'émetteur de la facture.
  2. Montant : si lines[*].htCustom est proche du montantHt facturé → fort indice.
  3. Date : dossier dont dateInsta est PROCHE (avant ou même peu après) de la date facture.
  4. Cohérence société (CRM societe vs ce que tu vois sur la facture si visible).
- Si plusieurs candidats sont quasi-équivalents, retourne-les tous (max 3), triés par confidence.
- Si AUCUN candidat ne convient (confidence < 0.4 partout), retourne proposals: [] et explique dans notes.
- Réponds UNIQUEMENT au format JSON demandé. Aucune autre sortie.`;
}

async function callClaudeMatch(client, extracted, candidates) {
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: MATCH_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildMatchInstructions(extracted, candidates) },
        ],
      },
    ],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text) return { proposals: [], notes: 'Réponse IA vide.' };
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return { proposals: [], notes: 'Réponse IA non parsable.' };
  }
}

// ============================================================================
//                             HANDLER
// ============================================================================
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
  const { type, imageBase64, mediaType, storagePath, availableSocietes, withMatch } = body;
  if (type !== 'bon' && type !== 'facture') {
    return json(res, 400, { error: "Paramètre 'type' manquant (attendu : 'bon' ou 'facture')." });
  }
  // withMatch n'est autorisé QUE pour les factures (cherche le dossier à
  // rattacher après extraction).
  const wantMatch = type === 'facture' && withMatch === true;
  if ((!imageBase64 && !storagePath) || !mediaType) {
    return json(res, 400, { error: 'Fichier manquant (imageBase64 ou storagePath requis).' });
  }
  const isImage = /^image\/(jpeg|png|webp|gif)$/.test(mediaType);
  const isPdf = mediaType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json(res, 400, { error: 'Format non supporté (JPEG, PNG, WebP, GIF ou PDF).' });
  }

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

  // Choisit schema + prompt + max_tokens selon le type
  let schema, instructions, maxTokens;
  if (type === 'bon') {
    const socList = Array.isArray(availableSocietes)
      ? availableSocietes
          .filter(s => s && typeof s.id === 'string' && typeof s.label === 'string' && s.id && s.label)
          .map(s => ({ id: s.id, label: s.label }))
          .slice(0, 10)
      : [];
    schema = buildBonSchema(socList);
    instructions = BON_INSTRUCTIONS + (socList.length > 0
      ? `\n\nSOCIÉTÉS DISPONIBLES : ${socList.map(s => `${s.id} (${s.label})`).join(', ')}. Identifie la société émettrice via le LOGO / raison sociale / SIRET / pied de page. Renvoie l'identifiant exact dans 'societe'.`
      : '');
    maxTokens = 4000;
  } else {
    schema = FACTURE_SCHEMA;
    instructions = FACTURE_INSTRUCTIONS;
    maxTokens = 2000;
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema },
      },
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: instructions },
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

    // 🎯 Mode matching : après extraction, on cherche à quel dossier rattacher
    // la facture. Si on échoue (lecture storage, IA, etc.) → on renvoie quand
    // même l'extraction (mieux que rien), avec matching: null pour signaler.
    if (wantMatch) {
      try {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: row, error: getErr } = await admin
          .from('storage')
          .select('value')
          .eq('key', 'dossiers-data')
          .maybeSingle();
        if (getErr) throw new Error(getErr.message);
        if (!row?.value) {
          return json(res, 200, { data: parsed, matching: { proposals: [], notes: 'Aucun dossier dans le CRM.' } });
        }
        const dossiers = JSON.parse(row.value);
        const candidates = buildCandidates(dossiers, parsed);
        if (candidates.length === 0) {
          return json(res, 200, {
            data: parsed,
            matching: {
              proposals: [],
              notes: `Aucun candidat avec un prestataire "${parsed.fournisseur || '?'}" sans facture parmi les dossiers posés.`,
              candidatesCount: 0,
            },
          });
        }
        const matching = await callClaudeMatch(client, parsed, candidates);
        return json(res, 200, {
          data: parsed,
          matching: { ...matching, candidatesCount: candidates.length },
        });
      } catch (mErr) {
        console.error('match-facture error:', mErr?.message, mErr?.stack);
        return json(res, 200, {
          data: parsed,
          matching: { proposals: [], notes: `Matching impossible : ${mErr?.message || 'erreur'}` },
        });
      }
    }

    return json(res, 200, { data: parsed });
  } catch (e) {
    const msg = e?.message || 'Erreur IA';
    if (e?.status === 401) return json(res, 502, { error: 'Clé API Anthropic invalide — vérifie ANTHROPIC_API_KEY dans Vercel.' });
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 400 && /credit|balance|insufficient/i.test(msg)) {
      return json(res, 502, { error: 'Crédits IA épuisés — recharge sur console.anthropic.com.' });
    }
    if (e?.status === 413) return json(res, 502, { error: 'Fichier trop lourd — réessaie avec une image plus petite ou un PDF compressé.' });
    console.error(`extract-pdf (${type}) error:`, msg, e?.stack);
    return json(res, 502, { error: "Échec de l'analyse IA. Réessaie dans un instant — si ça persiste, vérifie le format du PDF/image." });
  }
}
