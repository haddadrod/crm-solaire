// Génération de PDF en mode "overlay" : on charge le template officiel
// (logo, mise en page, mentions légales préservés) et on dessine le texte
// aux coordonnées extraites directement depuis le PDF source (pdfjs-dist
// utilisé en dev, cf. extract_positions.mjs — coords baked-in ici).
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

// Coordonnées extraites du template renonciation Elsun via pdfjs-dist.
// Page = 595.56 × 842.04 (A4). Origin = bottom-left (convention pdf-lib).
// Chaque champ : { x, y, fontSize, page = 0 }.
// Pour chaque label trouvé dans le PDF, le champ associé est positionné
// juste après (x = fin du label + petit gap, y = même baseline).
const ELSUN_RENONCIATION_FIELDS = {
  civilite:  { x: 195, y: 459.8, fontSize: 11 }, // après "Je soussigné Monsieur / Madame"
  numeroBC:  { x: 19,  y: 415,   fontSize: 11 }, // sous "...du bon de commande N°" (ligne suivante, l'espace après N° est trop court)
  dateBC:    { x: 315, y: 402,   fontSize: 11 }, // après "...en date du"
  faitA:     { x: 63,  y: 337.9, fontSize: 11 }, // après "Fait à :"
  dateToday: { x: 58,  y: 312.6, fontSize: 11 }, // après "Date :"
};

// Construit les valeurs à injecter pour la renonciation, depuis un dossier.
function renonciationValues(dossier) {
  const fullName = `${dossier.nom || ''} ${dossier.prenom || ''}`.trim();
  return {
    civilite: fullName,
    numeroBC: dossier.id || '',
    dateBC: frDate(dossier.dateSignature),
    faitA: dossier.ville || '',
    dateToday: frDate(new Date()),
  };
}

// Charge le template + dessine les champs + renvoie un Blob.
async function fillTemplate({ societe, templateName, fields, values }) {
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
      size: spec.fontSize || 11,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const out = await pdf.save();
  return new Blob([out], { type: 'application/pdf' });
}

// Génère la renonciation Elsun et déclenche le téléchargement.
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
    // À compléter avec les templates Yolico (j'ai vu le dossier "dossier complet yolico")
  ],
};
