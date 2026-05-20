// Fonction serverless Vercel : analyse d'un dossier client multi-pages (PDF).
// Claude lit toutes les pages, identifie les types de documents qu'il y trouve
// et renvoie un mapping page → catégorie pour permettre le découpage côté
// client (avec pdf-lib).
//
// Variables d'environnement requises côté Vercel :
//   - ANTHROPIC_API_KEY     : clé API Anthropic
//   - SUPABASE_URL          : URL du projet Supabase (pour valider le JWT et lire le bucket)
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase
//
// Le front uploade d'abord le PDF dans le bucket dossier-documents et nous
// envoie juste le storagePath ; on télécharge le PDF côté serveur, on l'envoie
// à Claude, on renvoie la table des matières.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

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

// Catégories possibles — doit rester aligné avec CLIENT_DOC_SUBCATS côté front
const CATEGORIES = [
  'bon_commande',
  'mandat',
  'attestation',
  'rge',
  'financement',
  'piece_identite',
  'taxe_fonciere',
  'avis_imposition',
  'justif_domicile',
  'bulletin_paie',
  'rib',
  'autre',
];

// Construit dynamiquement le schéma avec la liste des sociétés disponibles.
// Si availableSocietes est vide, le champ 'societe' n'est pas demandé.
// IDs de produits que le CRM connaît (synchro avec PRODUITS_DEFAULT du front).
// L'IA renvoie ses détections avec ces IDs exacts pour que le front les mappe.
const PRODUIT_IDS = ['PANNEAU_SOLAIRE', 'PERGOLA', 'POMPE_A_CHALEUR', 'CLIMATISATION', 'BALLON_THERMO', 'BATTERIE', 'ISOLATION', 'VMC', 'AUTRE'];

