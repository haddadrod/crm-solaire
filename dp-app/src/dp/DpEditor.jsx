// 🏛️ Éditeur de DP (déclaration préalable) d'un client.
//
// Étapes (menu de gauche) :
//   📍 Terrain   : adresse → GPS → parcelle cadastrale (IGN), repère déplaçable
//   ☀️ Panneaux  : nombre, puissance, dimensions, disposition, toiture
//   DP1          : 3 plans de situation générés automatiquement (1/20000, 1/5000, 1/650)
//   DP2 / DP4    : plan de masse (cadastre) / plan de toiture (photo aérienne),
//                  le champ de panneaux se glisse et se tourne à la souris
//   DP6          : photo de la maison + zone de panneaux posée en perspective
//   DP7 / DP8    : photos environnement proche / lointain
//   🧾 CERFA     : déclarant, signature → Cerfa 16702*03 rempli
//   📄 Générer   : PDF plans, Cerfa, dossier complet
//
// L'état complet de la DP (`dp`) est fourni par le parent, qui l'enregistre
// dans la colonne `clients.dp` (Supabase).

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  geocodeAddress, findParcel, layoutPolygon, pointInPolygon, panelGeometry,
  fileToCompressedDataUrl, loadDataUrlImage, drawPanelQuad,
} from './geo.js';
import { MAP_KINDS, kindView, kindScale, loadBases, drawMap, renderMapDataUrl, renderPhotoDataUrl, quadToPx, defaultQuad } from './render.js';
import { buildPlansPdf, fillCerfa, cerfaValues, mergePdfs, buildDescription, puissanceKwc } from './pdf.js';

// Ouvre le PDF dans un nouvel onglet (aperçu natif du navigateur).
function openBlobInTab(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener,noreferrer';
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

const STEPS = [
  { id: 'terrain', emoji: '📍', label: 'Terrain & parcelle' },
  { id: 'panneaux', emoji: '☀️', label: 'Panneaux' },
  { id: 'DP1', emoji: '🗺️', label: 'DP1 · Plan de situation', piece: true },
  { id: 'DP2', emoji: '📐', label: 'DP2 · Plan de masse', piece: true },
  { id: 'DP4', emoji: '🏠', label: 'DP4 · Plan de toiture', piece: true },
  { id: 'DP6', emoji: '🖼️', label: 'DP6 · Insertion', piece: true },
  { id: 'DP7', emoji: '📷', label: 'DP7 · Environnement proche', piece: true },
  { id: 'DP8', emoji: '🌄', label: 'DP8 · Environnement lointain', piece: true },
  { id: 'cerfa', emoji: '🧾', label: 'CERFA' },
  { id: 'generer', emoji: '📄', label: 'Générer le dossier' },
];

const PIECE_TITRES = {
  DP1: 'Plan de situation',
  DP2: 'Plan de masse',
  DP4: 'Plan des toitures',
  DP6: "Insertion dans l'environnement",
  DP7: 'Environnement proche',
  DP8: 'Environnement lointain',
};

export const ORIENTATIONS = ['Sud', 'Sud-Est', 'Sud-Ouest', 'Est', 'Ouest', 'Est-Ouest', 'Nord'];
export const DESTINATIONS = [
  'Autoconsommation avec vente du surplus',
  'Autoconsommation totale',
  'Vente totale',
];

// ─── Valeurs par défaut tirées de la fiche client ─────────────────────────────
// `panneaux` (facultatif) : { nombre, puissanceWc, marque, modele } saisis à la création.
export function defaultDp(client, panneaux = {}) {
  const wc = Number(panneaux.puissanceWc) || 0;
  const nomComplet = [client.nom, client.prenom].filter(Boolean).join(' ');
  return {
    v: 1,
    adresse: client.adresse || '',
    codePostal: client.code_postal || '',
    ville: client.ville || '',
    lon: null, lat: null,
    parcelle: { prefixe: '', section: '', numero: '', contenance: '', commune: '', geometry: null },
    module: {
      nombre: panneaux.nombre || '',
      puissanceWc: panneaux.puissanceWc || '',
      marque: panneaux.marque || '',
      modele: panneaux.modele || '',
      longueurMm: wc && wc < 480 ? 1722 : 2094,
      largeurMm: 1134,
      epaisseurMm: 30,
      disposition: 'portrait',
      colonnes: '',
      orientationToit: 'Sud',
      integration: 'surimposition',
      couleur: 'noire',
      destination: DESTINATIONS[0],
    },
    roof: { largeurM: '', longueurM: '' },
    layout: { lon: null, lat: null, angle: 0 },
    zoomDp2: 60,
    zoomDp4: 35,
    notes: {},
    photos: { DP6: null, DP7: null, DP8: null },
    quad: null,
    quadCols: '',
    quadRows: '',
    inclure: { DP1: true, DP2: true, DP4: true, DP6: true, DP7: true, DP8: true },
    declarant: {
      type: 'particulier',
      nom: (client.nom || '').toUpperCase(),
      prenom: client.prenom || '',
      dateNaissance: '', communeNaissance: '', deptNaissance: '', paysNaissance: 'France',
      raisonSociale: '', siret: '', formeJuridique: '',
      telephone: client.telephone || '',
      email: client.email || '',
      accepteEmail: true,
    },
    signature: { lieu: client.ville || '', date: new Date().toISOString().slice(0, 10), nom: nomComplet.toUpperCase() },
    descriptionPerso: '',
  };
}

// Fusion profonde « légère » : garde les nouvelles clés par défaut quand on
// recharge un DP enregistré avec une version plus ancienne du module.
export function mergeDefaults(def, saved) {
  if (!saved || typeof saved !== 'object') return def;
  const out = { ...def };
  for (const k of Object.keys(saved)) {
    const a = def[k], b = saved[k];
    out[k] = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)
      ? { ...a, ...b } : b;
  }
  return out;
}

