// 🏛️ DP Mairie — rendu des pièces (cartes + photos) sur canvas.
// Utilisé à la fois par l'éditeur (aperçu interactif) et par l'export PDF,
// pour que ce qu'on voit à l'écran soit exactement ce qui part en mairie.

import {
  makeView, loadLayerImage, drawMarker, drawParcel, drawScaleBar, drawNorth,
  drawAttribution, drawLayout, drawPanelQuad, groundWidthForScale,
  scaleDenominator, loadDataUrlImage, CANVAS_W, CANVAS_H,
} from './geo.js';

// Chaque « vue carte » : fond(s) + échelle fixe ou réglable.
export const MAP_KINDS = {
  dp1a: { bases: ['plan'], scale: 20000, marker: true },
  dp1b: { bases: ['plan'], scale: 5000, marker: true, parcel: true },
  dp1c: { bases: ['cadastre'], scale: 650, marker: true, parcel: true, white: true },
  dp2: { bases: ['cadastre'], zoomKey: 'zoomDp2', parcel: true, layout: true, white: true },
  dp4: { bases: ['ortho'], zoomKey: 'zoomDp4', layout: true },
  terrain: { bases: ['ortho', 'cadastre'], groundWidth: 90, marker: true, parcel: true },
};

export function kindGroundWidth(kind, dp) {
  const k = MAP_KINDS[kind];
  if (k.scale) return groundWidthForScale(k.scale);
  if (k.zoomKey) return Number(dp[k.zoomKey]) || (kind === 'dp2' ? 60 : 35);
  return k.groundWidth || 100;
}

export function kindScale(kind, dp) {
  const k = MAP_KINDS[kind];
  if (k.scale) return k.scale;
  return scaleDenominator(kindGroundWidth(kind, dp));
}

export function kindView(kind, dp) {
  return makeView(dp.lon, dp.lat, kindGroundWidth(kind, dp), CANVAS_W, CANVAS_H);
}

// Charge les fonds IGN (mis en cache par geo.js). Une couche en panne
// n'empêche pas les autres : on renvoie aussi la liste des erreurs.
export async function loadBases(kind, view) {
  const k = MAP_KINDS[kind];
  const images = [];
  const errors = [];
  for (const b of k.bases) {
    try {
      images.push(await loadLayerImage(b, view));
    } catch (e) {
      errors.push(`${b} : ${e.message}`);
      // Cadastre indisponible → on se rabat sur le Plan IGN pour ne pas rendre une page blanche
      if (b === 'cadastre' && k.bases.length === 1) {
        try { images.push(await loadLayerImage('plan', view)); } catch (e2) { /* rien */ }
      }
    }
  }
  return { images, errors };
}

export function drawMap(ctx, kind, dp, view, images, { selected = false } = {}) {
  const k = MAP_KINDS[kind];
  ctx.fillStyle = k.white ? '#ffffff' : '#eef1f4';
  ctx.fillRect(0, 0, view.W, view.H);
  for (const img of images) ctx.drawImage(img, 0, 0, view.W, view.H);
  if (k.parcel && dp.parcelle?.geometry) {
    drawParcel(ctx, view, dp.parcelle.geometry, kind === 'dp1b'
      ? { width: 4, fill: 'rgba(225,6,0,0.15)' }
      : { width: kind === 'terrain' ? 5 : 4 });
  }
  if (k.layout && dp.layout?.lon != null) drawLayout(ctx, view, dp.layout, dp.module, dp.roof, { selected });
  if (k.marker && dp.lon != null) {
    const [x, y] = view.toPx(dp.lon, dp.lat);
    drawMarker(ctx, x, y, kind === 'terrain' ? 12 : 16);
  }
  drawScaleBar(ctx, view);
  drawNorth(ctx, view.W, view.H);
  drawAttribution(ctx, view.W, view.H);
}

// Rendu complet → data URL JPEG (pour le PDF).
export async function renderMapDataUrl(kind, dp) {
  const view = kindView(kind, dp);
  const { images, errors } = await loadBases(kind, view);
  const c = document.createElement('canvas');
  c.width = view.W;
  c.height = view.H;
  drawMap(c.getContext('2d'), kind, dp, view, images);
  return { dataUrl: c.toDataURL('image/jpeg', 0.88), echelle: kindScale(kind, dp), errors };
}

// Photo + zone de panneaux en perspective (DP6). Les coins sont stockés en
// coordonnées relatives (0–1) pour ne pas dépendre de la taille d'affichage.
export function quadToPx(quadRel, w, h) {
  return (quadRel || []).map(([u, v]) => [u * w, v * h]);
}

export function defaultQuad() {
  return [[0.36, 0.3], [0.64, 0.3], [0.68, 0.46], [0.32, 0.46]];
}

export async function renderPhotoDataUrl(photoDataUrl, quadRel = null, cols = 4, rows = 2) {
  const img = await loadDataUrlImage(photoDataUrl);
  if (!quadRel) return photoDataUrl;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  drawPanelQuad(ctx, quadToPx(quadRel, c.width, c.height), cols, rows);
  return c.toDataURL('image/jpeg', 0.88);
}
