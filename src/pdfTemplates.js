// Génération de PDF "from scratch" avec pdf-lib. On ne charge plus de template
// existant ; on compose chaque document programmatiquement (texte, lignes,
// signatures). Avantage : rendu déterministe, pas de coordonnées à deviner,
// et facile à étendre avec de nouvelles sociétés (Yolico, Elsun…).

// pdf-lib est lourd (~200 KB) — dynamic import pour ne pas alourdir le bundle.

// Configuration des sociétés (en dur pour l'instant — à terme on lira depuis Réglages).
const SOCIETES = {
  elsun: {
    name: 'SARL ELS SOL-ELSOL',
    address: '1950, av du Marechal Juin - 30900 Nimes',
    phone: '09 86 87 71 62',
    email: 'contact@els-energies.fr',
    siret: '525 152 104 00028',
    siren: '525 152 104',
    rcs: 'NÎMES 525 152 104',
    capital: '40 000 €',
    tvaNumber: 'FR75525152104',
    decennale: 'SV75018041T11388',
    legalSuffix: 'SARL unipersonnelle au capital de 40 000 €',
  },
  yolico: {
    // À compléter quand Rodney aura confirmé les infos légales Yolico
    name: 'YOLICO',
    address: '',
    phone: '',
    email: '',
    siret: '',
    siren: '',
    rcs: '',
    capital: '',
    tvaNumber: '',
    decennale: '',
    legalSuffix: '',
  },
};

// Format français court : "12/05/2026" pour Date ou string ISO.
function frDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
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

// Helper : dessine du texte avec retour à la ligne automatique si trop long.
// Retourne la coordonnée Y après le dernier mot écrit.
function drawWrappedText(page, text, opts) {
  const { x, y, maxWidth, font, fontSize, lineHeight = fontSize * 1.4, color } = opts;
  if (!text) return y;
  const words = String(text).split(' ');
  let line = '';
  let currentY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font, color });
      line = word;
      currentY -= lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size: fontSize, font, color });
  }
  return currentY - lineHeight;
}