// ─── Petits composants de formulaire ─────────────────────────────────────────
export const inputCls = 'w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';
export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-slate-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
    </label>
  );
}
export function Card({ title, children, color = 'indigo' }) {
  const colors = {
    indigo: 'border-indigo-200 from-indigo-50', amber: 'border-amber-200 from-amber-50',
    emerald: 'border-emerald-200 from-emerald-50', rose: 'border-rose-200 from-rose-50',
    slate: 'border-slate-200 from-slate-50',
  };
  return (
    <div className={`rounded-2xl border-2 bg-gradient-to-br to-white p-4 ${colors[color] || colors.indigo}`}>
      {title && <div className="text-sm font-bold text-slate-800 mb-3">{title}</div>}
      {children}
    </div>
  );
}
export function Btn({ children, onClick, color = 'indigo', disabled, small }) {
  const c = {
    indigo: 'from-indigo-500 to-violet-500', emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500', slate: 'from-slate-500 to-slate-600', rose: 'from-rose-500 to-pink-500',
  }[color];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'} rounded-xl font-bold text-white bg-gradient-to-r ${c} shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all`}>
      {children}
    </button>
  );
}

// ─── Carte interactive (terrain, DP2, DP4) ───────────────────────────────────
// mode 'marker' : un clic place le repère (et relance la recherche de parcelle)
// mode 'layout' : on glisse le champ de panneaux
function MapCanvas({ kind, dp, mode, onMarker, onLayoutMove }) {
  const canvasRef = useRef(null);
  const basesRef = useRef({ key: '', images: [] });
  const viewRef = useRef(null);
  const dragRef = useRef(null);
  const [status, setStatus] = useState('');

  const view = useMemo(
    () => (dp.lon != null ? kindView(kind, dp) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, dp.lon, dp.lat, MAP_KINDS[kind].zoomKey ? dp[MAP_KINDS[kind].zoomKey] : 0],
  );

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !view) return;
    drawMap(c.getContext('2d'), kind, dp, view, basesRef.current.images, { selected: mode === 'layout' });
  }, [kind, dp, view, mode]);

  useEffect(() => {
    if (!view) return;
    viewRef.current = view;
    const key = view.bbox.join(',');
    if (basesRef.current.key === key) { redraw(); return; }
    let cancelled = false;
    setStatus('⏳ Chargement de la carte IGN…');
    loadBases(kind, view).then(({ images, errors }) => {
      if (cancelled) return;
      basesRef.current = { key, images };
      setStatus(errors.length ? `⚠️ ${errors.join(' · ')}` : '');
      redraw();
    });
    return () => { cancelled = true; };
  }, [view, kind, redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  const toCanvas = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
  };

  const onDown = (e) => {
    const v = viewRef.current;
    if (!v) return;
    const p = toCanvas(e);
    if (mode === 'marker') {
      const [lon, lat] = v.toLonLat(p[0], p[1]);
      onMarker?.(lon, lat);
      return;
    }
    if (mode === 'layout' && dp.layout?.lon != null) {
      const poly = layoutPolygon(v, dp.layout, dp.module, dp.roof);
      if (pointInPolygon(p, poly)) {
        const [lx, ly] = v.toPx(dp.layout.lon, dp.layout.lat);
        dragRef.current = { dx: p[0] - lx, dy: p[1] - ly };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }
  };
  const onMove = (e) => {
    const v = viewRef.current;
    if (!dragRef.current || !v) return;
    const p = toCanvas(e);
    const [lon, lat] = v.toLonLat(p[0] - dragRef.current.dx, p[1] - dragRef.current.dy);
    onLayoutMove?.(lon, lat);
  };
  const onUp = () => { dragRef.current = null; };

  if (dp.lon == null) {
    return <div className="aspect-[1600/1275] w-full rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-500 text-sm p-6 text-center">📍 Localise d'abord l'adresse dans l'étape « Terrain & parcelle ».</div>;
  }
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={view?.W || 1600}
        height={view?.H || 1275}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        className={`w-full rounded-xl border-2 border-slate-200 bg-slate-100 touch-none ${mode === 'marker' ? 'cursor-crosshair' : mode === 'layout' ? 'cursor-move' : ''}`}
      />
      {status && <div className="mt-1 text-xs text-amber-700">{status}</div>}
    </div>
  );
}