function buildClassifySchema(availableSocietes = []) {
  const socIds = availableSocietes.map(s => s.id).filter(Boolean);
  const bcProps = {
    nom: { type: 'string', description: 'Nom de famille du client' },
    prenom: { type: 'string', description: 'Prénom du client' },
    adresse: { type: 'string', description: 'Adresse (numéro et rue, sans code postal ni ville)' },
    codePostal: { type: 'string', description: 'Code postal' },
    ville: { type: 'string', description: 'Ville' },
    telephone: { type: 'string', description: 'Téléphone' },
    email: { type: 'string', description: 'Email si présent, sinon vide' },
    // Liste des produits/équipements présents sur le bon de commande. Un dossier
    // peut avoir plusieurs produits (ex : panneaux solaires + pergola + ballon).
    produits: {
      type: 'array',
      description: "Liste de TOUS les produits/équipements présents sur le bon de commande. RÈGLE CRITIQUE : 'panneaux solaires installés sur une pergola' = DEUX produits SÉPARÉS (1 ligne PANNEAU_SOLAIRE avec sa puissance Wc + 1 ligne PERGOLA quantité 1 puissance=0), pas un seul produit fusionné. Une pergola seule sans solaire = 1 ligne PERGOLA. Des panneaux seuls sur toiture = 1 ligne PANNEAU_SOLAIRE.",
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: PRODUIT_IDS, description: `Type de produit parmi : ${PRODUIT_IDS.join(', ')}. PERGOLA = la structure (puissance TOUJOURS 0 même si solaire — la puissance va sur la ligne PANNEAU_SOLAIRE séparée).` },
          label: { type: 'string', description: "Libellé tel que présent sur le BC (ex : 'Pergola bioclimatique 4x3m')." },
          puissance: { type: 'number', description: "Puissance en Wc — UNIQUEMENT pour PANNEAU_SOLAIRE. Pour PERGOLA mettre TOUJOURS 0 (la puissance va sur la ligne PANNEAU_SOLAIRE séparée)." },
          quantite: { type: 'number', description: "Quantité (1 par défaut). 6 pour 6 climatisations." },
        },
        required: ['type', 'label', 'puissance', 'quantite'],
        additionalProperties: false,
      },
    },
    // ⚠️ Champs legacy : conserve produit (string) + puissance (string) pour la
    // compatibilité avec l'ancien front. Le front moderne utilise 'produits' (array).
    produit: { type: 'string', description: '[LEGACY] Produit principal en texte libre. Mets le 1er produit de la liste produits[].' },
    puissance: { type: 'string', description: '[LEGACY] Puissance en Wc du 1er produit solaire, juste le nombre. Sinon vide.' },
    montantTTC: { type: 'number', description: 'Montant total TTC en euros' },
    montantHT: { type: 'number', description: 'Montant HT en euros' },
    financement: { type: 'string', description: 'Organisme bancaire/financier (PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE...). REGARDE le bloc "PAIEMENT AVEC FINANCEMENT" ou "ORGANISME BANCAIRE" sur le bon de commande. Si comptant, mets "COMPTANT".' },
    dateSignature: { type: 'string', description: 'Date de signature AAAA-MM-JJ' },
    // 🏦 Détails du prêt (bloc "PAIEMENT AVEC FINANCEMENT" du BC). 0/vide si comptant.
    montantPret: { type: 'number', description: 'Montant du prêt en euros (champ "Montant du prêt"). 0 si comptant ou non renseigné.' },
    reportMois: { type: 'number', description: 'Report en mois (champ "Report : X mois"). 0 si non renseigné.' },
    tauxDebiteur: { type: 'number', description: 'Taux débiteur fixe en % (ex 6.39). 0 si non renseigné.' },
    taeg: { type: 'number', description: 'TAEG (Taux annuel effectif global) en % (ex 6.58). 0 si non renseigné.' },
    nbEcheances: { type: 'number', description: "Nombre d'échéances (ex 180). 0 si non renseigné." },
    montantEcheance: { type: 'number', description: "Montant d'une échéance en euros (ex 312). 0 si non renseigné." },
    periodicite: { type: 'string', enum: ['', 'Mensuelle', 'Bimestrielle', 'Trimestrielle', 'Semestrielle', 'Annuelle'], description: "Périodicité des échéances. Vide si non renseigné — souvent 'Mensuelle' par défaut sur les BC." },
    typeToiture: { type: 'string', enum: ['', 'tuile', 'ardoise', 'tole', 'zinc', 'fibro', 'bac_acier', 'pergola', 'autre'], description: "Type de toiture / support, UNIQUEMENT si coché ou écrit sur le BC. Sinon ''. Si la pergola est sur la liste produits[], laisser '' (l'info est déjà dans le produit PERGOLA)." },
    orientationPanneaux: { type: 'string', enum: ['', 'portrait', 'paysage', 'les_deux'], description: "Orientation des panneaux, UNIQUEMENT si coché sur le BC. Sinon ''." },
  };
  const required = ['nom', 'prenom', 'adresse', 'codePostal', 'ville', 'telephone', 'email', 'produits', 'produit', 'puissance', 'montantTTC', 'montantHT', 'financement', 'dateSignature', 'montantPret', 'reportMois', 'tauxDebiteur', 'taeg', 'nbEcheances', 'montantEcheance', 'periodicite', 'typeToiture', 'orientationPanneaux'];
  if (socIds.length > 0) {
    bcProps.societe = {
      type: 'string',
      enum: ['', ...socIds],
      description: `Identifiant de la société émettrice du bon de commande. Regarde le LOGO en haut, la RAISON SOCIALE, le SIRET, le PIED DE PAGE. Valeurs possibles : ${availableSocietes.map(s => `'${s.id}' (${s.label})`).join(', ')}. Si tu n'es pas sûr, mets ''.`,
    };
    required.push('societe');
  }
  return {
    type: 'object',
    properties: {
      totalPages: { type: 'integer', description: 'Nombre total de pages du PDF' },
      sections: {
        type: 'array',
        description: 'Découpage du PDF en sections homogènes (pages consécutives appartenant au même document)',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: CATEGORIES, description: 'Type du document' },
            label: { type: 'string', description: "Nom court humain (ex: 'Taxe foncière 2025', 'Titre de séjour Yabie')" },
            pageStart: { type: 'integer', description: 'Première page (1-indexée)' },
            pageEnd:   { type: 'integer', description: 'Dernière page (1-indexée, incluse)' },
            confiance: { type: 'string', enum: ['haute', 'moyenne', 'faible'], description: 'Niveau de certitude' },
            fraudRisk: { type: 'string', enum: ['low', 'medium', 'high'], description: "Niveau de suspicion de fraude sur ce document. 'low' = rien d'anormal. 'medium' = quelques détails douteux à vérifier. 'high' = forte suspicion de falsification. Voir les fraudFlags pour le détail." },
            fraudFlags: {
              type: 'array',
              items: { type: 'string' },
              description: "Liste des détails suspects relevés sur ce document, en français court (ex : 'Fonts différentes entre les colonnes salaire brut et net', 'SIRET semble inventé (ne respecte pas la clé Luhn)', 'Signature identique au bon de commande mais à la pixel près = copier-coller', 'Pas de QR code mon-bulletin-de-paie.fr alors que l'employeur est censé en mettre'). Vide si rien à signaler."
            },
          },
          required: ['category', 'label', 'pageStart', 'pageEnd', 'confiance', 'fraudRisk', 'fraudFlags'],
          additionalProperties: false,
        },
      },
      bonCommande: {
        type: 'object',
        properties: bcProps,
        required,
        additionalProperties: false,
      },
      incoherences: {
        type: 'array',
        items: { type: 'string' },
        description: "Liste des INCOHÉRENCES constatées en recoupant les documents du dossier entre eux : nom/prénom/adresse/code postal/ville qui diffèrent entre le bon de commande et la pièce d'identité ou le justificatif de domicile, dates de naissance contradictoires, etc. Chaque ligne en français court et précise, en indiquant la valeur retenue et sa source (ex : \"Bon de commande : nom 'BOZEAU' — Carte d'identité : 'BOILEAU'. Retenu : BOILEAU (pièce d'identité fait foi).\"). Tableau vide [] si tous les documents concordent.",
      },
    },
    required: ['totalPages', 'sections', 'bonCommande', 'incoherences'],
    additionalProperties: false,
  };
}

