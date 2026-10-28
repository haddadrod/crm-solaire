// 🏛️ DP Mairie — géographie, cartes IGN et dessin sur canvas.
//
// Toutes les données viennent de services publics gratuits :
//   - Géocodage adresse : api-adresse.data.gouv.fr (BAN)
//   - Parcelle cadastrale : apicarto.ign.fr (module cadastre)
//   - Fonds de carte : Géoplateforme IGN (data.geopf.fr) en WMS
//
// Le navigateur appelle ces services en direct. Si l'accès direct est refusé
// (CORS), on repasse par le relais /api/dp-map (même requête, côté serveur).

import { supabase } from '../supabase.js';

const R = 6378137; // rayon WGS84 utilisé par la projection Web Mercator (EPSG:3857)

export function lonLatToMerc(lon, lat) {
  return [
    (R * lon * Math.PI) / 180,
    R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

export function mercToLonLat(x, y) {
  return [
    (x / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

// Une « vue » = un cadrage carte centré sur (lon, lat), large de
// `groundWidthM` mètres au sol, rendu en W×H pixels.
// En Web Mercator, 1 m au sol = 1/cos(lat) m « Mercator » : on corrige pour
// que l'échelle imprimée soit juste.
export function makeView(lon, lat, groundWidthM, W, H) {
  const k = 1 / Math.cos((lat * Math.PI) / 180);
  const [cx, cy] = lonLatToMerc(lon, lat);
  const mercW = groundWidthM * k;
  const mercH = (mercW * H) / W;
  const bbox = [cx - mercW / 2, cy - mercH / 2, cx + mercW / 2, cy + mercH / 2];
  return {
    lon, lat, W, H, bbox, groundWidthM,
    pxPerM: W / groundWidthM,
    toPx(lon2, lat2) {
      const [x, y] = lonLatToMerc(lon2, lat2);
      return [((x - bbox[0]) / mercW) * W, ((bbox[3] - y) / mercH) * H];
    },
    toLonLat(px, py) {
      return mercToLonLat(bbox[0] + (px / W) * mercW, bbox[3] - (py / H) * mercH);
    },
  };
}

// Échelle « papier » : largeur au sol / largeur imprimée.
// Sur la page A4 paysage (pdf.js), la carte fait ~203 mm de large.
// Les canvas font 1600×1275 px : même proportion que le cadre image du PDF.
export const PRINT_WIDTH_MM = 203;
export const CANVAS_W = 1600;
export const CANVAS_H = 1275;
export function scaleDenominator(groundWidthM, printWidthMm = PRINT_WIDTH_MM) {
  const raw = (groundWidthM * 1000) / printWidthMm;
  // Arrondi « lisible » : 2 chiffres significatifs
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  return Math.round(raw / p) * p;
}

// Largeur au sol qui donne une échelle donnée (1/denominator) une fois imprimée.
export function groundWidthForScale(denominator, printWidthMm = PRINT_WIDTH_MM) {
  return (denominator * printWidthMm) / 1000;
}

// ─── Couches IGN ─────────────────────────────────────────────────────────────
export const LAYERS = {
  plan: { label: 'Plan IGN', candidates: [
    { base: 'https://data.geopf.fr/wms-r/wms', layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png' },
  ] },
  ortho: { label: 'Photo aérienne', candidates: [
    { base: 'https://data.geopf.fr/wms-r/wms', layer: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg' },
  ] },
  cadastre: { label: 'Cadastre', transparent: true, candidates: [
    { base: 'https://data.geopf.fr/wms-r/wms', layer: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', format: 'image/png' },
    { base: 'https://data.geopf.fr/wms-v/ows', layer: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', format: 'image/png' },
  ] },
};

export function wmsUrl(candidate, view, transparent = false) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: candidate.layer, STYLES: '', CRS: 'EPSG:3857',
    BBOX: view.bbox.map(v => v.toFixed(2)).join(','),
    WIDTH: String(view.W), HEIGHT: String(view.H), FORMAT: candidate.format,
  });
  if (transparent) p.set('TRANSPARENT', 'TRUE');
  return `${candidate.base}?${p.toString()}`;
}

// ─── Réseau avec repli sur le relais serveur ─────────────────────────────────
async function authHeaders() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch (e) {
    return {};
  }
}

async function fetchWithFallback(url, accept) {
  // 1) Direct depuis le navigateur
  try {
    const r = await fetch(url);
    if (r.ok && accept(r.headers.get('content-type') || '')) return r;
  } catch (e) { /* CORS ou réseau : on tente le relais */ }
  // 2) Via le relais serveur
  const r = await fetch(`/api/dp-map?url=${encodeURIComponent(url)}`, { headers: await authHeaders() });
  if (!r.ok || !accept(r.headers.get('content-type') || '')) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Service IGN indisponible (${r.status}) ${txt.slice(0, 120)}`);
  }
  return r;
}

export async function fetchJson(url) {
  const r = await fetchWithFallback(url, ct => /json/.test(ct));
  return r.json();
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img); // l'objectURL est gardé : l'image reste dessinable
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Image illisible')); };
    img.src = u;
  });
}

const imageCache = new Map();
export async function loadLayerImage(layerKey, view) {
  const def = LAYERS[layerKey];
  const cacheKey = `${layerKey}|${view.bbox.map(v => v.toFixed(1)).join(',')}|${view.W}x${view.H}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  let lastErr = null;
  for (const c of def.candidates) {
    try {
      const r = await fetchWithFallback(wmsUrl(c, view, !!def.transparent), ct => /^image\//.test(ct));
      const img = await blobToImage(await r.blob());
      imageCache.set(cacheKey, img);
      return img;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Couche ${def.label} indisponible`);
}

// ─── Adresse & parcelle ──────────────────────────────────────────────────────
export async function geocodeAddress(q) {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`;
  const data = await fetchJson(url);
  const f = data?.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lon, lat, label: f.properties.label, score: f.properties.score, citycode: f.properties.citycode };
}

export async function findParcel(lon, lat) {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
  const data = await fetchJson(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`);
  const f = data?.features?.[0];
  if (!f) return null;
  const p = f.properties || {};
  return {
    prefixe: p.com_abs && p.com_abs !== '000' ? p.com_abs : '',
    section: p.section || '',
    numero: p.numero || '',
    contenance: p.contenance != null ? String(p.contenance) : '',
    commune: p.nom_com || '',
    insee: p.code_insee || '',
    geometry: f.geometry || null,
  };
}

// ─── Dessin ──────────────────────────────────────────────────────────────────
export function drawMarker(ctx, x, y, r = 16) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#e10600';
  ctx.fill();
  ctx.lineWidth = r / 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

export function drawParcel(ctx, view, geometry, { color = '#e10600', width = 4, fill = 'rgba(225,6,0,0.08)' } = {}) {
  if (!geometry) return;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  ctx.save();
  ctx.beginPath();
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = view.toPx(lon, lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
  ctx.setLineDash([14, 8]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function niceLength(maxM) {
  const steps = [1, 2, 5];
  let best = 1;
  for (let e = -1; e < 6; e++) {
    for (const s of steps) {
      const v = s * Math.pow(10, e);
      if (v <= maxM) best = v;
    }
  }
  return best;
}

export function drawScaleBar(ctx, view) {
  const len = niceLength(view.groundWidthM / 5);
  const px = len * view.pxPerM;
  const x = 30, y = view.H - 34;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - 12, y - 34, px + 24 + 70, 52);
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, px, 8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + px / 2, y + 1, px / 2 - 1, 6);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, px, 8);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
  ctx.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, x, y - 10);
  ctx.restore();
}

export function drawNorth(ctx, W, H) {
  const x = W - 60, y = H - 80;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 12, y + 14); ctx.lineTo(x, y + 6); ctx.lineTo(x - 12, y + 14); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y + 36);
  ctx.restore();
}

export function drawAttribution(ctx, W, H, text = '© IGN - Géoplateforme') {
  ctx.save();
  ctx.font = '16px Helvetica, Arial, sans-serif';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(W - w - 16, 0, w + 16, 24);
  ctx.fillStyle = '#333';
  ctx.fillText(text, W - w - 8, 17);
  ctx.restore();
}

// ─── Panneaux (plan de masse / toiture) ──────────────────────────────────────
// Calepinage en mètres. Portrait = côté long vertical.
export function panelGeometry(mod) {
  const L = (Number(mod.longueurMm) || 1722) / 1000;
  const l = (Number(mod.largeurMm) || 1134) / 1000;
  const portrait = mod.disposition !== 'paysage';
  const w = portrait ? l : L;
  const h = portrait ? L : l;
  const n = Math.max(0, Math.round(Number(mod.nombre) || 0));
  const cols = Math.max(1, Math.round(Number(mod.colonnes) || Math.ceil(Math.sqrt(n || 1))));
  const rows = Math.max(1, Math.ceil((n || 1) / cols));
  const gap = 0.02;
  return {
    n, cols, rows, w, h, gap,
    totalW: cols * w + (cols - 1) * gap,
    totalH: rows * h + (rows - 1) * gap,
  };
}

// Pan de toiture (beige) : par défaut le champ de panneaux + 0,5 m de marge.
export function roofSize(mod, roof) {
  const g = panelGeometry(mod);
  const rw = Number(roof?.largeurM) > 0 ? Number(roof.largeurM) : +(g.totalW + 1).toFixed(2);
  const rh = Number(roof?.longueurM) > 0 ? Number(roof.longueurM) : +(g.totalH + 1).toFixed(2);
  return { rw, rh };
}

function rotatePt(x, y, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

// Renvoie le polygone (px) du pan de toiture → sert au « clic pour déplacer ».
export function layoutPolygon(view, layout, mod, roof) {
  const [cx, cy] = view.toPx(layout.lon, layout.lat);
  const { rw, rh } = roofSize(mod, roof);
  const a = ((Number(layout.angle) || 0) * Math.PI) / 180;
  const hw = (rw * view.pxPerM) / 2, hh = (rh * view.pxPerM) / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => rotatePt(cx + x, cy + y, cx, cy, a));
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function drawLabel(ctx, text, x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  let a = angle;
  if (a > Math.PI / 2) a -= Math.PI; // jamais à l'envers
  if (a < -Math.PI / 2) a += Math.PI;
  ctx.rotate(a);
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawLayout(ctx, view, layout, mod, roof, { selected = false } = {}) {
  if (!layout || layout.lon == null) return;
  const g = panelGeometry(mod);
  const { rw, rh } = roofSize(mod, roof);
  const [cx, cy] = view.toPx(layout.lon, layout.lat);
  const a = ((Number(layout.angle) || 0) * Math.PI) / 180;
  const m = view.pxPerM;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  // Pan de toiture
  ctx.fillStyle = 'rgba(236,228,205,0.92)';
  ctx.strokeStyle = selected ? '#2563eb' : '#5b5b5b';
  ctx.lineWidth = selected ? 4 : 2.5;
  ctx.fillRect((-rw * m) / 2, (-rh * m) / 2, rw * m, rh * m);
  ctx.strokeRect((-rw * m) / 2, (-rh * m) / 2, rw * m, rh * m);
  // Modules
  const ox = (-g.totalW * m) / 2, oy = (-g.totalH * m) / 2;
  let placed = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (placed >= g.n) break;
      const x = ox + c * (g.w + g.gap) * m;
      const y = oy + r * (g.h + g.gap) * m;
      ctx.fillStyle = '#141a26';
      ctx.fillRect(x, y, g.w * m, g.h * m);
      ctx.strokeStyle = '#9aa4b2';
      ctx.lineWidth = Math.max(1, m * 0.03);
      ctx.strokeRect(x, y, g.w * m, g.h * m);
      placed++;
    }
  }
  ctx.restore();
  // Cotes du pan (texte toujours lisible)
  const size = Math.max(18, Math.min(34, m * 0.6));
  const off = size * 0.9;
  const pts = layoutPolygon(view, layout, mod, roof);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const outward = (p, q) => {
    const [mx, my] = mid(p, q);
    const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1;
    return [mx + (dx / d) * off, my + (dy / d) * off];
  };
  const fmt = v => `${v.toFixed(2).replace('.', ',')} m`;
  const [p0, p1, p2, p3] = pts;
  const [tx, ty] = outward(p0, p1); drawLabel(ctx, fmt(rw), tx, ty, a, size);
  const [bx, by] = outward(p2, p3); drawLabel(ctx, fmt(rw), bx, by, a, size);
  const [lx, ly] = outward(p3, p0); drawLabel(ctx, fmt(rh), lx, ly, a + Math.PI / 2, size);
  const [rx, ry] = outward(p1, p2); drawLabel(ctx, fmt(rh), rx, ry, a + Math.PI / 2, size);
}

// ─── Insertion photo (DP6) : zone de panneaux en perspective ─────────────────
// Homographie carré unité → quadrilatère (4 coins dans l'ordre :
// haut-gauche, haut-droit, bas-droit, bas-gauche).
export function homography(quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

export function drawPanelQuad(ctx, quad, cols, rows, { handles = false } = {}) {
  if (!quad || quad.length !== 4) return;
  const H = homography(quad);
  ctx.save();
  // Fond des modules
  ctx.beginPath();
  quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  const ys = quad.map(p => p[1]);
  const grad = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  grad.addColorStop(0, 'rgba(38,48,68,0.96)');
  grad.addColorStop(1, 'rgba(14,18,28,0.96)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Séparations entre modules
  const line = (u0, v0, u1, v1, width, color) => {
    ctx.beginPath();
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = H(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  const c = Math.max(1, cols | 0), r = Math.max(1, rows | 0);
  for (let i = 1; i < c; i++) line(i / c, 0, i / c, 1, 2.5, 'rgba(170,180,195,0.85)');
  for (let j = 1; j < r; j++) line(0, j / r, 1, j / r, 2.5, 'rgba(170,180,195,0.85)');
  // Cadre alu
  ctx.beginPath();
  quad.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(200,205,215,0.95)';
  ctx.stroke();
  if (handles) {
    quad.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    });
  }
  ctx.restore();
}

// Charge une photo choisie par l'utilisateur et la réduit (max 1800 px, JPEG)
// pour rester léger dans le stockage et dans le PDF.
export async function fileToCompressedDataUrl(file, maxSide = 1800, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Format non lisible (si c\'est une photo iPhone HEIC, exporte-la en JPG).'));
      i.src = url;
    });
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image illisible'));
    i.src = dataUrl;
  });
}