// Génère le PDF "Renonciation au droit de rétractation" from scratch.
export async function generateRenonciationElsun(dossier) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const soc = SOCIETES.elsun;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const marginLeft = 60;
  const marginRight = 60;
  const usableWidth = 595.28 - marginLeft - marginRight;

  // ─── EN-TÊTE SOCIÉTÉ ─────────────────────────────────────────────────────
  let y = 800;
  page.drawText(soc.name, { x: marginLeft, y, size: 14, font: fontBold, color: black });
  y -= 16;
  page.drawText(soc.address, { x: marginLeft, y, size: 9, font: fontRegular, color: gray });
  y -= 11;
  page.drawText(`Tél : ${soc.phone} — Email : ${soc.email}`, { x: marginLeft, y, size: 9, font: fontRegular, color: gray });
  y -= 11;
  page.drawText(`SIRET : ${soc.siret} — RCS : ${soc.rcs}`, { x: marginLeft, y, size: 9, font: fontRegular, color: gray });
  y -= 11;
  page.drawText(`N° TVA : ${soc.tvaNumber} — Assurance décennale : ${soc.decennale}`, { x: marginLeft, y, size: 9, font: fontRegular, color: gray });
  y -= 25;

  // Ligne séparatrice
  page.drawLine({ start: { x: marginLeft, y }, end: { x: 595.28 - marginRight, y }, thickness: 0.5, color: gray });
  y -= 35;

  // ─── TITRE ───────────────────────────────────────────────────────────────
  const title1 = 'FORMULAIRE DE RENONCIATION';
  const title2 = 'AU DROIT DE RÉTRACTATION';
  const title3 = '(article L 221-25° du code de la consommation)';
  const t1w = fontBold.widthOfTextAtSize(title1, 14);
  const t2w = fontBold.widthOfTextAtSize(title2, 14);
  const t3w = fontRegular.widthOfTextAtSize(title3, 10);
  page.drawText(title1, { x: (595.28 - t1w) / 2, y, size: 14, font: fontBold, color: black });
  y -= 16;
  page.drawText(title2, { x: (595.28 - t2w) / 2, y, size: 14, font: fontBold, color: black });
  y -= 14;
  page.drawText(title3, { x: (595.28 - t3w) / 2, y, size: 10, font: fontRegular, color: black });
  y -= 35;

  // ─── INTRO ───────────────────────────────────────────────────────────────
  const intro = "Veuillez signer le présent formulaire uniquement si vous souhaitez renoncer à votre droit de rétractation de 14 jours en vue de rendre immédiatement applicable la convention référencée ci-dessous.";
  y = drawWrappedText(page, intro, { x: marginLeft, y, maxWidth: usableWidth, font: fontRegular, fontSize: 11, lineHeight: 15, color: black });
  y -= 15;

  // ─── CORPS — Champs pré-remplis ──────────────────────────────────────────
  const fullName = `${dossier.nom || ''} ${dossier.prenom || ''}`.trim() || '____________________';
  const numBC = dossier.id || '____________________';
  const dateBC = frDate(dossier.dateSignature) || '____________';
  const ville = dossier.ville || '____________________';
  const dateToday = frDate(new Date());

  // Pour faire ressortir les champs pré-remplis on les met en gras.
  const drawMixedLine = (segments, yPos) => {
    let xPos = marginLeft;
    for (const seg of segments) {
      const f = seg.bold ? fontBold : fontRegular;
      page.drawText(seg.text, { x: xPos, y: yPos, size: 11, font: f, color: black });
      xPos += f.widthOfTextAtSize(seg.text, 11);
    }
  };

  drawMixedLine([
    { text: 'Je soussigné Monsieur / Madame ', bold: false },
    { text: fullName, bold: true },
  ], y);
  y -= 22;

  drawMixedLine([
    { text: 'Vous notifie par la présente ma renonciation à mon droit de rétractation', bold: false },
  ], y);
  y -= 16;
  drawMixedLine([
    { text: 'du bon de commande N° ', bold: false },
    { text: numBC, bold: true },
  ], y);
  y -= 22;

  drawMixedLine([
    { text: 'conclu avec la société ', bold: false },
    { text: soc.name, bold: true },
    { text: ' en date du ', bold: false },
    { text: dateBC, bold: true },
  ], y);
  y -= 22;

  y = drawWrappedText(
    page,
    "Je reconnais avoir pris conscience que de ce fait la convention commence à s'exécuter dès la signature de ce formulaire.",
    { x: marginLeft, y, maxWidth: usableWidth, font: fontRegular, fontSize: 11, lineHeight: 15, color: black }
  );
  y -= 25;

  // ─── PIED — Fait à / Date / Signature ────────────────────────────────────
  drawMixedLine([
    { text: 'Fait à : ', bold: false },
    { text: ville, bold: true },
  ], y);
  y -= 22;
  drawMixedLine([
    { text: 'Date : ', bold: false },
    { text: dateToday, bold: true },
  ], y);
  y -= 35;

  page.drawText('Signature :', { x: marginLeft, y, size: 11, font: fontRegular, color: black });
  // Cadre signature
  page.drawRectangle({
    x: marginLeft + 70,
    y: y - 50,
    width: 200,
    height: 70,
    borderColor: gray,
    borderWidth: 0.5,
  });

  // ─── PIED DE PAGE LÉGAL ──────────────────────────────────────────────────
  page.drawText(
    `${soc.name} — ${soc.address} — ${soc.legalSuffix} — RCS ${soc.rcs} — SIRET ${soc.siret}`,
    { x: marginLeft, y: 30, size: 7, font: fontRegular, color: gray }
  );

  const out = await pdf.save();
  const blob = new Blob([out], { type: 'application/pdf' });
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
    // À compléter quand Rodney aura validé les infos légales Yolico
  ],
};