const INSTRUCTIONS = `Tu reçois un PDF qui contient un dossier client complet pour une vente de panneaux solaires en France.
Il peut contenir plusieurs documents distincts (mandat administratif, bon de commande, dossier financement Cofidis/Sofinco/etc., pièce d'identité du client et co-emprunteur, taxe foncière, avis d'imposition, justificatif de domicile, bulletins de paie, RIB, etc.).

Ta mission :
1. Identifie chaque document distinct et donne ses bornes de pages (pageStart et pageEnd, 1-indexées, incluses).
2. Classe chaque section dans une des catégories suivantes :
   - bon_commande    : bon de commande / contrat de vente (souvent en-tête du vendeur, n° BC, total HT/TTC, descriptif produit)
   - mandat          : mandat de représentation administrative
   - attestation     : attestation sur l'honneur du client
   - rge             : document RGE / QualiPV / QualiPAC / mentions d'aides
   - financement     : dossier de demande de financement bancaire (renseignements crédit + emprunteur + budget)
   - piece_identite  : CNI, titre de séjour, passeport, permis (recto et verso comptent ensemble si consécutifs)
   - taxe_fonciere   : avis de taxe foncière
   - avis_imposition : avis d'impôt sur le revenu
   - justif_domicile : facture d'énergie / attestation d'abonnement / quittance de loyer
   - bulletin_paie   : bulletin de salaire (un par employeur/mois, à séparer s'ils ne se suivent pas)
   - rib             : relevé d'identité bancaire
   - autre           : tout autre document

3. Donne un "label" court et humain pour chaque section (ex: "Taxe foncière 2025", "Titre de séjour Yabie Alexandre").
3bis. 🚨 ANALYSE ANTI-FRAUDE — pour CHAQUE section, tu évalues fraudRisk (low/medium/high) et listes les fraudFlags concrets.

🎯 OBJECTIF PRINCIPAL : détecter les MODIFICATIONS LOCALES de vrais documents (un bulletin de paie où on a juste retouché le montant net, un avis d'impôt où on a changé le revenu fiscal de référence, un justif de domicile où on a remplacé l'adresse, une signature copiée d'un doc vers un autre). On NE cherche PAS des faux complets (papier inventé) — ça arrive presque jamais.

Indices CONCRETS de modification locale à chercher :

- **bulletin_paie** (le plus modifié) :
  • Le MONTANT NET en bas et le MONTANT BRUT en haut ne suivent pas les ratios standards français (charges salariales ~22-25% du brut) → flag si écart > 5%
  • UN chiffre dans le tableau utilise une police différente du reste (signe qu'il a été retapé par-dessus)
  • Alignement vertical d'un nombre cassé par rapport aux autres lignes
  • Cumul annuel ≠ somme des bulletins précédents si on en voit plusieurs
  • Espacement irrégulier autour d'une valeur (signe d'effacement + retape)
  • Zone légèrement plus blanche/grise autour d'un montant (cache d'un effacement)
  • Logo employeur pixelisé alors que le reste est net (signe d'un copier-coller depuis un faux template)
  • Pas de QR mon-bulletin-de-paie.fr ALORS QUE l'employeur est gros (Carrefour, La Poste, etc.)

- **avis_imposition / taxe_fonciere** (souvent modifié sur le revenu/nb parts) :
  • Le revenu fiscal de référence a une police différente des autres montants
  • Le nombre de parts modifié (un "1" qui devient "2" — regarder les pixels)
  • Décalage vertical / horizontal sur UN chiffre par rapport aux autres
  • Référence d'avis avec espacement bizarre (insertion de caractères)
  • Logo DGFiP ou Marianne ABSENT ou pixelisé

- **justif_domicile** (modification de l'adresse pour cacher où ils habitent) :
  • L'ADRESSE imprimée a une police différente du reste de la facture (EDF, Veolia, Orange, SFR ont une typo cohérente partout)
  • Zone autour de l'adresse plus claire/foncée que le reste
  • Le NOM ne matche pas la facture (mais l'adresse oui) — signe qu'on a changé un nom
  • Date d'émission qui ne suit pas le format habituel du fournisseur
  • Logo du fournisseur pixelisé alors que le reste est net

- **bon_commande / mandat** (signature rajoutée par quelqu'un d'autre que le signataire) :
  • Signature en pixel-pour-pixel identique à celle d'un autre doc du dossier → copier-coller (ALERTE 🔴)
  • Signature ENTOURÉE d'un halo / contour blanc (signe d'un découpage Photoshop maladroit)
  • Signature de qualité pixel TRÈS différente du reste du doc (résolution, anti-aliasing) → ajoutée séparément
  • Encre/couleur de signature qui ne matche pas la stylo utilisé pour les autres champs manuscrits du doc
  • Position de signature pas alignée avec la ligne de signature imprimée

- **TOUS documents** (signaux génériques d'édition) :
  • Zone rectangulaire blanche/grise visible (cache d'un effacement)
  • Ombres absentes ou incohérentes sur certains éléments
  • Compression JPEG plus forte sur UN zone (signe de re-save après modif)
  • Couleur de fond légèrement différente sur une zone

Échelle :
- fraudRisk='low' : rien d'anormal, document standard et cohérent
- fraudRisk='medium' : 1 indice qui mérite vérif humaine (sans être flagrant)
- fraudRisk='high' : ≥2 indices concrets OU 1 indice très flagrant (signature pixel-identique entre 2 docs, font mismatch évident sur un montant)

⚠️ HONNÊTETÉ ABSOLUE :
- Si rien d'anormal → fraudRisk='low', fraudFlags=[]. NE PAS inventer des indices pour paraître utile.
- Un faux positif sur un client honnête est pire qu'un faux négatif (la confiance du commercial dans l'outil s'effrite).
- Cite TOUJOURS un détail précis (pas "ça a l'air bizarre"). Exemple bon : "Le montant 2450€ utilise une police Arial alors que les autres montants sont en Verdana." Exemple mauvais : "Le bulletin semble suspect."
4. Si tu trouves un bon de commande, extrais aussi ses champs principaux pour pré-remplir le formulaire :
   - Identité client : nom, prénom, adresse, code postal, ville, téléphone, email
   - Vente : produit, puissance (Wc), montantTTC, montantHT
   - **Financement : nom de l'organisme bancaire — IMPORTANT. Regarde le bloc "PAIEMENT AVEC FINANCEMENT" / "ORGANISME BANCAIRE" / "Établissement financier". Valeurs typiques : PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE. Si le client paie comptant (case "PAIEMENT COMPTANT" cochée), mets "COMPTANT".**
   - Date de signature (AAAA-MM-JJ)
4bis. 🔎 RECOUPEMENT ENTRE DOCUMENTS — TRÈS IMPORTANT.
Le bon de commande est souvent rempli À LA MAIN : il peut être mal écrit, mal orthographié ou erroné. Tu as TOUS les documents du dossier sous les yeux EN MÊME TEMPS — sers-t'en pour VÉRIFIER et CORRIGER les champs du bon de commande, ne te contente pas de recopier ce qui est écrit sur le BC.
- nom / prénom : la PIÈCE D'IDENTITÉ (CNI, titre de séjour, passeport) fait foi pour l'orthographe. Si le nom/prénom du bon de commande diffère de la pièce d'identité, mets dans bonCommande.nom / bonCommande.prenom l'ORTHOGRAPHE EXACTE DE LA PIÈCE D'IDENTITÉ (ex : le BC manuscrit dit "Bozeau" mais la CNI dit "BOILEAU" → tu mets "BOILEAU").
- ⚠️ CAS PLUSIEURS PIÈCES D'IDENTITÉ (couple, co-emprunteur, conjoint) : le bon de commande ne concerne qu'UN seul titulaire. Tu dois d'abord identifier LAQUELLE des pièces d'identité correspond à la personne du BC — celle dont le nom RESSEMBLE le plus à ce qui est écrit sur le BC — et n'utiliser QUE celle-là pour corriger nom/prénom. NE REMPLACE JAMAIS le nom du BC par celui du conjoint ou du co-emprunteur. Avoir 2 pièces d'identité (Monsieur ET Madame) alors que le BC ne porte qu'un seul nom n'est PAS une incohérence — c'est normal. Si le nom du BC ne ressemble à AUCUNE pièce d'identité, NE DEVINE PAS : garde ce qui est écrit sur le BC et signale-le dans "incoherences".
- adresse / code postal / ville : recoupe avec le justificatif de domicile, la taxe foncière et la pièce d'identité. En cas de divergence, privilégie le justificatif de domicile le plus récent.
- Pour CHAQUE écart réel constaté entre deux documents, ajoute une ligne claire et précise dans le tableau "incoherences" (valeur de chaque doc + valeur retenue + source). Si tout concorde parfaitement, "incoherences" = [].
- Ne signale PAS une simple différence de casse (majuscules/minuscules) ou d'accents comme une incohérence — seulement les vraies divergences d'orthographe, de chiffres ou d'adresse.

5. confiance="haute" si le document est clairement identifiable, "moyenne" si tu hésites, "faible" si très incertain.

Règles :
- Les pages consécutives d'un même document forment UNE seule section.
- Deux documents du même type mais distincts (ex: 2 bulletins de paie différents) → 2 sections séparées.
- Ne saute aucune page : chaque page doit appartenir à exactement une section.
- Pour le bon de commande, si non trouvé, mets des chaînes vides / zéros.`;

