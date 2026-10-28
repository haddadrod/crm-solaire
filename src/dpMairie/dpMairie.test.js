import { describe, it, expect, vi } from 'vitest';

// geo.js importe le client Supabase (pour le relais) : on le neutralise.
vi.mock('../supabase.js', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const geo = await import('./geo.js');
const pdf = await import('./pdf.js');

describe('projection & vues', () => {
  it('aller-retour lon/lat ↔ Mercator', () => {
    const [x, y] = geo.lonLatToMerc(3.568, 47.9);
    const [lon, lat] = geo.mercToLonLat(x, y);
    expect(lon).toBeCloseTo(3.568, 9);
    expect(lat).toBeCloseTo(47.9, 9);
  });

  it('le centre de la vue tombe au milieu du canvas et revient au même point', () => {
    const v = geo.makeView(3.568, 47.9, 100, 1600, 1275);
    const [px, py] = v.toPx(3.568, 47.9);
    expect(px).toBeCloseTo(800, 6);
    expect(py).toBeCloseTo(637.5, 6);
    const [lon, lat] = v.toLonLat(px, py);
    expect(lon).toBeCloseTo(3.568, 9);
    expect(lat).toBeCloseTo(47.9, 9);
  });

  it('16 px par mètre au sol pour 100 m sur 1600 px, même loin de l\'équateur', () => {
    const v = geo.makeView(3.568, 47.9, 100, 1600, 1275);
    // 10 m vers l'est ≈ 160 px
    const dLon = (10 / (6378137 * Math.cos((47.9 * Math.PI) / 180))) * (180 / Math.PI);
    const [px] = v.toPx(3.568 + dLon, 47.9);
    expect(px - 800).toBeCloseTo(160, 0);
  });

  it('échelles papier', () => {
    expect(geo.groundWidthForScale(20000)).toBeCloseTo(4060, 0);
    expect(geo.scaleDenominator(60)).toBe(300);
  });

  it('URL WMS IGN', () => {
    const v = geo.makeView(2.35, 48.85, 100, 800, 600);
    const u = new URL(geo.wmsUrl(geo.LAYERS.ortho.candidates[0], v));
    expect(u.hostname).toBe('data.geopf.fr');
    expect(u.searchParams.get('LAYERS')).toBe('ORTHOIMAGERY.ORTHOPHOTOS');
    expect(u.searchParams.get('CRS')).toBe('EPSG:3857');
    expect(u.searchParams.get('WIDTH')).toBe('800');
  });
});

describe('panneaux', () => {
  it('calepinage portrait 8 panneaux sur 4 colonnes', () => {
    const g = geo.panelGeometry({ nombre: 8, colonnes: 4, longueurMm: 2094, largeurMm: 1134, disposition: 'portrait' });
    expect(g.cols).toBe(4);
    expect(g.rows).toBe(2);
    expect(g.w).toBeCloseTo(1.134);
    expect(g.h).toBeCloseTo(2.094);
    expect(g.totalW).toBeCloseTo(4 * 1.134 + 3 * 0.02);
  });

  it('paysage inverse largeur / hauteur', () => {
    const g = geo.panelGeometry({ nombre: 6, colonnes: 3, longueurMm: 1722, largeurMm: 1134, disposition: 'paysage' });
    expect(g.w).toBeCloseTo(1.722);
    expect(g.h).toBeCloseTo(1.134);
  });

  it('point dans le pan de toiture (rotation comprise)', () => {
    const v = geo.makeView(2.35, 48.85, 50, 1600, 1275);
    const layout = { lon: 2.35, lat: 48.85, angle: 30 };
    const mod = { nombre: 4, colonnes: 4, longueurMm: 1722, largeurMm: 1134 };
    const poly = geo.layoutPolygon(v, layout, mod, {});
    expect(geo.pointInPolygon([800, 637.5], poly)).toBe(true);
    expect(geo.pointInPolygon([10, 10], poly)).toBe(false);
  });
});

describe('homographie (DP6)', () => {
  it('envoie les coins du carré unité sur les coins du quadrilatère', () => {
    const quad = [[100, 50], [400, 80], [420, 300], [80, 260]];
    const H = geo.homography(quad);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const [x, y] = H(u, v);
      expect(x).toBeCloseTo(quad[i][0], 6);
      expect(y).toBeCloseTo(quad[i][1], 6);
    });
  });
});

describe('textes & Cerfa', () => {
  it('découpe numéro / voie', () => {
    expect(pdf.splitAdresse('13 Rue des Robins')).toEqual({ numero: '13', voie: 'Rue des Robins' });
    expect(pdf.splitAdresse('4 bis, chemin du Lac')).toEqual({ numero: '4 bis', voie: 'chemin du Lac' });
    expect(pdf.splitAdresse('Lieu-dit Les Champs')).toEqual({ numero: '', voie: 'Lieu-dit Les Champs' });
  });

  it('nettoie les caractères non imprimables par les polices PDF', () => {
    expect(pdf.safeText('Insertion dans l’environnement ∙ “ok” — fin')).toBe('Insertion dans l\'environnement - "ok" - fin');
    expect(pdf.safeText('1509 m² – 5 €')).toBe('1509 m² - 5 €');
  });

  it('description complète (plus de « __ » à remplir)', () => {
    const d = pdf.buildDescription({ nombre: 8, puissanceWc: 500, longueurMm: 2094, largeurMm: 1134, epaisseurMm: 30, disposition: 'portrait', orientationToit: 'Sud', marque: 'Powernity', couleur: 'noire' });
    expect(d).toContain('8 panneaux');
    expect(d).toContain('4 kWc');
    expect(d).toContain('portrait');
    expect(d).toContain('orienté Sud');
    expect(d).not.toContain('__');
  });

  it('valeurs Cerfa : particulier, parcelle, pièces, signature', () => {
    const { text, checks } = pdf.cerfaValues({
      declarant: { type: 'particulier', nom: 'LUCAS', prenom: 'Dominique', adresse: '13 Rue des Robins', ville: 'Vergigny', codePostal: '89600', telephone: '+33 6 12 34 56 78', email: 'a@b.fr' },
      terrain: { adresse: '13 Rue des Robins', ville: 'Vergigny', codePostal: '89600' },
      parcelle: { prefixe: '', section: '0H', numero: '0842', contenance: '1509' },
      module: { nombre: 8, puissanceWc: 500 },
      signature: { lieu: 'Vergigny', date: '2026-10-28', nom: 'LUCAS Dominique' },
      pieces: ['DP1', 'DP2', 'DP6'],
    });
    expect(text.D1N_nom).toBe('LUCAS');
    expect(text.D1P_prenom).toBe('Dominique');
    expect(text.D3T_telephone).toBe('0612345678');
    expect(text.D5GE1_email).toBe('a');
    expect(text.D5GE2_email).toBe('b.fr');
    expect(text.T2S_section).toBe('0H');
    expect(text.T2N_numero).toBe('0842');
    expect(text.C2ZP1_crete).toBe('4');
    expect(text.E1D_date).toBe('28102026');
    expect(checks).toEqual(expect.arrayContaining(['P5PA2', 'P5PB1', 'P3GF1', 'C2ZB1_existante']));
    expect(checks).not.toContain('P3GD1'); // DP4 non inclus
  });
});
