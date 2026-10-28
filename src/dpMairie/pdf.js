// 🏛️ DP Mairie — génération des PDF.
//   - buildPlansPdf : les pièces DP1…DP8, une page A4 paysage par image, avec
//     le cartouche (client, parcelle, échelle, légende) et l'en-tête société.
//   - fillCerfa     : remplit le Cerfa 16702*03 officiel (champs de formulaire).
//   - mergePdfs     : assemble plusieurs PDF en un seul.
//
// pdf-lib est chargé à la demande (comme dans pdfTemplates.js).

export const CERFA_URL = '/pdf-templates/cerfa/cerfa_16702-03.pdf';

// Les polices standard PDF (WinAnsi) ne connaissent pas certains caractères
// typographiques : on les remplace pour éviter une erreur à la génération.
export function safeText(s) {
  return String(s ?? '')
    .replace(/[’‘‛`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[∙•·]/g, '-')
    .replace(/…/g, '...')
    .replace(/ | /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€œŒ]/g, '');
}

export function frDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('fr-FR');
}

// « 13 bis rue des Robins » → { numero: '13 bis', voie: 'rue des Robins' }
export function splitAdresse(adresse) {
  const s = String(adresse || '').trim();
  const m = s.match(/^(\d+\s*(?:bis|ter|quater|[a-d])?)\s*,?\s+(.+)$/i);
  return m ? { numero: m[1].trim(), voie: m[2].trim() } : { numero: '', voie: s };
}

const fmtNum = (v, d = 2) => {
  const n = Number(v);
  if (!isFinite(n)) return '';
  return n.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
};

export function puissanceKwc(mod) {
  return ((Number(mod.nombre) || 0) * (Number(mod.puissanceWc) || 0)) / 1000;
}

// Texte du cadre « Courte description de votre projet » du Cerfa.
export function buildDescription(mod) {
  const n = Number(mod.nombre) || 0;
  const wc = Number(mod.puissanceWc) || 0;
  const kwc = puissanceKwc(mod);
  const L = Number(mod.longueurMm) || 0, l = Number(mod.largeurMm) || 0, e = Number(mod.epaisseurMm) || 0;
  const surface = (n * L * l) / 1e6;
  const parts = [];
  parts.push(`Pose de ${n} panneaux solaires photovoltaïques${wc ? ` de ${wc} Wc` : ''}${kwc ? ` (puissance totale ${fmtNum(kwc)} kWc)` : ''}`
    + `${L && l ? `, dimensions ${L} x ${l}${e ? ` x ${e}` : ''} mm` : ''}`
    + `${surface ? `, soit ${fmtNum(surface, 1)} m² de panneaux` : ''}.`);
  const pose = [
    mod.disposition === 'paysage' ? 'disposés en paysage' : 'disposés en portrait',
    mod.integration === 'integre' ? 'en intégration au bâti' : 'en surimposition',
    mod.orientationToit ? `sur le pan de toiture orienté ${mod.orientationToit}` : 'sur la toiture existante',
  ];
  parts.push(`Panneaux ${pose.join(', ')}.`);
  const marque = [mod.marque, mod.modele].filter(Boolean).join(' ');
  parts.push(`${marque ? `Panneaux ${marque}, ` : 'Panneaux '}anti-reflets, couleur ${mod.couleur || 'noire'}.`);
  return parts.join('\n');
}

// ─── Utilitaires de mise en page ─────────────────────────────────────────────
function wrap(text, font, size, maxW) {
  const out = [];
  for (const para of safeText(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) <= maxW) line = t;
      else { if (line) out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function embedImage(pdf, dataUrl) {
  if (/^data:image\/png/i.test(dataUrl)) return pdf.embedPng(dataUrlBytes(dataUrl));
  return pdf.embedJpg(dataUrlBytes(dataUrl));
}

/**
 * @param {object} p
 * @param {Array}  p.pieces   [{ code:'DP1', titre:'Plan de situation', images:[{ dataUrl, echelle? }], note, legende:boolean }]
 * @param {object} p.client   { nom, adresse }
 * @param {object} p.parcelle { prefixe, section, numero, contenance }
 * @param {object} p.module   infos panneaux (pour la légende)
 * @param {object} p.entete   { nom, lignes:[...], logoDataUrl }
 */
export async function buildPlansPdf({ pieces, client, parcelle, module, entete }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(safeText(`DP - ${client.nom}`));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28;
  const grey = rgb(0.42, 0.45, 0.5), dark = rgb(0.1, 0.12, 0.16), line = rgb(0.86, 0.88, 0.9);
  const logo = entete?.logoDataUrl ? await embedImage(pdf, entete.logoDataUrl).catch(() => null) : null;
  const today = frDate();
  const parcelleTxt = [parcelle?.prefixe, parcelle?.section, parcelle?.numero].filter(Boolean).join(' ');

  for (const piece of pieces) {
    const imgs = piece.images || [];
    for (let i = 0; i < imgs.length; i++) {
      const page = pdf.addPage([W, H]);
      const im = imgs[i];
      // En-tête société (haut droite) + logo (haut gauche)
      if (logo) {
        const s = Math.min(120 / logo.width, 34 / logo.height);
        page.drawImage(logo, { x: 28, y: H - 22 - logo.height * s, width: logo.width * s, height: logo.height * s });
      }
      const head = [entete?.nom, ...(entete?.lignes || [])].filter(Boolean).map(safeText);
      head.forEach((t, k) => {
        const f = k === 0 ? bold : font;
        const sz = k === 0 ? 9 : 8;
        page.drawText(t, { x: W - 28 - f.widthOfTextAtSize(t, sz), y: H - 26 - k * 11, size: sz, font: f, color: k === 0 ? dark : grey });
      });

      // Cartouche gauche
      const cx = 28, cw = 188, top = H - 70, bottom = 60;
      page.drawRectangle({ x: cx, y: bottom, width: cw, height: top - bottom, borderColor: line, borderWidth: 1, color: rgb(1, 1, 1) });
      let y = top - 22;
      const tx = cx + 12, tw = cw - 24;
      for (const l of wrap(`${piece.code} - ${piece.titre}`, bold, 12, tw)) {
        page.drawText(l, { x: tx, y, size: 12, font: bold, color: dark }); y -= 15;
      }
      y -= 4;
      for (const l of wrap(client.nom, bold, 9, tw)) { page.drawText(l, { x: tx, y, size: 9, font: bold, color: dark }); y -= 12; }
      for (const l of wrap(client.adresse, font, 8.5, tw)) { page.drawText(l, { x: tx, y, size: 8.5, font, color: grey }); y -= 11; }
      y -= 6;
      page.drawLine({ start: { x: tx, y }, end: { x: tx + tw, y }, thickness: 0.8, color: line });
      y -= 16;
      const kv = (k, v) => {
        if (!v) return;
        page.drawText(safeText(k), { x: tx, y, size: 8.5, font: bold, color: dark });
        const kw = bold.widthOfTextAtSize(safeText(k), 8.5);
        for (const [j, l] of wrap(v, font, 8.5, tw - kw - 4).entries()) {
          page.drawText(l, { x: j === 0 ? tx + kw + 4 : tx, y, size: 8.5, font, color: dark }); y -= 11;
        }
        y -= 3;
      };
      kv('Parcelle :', parcelleTxt);
      kv('Superficie :', parcelle?.contenance ? `${parcelle.contenance} m²` : '');
      kv('Échelle :', im.echelle ? `1/${im.echelle}` : '');
      kv('Note :', piece.note || 'Sans commentaire');
      if (piece.legende && module && Number(module.nombre) > 0) {
        y -= 8;
        page.drawText('Légende', { x: tx, y, size: 9, font: bold, color: dark }); y -= 16;
        page.drawRectangle({ x: tx, y: y - 4, width: 9, height: 13, color: rgb(0.08, 0.1, 0.15) });
        const leg1 = `${module.nombre} modules ${[module.marque, module.modele].filter(Boolean).join(' ')}`.trim();
        for (const l of wrap(leg1, bold, 8, tw - 16)) { page.drawText(l, { x: tx + 15, y, size: 8, font: bold, color: dark }); y -= 10; }
        if (module.longueurMm && module.largeurMm) {
          page.drawText(safeText(`${module.longueurMm} x ${module.largeurMm}${module.epaisseurMm ? ` x ${module.epaisseurMm}` : ''} mm`), { x: tx + 15, y, size: 8, font, color: grey });
          y -= 10;
        }
        if (piece.legendeToit) {
          y -= 6;
          page.drawRectangle({ x: tx, y: y - 4, width: 9, height: 13, color: rgb(0.925, 0.894, 0.804), borderColor: rgb(0.36, 0.36, 0.36), borderWidth: 0.6 });
          page.drawText('Pan de toiture concerné', { x: tx + 15, y, size: 8, font, color: dark });
        }
      }

      // Image
      const ix = cx + cw + 14, iy = bottom, iw = W - 28 - ix, ih = top - bottom;
      page.drawRectangle({ x: ix, y: iy, width: iw, height: ih, borderColor: line, borderWidth: 1 });
      if (im.dataUrl) {
        const emb = await embedImage(pdf, im.dataUrl);
        const s = Math.min((iw - 8) / emb.width, (ih - 8) / emb.height);
        const w = emb.width * s, h = emb.height * s;
        page.drawImage(emb, { x: ix + (iw - w) / 2, y: iy + (ih - h) / 2, width: w, height: h });
      }

      // Pied de page
      const gen = safeText(`Généré par ${entete?.nom || 'le CRM'}`);
      page.drawText(gen, { x: 28, y: 34, size: 8, font, color: grey });
      const p1 = safeText(`${piece.titre} ${i + 1}/${imgs.length}`);
      const p2 = `le ${today}`;
      page.drawText(p1, { x: W - 28 - font.widthOfTextAtSize(p1, 8.5), y: 40, size: 8.5, font, color: dark });
      page.drawText(p2, { x: W - 28 - font.widthOfTextAtSize(p2, 8), y: 29, size: 8, font, color: grey });
    }
  }
  return pdf.save();
}

// ─── Cerfa 16702*03 ──────────────────────────────────────────────────────────
// Correspondance champs Cerfa ← données du DP. Les noms de champs sont ceux
// du formulaire officiel (lisibles avec n'importe quel outil PDF).
export function cerfaValues({ declarant, terrain, parcelle, module, signature, pieces }) {
  const t = {}; // champs texte
  const c = []; // cases à cocher
  const adr = splitAdresse(declarant.adresse);
  if (declarant.type === 'societe') {
    t.D2D_denomination = declarant.raisonSociale;
    t.D2R_raison = declarant.raisonSociale;
    t.D2S_siret = String(declarant.siret || '').replace(/\D/g, '');
    t.D2J_type = declarant.formeJuridique;
    t.D2N_nom = declarant.nom;
    t.D2P_prenom = declarant.prenom;
  } else {
    t.D1N_nom = declarant.nom;
    t.D1P_prenom = declarant.prenom;
    if (declarant.dateNaissance) {
      const d = new Date(declarant.dateNaissance);
      if (!isNaN(d.getTime())) t.D1A_naissance = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
    }
    t.D1C_commune = declarant.communeNaissance;
    t.D1D_dept = declarant.deptNaissance;
    t.D1E_pays = declarant.paysNaissance || 'France';
  }
  t.D3N_numero = adr.numero;
  t.D3V_voie = adr.voie;
  t.D3L_localite = declarant.ville;
  t.D3C_code = declarant.codePostal;
  const tel = String(declarant.telephone || '').replace(/\D/g, '');
  t.D3T_telephone = tel.startsWith('33') && tel.length === 11 ? `0${tel.slice(2)}` : tel;
  if (declarant.email && declarant.email.includes('@')) {
    const [a, b] = declarant.email.split('@');
    t.D5GE1_email = a;
    t.D5GE2_email = b;
    if (declarant.accepteEmail !== false) c.push('D5A_acceptation');
  }
  // Terrain
  const tadr = splitAdresse(terrain.adresse);
  t.T2Q_numero = tadr.numero;
  t.T2V_voie = tadr.voie;
  t.T2L_localite = terrain.ville;
  t.T2C_code = terrain.codePostal;
  t.T2F_prefixe = parcelle.prefixe;
  t.T2S_section = parcelle.section;
  t.T2N_numero = parcelle.numero;
  t.T2T_superficie = parcelle.contenance;
  t.D5T_total = parcelle.contenance;
  // Situation juridique : « je ne sais pas » par défaut (facultatif)
  c.push('T3B_CUnc', 'T3S_lotnc', 'T3T_ZACnc', 'T3E_AFUnc', 'T3F_PUPnc');
  // Projet
  c.push('C2ZB1_existante'); // travaux sur construction existante
  t.C2ZD1_description = buildDescription(module);
  t.C2ZA7_autres = 'Pose de panneaux solaires photovoltaïques';
  c.push('C5ZD1_personnel', 'C2ZF1_principale');
  const kwc = puissanceKwc(module);
  if (kwc) t.C2ZP1_crete = fmtNum(kwc);
  // C2ZR1 = « destination principale de l'énergie produite »
  // (C2ZE1 est la puissance de raccordement > 12 kVA : on le laisse vide)
  t.C2ZR1_destination = module.destination || 'Autoconsommation avec vente du surplus';
  t.W3ES2_creee = '0';
  t.W3ES3_supprimee = '0';
  // Bordereau des pièces jointes
  const box = { DP1: 'P5PA2', DP2: 'P5PB1', DP4: 'P3GD1', DP6: 'P3GF1', DP7: 'P3GG1', DP8: 'P3GH1' };
  for (const code of pieces || []) if (box[code]) c.push(box[code]);
  // Signature
  t.E1L_lieu = signature.lieu;
  if (signature.date) {
    const d = new Date(signature.date);
    if (!isNaN(d.getTime())) t.E1D_date = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  }
  t.E1S_signature = signature.nom;
  return { text: t, checks: c };
}

// flatten: true → les champs deviennent du texte fixe (obligatoire avant de
// fusionner le Cerfa avec d'autres PDF, sinon les valeurs peuvent disparaître).
export async function fillCerfa(values, { flatten = false, templateUrl = CERFA_URL } = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const r = await fetch(templateUrl);
  if (!r.ok) throw new Error(`Cerfa introuvable (${r.status})`);
  const pdf = await PDFDocument.load(await r.arrayBuffer());
  const form = pdf.getForm();
  const missing = [];
  for (const [name, raw] of Object.entries(values.text)) {
    if (raw == null || raw === '') continue;
    try {
      const f = form.getTextField(name);
      let v = safeText(raw);
      const max = f.getMaxLength();
      if (max && v.length > max) v = v.slice(0, max);
      f.setText(v);
    } catch (e) {
      missing.push(name);
    }
  }
  for (const name of values.checks) {
    try { form.getCheckBox(name).check(); } catch (e) { missing.push(name); }
  }
  if (missing.length) console.warn('[DP] champs Cerfa non trouvés :', missing);
  if (flatten) {
    // Champs techniques d'identification du formulaire : invisibles à l'écran,
    // mais ils s'impriment par-dessus le logo Cerfa une fois aplatis.
    for (const name of ['NAFCA_formulaire', 'N1NCA_numero']) {
      try { form.removeField(form.getField(name)); } catch (e) {}
    }
    form.flatten();
  }
  return pdf.save();
}

export async function mergePdfs(list) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return out.save();
}
