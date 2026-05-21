// Helpers purs extraits de DossierSaisie.jsx pour être testables sans charger
// le composant React principal (~14k lignes, lent à importer en tests).
// DossierSaisie.jsx peut maintenant importer depuis ici plutôt que dupliquer.

// ─── Téléphone ─────────────────────────────────────────────────────────────

// Normalise un téléphone FR en E.164 (+33...) pour le matcher avec le webhook
// ONOFF ou n'importe quel service côté serveur.
// "06 12 34 56 78" → "+33612345678", "+33 6 12 34 56 78" → "+33612345678".
export function normalizePhoneE164(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s;
  if (s.startsWith('33') && s.length >= 11) return '+' + s;
  if (s.startsWith('0') && s.length === 10) return '+33' + s.slice(1);
  return s;
}

// ─── URL safety ────────────────────────────────────────────────────────────

// Refuse javascript:, data:, vbscript:, blob:, etc. — seuls HTTPS et HTTP
// sont autorisés. Utilisé pour vocalCQUrl et autres URLs user-supplied avant
// de les passer à <audio src>, <a href>, etc.
export function isSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// ─── Dates ─────────────────────────────────────────────────────────────────

// Format français court : "12/05/2026" pour Date ou string ISO.
// Renvoie '' pour null/undefined, et la string brute en fallback si pas une
// date valide (utile pour ne pas casser l'affichage si data corrompue).
export function frDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
}

