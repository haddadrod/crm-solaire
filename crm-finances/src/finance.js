// Constantes et calculs financiers (purs, testés dans finance.test.js).

export const STATUTS = [
  { id: 'en_cours', label: 'En cours', emoji: '🔄', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'pose', label: 'Posé', emoji: '🛠️', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'paye', label: 'Payé', emoji: '✅', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'litige', label: 'Litige', emoji: '⚠️', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'annule', label: 'Annulé', emoji: '❌', cls: 'bg-slate-200 text-slate-600 border-slate-300' },
];
export const statutInfo = (id) => STATUTS.find(s => s.id === id) || STATUTS[0];

// Catégories de dépenses ; `liste` = clé de la liste de noms dans les réglages.
export const CATEGORIES = [
  { id: 'materiel', label: 'Matériel', emoji: '📦', liste: 'fournisseurs' },
  { id: 'sous_traitant', label: 'Sous-traitant / pose', emoji: '🔧', liste: 'sous_traitants' },
  { id: 'regie', label: 'Régie', emoji: '🤝', liste: 'regies' },
  { id: 'commission', label: 'Commission', emoji: '💼', liste: 'commerciaux' },
  { id: 'autre', label: 'Autres frais', emoji: '🧾', liste: null },
];
export const categorieInfo = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const LISTES_DEFAUT = {
  financeurs: ['COMPTANT', 'SOFINCO', 'CETELEM', 'DOMOFINANCE', 'FRANFINANCE', 'FINANCO', 'PROJEXIO'],
  fournisseurs: [],
  sous_traitants: [],
  regies: [],
  commerciaux: [],
  produits: ['Panneaux solaires', 'Onduleur', 'Batterie', 'Pompe à chaleur', 'Ballon thermodynamique', 'Climatisation', 'Autre'],
};

export const TAUX_TVA = [20, 10, 5.5];

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

export function venteHt(client) {
  const taux = num(client?.taux_tva ?? 20);
  return round2(num(client?.montant_ttc) / (1 + taux / 100));
}

// Bilan d'un client : vente, dépenses (total / payé / reste, par catégorie), marge.
export function bilan(client) {
  const ht = venteHt(client);
  const ttc = num(client?.montant_ttc);
  const parCategorie = Object.fromEntries(CATEGORIES.map(c => [c.id, 0]));
  let depenses = 0, paye = 0;
  for (const d of client?.depenses || []) {
    const m = num(d.montant_ht);
    depenses += m;
    if (d.paye) paye += m;
    parCategorie[categorieInfo(d.categorie).id] += m;
  }
  depenses = round2(depenses);
  paye = round2(paye);
  const marge = round2(ht - depenses);
  return {
    ttc, ht, tva: round2(ttc - ht),
    depenses, depensesPayees: paye, resteAPayer: round2(depenses - paye),
    parCategorie: Object.fromEntries(Object.entries(parCategorie).map(([k, v]) => [k, round2(v)])),
    marge,
    margePct: ht > 0 ? round2((marge / ht) * 100) : 0,
    encaisse: !!client?.encaisse,
  };
}

// Clients pris en compte dans les totaux (on exclut les annulés).
export const actifs = (clients) => (clients || []).filter(c => c.statut !== 'annule');

export function totaux(clients) {
  const t = { nb: 0, ht: 0, ttc: 0, encaisse: 0, aEncaisser: 0, depenses: 0, depensesPayees: 0, resteAPayer: 0, marge: 0 };
  for (const c of actifs(clients)) {
    const b = bilan(c);
    t.nb += 1;
    t.ht += b.ht; t.ttc += b.ttc;
    if (b.encaisse) t.encaisse += b.ttc; else t.aEncaisser += b.ttc;
    t.depenses += b.depenses; t.depensesPayees += b.depensesPayees; t.resteAPayer += b.resteAPayer;
    t.marge += b.marge;
  }
  for (const k of Object.keys(t)) if (k !== 'nb') t[k] = round2(t[k]);
  t.margePct = t.ht > 0 ? round2((t.marge / t.ht) * 100) : 0;
  return t;
}

// Totaux par prestataire (nom + catégorie) : dû / payé / reste + lignes détaillées.
export function parPrestataire(clients) {
  const map = new Map();
  for (const c of actifs(clients)) {
    for (const d of c.depenses || []) {
      const cat = categorieInfo(d.categorie).id;
      const nom = (d.nom || '').trim() || '(sans nom)';
      const key = `${cat}|${nom.toUpperCase()}`;
      if (!map.has(key)) map.set(key, { categorie: cat, nom, du: 0, paye: 0, reste: 0, lignes: [] });
      const p = map.get(key);
      const m = num(d.montant_ht);
      p.du += m;
      if (d.paye) p.paye += m; else p.reste += m;
      p.lignes.push({ client: c, depense: d });
    }
  }
  return [...map.values()]
    .map(p => ({ ...p, du: round2(p.du), paye: round2(p.paye), reste: round2(p.reste) }))
    .sort((a, b) => b.reste - a.reste || b.du - a.du);
}

// Totaux par mois de signature (AAAA-MM), du plus récent au plus ancien.
export function parMois(clients) {
  const map = new Map();
  for (const c of actifs(clients)) {
    const mois = (c.date_signature || c.created_at || '').slice(0, 7) || 'sans date';
    if (!map.has(mois)) map.set(mois, []);
    map.get(mois).push(c);
  }
  return [...map.entries()]
    .map(([mois, cs]) => ({ mois, ...totaux(cs) }))
    .sort((a, b) => (a.mois < b.mois ? 1 : -1));
}

export const euros = (n) =>
  num(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const nouvelleDepense = (categorie = 'materiel') => ({
  id: (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())),
  categorie, nom: '', montant_ht: '', paye: false, date_paye: null, facture: '',
});
