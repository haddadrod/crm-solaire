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

// Limite Anthropic : 32 Mo par requête. En base64 ça représente ~24 Mo de PDF
// brut. On laisse une marge → 18 Mo brut max par chunk.
const MAX_CHUNK_BYTES = 18 * 1024 * 1024;

// Appel Claude pour un buffer PDF donné. Renvoie l'objet `parsed` (sections +
// bonCommande) ou throw en cas d'erreur (le caller gère le retry/chunk).
async function classifyPdfBuffer(client, pdfBuffer, extraContext = '') {
  const base64 = pdfBuffer.toString('base64');
  const fullInstructions = extraContext ? `${INSTRUCTIONS}\n\n${extraContext}` : INSTRUCTIONS;
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

  // 2) Appel à Claude — découpe en chunks si le PDF dépasse la limite Anthropic
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const sourceBytes = Buffer.from(pdfBase64, 'base64');
    let parsed;

    if (sourceBytes.length <= MAX_CHUNK_BYTES) {
      // PDF assez petit : un seul appel à Claude
      parsed = await classifyPdfBuffer(client, sourceBytes);
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
      let bonCommande = null;
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const ctx = `IMPORTANT : ce PDF est la portion ${i + 1}/${chunks.length} (pages ${c.pageOffset + 1} à ${c.pageOffset + c.pageCount}) d'un dossier plus grand. Les numéros pageStart/pageEnd que tu renvoies doivent être relatifs à ce sous-PDF (1 à ${c.pageCount}) — je les recalerai après.`;
        const chunkResult = await classifyPdfBuffer(client, c.bytes, ctx);
        const chunkSections = Array.isArray(chunkResult?.sections) ? chunkResult.sections : [];
        for (const s of chunkSections) {
          allSections.push({
            ...s,
            pageStart: (parseInt(s.pageStart, 10) || 1) + c.pageOffset,
            pageEnd: (parseInt(s.pageEnd, 10) || 1) + c.pageOffset,
          });
        }
        if (!bonCommande || !bonCommandeIsFilled(bonCommande)) {
          if (bonCommandeIsFilled(chunkResult?.bonCommande)) {
            bonCommande = chunkResult.bonCommande;
          }
        }
      }
      parsed = {
        totalPages,
        sections: allSections,
        bonCommande: bonCommande || {
          nom: '', prenom: '', adresse: '', codePostal: '', ville: '',
          telephone: '', email: '', produit: '', puissance: '',
          montantTTC: 0, montantHT: 0, financement: '', dateSignature: '',
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
    console.error('classify-dossier error:', msg);
    return json(res, 502, { error: `Erreur IA : ${msg}` });
  }
}