// ─── Photo (DP6/7/8) ─────────────────────────────────────────────────────────
function PhotoDrop({ value, onChange, label }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToCompressedDataUrl(file));
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handle(e.dataTransfer.files?.[0]); }}
      className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 p-4 text-center"
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { handle(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="text-sm text-slate-600 mb-2">{busy ? '⏳ Traitement de la photo…' : `📷 ${label} — glisse ta photo ici ou`}</div>
      <div className="flex gap-2 justify-center">
        <Btn small onClick={() => inputRef.current?.click()} disabled={busy}>{value ? '🔄 Changer la photo' : '➕ Choisir une photo'}</Btn>
        {value && <Btn small color="rose" onClick={() => onChange(null)}>🗑️ Retirer</Btn>}
      </div>
    </div>
  );
}

function QuadEditor({ photo, quad, cols, rows, onQuad }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const redraw = useCallback(() => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    drawPanelQuad(ctx, quadToPx(quad, c.width, c.height), cols, rows, { handles: true });
  }, [quad, cols, rows]);

  useEffect(() => {
    let cancelled = false;
    loadDataUrlImage(photo).then(img => {
      if (cancelled || !canvasRef.current) return;
      imgRef.current = img;
      const s = Math.min(1, 1600 / img.naturalWidth);
      canvasRef.current.width = Math.round(img.naturalWidth * s);
      canvasRef.current.height = Math.round(img.naturalHeight * s);
      redraw();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);
  useEffect(() => { redraw(); }, [redraw]);

  const rel = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onDown = (e) => {
    const [u, v] = rel(e);
    const r = canvasRef.current.getBoundingClientRect();
    // Coin le plus proche (rayon ~25 px à l'écran)
    let best = -1, bestD = Infinity;
    quad.forEach(([qu, qv], i) => {
      const d = Math.hypot((qu - u) * r.width, (qv - v) * r.height);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (bestD < 28) dragRef.current = { corner: best };
    else if (pointInPolygon([u, v], quad)) dragRef.current = { all: true, start: [u, v], quad0: quad };
    else return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const [u, v] = rel(e).map(x => Math.max(0, Math.min(1, x)));
    if (d.corner != null) onQuad(quad.map((p, i) => (i === d.corner ? [u, v] : p)));
    else onQuad(d.quad0.map(([a, b]) => [a + u - d.start[0], b + v - d.start[1]]));
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      className="w-full rounded-xl border-2 border-slate-200 touch-none cursor-pointer" />
  );
}

// ─── Aperçu DP1 (3 cartes) ───────────────────────────────────────────────────
function Dp1Preview({ dp }) {
  const [imgs, setImgs] = useState({});
  const [err, setErr] = useState('');
  const geomKey = dp.parcelle?.geometry ? JSON.stringify(dp.parcelle.geometry).length : 0;
  useEffect(() => {
    if (dp.lon == null) return;
    let cancelled = false;
    setImgs({});
    (async () => {
      const errs = [];
      for (const k of ['dp1a', 'dp1b', 'dp1c']) {
        const r = await renderMapDataUrl(k, dp);
        if (cancelled) return;
        errs.push(...r.errors);
        setImgs(prev => ({ ...prev, [k]: r }));
      }
      setErr(errs.join(' · '));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dp.lon, dp.lat, geomKey]);
  if (dp.lon == null) return <div className="text-sm text-slate-500">📍 Localise d'abord l'adresse.</div>;
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {['dp1a', 'dp1b', 'dp1c'].map(k => (
          <div key={k} className="rounded-xl border-2 border-slate-200 overflow-hidden bg-white">
            {imgs[k] ? <img src={imgs[k].dataUrl} alt="" className="w-full" /> : <div className="aspect-[1600/1275] flex items-center justify-center text-xs text-slate-400">⏳ Chargement…</div>}
            <div className="px-2 py-1 text-xs text-right text-slate-500 border-t">Échelle : 1/{MAP_KINDS[k].scale}</div>
          </div>
        ))}
      </div>
      {err && <div className="mt-2 text-xs text-amber-700">⚠️ {err}</div>}
    </div>
  );
}

// ─── Éditeur ─────────────────────────────────────────────────────────────────
// entete : { nom, lignes, logoDataUrl } (réglages société)
export default function DpEditor({ client, dp, setDp, entete = {} }) {
  const [step, setStep] = useState('terrain');
  const [busy, setBusy] = useState('');
  const [geoMsg, setGeoMsg] = useState('');
  const [markerMode, setMarkerMode] = useState(false);

  const set = (patch) => setDp(prev => ({ ...prev, ...patch }));
  const setIn = (key, patch) => setDp(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // ─── Localisation & parcelle ───────────────────────────────────────────────
  const chercherParcelle = async (lon, lat) => {
    setGeoMsg('🔎 Recherche de la parcelle cadastrale…');
    try {
      const p = await findParcel(lon, lat);
      if (!p) { setGeoMsg('⚠️ Aucune parcelle trouvée à cet endroit : déplace le repère sur le terrain, ou remplis la parcelle à la main.'); return; }
      setIn('parcelle', p);
      setGeoMsg(`✅ Parcelle ${[p.prefixe, p.section, p.numero].filter(Boolean).join(' ')} — ${p.contenance} m² (${p.commune})`);
    } catch (e) {
      setGeoMsg(`⚠️ Cadastre indisponible : ${e.message}. Tu peux remplir la parcelle à la main.`);
    }
  };

  const localiser = async () => {
    const q = [dp.adresse, dp.codePostal, dp.ville].filter(Boolean).join(' ');
    if (!q.trim()) { setGeoMsg('⚠️ Renseigne l\'adresse du terrain.'); return; }
    setGeoMsg('🔎 Recherche de l\'adresse…');
    try {
      const g = await geocodeAddress(q);
      if (!g) { setGeoMsg('⚠️ Adresse introuvable. Vérifie l\'orthographe ou le code postal.'); return; }
      setDp(prev => ({ ...prev, lon: g.lon, lat: g.lat, layout: { ...prev.layout, lon: g.lon, lat: g.lat } }));
      await chercherParcelle(g.lon, g.lat);
    } catch (e) {
      setGeoMsg(`⚠️ ${e.message}`);
    }
  };

  const placerRepere = async (lon, lat) => {
    setMarkerMode(false);
    setDp(prev => ({ ...prev, lon, lat, layout: { ...prev.layout, lon, lat } }));
    await chercherParcelle(lon, lat);
  };

  // ─── Calculs ───────────────────────────────────────────────────────────────
  const geom = panelGeometry(dp.module);
  const kwc = puissanceKwc(dp.module);
  const description = dp.descriptionPerso?.trim() ? dp.descriptionPerso : buildDescription(dp.module);
  const quadCols = Number(dp.quadCols) || geom.cols;
  const quadRows = Number(dp.quadRows) || geom.rows;

  const manquants = useMemo(() => {
    const m = [];
    if (dp.lon == null) m.push('Localisation du terrain');
    if (!dp.parcelle.section || !dp.parcelle.numero) m.push('Parcelle cadastrale');
    if (!Number(dp.module.nombre)) m.push('Nombre de panneaux');
    for (const c of ['DP6', 'DP7', 'DP8']) if (dp.inclure[c] && !dp.photos[c]) m.push(`Photo ${c}`);
    if (!dp.declarant.nom) m.push('Nom du déclarant');
    return m;
  }, [dp]);

  // ─── Génération ────────────────────────────────────────────────────────────
  const piecesIncluses = () => Object.keys(PIECE_TITRES).filter(c => dp.inclure[c] && (!['DP6', 'DP7', 'DP8'].includes(c) || dp.photos[c]));

  const buildPlans = async () => {
    const codes = piecesIncluses();
    const pieces = [];
    for (const code of codes) {
      setBusy(`🖼️ Préparation ${code}…`);
      const note = dp.notes[code] || '';
      if (code === 'DP1') {
        const imgs = [];
        for (const k of ['dp1a', 'dp1b', 'dp1c']) imgs.push(await renderMapDataUrl(k, dp));
        pieces.push({ code, titre: PIECE_TITRES[code], note, images: imgs });
      } else if (code === 'DP2' || code === 'DP4') {
        const r = await renderMapDataUrl(code === 'DP2' ? 'dp2' : 'dp4', dp);
        pieces.push({ code, titre: PIECE_TITRES[code], note, images: [r], legende: true, legendeToit: true });
      } else if (code === 'DP6') {
        const url = await renderPhotoDataUrl(dp.photos.DP6, dp.quad || defaultQuad(), quadCols, quadRows);
        pieces.push({ code, titre: PIECE_TITRES[code], note, images: [{ dataUrl: url }], legende: true });
      } else {
        pieces.push({ code, titre: PIECE_TITRES[code], note, images: [{ dataUrl: dp.photos[code] }] });
      }
    }
    setBusy('📄 Mise en page du PDF…');
    const nomClient = [dp.declarant.nom || client.nom, dp.declarant.prenom || client.prenom].filter(Boolean).join(' ');
    return buildPlansPdf({
      pieces,
      client: { nom: nomClient, adresse: `${dp.adresse} - ${dp.codePostal} ${dp.ville}` },
      parcelle: dp.parcelle,
      module: dp.module,
      entete: {
        nom: entete.nom || '',
        lignes: String(entete.lignes || '').split('\n').map(s => s.trim()).filter(Boolean),
        logoDataUrl: entete.logoDataUrl || '',
      },
    });
  };

  const buildCerfa = async (flatten) => {
    setBusy('🧾 Remplissage du CERFA…');
    const vals = cerfaValues({
      declarant: { ...dp.declarant, adresse: dp.adresse, codePostal: dp.codePostal, ville: dp.ville },
      terrain: { adresse: dp.adresse, codePostal: dp.codePostal, ville: dp.ville },
      parcelle: dp.parcelle,
      module: dp.module,
      signature: dp.signature,
      pieces: piecesIncluses(),
    });
    vals.text.C2ZD1_description = description;
    return fillCerfa(vals, { flatten });
  };

  const fileBase = `DP_${(client.nom || 'client').replace(/[^a-zA-Z0-9]+/g, '_')}`;

  const run = async (what) => {
    try {
      if (what === 'plans') {
        const b = await buildPlans();
        openBlobInTab(new Blob([b], { type: 'application/pdf' }), `${fileBase}_plans.pdf`);
      } else if (what === 'cerfa') {
        const b = await buildCerfa(false);
        openBlobInTab(new Blob([b], { type: 'application/pdf' }), `${fileBase}_cerfa.pdf`);
      } else {
        const cerfa = await buildCerfa(true);
        const plans = await buildPlans();
        setBusy('📦 Assemblage du dossier complet…');
        const all = await mergePdfs([cerfa, plans]);
        const blob = new Blob([all], { type: 'application/pdf' });
        openBlobInTab(blob, `${fileBase}_complet.pdf`);
      }
    } catch (e) {
      console.error('[DP]', e);
      alert(`❌ Erreur pendant la génération : ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  // ─── Rendu des étapes ──────────────────────────────────────────────────────
  const noteField = (code) => (
    <Field label="📝 Note sur le plan (facultatif)">
      <input className={inputCls} value={dp.notes[code] || ''} placeholder="Sans commentaire"
        onChange={e => setIn('notes', { [code]: e.target.value })} />
    </Field>
  );
  const includeToggle = (code) => (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
      <input type="checkbox" checked={!!dp.inclure[code]} onChange={e => setIn('inclure', { [code]: e.target.checked })} />
      Inclure {code} dans le dossier
    </label>
  );

  const renderStep = () => {
    switch (step) {
      case 'terrain':
        return (
          <div className="space-y-4">
            <Card title="📍 Adresse du terrain">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-3"><Field label="Adresse"><input className={inputCls} value={dp.adresse} onChange={e => set({ adresse: e.target.value })} /></Field></div>
                <div><Field label="Code postal"><input className={inputCls} value={dp.codePostal} onChange={e => set({ codePostal: e.target.value })} /></Field></div>
                <div className="md:col-span-2"><Field label="Ville"><input className={inputCls} value={dp.ville} onChange={e => set({ ville: e.target.value })} /></Field></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn onClick={localiser}>🔎 Localiser l'adresse</Btn>
                {dp.lon != null && <Btn color={markerMode ? 'amber' : 'slate'} onClick={() => setMarkerMode(m => !m)}>{markerMode ? '👆 Clique sur la maison…' : '🎯 Déplacer le repère'}</Btn>}
                {dp.lon != null && <Btn color="slate" onClick={() => chercherParcelle(dp.lon, dp.lat)}>🔄 Rechercher la parcelle</Btn>}
              </div>
              {geoMsg && <div className="mt-2 text-sm text-slate-700">{geoMsg}</div>}
            </Card>
            <MapCanvas kind="terrain" dp={dp} mode={markerMode ? 'marker' : null} onMarker={placerRepere} />
            <Card title="🧾 Parcelle cadastrale" color="amber">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Préfixe" hint="souvent vide"><input className={inputCls} value={dp.parcelle.prefixe} onChange={e => setIn('parcelle', { prefixe: e.target.value })} /></Field>
                <Field label="Section"><input className={inputCls} value={dp.parcelle.section} onChange={e => setIn('parcelle', { section: e.target.value.toUpperCase() })} /></Field>
                <Field label="Numéro"><input className={inputCls} value={dp.parcelle.numero} onChange={e => setIn('parcelle', { numero: e.target.value })} /></Field>
                <Field label="Superficie (m²)"><input className={inputCls} value={dp.parcelle.contenance} onChange={e => setIn('parcelle', { contenance: e.target.value })} /></Field>
              </div>
            </Card>
          </div>
        );
      case 'panneaux':
        return (
          <div className="space-y-4">
            <Card title="☀️ Panneaux" color="amber">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Nombre de panneaux"><input type="number" min="0" className={inputCls} value={dp.module.nombre} onChange={e => setIn('module', { nombre: e.target.value })} /></Field>
                <Field label="Puissance unitaire (Wc)"><input type="number" min="0" className={inputCls} value={dp.module.puissanceWc} onChange={e => setIn('module', { puissanceWc: e.target.value })} /></Field>
                <Field label="Marque"><input className={inputCls} value={dp.module.marque} onChange={e => setIn('module', { marque: e.target.value })} /></Field>
                <Field label="Modèle"><input className={inputCls} value={dp.module.modele} onChange={e => setIn('module', { modele: e.target.value })} /></Field>
                <Field label="Longueur (mm)"><input type="number" className={inputCls} value={dp.module.longueurMm} onChange={e => setIn('module', { longueurMm: e.target.value })} /></Field>
                <Field label="Largeur (mm)"><input type="number" className={inputCls} value={dp.module.largeurMm} onChange={e => setIn('module', { largeurMm: e.target.value })} /></Field>
                <Field label="Épaisseur (mm)"><input type="number" className={inputCls} value={dp.module.epaisseurMm} onChange={e => setIn('module', { epaisseurMm: e.target.value })} /></Field>
                <Field label="Couleur"><input className={inputCls} value={dp.module.couleur} onChange={e => setIn('module', { couleur: e.target.value })} /></Field>
              </div>
              <div className="mt-3 text-sm font-bold text-amber-800">⚡ Puissance totale : {kwc ? `${kwc.toLocaleString('fr-FR')} kWc` : '—'}</div>
            </Card>
            <Card title="🏠 Pose sur la toiture">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Disposition">
                  <select className={inputCls} value={dp.module.disposition} onChange={e => setIn('module', { disposition: e.target.value })}>
                    <option value="portrait">Portrait</option><option value="paysage">Paysage</option>
                  </select>
                </Field>
                <Field label="Panneaux par rangée" hint={`${geom.cols} × ${geom.rows} rangée(s)`}>
                  <input type="number" min="1" className={inputCls} value={dp.module.colonnes} placeholder={String(geom.cols)} onChange={e => setIn('module', { colonnes: e.target.value })} />
                </Field>
                <Field label="Orientation du pan">
                  <select className={inputCls} value={dp.module.orientationToit} onChange={e => setIn('module', { orientationToit: e.target.value })}>
                    {ORIENTATIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Type de pose">
                  <select className={inputCls} value={dp.module.integration} onChange={e => setIn('module', { integration: e.target.value })}>
                    <option value="surimposition">Surimposition</option><option value="integre">Intégration au bâti</option>
                  </select>
                </Field>
                <Field label="Largeur du pan (m)" hint={`auto : ${(geom.totalW + 1).toFixed(2)} m`}>
                  <input type="number" step="0.01" className={inputCls} value={dp.roof.largeurM} onChange={e => setIn('roof', { largeurM: e.target.value })} />
                </Field>
                <Field label="Longueur du pan (m)" hint={`auto : ${(geom.totalH + 1).toFixed(2)} m`}>
                  <input type="number" step="0.01" className={inputCls} value={dp.roof.longueurM} onChange={e => setIn('roof', { longueurM: e.target.value })} />
                </Field>
                <div className="col-span-2">
                  <Field label="Destination de l'énergie">
                    <select className={inputCls} value={dp.module.destination} onChange={e => setIn('module', { destination: e.target.value })}>
                      {DESTINATIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </Card>
          </div>
        );
      case 'DP1':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">{includeToggle('DP1')}<span className="text-xs text-slate-500">Généré automatiquement depuis le repère 📍</span></div>
            <Dp1Preview dp={dp} />
            {noteField('DP1')}
          </div>
        );
      case 'DP2':
      case 'DP4': {
        const kind = step === 'DP2' ? 'dp2' : 'dp4';
        const zoomKey = step === 'DP2' ? 'zoomDp2' : 'zoomDp4';
        const angle = Number(dp.layout.angle) || 0;
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {includeToggle(step)}
              <span className="text-xs text-slate-500">✋ Glisse le rectangle des panneaux sur le toit · Échelle 1/{kindScale(kind, dp)}</span>
            </div>
            <MapCanvas kind={kind} dp={dp} mode="layout" onLayoutMove={(lon, lat) => setIn('layout', { lon, lat })} />
            <Card color="slate">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={`🔄 Rotation : ${angle}°`}>
                  <div className="flex items-center gap-2">
                    <Btn small color="slate" onClick={() => setIn('layout', { angle: angle - 1 })}>−1°</Btn>
                    <input type="range" min="-180" max="180" value={angle} className="flex-1" onChange={e => setIn('layout', { angle: Number(e.target.value) })} />
                    <Btn small color="slate" onClick={() => setIn('layout', { angle: angle + 1 })}>+1°</Btn>
                  </div>
                </Field>
                <Field label={`🔍 Zoom : ${dp[zoomKey]} m de large`}>
                  <input type="range" min="20" max="200" value={dp[zoomKey]} className="w-full" onChange={e => set({ [zoomKey]: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn small color="slate" onClick={() => setIn('layout', { lon: dp.lon, lat: dp.lat })}>🎯 Recentrer sur le repère</Btn>
                <Btn small color="slate" onClick={() => setStep('panneaux')}>☀️ Modifier les panneaux</Btn>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">Le même placement sert au DP2 et au DP4 : place-le sur la photo aérienne (DP4), il sera juste sur le plan de masse (DP2).</div>
            </Card>
            {noteField(step)}
          </div>
        );
      }
      case 'DP6':
        return (
          <div className="space-y-3">
            {includeToggle('DP6')}
            <PhotoDrop label="Photo de la maison depuis la rue" value={dp.photos.DP6} onChange={v => setIn('photos', { DP6: v })} />
            {dp.photos.DP6 && (
              <>
                <div className="text-xs text-slate-500">✋ Tire les 4 points bleus sur les coins de la zone des panneaux (ou glisse toute la zone).</div>
                <QuadEditor photo={dp.photos.DP6} quad={dp.quad || defaultQuad()} cols={quadCols} rows={quadRows} onQuad={q => set({ quad: q })} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Panneaux visibles en largeur"><input type="number" min="1" className={inputCls} value={dp.quadCols} placeholder={String(geom.cols)} onChange={e => set({ quadCols: e.target.value })} /></Field>
                  <Field label="Rangées visibles"><input type="number" min="1" className={inputCls} value={dp.quadRows} placeholder={String(geom.rows)} onChange={e => set({ quadRows: e.target.value })} /></Field>
                  <div className="flex items-end"><Btn small color="slate" onClick={() => set({ quad: defaultQuad() })}>↺ Réinitialiser la zone</Btn></div>
                </div>
              </>
            )}
            {noteField('DP6')}
          </div>
        );
      case 'DP7':
      case 'DP8':
        return (
          <div className="space-y-3">
            {includeToggle(step)}
            <PhotoDrop label={step === 'DP7' ? 'Photo de près (la maison et son terrain)' : 'Photo de loin (la rue, le paysage)'} value={dp.photos[step]} onChange={v => setIn('photos', { [step]: v })} />
            {dp.photos[step] && <img src={dp.photos[step]} alt="" className="w-full rounded-xl border-2 border-slate-200" />}
            {noteField(step)}
          </div>
        );
      case 'cerfa': {
        const d = dp.declarant;
        const sd = (patch) => setIn('declarant', patch);
        return (
          <div className="space-y-4">
            <Card title="👤 Déclarant">
              <div className="flex gap-2 mb-3">
                {['particulier', 'societe'].map(t => (
                  <button key={t} type="button" onClick={() => sd({ type: t })}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${d.type === t ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {t === 'particulier' ? '🏡 Particulier' : '🏢 Société'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {d.type === 'societe' && <>
                  <Field label="Raison sociale"><input className={inputCls} value={d.raisonSociale} onChange={e => sd({ raisonSociale: e.target.value })} /></Field>
                  <Field label="SIRET"><input className={inputCls} value={d.siret} onChange={e => sd({ siret: e.target.value })} /></Field>
                  <Field label="Forme juridique"><input className={inputCls} value={d.formeJuridique} placeholder="SAS, SARL…" onChange={e => sd({ formeJuridique: e.target.value })} /></Field>
                </>}
                <Field label={d.type === 'societe' ? 'Nom du représentant' : 'Nom'}><input className={inputCls} value={d.nom} onChange={e => sd({ nom: e.target.value })} /></Field>
                <Field label="Prénom"><input className={inputCls} value={d.prenom} onChange={e => sd({ prenom: e.target.value })} /></Field>
                {d.type !== 'societe' && <>
                  <Field label="Date de naissance" hint="facultatif"><input type="date" className={inputCls} value={d.dateNaissance} onChange={e => sd({ dateNaissance: e.target.value })} /></Field>
                  <Field label="Commune de naissance"><input className={inputCls} value={d.communeNaissance} onChange={e => sd({ communeNaissance: e.target.value })} /></Field>
                  <Field label="Département de naissance"><input className={inputCls} value={d.deptNaissance} onChange={e => sd({ deptNaissance: e.target.value })} /></Field>
                  <Field label="Pays de naissance"><input className={inputCls} value={d.paysNaissance} onChange={e => sd({ paysNaissance: e.target.value })} /></Field>
                </>}
                <Field label="Téléphone"><input className={inputCls} value={d.telephone} onChange={e => sd({ telephone: e.target.value })} /></Field>
                <Field label="Email"><input className={inputCls} value={d.email} onChange={e => sd({ email: e.target.value })} /></Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={d.accepteEmail !== false} onChange={e => sd({ accepteEmail: e.target.checked })} />
                Le déclarant accepte de recevoir les réponses de la mairie par email
              </label>
              <div className="mt-2 text-[11px] text-slate-500">L'adresse du déclarant = l'adresse du terrain (étape 📍).</div>
            </Card>
            <Card title="📝 Description des travaux (cadre 4.1 du CERFA)" color="amber">
              <textarea rows={5} className={inputCls} value={description} onChange={e => set({ descriptionPerso: e.target.value })} />
              {dp.descriptionPerso && <div className="mt-2"><Btn small color="slate" onClick={() => set({ descriptionPerso: '' })}>↺ Revenir au texte automatique</Btn></div>}
            </Card>
            <Card title="✍️ Signature" color="emerald">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Fait à"><input className={inputCls} value={dp.signature.lieu} onChange={e => setIn('signature', { lieu: e.target.value })} /></Field>
                <Field label="Le"><input type="date" className={inputCls} value={dp.signature.date} onChange={e => setIn('signature', { date: e.target.value })} /></Field>
                <Field label="Nom du signataire"><input className={inputCls} value={dp.signature.nom} onChange={e => setIn('signature', { nom: e.target.value })} /></Field>
              </div>
            </Card>
          </div>
        );
      }
      case 'generer':
        return (
          <div className="space-y-4">
            <div className="text-xs text-slate-500">🏢 En-tête des plans : <b>{entete.nom || 'non renseigné'}</b> — à régler dans ⚙️ Réglages.</div>
            <Card title="📋 Pièces du dossier" color="indigo">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                {Object.keys(PIECE_TITRES).map(code => {
                  const needPhoto = ['DP6', 'DP7', 'DP8'].includes(code);
                  const ok = !needPhoto || dp.photos[code];
                  return (
                    <label key={code} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${dp.inclure[code] && ok ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                      <input type="checkbox" checked={!!dp.inclure[code]} onChange={e => setIn('inclure', { [code]: e.target.checked })} />
                      <span className="font-semibold">{code}</span><span className="text-slate-500 truncate">{PIECE_TITRES[code]}</span>
                      {needPhoto && !dp.photos[code] && <span className="ml-auto text-[11px] text-rose-600 font-bold">photo ?</span>}
                    </label>
                  );
                })}
              </div>
            </Card>
            {manquants.length > 0 && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ À compléter : {manquants.join(' · ')}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => run('plans')} disabled={!!busy || dp.lon == null}>🗺️ Plans DP (PDF)</Btn>
              <Btn color="amber" onClick={() => run('cerfa')} disabled={!!busy}>🧾 CERFA rempli</Btn>
              <Btn color="emerald" onClick={() => run('complet')} disabled={!!busy || dp.lon == null}>📦 Dossier complet (CERFA + plans)</Btn>
            </div>
            {busy && <div className="text-sm font-semibold text-indigo-700">{busy}</div>}
            <div className="text-[11px] text-slate-500">Le CERFA seul reste modifiable dans Acrobat. Dans le « dossier complet », il est figé pour que rien ne bouge à l'impression.</div>
          </div>
        );
      default:
        return null;
    }
  };

  const stepDone = (id) => {
    if (id === 'terrain') return dp.lon != null && !!dp.parcelle.numero;
    if (id === 'panneaux') return !!Number(dp.module.nombre);
    if (['DP6', 'DP7', 'DP8'].includes(id)) return !!dp.photos[id];
    if (['DP1', 'DP2', 'DP4'].includes(id)) return dp.lon != null;
    if (id === 'cerfa') return !!dp.declarant.nom;
    return false;
  };

  return (
    <div className="bg-white rounded-2xl shadow border border-slate-200 flex flex-col md:flex-row min-h-[70vh] overflow-hidden">
      <div className="md:w-60 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 overflow-x-auto">
        <div className="p-2 flex md:flex-col gap-1">
          {STEPS.map(s => (
            <button key={s.id} type="button" onClick={() => setStep(s.id)}
              className={`flex-shrink-0 text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${step === s.id ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow' : 'hover:bg-white text-slate-700'}`}>
              <span>{s.emoji}</span>
              <span className="whitespace-nowrap">{s.label}</span>
              {stepDone(s.id) && <span className={`ml-auto text-xs ${step === s.id ? 'text-white' : 'text-emerald-600'}`}>✓</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 p-4">
        {renderStep()}
      </div>
    </div>
  );
}
