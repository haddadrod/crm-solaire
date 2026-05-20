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
  if (d.statutFin === 'refusé') return 'B3_REFUS_FINANCEMENT';
  if (d.dateInsta || d.statutPose === 'visite_ok') return null;
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
  'A_EN_COURS', 'B_A_ENVOYER_BANQUE', 'B1_EN_COURS_FINANCEMENT',
  'B2_A_ENVOYER_POSE', 'B4_EN_COURS_POSE', 'B3_REFUS_FINANCEMENT',
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
