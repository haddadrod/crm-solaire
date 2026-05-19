// Génération de PDF à partir de templates statiques (PDF non remplissables).
// On charge le template depuis /public/pdf-templates/, on dessine le texte aux
// coordonnées définies par template, et on renvoie un Blob à télécharger.
//
// pdf-lib est lourd (~200KB) — on l'import dynamiquement pour ne pas alourdir
// le bundle principal.

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

// Format français court : "12/05/2026" pour Date ou string ISO.
function frDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
}

// Schéma de champs pour la renonciation au droit de rétractation (Elsun).
// Coordonnées en points PDF (origin bottom-left, 1pt = 1/72 inch).
// Page A4 = 595 × 842 pts.
// Les valeurs ci-dessous sont une 1re estimation à ajuster visuellement.
const ELSUN_RENONCIATION_FIELDS = {
  // "Je soussigné Monsieur / Madame [____]"
  civilite: { x: 220, y: 520, fontSize: 11, page: 0 },
  // "du bon de commande N° [____]"
  numeroBC: { x: 410, y: 478, fontSize: 11, page: 0 },
  // "en date du [____]"
  dateBC: { x: 245, y: 446, fontSize: 11, page: 0 },
  // "Fait à : [____]"
  faitA: { x: 120, y: 375, fontSize: 11, page: 0 },
  // "Date : [____]"
  date: { x: 120, y: 350, fontSize: 11, page: 0 },
};

// Construit les valeurs à injecter pour la renonciation, depuis un dossier.
function renonciationValues(dossier) {
  const fullName = `${dossier.nom || ''} ${dossier.prenom || ''}`.trim();
  return {
    civilite: fullName,
    numeroBC: dossier.id || '',
    dateBC: frDate(dossier.dateSignature),
    faitA: dossier.ville || '',
    date: frDate(new Date()),
  };
}

// Fonction principale : charge le template + dessine les champs + renvoie un Blob.
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

// Génère la renonciation pour un dossier donné et la télécharge.
export async function generateRenonciationElsun(dossier) {
  const blob = await fillTemplate({
    societe: 'elsun',
    templateName: 'renonciation',
    fields: ELSUN_RENONCIATION_FIELDS,
    values: renonciationValues(dossier),
  });
  const safeName = `${dossier.nom || 'client'}_${dossier.prenom || ''}`.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  downloadBlob(blob, `renonciation_${safeName}.pdf`);
  return blob;
}

// Catalogue des templates disponibles par société. Sert au composant UI pour
// afficher la liste des PDF générables pour un dossier.
export const TEMPLATES_CATALOG = {
  elsun: [
    {
      id: 'renonciation',
      label: 'Renonciation au droit de rétractation',
      emoji: '✍️',
      generate: generateRenonciationElsun,
    },
  ],
  yolico: [
    // À compléter quand Rodney enverra les templates Yolico
  ],
};
