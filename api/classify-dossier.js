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

// Schéma de sortie : un tableau de sections, plus les champs extraits du
// bon de commande si trouvé (pour pré-remplir le formulaire).
const CLASSIFY_SCHEMA = {
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
        },
        required: ['category', 'label', 'pageStart', 'pageEnd', 'confiance'],
        additionalProperties: false,
      },
    },
    // Champs extraits du bon de commande (s'il y en a un), pour pré-remplir le formulaire
    bonCommande: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom de famille du client' },
        prenom: { type: 'string', description: 'Prénom du client' },
        adresse: { type: 'string', description: 'Adresse (numéro et rue, sans code postal ni ville)' },
        codePostal: { type: 'string', description: 'Code postal' },
        ville: { type: 'string', description: 'Ville' },
        telephone: { type: 'string', description: 'Téléphone' },
        email: { type: 'string', description: 'Email si présent, sinon vide' },
        produit: { type: 'string', description: 'Ce qui a été vendu (ex: panneaux solaires)' },
        puissance: { type: 'string', description: 'Puissance en Wc si panneaux solaires, juste le nombre' },
        montantTTC: { type: 'number', description: 'Montant total TTC en euros' },
        montantHT: { type: 'number', description: 'Montant HT en euros' },
        financement: { type: 'string', description: 'Organisme bancaire/financier (PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE...). REGARDE le bloc "PAIEMENT AVEC FINANCEMENT" ou "ORGANISME BANCAIRE" sur le bon de commande. Si comptant, mets "COMPTANT".' },
        dateSignature: { type: 'string', description: 'Date de signature AAAA-MM-JJ' },
      },
      required: ['nom', 'prenom', 'adresse', 'codePostal', 'ville', 'telephone', 'email', 'produit', 'puissance', 'montantTTC', 'montantHT', 'financement', 'dateSignature'],
      additionalProperties: false,
    },
  },
  required: ['totalPages', 'sections', 'bonCommande'],
  additionalProperties: false,
};

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
4. Si tu trouves un bon de commande, extrais aussi ses champs principaux pour pré-remplir le formulaire :
   - Identité client : nom, prénom, adresse, code postal, ville, téléphone, email
   - Vente : produit, puissance (Wc), montantTTC, montantHT
   - **Financement : nom de l'organisme bancaire — IMPORTANT. Regarde le bloc "PAIEMENT AVEC FINANCEMENT" / "ORGANISME BANCAIRE" / "Établissement financier". Valeurs typiques : PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE. Si le client paie comptant (case "PAIEMENT COMPTANT" cochée), mets "COMPTANT".**
   - Date de signature (AAAA-MM-JJ)
5. confiance="haute" si le document est clairement identifiable, "moyenne" si tu hésites, "faible" si très incertain.

Règles :
- Les pages consécutives d'un même document forment UNE seule section.
- Deux documents du même type mais distincts (ex: 2 bulletins de paie différents) → 2 sections séparées.
- Ne saute aucune page : chaque page doit appartenir à exactement une section.
- Pour le bon de commande, si non trouvé, mets des chaînes vides / zéros.`;

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
  const { storagePath } = body;
  if (!storagePath) return json(res, 400, { error: 'storagePath requis.' });

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

  // 2) Appel à Claude avec le PDF en bloc "document"
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: CLASSIFY_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
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
    console.error('classify-dossier error:', msg);
    return json(res, 502, { error: `Erreur IA : ${msg}` });
  }
}
