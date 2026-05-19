// Génération de PDF en mode "overlay" : on charge le template officiel
// (logo, mise en page, mentions légales préservés) et on dessine le texte
// aux coordonnées extraites directement depuis le PDF source.
// Coords mesurées via pdfjs-dist en dev (scripts à usage unique, non commités).
//
// pdf-lib est lourd (~200KB) — dynamic import pour ne pas alourdir le bundle.

// Format français court : "12/05/2026" pour Date ou string ISO.
function frDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
}

// Charge le PDF template depuis le dossier public.
async function loadTemplateBytes(societe, name) {
  const url = `/pdf-templates/${societe}/${name}.pdf`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Template introuvable : ${url} (HTTP ${r.status})`);
  return r.arrayBuffer();
}

// Déclenche le téléchargement d'un Blob côté navigateur.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Construit un nom de fichier sûr depuis nom + prénom du client.
function safeFilename(dossier, prefix) {
  const safe = `${dossier.nom || 'client'}_${dossier.prenom || ''}`
    .replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
  return `${prefix}_${safe}.pdf`;
}

// Charge le template + dessine les champs + renvoie un Blob.
async function fillTemplate({ societe, templateName, fields, values, defaultFontSize = 11 }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const bytes = await loadTemplateBytes(societe, templateName);
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const [key, value] of Object.entries(values)) {
    const spec = fields[key];
    if (!spec || !value) continue;
    const page = pages[spec.page ?? 0];
    if (!page) continue;
    page.drawText(String(value), {
      x: spec.x,
      y: spec.y,
      size: spec.fontSize || defaultFontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const out = await pdf.save();
  return new Blob([out], { type: 'application/pdf' });
}

// ════════════════════════════════════════════════════════════════════════
// RENONCIATION AU DROIT DE RÉTRACTATION
// ════════════════════════════════════════════════════════════════════════

// Coords identiques entre Elsun et Yolico SAUF "en date du" qui est plus
// près du bord gauche pour Yolico (raison sociale plus courte que ELS SOL).
const ELSUN_RENONCIATION_FIELDS = {
  civilite:  { x: 195, y: 459.8 }, // après "Je soussigné Monsieur / Madame"
  numeroBC:  { x: 19,  y: 415   }, // sous "...du bon de commande N°" (espace trop court après N°)
  dateBC:    { x: 315, y: 402   }, // après "SARL ELS SOL - ELSOL en date du"
  faitA:     { x: 63,  y: 337.9 },
  dateToday: { x: 58,  y: 312.6 },
};

const YOLICO_RENONCIATION_FIELDS = {
  civilite:  { x: 195, y: 459.7 },
  numeroBC:  { x: 19,  y: 415   },
  dateBC:    { x: 265, y: 400.7 }, // après "SAS YOLICO en date du" — plus à gauche
  faitA:     { x: 63,  y: 337.8 },
  dateToday: { x: 58,  y: 312.4 },
};

function renonciationValues(dossier) {
  return {
    civilite: `${dossier.nom || ''} ${dossier.prenom || ''}`.trim(),
    numeroBC: dossier.id || '',
    dateBC: frDate(dossier.dateSignature),
    faitA: dossier.ville || '',
    dateToday: frDate(new Date()),
  };
}

export async function generateRenonciation(dossier) {
  const societe = dossier.societe === 'yolico' ? 'yolico' : 'elsun';
  const fields = societe === 'yolico' ? YOLICO_RENONCIATION_FIELDS : ELSUN_RENONCIATION_FIELDS;
  const blob = await fillTemplate({
    societe,
    templateName: 'renonciation',
    fields,
    values: renonciationValues(dossier),
  });
  downloadBlob(blob, safeFilename(dossier, 'renonciation'));
  return blob;
}

// ════════════════════════════════════════════════════════════════════════
// FICHE DE RENSEIGNEMENT (Eco Energy, partagé entre Elsun et Yolico)
// ════════════════════════════════════════════════════════════════════════

// Page A4 (595 × 842), origin bottom-left.
// Les underscores des champs commencent après les labels :
//   "Nom et Prénom : Mr et/ou Mme : ___..."  → début ~x=255
//   "Adresse : ___..."                       → début ~x=130
//   "Code postal : ___...Ville : ___..."     → CP ~x=162, Ville ~x=420
//   "Téléphones : Fixe : ___ Portable : ___" → Fixe ~x=155, Portable ~x=370
//   "Adresse email : ___@___"                → user ~x=155
const FICHE_RENSEIGNEMENT_FIELDS = {
  nomPrenom:  { x: 255, y: 681 },
  adresse:    { x: 130, y: 667 },
  codePostal: { x: 162, y: 654 },
  ville:      { x: 410, y: 654 },
  telephone:  { x: 370, y: 640 }, // portable (champ unique côté CRM)
  email:      { x: 155, y: 626 },
};

function ficheRenseignementValues(dossier) {
  const fullName = `${dossier.nom || ''} ${dossier.prenom || ''}`.trim();
  return {
    nomPrenom: fullName,
    adresse: dossier.adresse || '',
    codePostal: dossier.codePostal || '',
    ville: dossier.ville || '',
    telephone: dossier.telephone || '',
    email: dossier.email || '',
  };
}

export async function generateFicheRenseignement(dossier) {
  const societe = dossier.societe === 'yolico' ? 'yolico' : 'elsun';
  const blob = await fillTemplate({
    societe,
    templateName: 'fiche-renseignement',
    fields: FICHE_RENSEIGNEMENT_FIELDS,
    values: ficheRenseignementValues(dossier),
  });
  downloadBlob(blob, safeFilename(dossier, 'fiche-renseignement'));
  return blob;
}

// ════════════════════════════════════════════════════════════════════════
// PV DE RÉCEPTION (Qualit'EnR, standard partagé)
// ════════════════════════════════════════════════════════════════════════

// La page contient "Je soussigné [client] maître de l'ouvrage" en haut,
// puis "Fait à : ___ le ___" tout en bas. Le bloc "entreprise" sur la
// ligne suivante a un encodage de police custom que pdfjs ne décode pas
// proprement → je skip ce champ pour l'instant (l'user pourra écrire à
// la main, ou on l'ajoutera après inspection visuelle).
const PV_RECEPTION_FIELDS = {
  clientName: { x: 180, y: 706.1 }, // après "Je soussigné"
  faitA:      { x: 125, y: 292.4 }, // après "Fait à : ..."
  dateToday:  { x: 245, y: 292.4 }, // après "le ..."
};

function pvReceptionValues(dossier) {
  return {
    clientName: `${dossier.nom || ''} ${dossier.prenom || ''}`.trim(),
    faitA: dossier.ville || '',
    dateToday: frDate(new Date()),
  };
}

export async function generatePvReception(dossier) {
  const societe = dossier.societe === 'yolico' ? 'yolico' : 'elsun';
  const blob = await fillTemplate({
    societe,
    templateName: 'pv-reception',
    fields: PV_RECEPTION_FIELDS,
    values: pvReceptionValues(dossier),
  });
  downloadBlob(blob, safeFilename(dossier, 'pv-reception'));
  return blob;
}

// ════════════════════════════════════════════════════════════════════════
// CATALOGUE par société
// ════════════════════════════════════════════════════════════════════════

const SHARED_TEMPLATES = [
  { id: 'renonciation', label: 'Renonciation au droit de rétractation', emoji: '✍️', generate: generateRenonciation },
  { id: 'fiche-renseignement', label: 'Fiche de renseignement (TVA)', emoji: '📋', generate: generateFicheRenseignement },
  { id: 'pv-reception', label: 'PV de réception des travaux', emoji: '✅', generate: generatePvReception },
];

export const TEMPLATES_CATALOG = {
  elsun: SHARED_TEMPLATES,
  yolico: SHARED_TEMPLATES,
};