// Limite Anthropic : 32 Mo par requête. En base64 ça représente ~24 Mo de PDF
// brut. On laisse une marge → 18 Mo brut max par chunk.
const MAX_CHUNK_BYTES = 18 * 1024 * 1024;

// Appel Claude pour un buffer PDF donné. Renvoie l'objet `parsed` (sections +
// bonCommande) ou throw en cas d'erreur (le caller gère le retry/chunk).
async function classifyPdfBuffer(client, pdfBuffer, extraContext = '', availableSocietes = []) {
  const base64 = pdfBuffer.toString('base64');
  // Ajoute les indices pour identifier la société du BC (logo, nom, SIRET).
  const societeContext = availableSocietes.length > 0
    ? `\n\nSOCIÉTÉS DISPONIBLES : ${availableSocietes.map(s => `${s.id} (${s.label})`).join(', ')}.\nPour le bon de commande, identifie la société émettrice en regardant le LOGO en haut, la raison sociale, le SIRET, et le pied de page. Renvoie l'identifiant exact dans 'societe'. Si tu n'es pas sûr, mets une chaîne vide.`
    : '';
  const fullInstructions = [INSTRUCTIONS, extraContext, societeContext].filter(Boolean).join('\n\n');
  const schema = buildClassifySchema(availableSocietes);
  // Configuration éprouvée : appel bloquant simple, max_tokens 8000.
  // (8000 reste sous le seuil qui force le streaming côté SDK Anthropic.)
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: fullInstructions },
        ],
      },
    ],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text) throw new Error('Réponse IA vide.');
  return JSON.parse(textBlock.text);
}