// Formate des secondes en "M:SS" (ex : 145 → "2:25", 0 → "0:00", 60 → "1:00").
export function formatDurationMmSs(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─── Workflow statut auto-calculé ──────────────────────────────────────────

// Calcule le statut workflow à partir de l'état du dossier (CQ, envoi banque,
// retour, date pose, poseur assigné). Renvoie null si on est sorti du cycle
// (pose réalisée → l'utilisateur gère le reste manuellement).
export function computeWorkflowStatut(d) {
  // Verdicts banque négatifs (refusé / manque_doc) : priment sur tout, même
  // sur une date de pose — tant que la banque bloque, le financement n'est
  // pas sécurisé et le dossier doit le rester visuellement.
  if (d.statutFin === 'refusé') return 'B3_REFUS_FINANCEMENT';
  // MANQUE DOCS BANQUE : demande une action (relancer la régie/client).
  // Repasse en B1 dès que statutFin redevient 'envoyé' (docs renvoyés).
  if (d.statutFin === 'manque_doc') return 'B1_MANQUE_DOC';
  // Envoyé en banque, en attente de réponse → EN COURS DE FINANCEMENT.
  // Prime sur une date de pose (évite que le dossier reste bloqué en
  // sortant de "manque docs" si une date de pose traîne).
  if (d.statutFin === 'envoyé' && d.dateEnvoiFin) return 'B1_EN_COURS_FINANCEMENT';
  // Pose réalisée → phase financière post-pose, auto-progressée jusqu'au
  // paiement : originaux reçus → contrôle livraison → appel banque → payé.
  if (d.dateInsta || d.statutPose === 'visite_ok') {
    if (d.payeClient || d.datePaiementBanque) return 'W_DOSSIER_PAYER';
    if (d.dateAppelBanque) return 'F1_CONTROLE_LIV_BANQUE';
    if (d.dateControleLivraison) return 'F_ATTENTE_DEBLOCAGE';
    if (d.dateRecusOriginauxBanque || d.pasOriginauxRequis) return 'G_ATTENTE_ACCORD_DEF';
    return null; // pose faite, banque pas encore servie en originaux
  }
  if (d.dateEnvoiPose) {
    const poseurAssigne = (d.poseurs || []).some(p => p && p.nom && p.nom.trim());
    if (poseurAssigne) return 'B4_EN_COURS_POSE';
    return 'B2_A_ENVOYER_POSE';
  }
  if (d.statutFin === 'accepté') return 'B2_A_ENVOYER_POSE';
  if (d.dateEnvoiFin) return 'B1_EN_COURS_FINANCEMENT';
  if (d.statutControleQualite === 'ok') return 'B_A_ENVOYER_BANQUE';
  return 'A_EN_COURS';
}

// Liste des statuts auto-calculables (le reste est verrouillé manuel).
export const AUTO_STATUTS = [
  'A_EN_COURS', 'B_A_ENVOYER_BANQUE', 'B1_EN_COURS_FINANCEMENT', 'B1_MANQUE_DOC',
  'B2_A_ENVOYER_POSE', 'B4_EN_COURS_POSE', 'B3_REFUS_FINANCEMENT',
  'G_ATTENTE_ACCORD_DEF', 'F_ATTENTE_DEBLOCAGE', 'F1_CONTROLE_LIV_BANQUE', 'W_DOSSIER_PAYER',
];

// Applique l'auto-statut à un dossier si son statut courant est dans le cycle.
// Si l'utilisateur a manuellement choisi un statut hors cycle (SAV, LITIGE…)
// OU verrouillé (d.statutLocked), on respecte sa décision.
export function applyAutoStatut(d) {
  if (d.statutLocked) return d;
  const current = d.statut || 'A_EN_COURS';
  if (current && !AUTO_STATUTS.includes(current)) return d;
  const auto = computeWorkflowStatut(d);
  if (!auto || auto === current) return d;
  return { ...d, statut: auto };
}

// ─── Math financier ────────────────────────────────────────────────────────

// Calcule le TTC d'un prestataire à partir du HT.
// - Par défaut : TVA 20 % (TTC = HT × 1,2)
// - Si `sansTva` est true (auto-entrepreneur, société étrangère, etc.) :
//   pas de TVA, donc TTC = HT.
// Compat : si l'ancien champ `tauxTva` vaut 0, on traite comme sansTva.
export function computeTtcPresta(ht, sansTva, legacyTauxTva) {
  if (sansTva) return ht;
  if (legacyTauxTva === 0 || legacyTauxTva === '0') return ht;
  return ht * 1.2;
}

// Cherche le tarif applicable pour une puissance donnée dans une grille
// { '3000': 800, '6000': 1200, '9000': 1500 } → trouve la puissance ≤ celle
// demandée. Renvoie 0 si grille vide ou puissance < toutes les clés.
// Utilisé pour les tarifs poseurs / régies indexés sur la puissance.
export function findClosestTarif(tarifs, puissance) {
  if (!tarifs || Object.keys(tarifs).length === 0) return 0;
  if (tarifs[puissance]) return tarifs[puissance];
  const keys = Object.keys(tarifs).map(Number).sort((a, b) => a - b);
  const lower = keys.filter(k => k <= puissance).pop();
  return lower ? tarifs[lower] : 0;
}

// ─── Formatage ─────────────────────────────────────────────────────────────

// Format euro français "1 234,56 €". Robuste aux null/undefined/NaN.
export function formatEuro(n) {
  if (n === null || n === undefined || isNaN(n)) return '0,00 €';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

// Convertit une date ISO "AAAA-MM-JJ" en "JJ/MM/AAAA" pour les exports Excel.
// Si déjà au format FR, on garde. Si autre format, on parse comme Date.
export function formatDateForSheet(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(0, 4)}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(iso)) return iso;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return iso || '';
}

// Normalise une date entrée par l'IA (peut être AAAA-MM-JJ ou JJ/MM/AAAA)
// en ISO standard AAAA-MM-JJ pour le stockage.
export function normalizeDateToIso(raw) {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
}

// Format taille fichier "1.23 Mo" / "456 Ko" / "789 o".
export function formatFileSize(bytes) {
  if (!bytes) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

// ─── Parsers d'import ──────────────────────────────────────────────────────

// Parse un nombre français : "1 234,56 €" → 1234.56. Tolère les espaces et €.
export function parseNumber(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Parse une date d'import en ISO. Accepte JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA,
// AAAA-MM-JJ, AAAA/MM/JJ. Renvoie '' si format inconnu.
export function parseDateInput(str) {
  if (!str) return '';
  const s = String(str).trim();
  const fr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (fr) {
    let [, d, m, y] = fr;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

// Parse un booléen d'import : oui/yes/1/true/x/payé → true, sinon false.
export function parseBool(str) {
  const s = String(str || '').toLowerCase().trim();
  return s === 'oui' || s === 'yes' || s === '1' || s === 'true' || s === 'x' || s === 'payé' || s === 'paye';
}