// Vérifie si un objet bonCommande contient au moins un champ rempli.
function bonCommandeIsFilled(bc) {
  if (!bc) return false;
  return Object.values(bc).some((v) => {
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return v > 0;
    return false;
  });
}

// Découpe un PDF source en chunks de pages dont la taille reste sous la limite
// Anthropic. Renvoie [{ bytes, pageOffset, pageCount }, ...].
async function chunkPdfBySize(sourceDoc, totalSize, totalPages) {
  // Estime combien de pages par chunk pour rester sous MAX_CHUNK_BYTES
  const estimatedPerPage = totalSize / totalPages;
  const pagesPerChunk = Math.max(1, Math.floor(MAX_CHUNK_BYTES / estimatedPerPage));
  const chunks = [];
  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const chunkDoc = await PDFDocument.create();
    const indices = [];
    for (let p = start; p < end; p++) indices.push(p);
    const copied = await chunkDoc.copyPages(sourceDoc, indices);
    copied.forEach((page) => chunkDoc.addPage(page));
    const bytes = Buffer.from(await chunkDoc.save());
    chunks.push({ bytes, pageOffset: start, pageCount: end - start });
  }
  return chunks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return json(res, 503, { error: "Crédits IA non configurés : ajoute la variable ANTHROPIC_API_KEY dans Vercel." });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const { storagePath, availableSocietes } = body;
  if (!storagePath) return json(res, 400, { error: 'storagePath requis.' });
  // Filtre + sanitize les sociétés reçues (max 10 pour éviter abus / coût)
  const socList = Array.isArray(availableSocietes)
    ? availableSocietes
        .filter(s => s && typeof s.id === 'string' && typeof s.label === 'string' && s.id && s.label)
        .map(s => ({ id: s.id, label: s.label }))
        .slice(0, 10)
    : [];

  // 1) Télécharge le PDF depuis le bucket avec la clé service_role
  let pdfBase64;
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
    pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
  } catch (e) {
    return json(res, 502, { error: `Téléchargement bucket échoué : ${e.message}` });
  }

  // 2) Analyse métadonnées PDF avant l'IA — détecte les fichiers édités
  //    après création (Photoshop, Acrobat, etc.) qui sont souvent des fraudes.
  //    On utilise pdf-lib pour lire les métadonnées (producer, dates, version).
  let pdfMeta = null;
  try {
    const sourceBytes = Buffer.from(pdfBase64, 'base64');
    const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const created = sourceDoc.getCreationDate();
    const modified = sourceDoc.getModificationDate();
    const producer = sourceDoc.getProducer() || '';
    const creator = sourceDoc.getCreator() || '';
    const title = sourceDoc.getTitle() || '';
    const author = sourceDoc.getAuthor() || '';
    const flags = [];

    // Whitelist d'éditeurs légitimes connus en France (pas exhaustif).
    // Si le producteur est dans cette liste → on baisse l'alerte sur les
    // logiciels d'édition (par exemple PayFit peut produire via une lib qui
    // ressemble à du Word — c'est OK).
    const LEGIT_PRODUCERS = /silae|payfit|sage paie|cegid|adp|primobox|nibelis|kelio|talentsoft|adp gsi|dgfip|impots\.gouv|république française|finances publiques|edf|engie|veolia|suez|orange|sfr|bouygues|free|la poste|caf|cnam|cpam|urssaf|pôle emploi|france travail|carsat|ircantec|agirc-arrco/i;
    const isLegit = LEGIT_PRODUCERS.test(producer) || LEGIT_PRODUCERS.test(creator) || LEGIT_PRODUCERS.test(author);

    // Signal #1 : date de modification très postérieure à la création (> 1 jour)
    if (created && modified) {
      const deltaMs = modified.getTime() - created.getTime();
      if (deltaMs > 24 * 60 * 60 * 1000) {
        flags.push(`PDF modifié ${Math.round(deltaMs / (24 * 60 * 60 * 1000))} jour(s) après sa création (signe possible d'édition tardive)`);
      }
    }
    // Signal #2 : producteur connu pour l'édition d'images / docs
    // Mais : on ne flag PAS si l'éditeur est dans la whitelist (faux positif)
    const editTools = /photoshop|illustrator|acrobat pro|gimp|inkscape|paint\.net|pixelmator|affinity|canva|sumatra|foxit phantompdf|nitro|smallpdf|ilovepdf|pdfescape/i;
    if ((editTools.test(producer) || editTools.test(creator)) && !isLegit) {
      flags.push(`Logiciel d'édition détecté : ${creator || producer}. Un vrai bulletin/avis officiel n'est jamais re-sauvé via ces outils.`);
    }
    // Signal #3 : Word / LibreOffice → suspect pour des documents officiels
    // (bulletins, avis, justifs proviennent toujours de logiciels métier)
    const officeTools = /microsoft word|libreoffice|openoffice|google docs|pages|wps office/i;
    if ((officeTools.test(producer) || officeTools.test(creator)) && !isLegit) {
      flags.push(`PDF produit via Word/LibreOffice : ${creator || producer}. Suspect pour un document officiel (bulletin de paie, avis d'impôt, facture utilitaire).`);
    }

    pdfMeta = {
      created: created?.toISOString() || null,
      modified: modified?.toISOString() || null,
      producer, creator, title, author,
      isLegitProducer: isLegit,
      flags,
    };
  } catch (e) {
    // Si pdf-lib n'arrive pas à lire les métadonnées (PDF corrompu / chiffré),
    // on n'échoue pas l'analyse globale, on note juste qu'il n'y a pas de méta.
    pdfMeta = { error: e.message };
  }

  // 3) Appel à Claude — découpe en chunks si le PDF dépasse la limite Anthropic
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const sourceBytes = Buffer.from(pdfBase64, 'base64');
    let parsed;

    if (sourceBytes.length <= MAX_CHUNK_BYTES) {
      // PDF assez petit : un seul appel à Claude
      parsed = await classifyPdfBuffer(client, sourceBytes, '', socList);
    } else {
      // PDF trop gros : on le scinde en plusieurs PDF de < 18 Mo, on classifie
      // chacun séparément, puis on fusionne les sections (en décalant les
      // numéros de page) et on garde le 1er bonCommande rempli trouvé.
      const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
      const totalPages = sourceDoc.getPageCount();
      const chunks = await chunkPdfBySize(sourceDoc, sourceBytes.length, totalPages);
      // Vérifie qu'aucun chunk n'est encore trop gros (page unique très lourde)
      const tooBig = chunks.find((c) => c.bytes.length > MAX_CHUNK_BYTES);
      if (tooBig) {
        const mb = (tooBig.bytes.length / 1024 / 1024).toFixed(1);
        return json(res, 502, {
          error: `Pages ${tooBig.pageOffset + 1}-${tooBig.pageOffset + tooBig.pageCount} font ${mb} Mo — trop lourdes même découpées. Rescanne en qualité plus basse.`,
        });
      }
      const allSections = [];
      const allIncoherences = [];
      let bonCommande = null;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const ctx = `IMPORTANT : ce PDF est la portion ${i + 1}/${chunks.length} (pages ${c.pageOffset + 1} à ${c.pageOffset + c.pageCount}) d'un dossier plus grand. Les numéros pageStart/pageEnd que tu renvoies doivent être relatifs à ce sous-PDF (1 à ${c.pageCount}) — je les recalerai après.`;
        const chunkResult = await classifyPdfBuffer(client, c.bytes, ctx, socList);
        const chunkSections = Array.isArray(chunkResult?.sections) ? chunkResult.sections : [];
        for (const s of chunkSections) {
          allSections.push({
            ...s,
            pageStart: (parseInt(s.pageStart, 10) || 1) + c.pageOffset,
            pageEnd: (parseInt(s.pageEnd, 10) || 1) + c.pageOffset,
          });
        }
        if (Array.isArray(chunkResult?.incoherences)) allIncoherences.push(...chunkResult.incoherences);
        if (!bonCommande || !bonCommandeIsFilled(bonCommande)) {
          if (bonCommandeIsFilled(chunkResult?.bonCommande)) {
            bonCommande = chunkResult.bonCommande;
          }
        }
      }
      parsed = {
        totalPages,
        incoherences: allIncoherences,
        sections: allSections,
        bonCommande: bonCommande || {
          nom: '', prenom: '', adresse: '', codePostal: '', ville: '',
          telephone: '', email: '', produit: '', puissance: '',
          montantTTC: 0, montantHT: 0, financement: '', dateSignature: '',
          montantPret: 0, reportMois: 0, tauxDebiteur: 0, taeg: 0,
          nbEcheances: 0, montantEcheance: 0, periodicite: '',
          typeToiture: '', orientationPanneaux: '',
        },
      };
    }

    // 3) Découpage server-side : pour chaque section, on extrait les pages avec
    //    pdf-lib et on uploade le sous-PDF dans le bucket. Chaque section a son
    //    propre storagePath → ouverture standalone côté front.
    //    Si le découpage échoue pour une section, on continue sans storagePath
    //    (le front retombera sur le PDF complet avec bookmark de page).
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    if (sections.length > 0) {
      try {
        const sourceBytes = Buffer.from(pdfBase64, 'base64');
        const sourceDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
        const totalPages = sourceDoc.getPageCount();
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        // Nom de base pour les chemins des sous-PDF : on retire l'extension du
        // storagePath original et on suffixe _s<i>.pdf.
        const basePath = storagePath.replace(/\.[a-z0-9]+$/i, '');
        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];
          try {
            const pStart = Math.max(1, Math.min(totalPages, parseInt(sec.pageStart, 10) || 1));
            const pEnd = Math.max(pStart, Math.min(totalPages, parseInt(sec.pageEnd, 10) || pStart));
            const indices = [];
            for (let p = pStart - 1; p <= pEnd - 1; p++) indices.push(p);
            const subDoc = await PDFDocument.create();
            const copied = await subDoc.copyPages(sourceDoc, indices);
            copied.forEach((page) => subDoc.addPage(page));
            const subBytes = await subDoc.save();
            const subPath = `${basePath}_s${i}.pdf`;
            const { error: upErr } = await admin.storage
              .from('dossier-documents')
              .upload(subPath, Buffer.from(subBytes), {
                contentType: 'application/pdf',
                upsert: true,
              });
            if (!upErr) {
              sec.storagePath = subPath;
            } else {
              console.warn(`split section ${i} upload failed:`, upErr.message);
            }
          } catch (secErr) {
            console.warn(`split section ${i} failed:`, secErr.message);
          }
        }
        // Si toutes les sections ont été découpées, on supprime le PDF original
        // (sinon il reste orphelin dans le bucket — le front n'a plus de
        // référence vers lui).
        const allSplit = sections.every((s) => !!s.storagePath);
        if (allSplit) {
          try {
            await admin.storage.from('dossier-documents').remove([storagePath]);
          } catch (rmErr) {
            console.warn('cleanup original PDF failed:', rmErr.message);
          }
        }
      } catch (splitErr) {
        // Échec global du chargement pdf-lib : on renvoie sans storagePath par
        // section, le front utilisera les bookmarks sur le PDF complet.
        console.warn('PDF split skipped:', splitErr.message);
      }
    }

    // Ajoute les métadonnées PDF (lues côté serveur) au payload retourné.
    // Le front les affichera comme un signal anti-fraude global du dossier.
    if (pdfMeta) parsed.pdfMeta = pdfMeta;
    return json(res, 200, { data: parsed });
  } catch (e) {
    const msg = e?.message || 'Erreur IA';
    if (e?.status === 401) return json(res, 502, { error: 'Clé API Anthropic invalide.' });
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 413 || /request_too_large|exceeds the maximum size/i.test(msg)) {
      const pdfMb = pdfBase64 ? (Buffer.from(pdfBase64, 'base64').length / 1024 / 1024).toFixed(1) : '?';
      return json(res, 502, {
        error: `PDF trop volumineux pour l'IA (${pdfMb} Mo — limite 32 Mo). Rescanne-le en qualité plus basse (CamScanner : choisir "Compresser" ou "Email") ou divise-le en plusieurs PDF.`,
      });
    }
    if (e?.status === 400 && /credit|balance|insufficient/i.test(msg)) {
      return json(res, 502, { error: 'Crédits IA épuisés — recharge sur console.anthropic.com.' });
    }
    // Service IA momentanément indisponible / surchargé.
    if (e?.status === 529 || e?.status === 503 || e?.status === 500 || /overloaded/i.test(msg)) {
      return json(res, 502, { error: 'Service IA momentanément surchargé. Réessaie dans 1 à 2 minutes.' });
    }
    // Réponse IA mal formée (JSON tronqué / non parsable).
    if (e instanceof SyntaxError || /JSON|Unexpected token|Réponse IA vide/i.test(msg)) {
      return json(res, 502, { error: "L'IA a renvoyé une réponse incomplète (PDF probablement trop long). Réessaie, ou découpe le PDF en deux." });
    }
    // Log complet côté serveur. Côté client : on donne la VRAIE cause de façon
    // diagnostiquable (statut HTTP + message Anthropic abrégé) — ce ne sont pas
    // des secrets, et sans ça l'admin ne peut rien dépanner.
    console.error('classify-dossier error:', e?.status, msg, e?.stack);
    const reason = `${e?.status ? `HTTP ${e.status} — ` : ''}${String(msg).slice(0, 200)}`;
    return json(res, 502, { error: `Échec de l'analyse IA : ${reason}` });
  }
}
