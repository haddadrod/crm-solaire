import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Copy, Trash2, Check, Search, Sparkles, Zap, X, Edit3, FileText, TrendingUp, Euro, Calendar, Download, Filter, BarChart3, AlertTriangle, Bell, Award, Activity, Flame, Settings, ArrowUp, ArrowDown, RotateCcw, Paperclip, Upload, Eye, FileImage, File, Lock, Unlock, Shield, KeyRound } from 'lucide-react';
import { supabase, uploadFileToBucket, getSignedUrl, deleteFileFromBucket, downloadFileFromBucket } from '../supabase.js';
import { TEMPLATES_CATALOG } from '../pdfTemplates.js';

// Listes par défaut — modifiables dans Réglages
const POSEURS_DEFAULT = ['IONERGIK 2', 'IONERGIK', 'TEK', 'RV SERVICE', 'ECO ENERGY', 'MAFATEC', 'RBM', 'RL CONSEILS', 'MASTEROVIT', 'SKY', 'INTERNE', 'LEH', 'CAP SOLEIL', 'INNOVA', 'DDI', 'ALLAN', 'AUTRE'];
const REGIES_DEFAULT = ['ELON', 'DYLAN CARBON', 'YONI COHEN', 'ISAAC', 'ES CAPITAL', 'DUMONT', 'OREN', 'YC CONSEIL', 'JOHN SULTAN', 'REGIE YE', 'MARTIAL', 'LYA', 'SAMUEL LEVY', 'RL ELON', 'AUTRE'];
const FOURNISSEURS_DEFAULT = ['IONERGIK', 'ECO NEGOCE', 'LEH', 'SYNEXIUM', 'CAP SOLEIL', 'INNOVA', 'RBM', 'ORALED', 'BG MATERIAUX', 'BROTHER NEGOCE', 'AXDIS', 'ERP', 'AUTRE'];

const TARIFS_POSEURS_DEFAULT = Object.fromEntries(POSEURS_DEFAULT.map(n => [n, {}]));
const TARIFS_REGIES_DEFAULT = Object.fromEntries(REGIES_DEFAULT.map(n => [n, {}]));

// Types de crédits / leasings que le client peut déclarer pendant l'appel CQ.
const CREDIT_TYPES = [
  { value: 'conso', label: 'Crédit conso' },
  { value: 'auto', label: 'Crédit auto' },
  { value: 'immo', label: 'Crédit immo' },
  { value: 'autre', label: 'Crédit autre' },
];

// ── Statuts du dossier ──────────────────────────────────────────────────
// 11 statuts « parcours » dans l'ordre du cycle de vie (signature → paiement),
// tous AUTO-CALCULÉS : l'utilisateur n'a jamais à les choisir, ils suivent
// l'état du dossier (voir computeWorkflowStatut). 3 statuts « hors parcours »
// manuels (Annulé, Litige, SAV). Les statuts `legacy` sont d'anciens dossiers :
// gardés pour l'affichage mais retirés du menu de sélection.
// Les IDs sont conservés tels quels (pas de migration) — seuls libellés,
// emojis, couleurs et ordre changent.
const STATUTS = [
  // ── Parcours (auto-calculé) ──
  { id: 'A_EN_COURS',              label: 'EN COURS',                 color: 'from-slate-400 to-slate-500',    bg: 'bg-slate-100',   text: 'text-slate-700',   emoji: '🔄' },
  { id: 'A1_CONTROLE_QUALITE',     label: 'CONTRÔLE QUALITÉ',         color: 'from-purple-400 to-fuchsia-500', bg: 'bg-purple-100',  text: 'text-purple-700',  emoji: '🔍' },
  { id: 'B_A_ENVOYER_BANQUE',      label: 'À ENVOYER EN FINANCEMENT', color: 'from-violet-400 to-purple-500',  bg: 'bg-violet-100',  text: 'text-violet-700',  emoji: '🏦' },
  { id: 'B1_EN_COURS_FINANCEMENT', label: 'EN FINANCEMENT',           color: 'from-blue-400 to-indigo-500',    bg: 'bg-blue-100',    text: 'text-blue-700',    emoji: '⏳' },
  { id: 'B1_MANQUE_DOC',           label: 'MANQUE DOC',               color: 'from-orange-400 to-amber-500',   bg: 'bg-orange-100',  text: 'text-orange-700',  emoji: '📄' },
  { id: 'B3_REFUS_FINANCEMENT',    label: 'REFUSÉ FINANCEMENT',       color: 'from-red-500 to-rose-600',       bg: 'bg-red-100',     text: 'text-red-700',     emoji: '🚫' },
  { id: 'B2_A_ENVOYER_POSE',       label: 'À PROGRAMMER EN POSE',     color: 'from-amber-400 to-orange-500',   bg: 'bg-amber-100',   text: 'text-amber-700',   emoji: '📅' },
  { id: 'B4_EN_COURS_POSE',        label: 'EN COURS DE POSE',         color: 'from-orange-500 to-red-500',     bg: 'bg-orange-100',  text: 'text-orange-700',  emoji: '🔧' },
  { id: 'G_ATTENTE_ACCORD_DEF',    label: 'ATTENTE ACCORD DÉFINITIF', color: 'from-teal-400 to-emerald-500',   bg: 'bg-teal-100',    text: 'text-teal-700',    emoji: '📋' },
  { id: 'F1_CONTROLE_LIV_BANQUE',  label: 'CONTRÔLE LIVRAISON',       color: 'from-sky-400 to-blue-500',       bg: 'bg-sky-100',     text: 'text-sky-700',     emoji: '📞' },
  { id: 'F_ATTENTE_DEBLOCAGE',     label: 'ATTENTE DÉBLOCAGE',        color: 'from-cyan-400 to-sky-500',       bg: 'bg-cyan-100',    text: 'text-cyan-700',    emoji: '💳' },
  { id: 'W_DOSSIER_PAYER',         label: 'PAYÉ',                     color: 'from-emerald-500 to-green-600',  bg: 'bg-emerald-100', text: 'text-emerald-800', emoji: '✅' },
  // ── Hors parcours (manuel) ──
  { id: 'W2_ANNULER',              label: 'ANNULÉ',                   color: 'from-stone-500 to-neutral-600',  bg: 'bg-stone-100',   text: 'text-stone-700',   emoji: '❌' },
  { id: 'C_LITIGE',                label: 'LITIGE',                   color: 'from-rose-500 to-red-500',       bg: 'bg-rose-100',    text: 'text-rose-700',    emoji: '⚠️' },
  { id: 'D_SAV',                   label: 'SAV',                      color: 'from-orange-500 to-red-500',     bg: 'bg-orange-100',  text: 'text-orange-700',  emoji: '🛠️' },
  // ── Hérités (anciens dossiers — non sélectionnables, conservés pour l'affichage) ──
  { id: 'F2_PREFINANCEMENT',       label: 'PRÉFINANCEMENT',           color: 'from-emerald-300 to-green-400',  bg: 'bg-emerald-50',  text: 'text-emerald-700', emoji: '💳', legacy: true },
  { id: 'F1_ACCEPTE',              label: 'ACCEPTÉ',                  color: 'from-rose-300 to-pink-300',      bg: 'bg-rose-50',     text: 'text-rose-700',    emoji: '👍', legacy: true },
  { id: 'F3_MANQUE_RECEP',         label: 'MANQUE RECEP',             color: 'from-slate-300 to-gray-400',     bg: 'bg-slate-100',   text: 'text-slate-700',   emoji: '📭', legacy: true },
  { id: 'CONFORMITE_CONTRAT',      label: 'CONFORMITÉ CONTRAT',       color: 'from-purple-600 to-violet-700',  bg: 'bg-purple-100',  text: 'text-purple-700',  emoji: '📝', legacy: true },
  { id: 'Z_DEPLACEMENT',           label: 'DÉPLACEMENT',              color: 'from-purple-500 to-fuchsia-500', bg: 'bg-purple-100',  text: 'text-purple-700',  emoji: '🚗', legacy: true },
  { id: 'W1_DEPOSER',              label: 'DÉPOSÉ',                   color: 'from-red-600 to-rose-700',       bg: 'bg-red-100',     text: 'text-red-800',     emoji: '📦', legacy: true },
];

// Étapes du parcours pour la barre de progression — chemin nominal en 10
// jalons. « Manque doc » et « Refusé financement » sont des variantes de
// l'étape Financement (signalées à part, pas un jalon distinct).
const PARCOURS_ETAPES = [
  { emoji: '🔄', label: 'En cours' },
  { emoji: '🔍', label: 'Contrôle qualité' },
  { emoji: '🏦', label: 'Envoi financement' },
  { emoji: '⏳', label: 'Financement' },
  { emoji: '📅', label: 'Pose à programmer' },
  { emoji: '🔧', label: 'Pose' },
  { emoji: '📋', label: 'Accord définitif' },
  { emoji: '📞', label: 'Contrôle livraison' },
  { emoji: '💳', label: 'Déblocage' },
  { emoji: '✅', label: 'Payé' },
];
// Statut → index d'étape parcours (0-based). Absent = statut hors parcours.
const STATUT_ETAPE_INDEX = {
  A_EN_COURS: 0,
  A1_CONTROLE_QUALITE: 1,
  B_A_ENVOYER_BANQUE: 2,
  B1_EN_COURS_FINANCEMENT: 3,
  B1_MANQUE_DOC: 3,
  B3_REFUS_FINANCEMENT: 3,
  B2_A_ENVOYER_POSE: 4,
  B4_EN_COURS_POSE: 5,
  G_ATTENTE_ACCORD_DEF: 6,
  F1_CONTROLE_LIV_BANQUE: 7,
  F_ATTENTE_DEBLOCAGE: 8,
  W_DOSSIER_PAYER: 9,
};

// Statuts gérés par l'auto-statut (cycle workflow CQ → banque → pose →
// originaux → contrôle livraison → appel banque → paiement).
// Si le statut courant est dans cette liste, il sera mis à jour automatiquement
// selon l'état du dossier. Sinon (SAV, LITIGE, ANNULER, etc.), on ne touche pas.
const AUTO_STATUTS = ['A_EN_COURS', 'A1_CONTROLE_QUALITE', 'B_A_ENVOYER_BANQUE', 'B1_EN_COURS_FINANCEMENT', 'B1_MANQUE_DOC', 'B2_A_ENVOYER_POSE', 'B4_EN_COURS_POSE', 'B3_REFUS_FINANCEMENT', 'G_ATTENTE_ACCORD_DEF', 'F_ATTENTE_DEBLOCAGE', 'F1_CONTROLE_LIV_BANQUE', 'W_DOSSIER_PAYER'];

// Calcule le statut workflow à partir de l'état du dossier (CQ, envoi banque,
// retour banque, date pose, poseur, puis phase financière post-pose :
// originaux reçus → contrôle livraison → appel banque → paiement).
// Retourne null si aucun statut auto ne s'applique (pose faite mais banque
// pas encore servie en originaux → l'utilisateur garde la main).
function computeWorkflowStatut(d) {
  // ── Verdicts banque négatifs ── priment sur tout le reste, même sur une
  // date de pose saisie : tant que la banque n'a pas validé, le financement
  // n'est PAS sécurisé, le dossier est bloqué et doit le rester visuellement.
  // Refusé → REFUS DE FINANCEMENT
  if (d.statutFin === 'refusé') return 'B3_REFUS_FINANCEMENT';
  // Banque réclame des docs complémentaires → MANQUE DOCS BANQUE.
  // Distinct de B1 : demande une action (relancer la régie/client). Repasse
  // en B1 dès que statutFin redevient 'envoyé' (docs renvoyés à la banque).
  if (d.statutFin === 'manque_doc') return 'B1_MANQUE_DOC';
  // Dossier envoyé en banque, en attente de réponse → EN COURS DE FINANCEMENT.
  // Prime sur une date de pose : tant que la banque n'a pas accepté, le
  // dossier est en financement (sinon il restait bloqué en sortant de
  // "manque docs" si une date de pose traînait).
  if (d.statutFin === 'envoyé' && d.dateEnvoiFin) return 'B1_EN_COURS_FINANCEMENT';
  // Pose réalisée — UNIQUEMENT si statutPose==='visite_ok' (bouton « ✓ Posé »).
  // ⚠️ Ne PAS se fier à dateInsta : ce champ « date de pose » est pré-rempli à
  // aujourd'hui sur tout nouveau dossier, il ne prouve pas que la pose a eu
  // lieu. → phase financière post-pose, auto-progressée jusqu'au paiement.
  if (d.statutPose === 'visite_ok') {
    // Paiement reçu → PAYÉ (statut terminal du cycle).
    if (d.payeClient || d.datePaiementBanque) return 'W_DOSSIER_PAYER';
    // Contrôle livraison fait → ATTENTE DÉBLOCAGE (la banque vérifie et débloque).
    if (d.dateControleLivraison) return 'F_ATTENTE_DEBLOCAGE';
    // Accord définitif obtenu (banque a reçu les originaux, ou dossier sans
    // originaux requis) → CONTRÔLE LIVRAISON à faire.
    if (d.dateRecusOriginauxBanque || d.pasOriginauxRequis) return 'F1_CONTROLE_LIV_BANQUE';
    // Pose finie, dossier (re-signé) en route vers la banque → ATTENTE ACCORD DÉFINITIF.
    return 'G_ATTENTE_ACCORD_DEF';
  }
  // Date de pose remplie : selon qu'on a un poseur ou pas
  if (d.dateEnvoiPose) {
    const poseurAssigne = (d.poseurs || []).some(p => p && p.nom && p.nom.trim());
    // Date + poseur → EN COURS DE POSE
    if (poseurAssigne) return 'B4_EN_COURS_POSE';
    // Date sans poseur → reste À ENVOYER EN POSE (l'alerte "Poseur à assigner" fera son boulot)
    return 'B2_A_ENVOYER_POSE';
  }
  // Accord financement reçu, pas encore date de pose → À ENVOYER EN POSE
  if (d.statutFin === 'accepté') return 'B2_A_ENVOYER_POSE';
  // Envoyé banque, en attente de retour → EN COURS DE FINANCEMENT
  if (d.dateEnvoiFin) return 'B1_EN_COURS_FINANCEMENT';
  // CQ validé OK, pas encore envoyé banque → À ENVOYER EN FINANCEMENT
  if (d.statutControleQualite === 'ok') return 'B_A_ENVOYER_BANQUE';
  // Date de contrôle qualité saisie → CONTRÔLE QUALITÉ (CQ en cours)
  if (d.dateControleQualite) return 'A1_CONTROLE_QUALITE';
  // Par défaut → EN COURS (dossier scanné, CQ pas encore démarré)
  return 'A_EN_COURS';
}

// Applique l'auto-statut à un dossier si son statut courant est dans le cycle.
// Si l'utilisateur a manuellement choisi un statut hors cycle (SAV, LITIGE,
// ANNULER, etc.) OU s'il a verrouillé le statut (d.statutLocked === true),
// on respecte sa décision et on ne touche à rien.
function applyAutoStatut(d) {
  if (d.statutLocked) return d; // verrouillage manuel — auto-statut désactivé
  const current = d.statut || 'A_EN_COURS';
  if (current && !AUTO_STATUTS.includes(current)) return d;
  const auto = computeWorkflowStatut(d);
  if (!auto || auto === current) return d;
  return { ...d, statut: auto };
}

// Date métier rattachée à un changement de statut workflow, pour l'afficher
// directement dans la timeline de l'historique ("Refusé le 19/05/2026").
// Snapshotée au moment du changement (les dates du dossier évoluent ensuite,
// notamment au reset lors d'une rebascule banque). '' si pas pertinent.
function statutMilestoneDate(d, fromStatut, toStatut) {
  switch (toStatut) {
    case 'B3_REFUS_FINANCEMENT': return d.dateRetourFin || '';
    case 'B1_MANQUE_DOC':        return d.dateRetourFin || '';
    case 'B2_A_ENVOYER_POSE':    return d.statutFin === 'accepté' ? (d.dateAccord || '') : '';
    case 'B1_EN_COURS_FINANCEMENT':
      // Retour depuis "manque docs" → date de renvoi des docs à la banque
      if (fromStatut === 'B1_MANQUE_DOC') return d.dateRenvoiDocs || d.dateEnvoiFin || '';
      return d.dateEnvoiFin || '';
    case 'A1_CONTROLE_QUALITE':    return d.dateControleQualite || '';
    case 'G_ATTENTE_ACCORD_DEF':   return d.dateInsta || '';
    case 'F1_CONTROLE_LIV_BANQUE': return d.dateRecusOriginauxBanque || '';
    case 'F_ATTENTE_DEBLOCAGE':    return d.dateControleLivraison || '';
    case 'W_DOSSIER_PAYER':        return d.datePaiementBanque || d.payeClientDate || '';
    default: return '';
  }
}

// Libellé humain de la date métier ci-dessus, dérivé du couple from→to.
function statutMilestoneLabel(fromStatut, toStatut) {
  switch (toStatut) {
    case 'B3_REFUS_FINANCEMENT': return '🚫 Refusé le';
    case 'B1_MANQUE_DOC':        return '📄 Docs réclamés par la banque le';
    case 'B2_A_ENVOYER_POSE':    return '✅ Accord banque le';
    case 'B1_EN_COURS_FINANCEMENT':
      return fromStatut === 'B1_MANQUE_DOC' ? '↩️ Docs renvoyés à la banque le' : '📤 Envoyé en banque le';
    case 'A1_CONTROLE_QUALITE':    return '🔍 Passé en contrôle qualité le';
    case 'G_ATTENTE_ACCORD_DEF':   return '📋 Pose terminée le';
    case 'F1_CONTROLE_LIV_BANQUE': return '📞 Accord définitif reçu le';
    case 'F_ATTENTE_DEBLOCAGE':    return '💳 Contrôle livraison fait le';
    case 'W_DOSSIER_PAYER':        return '✅ Dossier payé le';
    default: return '';
  }
}

const FINANCEMENTS = ['PROJEXIO', 'SOFINCO', 'DOMOFINANCE', 'COMPTANT', 'CETELEM', 'FINANCO', 'FRANFINANCE'];

// 🏦 Plafond mensuel imposé par PROJEXIO : on n'a le droit de leur envoyer
// que pour 2,5 M€ de financement par mois. Au-delà, ils ne traitent plus
// les dossiers tant que le mois suivant n'a pas démarré.
const PROJEXIO_CAP_MENSUEL = 2_500_000;
const PROVENANCES_LEAD = ['Site web', 'Facebook', 'Google Ads', 'Bouche à oreille', 'Salon / Foire', 'Téléprospection', 'Recommandation client', 'Référenceur', 'Autre'];

// Prérequis avant de pouvoir saisir le contrôle de livraison (= étape qui
// débloque le dossier auprès de la banque).
//   • Consuel visé        → toujours obligatoire.
//   • Originaux reçus banque → obligatoire (sauf dossiers sans originaux
//     requis) : on ne peut pas contrôler la livraison tant que la banque
//     n'a pas reçu les documents originaux.
//   • Récépissé mairie    → obligatoire uniquement pour les dossiers financés
//     via SOFINCO (seul organisme qui le réclame avant déblocage).
// Renvoie { bloque, manquants } — `manquants` listé en clair pour l'UI.
function controleLivraisonBlocage(d) {
  const manquants = [];
  if (d.statutConsuel !== 'accepté') manquants.push('Consuel visé');
  if (!d.dateRecusOriginauxBanque && !d.pasOriginauxRequis) manquants.push('Originaux reçus par la banque');
  if (d.financement === 'SOFINCO') {
    const recepisseMairie = !!(d.dateRecepisseMairie || d.recepisseMairieFileId
      || (d.envoisMairie || []).some(e => e && (e.dateRecepisse || e.recepisseFileId)));
    if (!recepisseMairie) manquants.push('Récépissé mairie (exigé par SOFINCO)');
  }
  return { bloque: manquants.length > 0, manquants };
}

// Détecte si l'utilisateur est sur mobile (iOS / Android). Sur mobile, un lien
// `tel:` est sûr (iOS propose ONOFF dans le picker, Android idem). Sur Mac,
// `tel:` est intercepté par Continuity → on doit utiliser la Web App.
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS récent se présente parfois en MacIntel — on regarde maxTouchPoints.
  if (/Mac/i.test(navigator.platform || '') && (navigator.maxTouchPoints || 0) > 1) return true;
  return false;
}

// Formate des secondes en "M:SS" (ex : 145 → "2:25").
function formatDurationMmSs(sec) {
  const s = Math.max(0, parseInt(sec, 10) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Normalise un téléphone FR en E.164 (+33...) pour le matcher avec le webhook ONOFF.
// "06 12 34 56 78" → "+33612345678", "+33 6 12 34 56 78" → "+33612345678", etc.
function normalizePhoneE164(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s;
  if (s.startsWith('33') && s.length >= 11) return '+' + s;
  if (s.startsWith('0') && s.length === 10) return '+33' + s.slice(1);
  return s;
}

// Enregistre un "appel ONOFF en attente" dans window.storage. Quand l'utilisateur
// raccrochera, le webhook ONOFF (cf. /api/cq-recording.js) consultera cette liste
// pour savoir à quel dossier rattacher l'enregistrement audio reçu.
// Stocke 50 entrées max, purge auto les expirées (30 min de fenêtre).
async function recordPendingOnoffCall({ dossierLocalId, telephone, type, createdBy }) {
  try {
    const existing = await window.storage.get('pending-onoff-calls');
    let list = [];
    try { list = JSON.parse(existing?.value || '[]'); } catch (e) {}
    if (!Array.isArray(list)) list = [];
    const now = Date.now();
    list = list.filter(c => c && c.expiresAt > now && c.dossierLocalId !== dossierLocalId);
    list.push({
      dossierLocalId,
      telephone: normalizePhoneE164(telephone),
      telephoneRaw: telephone || '',
      type: type || 'cq',
      createdBy: createdBy || '',
      createdAt: new Date().toISOString(),
      expiresAt: now + 30 * 60 * 1000,
    });
    if (list.length > 50) list = list.slice(-50);
    await window.storage.set('pending-onoff-calls', JSON.stringify(list));
    return true;
  } catch (e) {
    console.warn('[onoff] pending call save failed', e);
    return false;
  }
}

// Garde XSS pour les URLs collées par l'utilisateur (vocalCQUrl notamment).
// Refuse javascript:, data:, vbscript:, blob:, etc. — seuls HTTPS et HTTP
// sont autorisés pour les <audio src>, <a href>, etc.
function isSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Rôles équipe interne (régie interne) — payés au dossier
const ROLES_INTERNES = [
  { key: 'teleprospecteur', label: 'Téléprospecteur', emoji: '📞', defaultTarif: 50 },
  { key: 'confirmateur', label: 'Confirmateur', emoji: '✅', defaultTarif: 30 },
  { key: 'commercial', label: 'Commercial', emoji: '💼', defaultTarif: 300 },
  { key: 'coordinateurProjet', label: 'Coordinateur projet', emoji: '🛠️', defaultTarif: 80 },
  { key: 'responsableEnvoiPose', label: 'Responsable envoi pose', emoji: '📦', defaultTarif: 40 },
];
const TARIFS_INTERNES_DEFAULT = ROLES_INTERNES.reduce((acc, r) => ({ ...acc, [r.key]: r.defaultTarif }), {});
const NOMS_INTERNES_DEFAULT = ROLES_INTERNES.reduce((acc, r) => ({ ...acc, [r.key]: [] }), {});
const PUISSANCES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 10000, 11000, 12000, 15000, 18000];
const PUISSANCES_PRINCIPALES = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 10000, 11000, 12000, 15000, 18000];

// Types de produits — seul "Panneaux solaires" utilise la grille de tarifs auto par Wc.
// La liste est modifiable dans Réglages → Produits (ajouter/renommer/supprimer).
const PRODUITS_DEFAULT = [
  { id: 'PANNEAU_SOLAIRE', label: 'Panneaux solaires',      emoji: '☀️', autoTarif: true },
  { id: 'PERGOLA',         label: 'Pergola',                emoji: '🏡', autoTarif: false },
  { id: 'POMPE_A_CHALEUR', label: 'Pompe à chaleur',        emoji: '🌡️', autoTarif: false },
  { id: 'CLIMATISATION',   label: 'Climatisation',          emoji: '❄️', autoTarif: false },
  { id: 'BALLON_THERMO',   label: 'Ballon thermodynamique', emoji: '🚿', autoTarif: false },
  { id: 'BATTERIE',        label: 'Batterie de stockage',   emoji: '🔋', autoTarif: false },
  { id: 'ISOLATION',       label: 'Isolation',              emoji: '🏠', autoTarif: false },
  { id: 'VMC',             label: 'VMC',                    emoji: '💨', autoTarif: false },
  { id: 'AUTRE',           label: 'Autre rénovation',       emoji: '🔨', autoTarif: false },
];

// Caractéristiques techniques de la toiture pour les panneaux solaires.
// Le poseur en a besoin pour préparer son matériel (fixations, etc.).
const TYPES_TOIT = [
  { id: 'tuile',      label: 'Tuile' },
  { id: 'ardoise',    label: 'Ardoise' },
  { id: 'tole',       label: 'Tôle' },
  { id: 'zinc',       label: 'Zinc' },
  { id: 'fibro',      label: 'Fibro' },
  { id: 'bac_acier',  label: 'Bac Acier' },
  { id: 'toit_plat',  label: 'Toit plat' },
  { id: 'a_valider',  label: 'À VALIDER' },
];
const ORIENTATIONS_PANNEAUX = [
  { id: 'paysage',   label: 'Paysage' },
  { id: 'portrait',  label: 'Portrait' },
  { id: 'les_deux',  label: 'Paysage + Portrait' },
];

// Sous-catégories de documents Client — utilisées pour la classification
// automatique par l'IA quand on scanne un dossier complet multi-pages,
// et comme onglets dans la modale Documents.
const CLIENT_DOC_SUBCATS = [
  { id: 'bon_commande',      label: 'Bon de commande',     emoji: '📄', color: 'violet'  },
  { id: 'mandat',            label: 'Mandat administratif', emoji: '📋', color: 'blue'    },
  { id: 'attestation',       label: 'Attestation honneur', emoji: '✍️', color: 'amber'   },
  { id: 'rge',               label: 'Document RGE',         emoji: '🏅', color: 'emerald' },
  { id: 'financement',       label: 'Dossier financement',  emoji: '🏦', color: 'sky'     },
  { id: 'piece_identite',    label: "Pièce d'identité",     emoji: '🆔', color: 'pink'    },
  { id: 'taxe_fonciere',     label: 'Taxe foncière',        emoji: '🏠', color: 'orange'  },
  { id: 'avis_imposition',   label: "Avis d'imposition",    emoji: '💼', color: 'rose'    },
  { id: 'justif_domicile',   label: 'Justificatif domicile',emoji: '📋', color: 'cyan'    },
  { id: 'bulletin_paie',     label: 'Bulletin de paie',     emoji: '💰', color: 'green'   },
  { id: 'rib',               label: 'RIB',                  emoji: '🏦', color: 'indigo'  },
  { id: 'recepisse_mairie',  label: 'Récépissé mairie',     emoji: '🏛️', color: 'indigo'  },
  { id: 'autre',             label: 'Autre',                emoji: '📑', color: 'slate'   },
];

// Classes Tailwind par couleur — déclarées en clair (pas en construction
// dynamique) pour que le purge ne les supprime pas en prod.
const SUBCAT_COLOR_CLASSES = {
  violet:  { bar: 'bg-violet-500',  headerBg: 'bg-violet-50',  border: 'border-violet-300',  count: 'bg-violet-100 text-violet-700' },
  blue:    { bar: 'bg-blue-500',    headerBg: 'bg-blue-50',    border: 'border-blue-300',    count: 'bg-blue-100 text-blue-700' },
  amber:   { bar: 'bg-amber-500',   headerBg: 'bg-amber-50',   border: 'border-amber-300',   count: 'bg-amber-100 text-amber-700' },
  emerald: { bar: 'bg-emerald-500', headerBg: 'bg-emerald-50', border: 'border-emerald-300', count: 'bg-emerald-100 text-emerald-700' },
  sky:     { bar: 'bg-sky-500',     headerBg: 'bg-sky-50',     border: 'border-sky-300',     count: 'bg-sky-100 text-sky-700' },
  pink:    { bar: 'bg-pink-500',    headerBg: 'bg-pink-50',    border: 'border-pink-300',    count: 'bg-pink-100 text-pink-700' },
  orange:  { bar: 'bg-orange-500',  headerBg: 'bg-orange-50',  border: 'border-orange-300',  count: 'bg-orange-100 text-orange-700' },
  rose:    { bar: 'bg-rose-500',    headerBg: 'bg-rose-50',    border: 'border-rose-300',    count: 'bg-rose-100 text-rose-700' },
  cyan:    { bar: 'bg-cyan-500',    headerBg: 'bg-cyan-50',    border: 'border-cyan-300',    count: 'bg-cyan-100 text-cyan-700' },
  green:   { bar: 'bg-green-500',   headerBg: 'bg-green-50',   border: 'border-green-300',   count: 'bg-green-100 text-green-700' },
  indigo:  { bar: 'bg-indigo-500',  headerBg: 'bg-indigo-50',  border: 'border-indigo-300',  count: 'bg-indigo-100 text-indigo-700' },
  slate:   { bar: 'bg-slate-400',   headerBg: 'bg-slate-100',  border: 'border-slate-300',   count: 'bg-slate-200 text-slate-700' },
};

// Limite des fichiers stockés en base64 inline (KV `storage` table) :
// 5 Mo max par clé Supabase, et le base64 ajoute ~33% d'overhead → 3,7 Mo brut.
// Utilisé uniquement par FactureFileInput (factures PDF compactes).
const MAX_FILE_SIZE_KV = Math.floor(3.7 * 1024 * 1024);
// Limite des fichiers stockés dans le bucket Supabase Storage : 50 Mo
// (limite imposée par Supabase + cohérent avec SUPABASE_STORAGE_SETUP.sql).
const MAX_FILE_SIZE_BUCKET = 50 * 1024 * 1024;
// Alias pour les usages historiques (à supprimer progressivement)
const MAX_FILE_SIZE = MAX_FILE_SIZE_KV;

const findProduit = (produits, id) => {
  const list = (produits && produits.length) ? produits : PRODUITS_DEFAULT;
  return list.find(p => p.id === id) || list[0];
};

const formatEuro = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '0,00 €';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
};

const formatDateForSheet = (iso) => {
  if (!iso) return '';
  // Format ISO standard "AAAA-MM-JJ" → "JJ/MM/AAAA"
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(0, 4)}`;
  }
  // Si déjà au format JJ/MM/AAAA (renvoyé par l'IA parfois), on garde tel quel
  if (/^\d{2}\/\d{2}\/\d{4}/.test(iso)) return iso;
  // Sinon, on essaie de parser comme Date
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return iso || '';
};

// Normalise une date entrée par l'IA (peut être AAAA-MM-JJ ou JJ/MM/AAAA)
// en ISO standard AAAA-MM-JJ pour le stockage.
const normalizeDateToIso = (raw) => {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
};

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Lecture fichier impossible'));
  reader.readAsDataURL(file);
});

// Compresse une image (downscale + ré-encodage JPEG) avant envoi à la fonction
// serverless de scan. Garde le poids sous la limite Vercel et accélère l'analyse.
// Renvoie { base64, mediaType }.
const compressImageForUpload = (file, maxEdge = 2200, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = (dataUrl.split(',')[1]) || '';
    if (!base64) { reject(new Error('Conversion image impossible')); return; }
    resolve({ base64, mediaType: 'image/jpeg' });
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
  img.src = url;
});

// Calcule le TTC d'un prestataire.
// - Par défaut : TVA 20 % (TTC = HT × 1,2)
// - Si `sansTva` est true (auto-entrepreneur, société étrangère, etc.) :
//   pas de TVA, donc TTC = HT.
// Compat : si l'ancien champ `tauxTva` vaut 0, on traite comme sansTva.
const computeTtcPresta = (ht, sansTva, legacyTauxTva) => {
  if (sansTva) return ht;
  if (legacyTauxTva === 0 || legacyTauxTva === '0') return ht;
  return ht * 1.2;
};

// Composant réutilisable : input pour attacher un PDF de facture en glisser/déposer
// ou clic. Stocke le fichier inline (window.storage `file:<id>`) et garde
// l'ID du fichier dans la prop `fileId`. Onglet 👁️ pour prévisualiser dans
// un nouvel onglet.
function FactureFileInput({ fileId, onChange, color = 'orange', onExtract = null, autoExtract = false, pennylaneInfo = null, onPennylaneSuccess = null, label = 'facture' }) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pushingPennylane, setPushingPennylane] = useState(false);
  const [meta, setMeta] = useState(null);
  // Indique que le fileId est défini mais que le fichier est introuvable
  // dans le storage (rare — ex : ligne supprimée à la main, race condition).
  const [missingFile, setMissingFile] = useState(false);
  // Ref pour éviter les setState après unmount (modale fermée pendant un
  // appel IA en cours, par ex.). React warn dans la console sinon.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    setMissingFile(false);
    if (!fileId) { setMeta(null); return; }
    (async () => {
      try {
        const r = await window.storage.get(`file:${fileId}`);
        if (cancelled) return;
        if (!r?.value) {
          // fileId défini mais aucune row dans storage → fichier perdu
          console.warn(`[FactureFileInput] file:${fileId} introuvable dans storage`);
          setMissingFile(true);
          setMeta(null);
          return;
        }
        const data = JSON.parse(r.value);
        setMeta({ name: data.name || 'facture.pdf', type: data.type || 'application/pdf' });
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [fileId]);

  // Appelle l'API IA pour lire la facture et renvoyer les champs extraits.
  const runExtraction = async (base64DataUrl, mimeType) => {
    if (!onExtract) return;
    setExtracting(true);
    try {
      const base64 = (base64DataUrl || '').split(',')[1] || '';
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/extract-facture', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64: base64, mediaType: mimeType }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      // Si le composant a été unmount entre temps (modale fermée par l'user),
      // on n'invoque pas onExtract (qui tenterait de mettre à jour des states
      // d'un parent peut-être démonté aussi).
      if (isMountedRef.current) onExtract(payload.data || {});
    } catch (e) {
      if (isMountedRef.current) alert(`Lecture IA de la facture : ${e.message}`);
    } finally {
      if (isMountedRef.current) setExtracting(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert(`❌ Fichier trop gros (${formatFileSize(file.size)}). Max : ${formatFileSize(MAX_FILE_SIZE)}.`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ok = await window.storage.set(`file:${id}`, JSON.stringify({ dataUrl, name: file.name, type: file.type }));
      if (!ok) { if (isMountedRef.current) alert('❌ Échec du stockage du fichier.'); return; }
      if (fileId) { try { await window.storage.delete(`file:${fileId}`); } catch (e) {} }
      if (!isMountedRef.current) return; // composant démonté pendant l'upload
      onChange(id);
      setMeta({ name: file.name, type: file.type });
      // Auto-extraction si activée (ex : Lire la facture dès qu'on l'upload)
      if (autoExtract && onExtract) {
        runExtraction(dataUrl, file.type);
      }
    } catch (e) {
      if (isMountedRef.current) alert('Erreur : ' + e.message);
    } finally {
      if (isMountedRef.current) setUploading(false);
    }
  };

  // Re-déclenche la lecture IA sur le fichier déjà uploadé (bouton ✨).
  const handleReExtract = async () => {
    if (!fileId || !onExtract) return;
    try {
      const r = await window.storage.get(`file:${fileId}`);
      if (!r?.value) { alert('❌ Fichier introuvable.'); return; }
      const data = JSON.parse(r.value);
      await runExtraction(data.dataUrl, data.type || 'application/pdf');
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  // Push la facture vers Pennylane via /api/pennylane-push-facture.
  // Validation : il faut au moins nom fournisseur + N° facture + montants
  // + un fichier uploadé (pour éviter d'envoyer du n'importe quoi).
  const handlePushPennylane = async () => {
    if (!pennylaneInfo || !fileId) return;
    const missing = [];
    if (!pennylaneInfo.supplierName) missing.push('nom du fournisseur');
    if (!pennylaneInfo.factureNo) missing.push('N° facture');
    if (!pennylaneInfo.dateFacture) missing.push('date facture');
    if (!pennylaneInfo.montantHt || pennylaneInfo.montantHt <= 0) missing.push('montant HT');
    if (!pennylaneInfo.montantTtc || pennylaneInfo.montantTtc <= 0) missing.push('montant TTC');
    if (missing.length > 0) {
      alert(`Impossible d'envoyer à Pennylane — manque : ${missing.join(', ')}.`);
      return;
    }
    setPushingPennylane(true);
    try {
      const r = await window.storage.get(`file:${fileId}`);
      if (!r?.value) throw new Error('Fichier introuvable dans le storage local.');
      const data = JSON.parse(r.value);
      const fileBase64 = (data.dataUrl || '').split(',')[1] || '';
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/pennylane-push-facture', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierName: pennylaneInfo.supplierName,
          factureNo: pennylaneInfo.factureNo,
          dateFacture: pennylaneInfo.dateFacture,
          montantHt: pennylaneInfo.montantHt,
          montantTtc: pennylaneInfo.montantTtc,
          tauxTva: pennylaneInfo.tauxTva ?? 20,
          fileBase64,
          fileName: data.name || 'facture.pdf',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      if (onPennylaneSuccess && payload.data?.pennylaneInvoiceId) {
        onPennylaneSuccess(payload.data.pennylaneInvoiceId);
      }
      alert(`✅ Facture envoyée à Pennylane (ID ${payload.data?.pennylaneInvoiceId || '?'})`);
    } catch (e) {
      alert(`Envoi Pennylane : ${e.message}`);
    } finally {
      setPushingPennylane(false);
    }
  };

  // Aperçu de la facture : on charge le fichier depuis le storage et on ouvre
  // l'overlay in-app FilePreviewOverlay (compatible mobile, pas de popup blocker
  // contrairement à window.open qui est bloqué après un await asynchrone).
  const [preview, setPreview] = useState(null);
  const handleView = async () => {
    if (!fileId) return;
    try {
      const r = await window.storage.get(`file:${fileId}`);
      if (!r?.value) { alert('❌ Fichier introuvable.'); return; }
      const data = JSON.parse(r.value);
      setPreview({
        doc: { name: data.name || 'facture.pdf', size: data.size || 0 },
        dataUrl: data.dataUrl,
        type: data.type || 'application/pdf',
      });
    } catch (e) { alert('Erreur : ' + e.message); }
  };
  const handleDownload = () => {
    if (!preview) return;
    try {
      const a = document.createElement('a');
      a.href = preview.dataUrl;
      a.download = preview.doc.name || 'facture.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 0);
    } catch (e) { alert('Erreur téléchargement : ' + e.message); }
  };

  const handleRemove = async () => {
    if (!fileId) return;
    if (!window.confirm('Retirer la facture jointe ?')) return;
    try { await window.storage.delete(`file:${fileId}`); } catch (e) {}
    onChange('');
    setMeta(null);
  };

  const palette = {
    orange:  'border-orange-200 text-orange-700 hover:bg-orange-50',
    amber:   'border-amber-200 text-amber-700 hover:bg-amber-50',
    purple:  'border-purple-200 text-purple-700 hover:bg-purple-50',
  }[color] || 'border-slate-200 text-slate-700 hover:bg-slate-50';

  if (meta) {
    const pennylanePushed = pennylaneInfo?.pushedId;
    return (
      <>
        <div className={`flex items-center gap-1 px-2 py-1 rounded border bg-white text-[10px] ${palette}`}>
          <span className="flex-1 truncate font-semibold">📄 {meta.name}</span>
          {onExtract && (
            <button onClick={handleReExtract} disabled={extracting} className="px-1 py-0.5 hover:bg-violet-100 text-violet-600 rounded" title="Re-lire les infos de la facture avec l'IA">
              {extracting ? '⏳' : '✨'}
            </button>
          )}
          {pennylaneInfo && (
            pennylanePushed ? (
              <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold" title={`Déjà envoyé à Pennylane (ID ${pennylanePushed})`}>
                ✓ Pennylane
              </span>
            ) : (
              <button
                onClick={handlePushPennylane}
                disabled={pushingPennylane}
                className="px-1.5 py-0.5 bg-violet-500 hover:bg-violet-600 text-white rounded text-[9px] font-bold"
                title="Envoyer cette facture à Pennylane (compta)"
              >
                {pushingPennylane ? '⏳' : '📤 Pennylane'}
              </button>
            )
          )}
          <button onClick={handleView} className="px-1 py-0.5 hover:bg-white rounded" title="Voir la facture">👁️</button>
          <button onClick={handleRemove} className="px-1 py-0.5 text-rose-500 hover:bg-rose-100 rounded" title="Retirer">🗑️</button>
        </div>
        {preview && (
          <FilePreviewOverlay
            preview={preview}
            onClose={() => setPreview(null)}
            onDownload={handleDownload}
          />
        )}
      </>
    );
  }

  return (
    <>
      {missingFile && (
        <div
          className="mb-1 px-2 py-1 rounded border border-rose-300 bg-rose-50 text-[10px] text-rose-700 flex items-center gap-1"
          title="Le fichier était attaché mais introuvable maintenant. Glisse-le à nouveau."
        >
          <span>⚠️ Fichier facture introuvable — uploade-le à nouveau ci-dessous</span>
          <button
            onClick={() => onChange('')}
            className="ml-auto px-1 py-0.5 text-rose-500 hover:bg-rose-100 rounded font-bold"
            title="Effacer la référence orpheline"
          >✕</button>
        </div>
      )}
      <label
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed bg-white text-[10px] cursor-pointer ${palette} ${uploading || extracting ? 'opacity-60' : ''}`}
      >
        <span>
          {uploading ? '⏳ Upload…' : extracting ? '✨ Lecture IA…' : (onExtract ? `📎 Glisser PDF — l'IA lira la ${label} ✨` : `📎 Glisser PDF ${label} ou cliquer`)}
        </span>
        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading || extracting} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </label>
    </>
  );
}

const findClosestTarif = (tarifs, puissance) => {
  if (!tarifs || Object.keys(tarifs).length === 0) return 0;
  if (tarifs[puissance]) return tarifs[puissance];
  const keys = Object.keys(tarifs).map(Number).sort((a, b) => a - b);
  const lower = keys.filter(k => k <= puissance).pop();
  return lower ? tarifs[lower] : 0;
};

// Enrichit un dossier brut avec les champs calculés (HT, marges, totaux, etc.)
// Utilisé à l'affichage pour que les anciens dossiers aient aussi ces infos.
const enrichDossier = (d, tarifsPoseurs, tarifsRegies, produits, tarifsFournisseurs = {}) => {
  if (!d) return d;
  // Liste des produits du dossier (fallback ancien format)
  const produitsList = (d.produits && d.produits.length > 0)
    ? d.produits
    : [{ type: d.produit || 'PANNEAU_SOLAIRE', puissance: d.puissance || 0, quantite: 1 }];
  const totalPuissance = produitsList.reduce((s, p) => {
    const info = findProduit(produits, p.type);
    return s + (info.autoTarif ? (parseInt(p.puissance) || 0) : 0);
  }, 0);
  const computeAutoTarif = (tarifsPrestataire) => {
    if (!tarifsPrestataire) return 0;
    return produitsList.reduce((sum, p) => {
      const prodInfo = findProduit(produits, p.type);
      if (prodInfo.autoTarif) return sum + findClosestTarif(tarifsPrestataire, parseInt(p.puissance) || 0);
      const unitPrice = parseFloat(tarifsPrestataire[p.type]) || 0;
      const qty = parseInt(p.quantite) || 1;
      return sum + (unitPrice * qty);
    }, 0);
  };

  const montantTotal = parseFloat(d.montantTotal) || 0;
  const tauxTvaForm = parseFloat(d.tauxTvaVente) || 20;
  const montantHt = (d.montantHtCustom !== '' && d.montantHtCustom !== undefined && d.montantHtCustom !== null)
    ? (parseFloat(d.montantHtCustom) || 0)
    : montantTotal / (1 + tauxTvaForm / 100);
  const tvaVente = montantTotal - montantHt;
  const tauxTva = montantHt > 0 ? ((tvaVente / montantHt) * 100) : 0;

  const fournisseursDetail = (d.fournisseurs || []).map(f => {
    // Tarif auto : €/Wc × puissance solaire totale du dossier
    const tarifWc = parseFloat(tarifsFournisseurs[f.nom]) || 0;
    const autoHt = tarifWc > 0 && totalPuissance > 0 ? tarifWc * totalPuissance : 0;
    const ht = (f.htCustom !== '' && f.htCustom !== undefined && f.htCustom !== null) ? (parseFloat(f.htCustom) || 0) : autoHt;
    return { nom: f.nom, ht, ttc: computeTtcPresta(ht, !!f.sansTva, f.tauxTva), sansTva: !!f.sansTva, paye: !!f.paye, datePaye: f.datePaye || '', autoHt, tarifWc, bl: f.bl || '', factureNo: f.factureNo || '', facturePdfUrl: f.facturePdfUrl || '' };
  });
  const fournisseurHt = fournisseursDetail.reduce((s, f) => s + f.ht, 0);
  const fournisseurTtc = fournisseursDetail.reduce((s, f) => s + f.ttc, 0);

  // Régies : on traite comme un tableau, fallback sur l'ancien format si pas de tableau
  let regiesList = d.regies;
  if (!regiesList || regiesList.length === 0) {
    // Fallback ancien format (1 régie)
    if (d.regie) {
      regiesList = [{
        nom: d.regie,
        htCustom: d.regieHtCustom || '',
        paye: !!d.regiePaye,
        datePaye: d.regieDatePaye || '',
      }];
    } else {
      regiesList = [];
    }
  }
  const regiesDetail = regiesList.map(r => {
    const autoHt = computeAutoTarif((tarifsRegies || {})[r.nom]);
    const ht = (r.htCustom !== '' && r.htCustom !== undefined && r.htCustom !== null) ? (parseFloat(r.htCustom) || 0) : autoHt;
    return { nom: r.nom, ht, ttc: computeTtcPresta(ht, !!r.sansTva, r.tauxTva), sansTva: !!r.sansTva, paye: !!r.paye, datePaye: r.datePaye || '', autoHt, bl: r.bl || '', factureNo: r.factureNo || '', facturePdfUrl: r.facturePdfUrl || '' };
  });
  const regieHt = regiesDetail.reduce((s, r) => s + r.ht, 0);
  const regieTtc = regiesDetail.reduce((s, r) => s + r.ttc, 0);
  // Legacy : on garde regieAutoHt (premier élément) pour compat avec d'éventuels usages
  const regieAutoHt = regiesDetail[0]?.autoHt || 0;

  const poseursDetail = (d.poseurs || []).map(p => {
    const autoHt = computeAutoTarif((tarifsPoseurs || {})[p.nom]);
    const ht = (p.htCustom !== '' && p.htCustom !== undefined && p.htCustom !== null) ? (parseFloat(p.htCustom) || 0) : autoHt;
    // Poseurs : jamais de TVA (toujours HT). TTC = HT.
    return { nom: p.nom, ht, ttc: ht, sansTva: true, paye: !!p.paye, datePaye: p.datePaye || '', autoHt, bl: p.bl || '', factureNo: p.factureNo || '', facturePdfUrl: p.facturePdfUrl || '' };
  });
  const poseurHt = poseursDetail.reduce((s, p) => s + p.ht, 0);
  const poseurTtc = poseursDetail.reduce((s, p) => s + p.ttc, 0);

  const margeTtc = montantTotal - fournisseurTtc - regieTtc - poseurTtc;
  const margeHt = montantHt - fournisseurHt - regieHt - poseurHt;
  const tva = margeTtc - margeHt;

  return {
    ...d,
    montantHt, tvaVente, tauxTva, tva,
    fournisseursDetail, fournisseurHt, fournisseurTtc,
    regiesDetail, regieAutoHt, regieHt, regieTtc,
    poseursDetail, poseurHt, poseurTtc,
    margeTtc, margeHt,
    puissance: d.puissance || totalPuissance,
  };
};

export default function DossierSaisie({ authUser, onLogout }) {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState('all');
  const [showStatutFilter, setShowStatutFilter] = useState(false); // 🔻 replier/déplier le filtre par statut
  const [copiedId, setCopiedId] = useState(null);
  const [celebrating, setCelebrating] = useState(false);
  // Toast léger pour feedback (succès save, action effectuée, etc.).
  // { message: string, type: 'success' | 'error' | 'info' } | null
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success', duration = 2500) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  };
  // Init depuis le hash URL pour qu'un refresh F5 garde l'onglet courant.
  // Format : #onglet ou #onglet/sous-section (ex : #reglages/utilisateurs)
  const initialTabFromHash = (typeof window !== 'undefined' && window.location.hash)
    ? window.location.hash.replace(/^#/, '').split('/')[0] || 'dossiers'
    : 'dossiers';
  const VALID_TABS = ['dossiers', 'archives', 'calendrier', 'paiements', 'dashboard', 'reglages'];
  const [activeTab, setActiveTab] = useState(VALID_TABS.includes(initialTabFromHash) ? initialTabFromHash : 'dossiers');
  const [statutsOrder, setStatutsOrder] = useState(STATUTS.map(s => s.id));
  const [tarifsPoseurs, setTarifsPoseurs] = useState(TARIFS_POSEURS_DEFAULT);
  const [poseursContacts, setPoseursContacts] = useState({}); // { nomPoseur: 'téléphone' } — pour l'envoi WhatsApp
  // Contacts régies : { nomRegie: { tel, email } } — pour prévenir la régie
  // par WhatsApp/mail quand le financement est accepté → à programmer en pose.
  const [regiesContacts, setRegiesContacts] = useState({});
  // Config email SMTP pour envoi auto via Gmail (legacy app password, conservé
  // pour fallback). La méthode primaire est OAuth Google (gmailOAuth ci-dessous).
  const [emailConfig, setEmailConfig] = useState({ smtpUser: '', smtpPass: '', fromName: '' });
  // Statut OAuth Gmail pour l'utilisateur courant. Chargé via
  // /api/gmail-oauth (GET) au mount + après retour du callback OAuth.
  const [gmailOAuth, setGmailOAuth] = useState({ connected: false, email: null, connectedAt: null });
  const [tarifsRegies, setTarifsRegies] = useState(TARIFS_REGIES_DEFAULT);
  const [tarifsInternes, setTarifsInternes] = useState(TARIFS_INTERNES_DEFAULT);
  const [nomsInternes, setNomsInternes] = useState(NOMS_INTERNES_DEFAULT);
  const [listeFournisseurs, setListeFournisseurs] = useState(FOURNISSEURS_DEFAULT);
  // 🏢 Sociétés du groupe : permet de gérer plusieurs marques (Yolico + Elsun)
  // sur le même CRM. Chaque dossier appartient à une société. Filtre + badge.
  // logoUrl = data URL d'une image (uploadée via SocietesManager). Si présente,
  // s'affiche partout à la place de l'emoji.
  const [societes, setSocietes] = useState([
    { id: 'yolico', label: 'Yolico', emoji: '🟢', color: 'emerald', signature: '', logoUrl: '' },
    { id: 'elsun',  label: 'Elsun',  emoji: '🔵', color: 'blue',    signature: '', logoUrl: '' },
  ]);
  // Filtre société actif : '' = toutes, ou un id de société
  const initialSocieteFromHash = (typeof window !== 'undefined' && window.location.hash)
    ? new URLSearchParams(window.location.hash.replace(/^#/, '').split('?')[1] || '').get('soc') || ''
    : '';
  const [activeSociete, setActiveSociete] = useState(initialSocieteFromHash);
  // Tarif au Wc (€) par fournisseur. Ex : { 'ECO NEGOCE': 0.37, 'IONERGIK': 0.55 }
  // Auto-calcul du HT du dossier : tarif × puissance totale solaire.
  const [tarifsFournisseurs, setTarifsFournisseurs] = useState({});
  const [produits, setProduits] = useState(PRODUITS_DEFAULT);
  const [users, setUsers] = useState([]);
  const [showDocsForId, setShowDocsForId] = useState(null); // 📎 modal documents
  const [showHistForId, setShowHistForId] = useState(null); // 📜 modal historique
  const [showQuickViewId, setShowQuickViewId] = useState(null); // 👁️ panneau aperçu rapide
  const [quickViewScrollTo, setQuickViewScrollTo] = useState(null); // 🎯 section à scroller dans la bannière
  const [showSearch, setShowSearch] = useState(false); // 🔍 recherche globale Ctrl+K
  const [showAssistantIa, setShowAssistantIa] = useState(false); // 🤖 modale assistant IA email
  const [showAlertesType, setShowAlertesType] = useState(null); // 🔔 type d'alerte ouvert : null | 'financement' | 'consuel' | 'paiement' | 'stagnation'
  const [showImport, setShowImport] = useState(false); // 📥 modal import dossiers
  // Identité de l'utilisateur courant : dérivée de la session Supabase (authUser).
  // Plus de dropdown local — qui est connecté = qui agit.
  // currentUser = nom complet (utilisé pour tagger createdBy / modifiedBy) ;
  // currentUserFirstName = prénom court affiché à l'écran.
  const currentUser = useMemo(() => {
    if (!authUser) return '';
    const m = authUser.user_metadata || {};
    return (m.display_name || (authUser.email ? authUser.email.split('@')[0] : '') || '').toString();
  }, [authUser]);
  const currentUserFirstName = useMemo(() => {
    if (!currentUser) return '';
    const first = currentUser.split(/[.\s_-]+/)[0] || currentUser;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }, [currentUser]);
  const currentUserEmoji = useMemo(() => authUser?.user_metadata?.emoji || '👤', [authUser]);
  const [showEmptyStatuts, setShowEmptyStatuts] = useState(false); // afficher ou non les statuts à 0 dans le filtre
  const isInitialMount = useRef(true);
  // Ref qui mémorise le dernier JSON écrit par CE client, pour ignorer les
  // évènements realtime qui correspondent à nos propres écritures.
  const lastWrittenDossiersJson = useRef(null);
  // Idem pour les clés contacts/tarifs/email-config — évite que la sauvegarde
  // locale soit écrasée par un autre device avec un état stale.
  const lastWrittenSettings = useRef({});
  const isInitialOrder = useRef(true);
  const isInitialTarifs = useRef(true);

  const POSEURS = useMemo(() => Object.keys(tarifsPoseurs), [tarifsPoseurs]);
  const REGIES = useMemo(() => Object.keys(tarifsRegies), [tarifsRegies]);
  const FOURNISSEURS = listeFournisseurs;

  // Contacts effectifs des prestataires = source de vérité = comptes
  // utilisateurs Supabase (via user.linkedTo). On fait l'override des
  // anciens poseursContacts/regiesContacts pour ne plus avoir 2 endroits
  // qui se contredisent et causent le bug 'l'email disparaît'.
  // Fallback sur les contacts legacy pour les prestataires sans compte.
  const buildEffectiveContacts = (kind, legacy) => {
    const out = {};
    users.forEach(u => {
      if (u.role === kind && u.linkedTo && (u.tel || u.email)) {
        out[u.linkedTo] = { tel: u.tel || '', email: u.email || '' };
      }
    });
    Object.keys(legacy || {}).forEach(nom => {
      if (out[nom]) return; // user account prime
      const c = legacy[nom];
      if (!c) return;
      out[nom] = typeof c === 'string' ? { tel: c, email: '' } : { tel: c.tel || '', email: c.email || '' };
    });
    return out;
  };
  const effectivePoseursContacts = useMemo(() => buildEffectiveContacts('poseur', poseursContacts), [users, poseursContacts]);
  const effectiveRegiesContacts = useMemo(() => buildEffectiveContacts('regie', regiesContacts), [users, regiesContacts]);

  // Rôle de l'utilisateur courant : lu directement dans le user_metadata Supabase.
  // Fallback : recherche dans les profils locaux (anciens dossiers).
  const authUserRole = useMemo(() => {
    const fromAuth = authUser?.user_metadata?.role;
    if (fromAuth) return fromAuth;
    if (!currentUser) return null;
    const u = users.find(usr => usr.name === currentUser);
    return u?.role || null;
  }, [authUser, currentUser, users]);

  // Mode "Voir comme..." : uniquement en localhost ET si le compte est admin.
  // Permet de prévisualiser ce que voit un autre rôle sans se déconnecter.
  // En prod, jamais activé.
  const isLocalDev = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isRealAdmin = authUserRole === 'admin';
  const canPreviewRole = isLocalDev && isRealAdmin;
  const [viewAsRole, setViewAsRole] = useState(null); // null = pas d'override

  // Rôle effectif = override de preview si actif, sinon rôle réel Supabase.
  const currentUserRole = (canPreviewRole && viewAsRole) ? viewAsRole : authUserRole;

  // Entité rattachée (pour les rôles poseur / régie) : nom du poseur ou de la
  // régie auquel le compte est lié. Stocké dans user_metadata.linkedTo.
  // Fallback : le display_name (rétrocompat avec les comptes créés avant).
  const currentUserLinkedTo = authUser?.user_metadata?.linkedTo || currentUser;

  // Admin = rôle effectif === 'admin'. En mode preview, basculer en non-admin
  // débloque les autres rendus pour validation visuelle.
  const isAdmin = currentUserRole === 'admin';

  // Permissions calculées : si admin → tout débloqué ; sinon, dépend du rôle.
  const permissions = useMemo(() => {
    if (isAdmin) {
      return {
        voirTousDossiers: true,
        voirMarges: true,
        voirBLFactures: true,
        creerDossier: true,
        supprimerDossier: true,
        modifierTous: true,
        voirRapportPaiements: true,
        voirDashboard: true,
        voirReglages: true,
        cocherPaiements: true,
        voirCA: true,
        filtreDossiers: 'tous', // 'tous' | 'mes' | 'chantiers'
      };
    }
    // Mode équipe : permissions selon rôle
    const role = currentUserRole || 'equipe';
    switch (role) {
      case 'commercial':
        return {
          voirTousDossiers: true,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: true,
          supprimerDossier: false,
          modifierTous: false,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: true,
          filtreDossiers: 'tous',
        };
      case 'poseur':
        return {
          voirTousDossiers: false,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: false,
          supprimerDossier: false,
          modifierTous: false,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: false,
          filtreDossiers: 'chantiers',
        };
      case 'regie':
        return {
          voirTousDossiers: false,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: false,
          supprimerDossier: false,
          modifierTous: false,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: false,
          filtreDossiers: 'regies',
        };
      case 'compta':
        return {
          voirTousDossiers: true,
          voirMarges: true,
          voirBLFactures: true,
          creerDossier: false,
          supprimerDossier: false,
          modifierTous: false,
          voirRapportPaiements: true,
          voirDashboard: true,
          voirReglages: false,
          cocherPaiements: true,
          voirCA: true,
          filtreDossiers: 'tous',
        };
      case 'envoi_finance':
        return {
          voirTousDossiers: true,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: false,
          supprimerDossier: false,
          modifierTous: true,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: false,
          filtreDossiers: 'tous',
        };
      case 'administratif':
        // Démarches : mairie, raccordement, Consuel, récup. TVA. Voit tous les
        // dossiers et peut les modifier (pour saisir ces dates), sans accès
        // marges / CA / dashboard / réglages.
        return {
          voirTousDossiers: true,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: false,
          supprimerDossier: false,
          modifierTous: true,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: false,
          filtreDossiers: 'tous',
        };
      default: // 'equipe' ou rôle non défini
        return {
          voirTousDossiers: true,
          voirMarges: false,
          voirBLFactures: false,
          creerDossier: true,
          supprimerDossier: false,
          modifierTous: false,
          voirRapportPaiements: false,
          voirDashboard: false,
          voirReglages: false,
          cocherPaiements: false,
          voirCA: true,
          filtreDossiers: 'tous',
        };
    }
  }, [isAdmin, currentUserRole]);

  const emptyForm = {
    id: '', dateInsta: new Date().toISOString().split('T')[0],
    dateSignature: '',
    societe: activeSociete || (societes[0]?.id || ''), // 🏢 société émettrice (Yolico/Elsun)
    // Étape 1 : contrôle qualité (avant envoi banque)
    dateControleQualite: '', statutControleQualite: '', // '' | 'ok' | 'pas_ok'
    // 💳 Crédits / leasings en cours du client, déclarés pendant l'appel CQ
    // ("vous avez des crédits en cours ?"). Liste typée : [{ type, montant }].
    creditsClientCQ: [],
    vocalCQUrl: '', // lien vers le fichier audio du contrôle qualité
    vocalCQStoragePath: '', // chemin Supabase Storage si le vocal a été téléversé directement
    tentativesCQ: [], // [{datetime: ISO}] — historique des appels où le client n'a pas répondu
    dateAccord: '', dateConsuel: '',
    dateEnvoiFin: '', dateRetourFin: '',
    statutFin: '', // '' | 'envoyé' | 'accepté' | 'refusé' | 'manque_doc'
    motifManqueDoc: '', // texte libre : quels documents la banque réclame (ex : "Bulletin paie + RIB")
    // Workflow Manque docs : banque → régie → client → régie → nous → banque
    dateNotifRegie: '', // date à laquelle on a prévenu la régie (qu'elle réclame au client)
    dateRecuRegie: '',  // date à laquelle la régie nous a renvoyé le doc du client
    dateRenvoiDocs: '', // date à laquelle on a renvoyé les docs à la banque
    envoisHistorique: [], // [{financeur, dateEnvoi, dateRetour, statut, note}]
    // Process pose
    dateEnvoiPose: '', dateVisitePose: '',
    statutPose: '', // '' | 'envoyé' | 'visite_ok' | 'client_refuse'
    tentativesPose: [], // [{date, motif: 'client_absent'|'client_refuse'|'autre', penalite, regie, regleAt}]
    // Originaux signés (entre pose et contrôle livraison)
    dateRecusOriginauxPoseur: '', dateEnvoiOriginauxBanque: '', dateRecusOriginauxBanque: '',
    pasOriginauxRequis: false, // si le dossier ne nécessite pas d'originaux
    // Process consuel — le Consuel répond : 'accepté' (visé) ou 'visite' (visite demandée)
    dateEnvoiConsuel: '', dateAccordConsuel: '',
    statutConsuel: '', // '' | 'visite' | 'accepté'
    visitesConsuel: [],
    // Process raccordement (demande de raccordement Enedis)
    dateEnvoiRaccordement: '', dateAccordRaccordement: '',
    statutRaccordement: '', // '' | 'accepté' | 'refusé'
    // Process mairie (déclaration préalable / autorisation d'urbanisme)
    dateEnvoiMairie: '', dateRecepisseMairie: '', dateAccordMairie: '',
    recepisseMairieFileId: '', // PDF du récépissé reçu après dépôt en mairie
    statutMairie: '', // '' | 'accepté' | 'refusé'
    envoisMairie: [], // historique des envois en cas de refus (chaque envoi : { dateEnvoi, dateRecepisse, recepisseFileId, dateReponse, resultat, note })
    // Suivi paiement
    dateControleLivraison: '', dateAppelBanque: '', datePaiementBanque: '',
    tentativesControleLivraison: [], // [{datetime: ISO}] — historique des appels où le client n'a pas répondu pour le contrôle livraison
    // 💰 Récupération TVA pour le client — délai légal 6 mois
    tvaStatus: '', // '' | 'envoyee' | 'recuperee' | 'non_concerne'
    tvaDateDemarche: '', // date où la démarche a été envoyée
    tvaDateRecuperee: '', // date où la TVA a été récupérée
    tvaNotes: '', // notes libres sur la démarche
    nom: '', prenom: '', telephone: '', email: '',
    adresse: '', codePostal: '', ville: '',
    statut: 'A_EN_COURS', statutLocked: false, financement: '',
    montantTotal: '', montantHtCustom: '', tauxTvaVente: 20, payeClient: false, payeClientDate: '',
    // Détails du financement (si financement bancaire — sinon ignoré). Récupérables
    // par scan IA du BC ou saisis à la main.
    montantPret: '', reportMois: '', tauxDebiteur: '', taeg: '',
    nbEcheances: '', montantEcheance: '', periodicite: 'Mensuelle',
    produits: [{ type: '', puissance: 0, description: '', quantite: 1 }],
    puissance: 0, // Puissance totale (somme des puissances solaires) — calculée auto

    fournisseurs: [],
    regies: [], // tableau de régies : { nom, htCustom, paye, datePaye, bl, factureNo, facturePdfUrl }
    // ⚠️ Champs legacy (régie unique) - gardés pour rétrocompat, migrés en regies au chargement
    regie: '', regieHtCustom: '', regiePaye: false, regieDatePaye: '',
    typeRegie: 'externe', // 'externe' | 'interne'
    teleprospecteur: '', teleprospecteurMontant: '', teleprospecteurPaye: false, teleprospecteurDatePaye: '',
    confirmateur: '', confirmateurMontant: '', confirmateurPaye: false, confirmateurDatePaye: '',
    commercial: '', commercialMontant: '', commercialPaye: false, commercialDatePaye: '',
    coordinateurProjet: '', coordinateurProjetMontant: '', coordinateurProjetPaye: false, coordinateurProjetDatePaye: '',
    responsableEnvoiPose: '', responsableEnvoiPoseMontant: '', responsableEnvoiPosePaye: false, responsableEnvoiPoseDatePaye: '',
    provenanceLead: '',
    poseurs: [],
    accordDef: false, consuel: false, observations: '',
    // 🛠️ Instructions libres pour la pose — incluses dans le message envoyé
    // au poseur (WhatsApp/email) en plus du descriptif standard (client,
    // adresse, date, matériel). Ex : 'accès par le portail bleu, pas de
    // gravier dans la cour, prévoir échelle 4m, branchement Linky à droite'.
    instructionsPose: '',
    // 🏠 Caractéristiques de la toiture pour les panneaux solaires
    typeToit: '', // '' | 'tuile' | 'ardoise' | 'tole' | 'zinc' | 'fibro' | 'bac_acier' | 'toit_plat' | 'a_valider'
    orientationPanneaux: '', // '' | 'paysage' | 'portrait' | 'les_deux'
    // ⚖️ Litige client : si statut === 'C_LITIGE', le client réclame un
    // remboursement. La régie qui a apporté le dossier doit nous rembourser
    // ce montant (même mécanique que les pénalités de pose).
    litigeAccordPdfUrl: '', // file ID du PDF accord transactionnel (FactureFileInput)
    litigeMontantRembourse: '', // montant que je dois rendre au client (= que la régie me doit)
    litigeRegieNom: '', // quelle régie doit rembourser (utile si plusieurs)
    litigeRegieRembourse: false, // toggle : la régie m'a remboursé ?
    litigeDateRembourse: '', // date du remboursement par la régie
    litigeFactureNo: '', // N° facture émise pour la régie
    litigeNote: '', // notes libres (motif du litige, contexte)
    historique: [],
    createdBy: '', createdAt: '', modifiedBy: '', modifiedAt: '',
    scannedBon: null, // {dataUrl, name, type, size} si scan IA réussi, sinon null
  };
  const [formData, setFormData] = useState(emptyForm);
  const [sortBy, setSortBy] = useState('statut');
  const [viewMode, setViewMode] = useState('detaille');

  // Chargement initial
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('dossiers-data');
        if (r?.value) {
          const arr = JSON.parse(r.value);
          // Migration : ancien format poseur unique → tableau poseurs + poseursDetail
          const REMOVED_STATUSES = ['I_CONSUEL_OK', 'CONSUEL_OK', 'J_VISITE_CONSUEL', 'M_VISITE_CONSUEL', 'K_ATTENTE_CONSUEL', 'ATTENTE_CONSUEL', 'K2_PROBLEME_CONSUEL', 'M_PROBLEME_CONSUEL', 'M_ATT_DOSSIER', 'ATT_DOSSIER', 'E_PASSE_COMPTANT', 'PASSE_COMPTANT', 'H_NRP_CQ_LIVRAISON', 'G1_ATT_NRP_CL'];
          // Statuts legacy (sans préfixe) → renommés vers leur vrai ID actuel.
          // Avant, le bouton "✗ Refuse" stockait 'ANNULER' sans préfixe ; idem
          // pour des migrations partielles précédentes. On les recolle ici.
          const RENAMED_STATUSES = { 'ANNULER': 'W2_ANNULER', 'DOSSIER_PAYER': 'W_DOSSIER_PAYER', 'DEPOSER': 'W1_DEPOSER', 'ACCEPTE': 'F1_ACCEPTE' };
          const ROLES_KEYS = ['teleprospecteur', 'confirmateur', 'commercial', 'coordinateurProjet', 'responsableEnvoiPose'];
          // Vérifie si tous les paiements d'un dossier sont OK
          const isFullyPaid = (d) => {
            if (!d.payeClient) return false;
            const poseurs = d.poseurs || [];
            if (poseurs.some(p => p.nom && !p.paye)) return false;
            const fournisseurs = d.fournisseurs || [];
            if (fournisseurs.some(f => f.nom && !f.paye)) return false;
            if (d.regie && !d.regiePaye) return false;
            // Multi-régies : toutes payées
            if ((d.regies || []).some(r => r.nom && !r.paye)) return false;
            if (ROLES_KEYS.some(k => d[k] && !d[k + 'Paye'])) return false;
            return true;
          };
          const migrated = arr.map(d => {
            let dossier = d;
            // Migration : statuts legacy (sans préfixe) → ID actuel
            if (dossier.statut && RENAMED_STATUSES[dossier.statut]) {
              dossier = { ...dossier, statut: RENAMED_STATUSES[dossier.statut] };
            }
            // Migration : statuts supprimés → repasser en EN COURS
            if (REMOVED_STATUSES.includes(dossier.statut)) {
              dossier = { ...dossier, statut: 'A_EN_COURS' };
            }
            // ⚠️ NOUVEAU : Désarchive automatiquement les dossiers archivés à tort
            // (statut DOSSIER_PAYER mais paiements pas tous OK)
            // Sauf si l'utilisateur a explicitement archivé manuellement (`manualArchive: true`)
            if (dossier.archived === true && !dossier.manualArchive && !isFullyPaid(dossier)) {
              dossier = { ...dossier, archived: false, archivedAt: null, autoArchived: false };
            }
            // Migration : régie unique → tableau régies
            if (!dossier.regies) {
              if (dossier.regie) {
                dossier = {
                  ...dossier,
                  regies: [{
                    nom: dossier.regie,
                    htCustom: dossier.regieHtCustom || '',
                    paye: dossier.regiePaye || false,
                    datePaye: dossier.regieDatePaye || '',
                    bl: '',
                    factureNo: '',
                    facturePdfUrl: '',
                  }],
                };
              } else {
                dossier = { ...dossier, regies: [] };
              }
            }
            // Migration : format produit unique → tableau produits
            if (!dossier.produits || dossier.produits.length === 0) {
              dossier = {
                ...dossier,
                produits: [{
                  type: dossier.produit || 'PANNEAU_SOLAIRE',
                  puissance: dossier.puissance || 6000,
                  description: '',
                  quantite: 1
                }],
              };
            } else {
              // Migration : ajoute quantite=1 aux produits qui n'en ont pas
              dossier = {
                ...dossier,
                produits: dossier.produits.map(p => ({ ...p, quantite: p.quantite || 1 })),
              };
            }
            if (!dossier.poseurs) {
              if (dossier.poseur) {
                dossier = {
                  ...dossier,
                  poseurs: [{
                    nom: dossier.poseur,
                    htCustom: dossier.poseurHtCustom || '',
                    paye: !!dossier.poseurPaye,
                    datePaye: dossier.poseurDatePaye || ''
                  }],
                  poseursDetail: dossier.poseursDetail || [{
                    nom: dossier.poseur,
                    ht: dossier.poseurHt || 0,
                    ttc: dossier.poseurTtc || 0,
                    paye: !!dossier.poseurPaye,
                    datePaye: dossier.poseurDatePaye || ''
                  }],
                };
              } else {
                dossier = { ...dossier, poseurs: [], poseursDetail: [] };
              }
            }
            // Migration documents poseur sans subCategory → assigner au 1er poseur
            if (dossier.documents?.some(doc => doc.category === 'poseur' && !doc.subCategory)) {
              const firstPoseurName = dossier.poseurs[0]?.nom;
              if (firstPoseurName) {
                dossier = {
                  ...dossier,
                  documents: dossier.documents.map(doc =>
                    doc.category === 'poseur' && !doc.subCategory
                      ? { ...doc, subCategory: firstPoseurName }
                      : doc
                  ),
                };
              }
            }
            // Auto-statut : recalcule le statut workflow depuis l'état du dossier
            // (CQ, envoi banque, accord, date pose, poseur). Idempotent : si le
            // statut est hors cycle (SAV, LITIGE, W2_ANNULER, etc.) ou déjà
            // correct, applyAutoStatut renvoie le dossier inchangé.
            dossier = applyAutoStatut(dossier);
            // Auto-archive de rattrapage : un dossier annulé devrait être archivé.
            // Si on tombe sur un dossier W2_ANNULER non archivé (annulation faite
            // avant la mise en place de l'auto-archive), on l'archive maintenant.
            if (dossier.statut === 'W2_ANNULER' && !dossier.archived) {
              dossier = {
                ...dossier,
                archived: true,
                archivedAt: dossier.archivedAt || new Date().toISOString(),
                autoArchived: true,
                autoArchivedReason: 'annule',
              };
            }
            return dossier;
          });
          setDossiers(migrated);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('statuts-order');
        if (r?.value) {
          const saved = JSON.parse(r.value);
          const allIds = STATUTS.map(s => s.id);
          const valid = saved.filter(id => allIds.includes(id));
          const missing = allIds.filter(id => !valid.includes(id));
          setStatutsOrder([...valid, ...missing]);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('tarifs-poseurs');
        if (r?.value) setTarifsPoseurs(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get('tarifs-regies');
        if (r?.value) setTarifsRegies(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get('poseurs-contacts');
        if (r?.value) {
          const obj = JSON.parse(r.value);
          if (obj && typeof obj === 'object') setPoseursContacts(obj);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('regies-contacts');
        if (r?.value) {
          const obj = JSON.parse(r.value);
          if (obj && typeof obj === 'object') setRegiesContacts(obj);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('email-config');
        if (r?.value) {
          const obj = JSON.parse(r.value);
          if (obj && typeof obj === 'object') setEmailConfig({
            smtpUser: obj.smtpUser || '',
            smtpPass: obj.smtpPass || '',
            fromName: obj.fromName || '',
          });
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('tarifs-internes');
        if (r?.value) setTarifsInternes({ ...TARIFS_INTERNES_DEFAULT, ...JSON.parse(r.value) });
      } catch (e) {}
      try {
        const r = await window.storage.get('noms-internes');
        if (r?.value) setNomsInternes({ ...NOMS_INTERNES_DEFAULT, ...JSON.parse(r.value) });
      } catch (e) {}
      try {
        const r = await window.storage.get('liste-fournisseurs');
        if (r?.value) setListeFournisseurs(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get('tarifs-fournisseurs');
        if (r?.value) {
          const obj = JSON.parse(r.value);
          if (obj && typeof obj === 'object') setTarifsFournisseurs(obj);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('produits');
        if (r?.value) {
          const arr = JSON.parse(r.value);
          if (Array.isArray(arr) && arr.length > 0) setProduits(arr);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('users-list');
        if (r?.value) {
          const arr = JSON.parse(r.value);
          if (Array.isArray(arr)) setUsers(arr);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('societes');
        if (r?.value) {
          const arr = JSON.parse(r.value);
          if (Array.isArray(arr) && arr.length > 0) setSocietes(arr);
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  // Charge le statut OAuth Gmail au démarrage + après le callback OAuth
  // (?gmail_connected=1&gmail_email=xxx dans l'URL → on rafraîchit + alerte)
  useEffect(() => {
    const refreshOAuthStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/gmail-oauth', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const payload = await res.json();
        if (payload?.data) setGmailOAuth(payload.data);
      } catch (e) {}
    };
    refreshOAuthStatus();
    // Gestion du retour callback OAuth
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gmail_connected')) {
        const email = params.get('gmail_email');
        alert(`✅ Gmail connecté : ${email || ''}`);
        // Nettoie l'URL
        window.history.replaceState({}, '', window.location.pathname);
        // Re-charge le statut
        setTimeout(refreshOAuthStatus, 300);
      } else if (params.get('gmail_error')) {
        alert(`❌ Connexion Gmail échouée : ${params.get('gmail_error')}`);
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {}
  }, []);

  // Sauvegardes + backup snapshot par minute (filet de sécurité)
  useEffect(() => {
    if (isInitialMount.current) { if (!loading) isInitialMount.current = false; return; }
    const json = JSON.stringify(dossiers);
    lastWrittenDossiersJson.current = json;
    (async () => {
      try {
        await window.storage.set('dossiers-data', json);
        // 🛡️ Backup snapshot : 1 max par minute (upsert sur la même clé).
        // Permet de remonter dans le temps si data perdue/écrasée.
        // Cleanup auto des backups > 7 jours au chargement de l'app.
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const bkKey = `dossiers-data-bk-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
        await window.storage.set(bkKey, json);
      } catch (e) {}
    })();
  }, [dossiers, loading]);

  // 🧹 Nettoyage des backups > 7 jours, au chargement de l'app (1 fois par session)
  useEffect(() => {
    (async () => {
      try {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        const cutoffKey = `dossiers-data-bk-${cutoff.getUTCFullYear()}${pad(cutoff.getUTCMonth() + 1)}${pad(cutoff.getUTCDate())}${pad(cutoff.getUTCHours())}${pad(cutoff.getUTCMinutes())}`;
        const list = await window.storage.list('dossiers-data-bk-');
        const oldKeys = (list?.keys || []).filter((k) => k < cutoffKey);
        for (const k of oldKeys) {
          try { await window.storage.delete(k); } catch (e) {}
        }
      } catch (e) {}
    })();
  }, []);

  // 🚨 Détection de perte de données : au chargement, on compare le nombre
  // de dossiers actuels avec les snapshots récents. Si un backup contient
  // des dossiers qu'on n'a PLUS dans l'état actuel ET qui ne sont PAS dans
  // la liste des suppressions volontaires (tombstones) → suspect, on alerte.
  // Évite le faux positif quand l'admin a juste supprimé volontairement.
  //
  // ⚠️ ADMIN UNIQUEMENT : seul l'admin peut supprimer/restaurer des dossiers,
  // donc seul lui doit être prompté. Les autres rôles ne voient même pas
  // l'alerte (sinon ils risqueraient de tombstoner par erreur des dossiers
  // qu'ils ne peuvent pas restaurer).
  useEffect(() => {
    if (loading) return;
    if (!isAdmin) return;
    (async () => {
      try {
        // Lecture des tombstones (localIds explicitement supprimés)
        let tombstones = new Set();
        try {
          const tRow = await window.storage.get('dossiers-deleted-tombstones');
          const arr = JSON.parse(tRow?.value || '[]');
          if (Array.isArray(arr)) tombstones = new Set(arr);
        } catch (e) {}

        // Lecture des clés de backup déjà dismissées (pour ne plus alerter dessus)
        let dismissedKeys = new Set();
        try {
          const dRow = await window.storage.get('dossiers-backup-dismissed');
          const arr = JSON.parse(dRow?.value || '[]');
          if (Array.isArray(arr)) dismissedKeys = new Set(arr);
        } catch (e) {}

        const currentIds = new Set(dossiers.map(d => d.localId).filter(Boolean));
        const list = await window.storage.list('dossiers-data-bk-');
        const keys = (list?.keys || []).sort().reverse().slice(0, 20); // 20 plus récents
        // ⏱️ Cap temporel : on n'alerte que sur les backups < 30 min.
        // Au-delà, c'est de l'historique, pas un crash récent.
        const now = Date.now();
        const MAX_AGE_MS = 30 * 60 * 1000;

        for (const k of keys) {
          // Skip si déjà dismissé
          if (dismissedKeys.has(k)) continue;
          // Skip si backup trop vieux
          const ts = k.replace('dossiers-data-bk-', '');
          if (ts.length >= 12) {
            const dateStr = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:00Z`;
            const backupTime = new Date(dateStr).getTime();
            if (!isNaN(backupTime) && (now - backupTime) > MAX_AGE_MS) continue;
          }
          const row = await window.storage.get(k);
          if (!row?.value) continue;
          let arr;
          try { arr = JSON.parse(row.value); } catch (e) { continue; }
          if (!Array.isArray(arr)) continue;

          // Cherche les dossiers présents dans le backup mais ABSENTS de l'état
          // courant ET non tombstoneés (donc pas supprimés volontairement).
          const reallyMissing = arr.filter(d => {
            const lid = d?.localId;
            if (!lid) return false; // sans localId, on ne peut rien tracer
            if (currentIds.has(lid)) return false; // toujours là
            if (tombstones.has(lid)) return false; // suppression volontaire
            return true;
          });

          if (reallyMissing.length > 0) {
            const ts = k.replace('dossiers-data-bk-', '');
            const dt = `${ts.slice(6, 8)}/${ts.slice(4, 6)}/${ts.slice(0, 4)} à ${ts.slice(8, 10)}:${ts.slice(10, 12)} UTC`;
            const noms = reallyMissing.slice(0, 3).map(d => `${d.nom || ''} ${d.prenom || ''}`.trim() || '(sans nom)').join(', ');
            const extra = reallyMissing.length > 3 ? ` +${reallyMissing.length - 3}` : '';
            const restore = window.confirm(
              `⚠️ ALERTE PERTE DE DONNÉES\n\n` +
              `Backup du ${dt} : ${reallyMissing.length} dossier${reallyMissing.length > 1 ? 's' : ''} manquant${reallyMissing.length > 1 ? 's' : ''} (${noms}${extra}).\n\n` +
              `Ces dossiers n'ont PAS été supprimés volontairement (sinon ils seraient dans la liste des tombstones).\n\n` +
              `Veux-tu RESTAURER ce backup ?\n\n` +
              `(Tes données actuelles seront remplacées par celles du backup. ` +
              `Si tu refuses, le CRM continue avec ${dossiers.length} dossiers.)`
            );
            if (restore) {
              setDossiers(arr);
              lastWrittenDossiersJson.current = row.value;
            } else {
              // L'user a refusé → 2 garde-fous pour ne plus l'embêter :
              // 1) Tombstone les localIds manquants (suppressions assumées)
              // 2) Marque CETTE clé de backup comme dismissée (au cas où elle
              //    contient d'autres dossiers déjà supprimés/sans localId)
              try {
                const newTombs = new Set([...tombstones]);
                reallyMissing.forEach(d => { if (d.localId) newTombs.add(d.localId); });
                const arrTombs = [...newTombs];
                const capped = arrTombs.length > 1000 ? arrTombs.slice(-1000) : arrTombs;
                await window.storage.set('dossiers-deleted-tombstones', JSON.stringify(capped));
              } catch (e) { console.warn('[tombstone] dismiss save failed', e); }
              try {
                const newDismissed = new Set([...dismissedKeys, k]);
                const arrD = [...newDismissed];
                const capped = arrD.length > 500 ? arrD.slice(-500) : arrD;
                await window.storage.set('dossiers-backup-dismissed', JSON.stringify(capped));
              } catch (e) { console.warn('[backup-dismiss] save failed', e); }
            }
            return; // on arrête après le 1er backup où on a un soupçon réel
          }
        }
      } catch (e) { console.warn('[safety] backup check failed', e); }
    })();
  }, [loading, isAdmin]);

  // 🔄 Synchronisation temps réel entre appareils — quand un autre device
  // écrit dans dossiers-data, on rafraîchit notre état local pour rester à
  // jour. Évite le scénario 'last writer wins' où un PC ouvert depuis longtemps
  // écrase des dossiers ajoutés depuis le téléphone.
  //
  // ⚠️ Requiert que Realtime soit activé sur la table 'storage' côté Supabase :
  //   ALTER PUBLICATION supabase_realtime ADD TABLE storage;
  // Si pas activé, le subscribe ne reçoit rien — pas de régression, juste
  // pas de sync auto.
  useEffect(() => {
    if (loading) return;
    const channel = supabase
      .channel('dossiers-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'storage', filter: 'key=eq.dossiers-data' },
        (payload) => {
          const newValue = payload?.new?.value;
          if (!newValue) return;
          // Ignore les évènements qui matchent notre propre dernière écriture
          // (sinon boucle infinie : on écrit → realtime → on relit → on écrit…)
          if (newValue === lastWrittenDossiersJson.current) return;
          try {
            const parsed = JSON.parse(newValue);
            if (!Array.isArray(parsed)) return;
            // Met à jour notre état avec ce que l'autre device vient d'écrire.
            // On marque ce JSON comme 'déjà écrit' pour pas le réécrire en boucle.
            lastWrittenDossiersJson.current = newValue;
            setDossiers(parsed);
          } catch (e) {
            console.warn('[realtime dossiers] parse failed', e);
          }
        }
      )
      .subscribe((status, err) => {
        // Logge l'état de la connexion realtime — utile pour diagnostic
        // quand la sync multi-device casse silencieusement.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[realtime dossiers] ${status}`, err || '');
        }
      });
    return () => { try { supabase.removeChannel(channel); } catch (e) {} };
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    window.storage.set('users-list', JSON.stringify(users)).catch(() => {});
  }, [users, loading]);

  // Raccourci clavier Ctrl+K / Cmd+K pour ouvrir la recherche globale
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isInitialOrder.current) { if (!loading) isInitialOrder.current = false; return; }
    window.storage.set('statuts-order', JSON.stringify(statutsOrder)).catch(() => {});
  }, [statutsOrder, loading]);

  useEffect(() => {
    if (isInitialTarifs.current) { if (!loading) isInitialTarifs.current = false; return; }
    // Sauve chaque clé en mémorisant le JSON écrit, pour qu'on puisse ignorer
    // notre propre écho via la subscription Realtime ci-dessous.
    const saveAndTrack = (key, value) => {
      const json = JSON.stringify(value);
      lastWrittenSettings.current[key] = json;
      window.storage.set(key, json).catch(() => {});
    };
    saveAndTrack('tarifs-poseurs', tarifsPoseurs);
    saveAndTrack('tarifs-regies', tarifsRegies);
    saveAndTrack('tarifs-internes', tarifsInternes);
    saveAndTrack('noms-internes', nomsInternes);
    saveAndTrack('liste-fournisseurs', listeFournisseurs);
    saveAndTrack('tarifs-fournisseurs', tarifsFournisseurs);
    saveAndTrack('produits', produits);
    saveAndTrack('poseurs-contacts', poseursContacts);
    saveAndTrack('regies-contacts', regiesContacts);
    saveAndTrack('email-config', emailConfig);
    saveAndTrack('societes', societes);
  }, [tarifsPoseurs, tarifsRegies, tarifsInternes, nomsInternes, listeFournisseurs, tarifsFournisseurs, produits, poseursContacts, regiesContacts, emailConfig, societes, loading]);

  // 🔄 Sync Realtime sur les clés de réglages (contacts régies/poseurs,
  // tarifs, email config, etc.). Évite qu'un device avec un état stale
  // écrase silencieusement les modifs faites depuis un autre device.
  useEffect(() => {
    if (loading) return;
    const SYNCED_KEYS = {
      'tarifs-poseurs': setTarifsPoseurs,
      'tarifs-regies': setTarifsRegies,
      'tarifs-internes': setTarifsInternes,
      'noms-internes': setNomsInternes,
      'liste-fournisseurs': setListeFournisseurs,
      'tarifs-fournisseurs': setTarifsFournisseurs,
      'produits': setProduits,
      'poseurs-contacts': setPoseursContacts,
      'regies-contacts': setRegiesContacts,
      'email-config': setEmailConfig,
    };
    const channel = supabase
      .channel('settings-sync')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'storage' },
        (payload) => {
          const key = payload?.new?.key;
          const newValue = payload?.new?.value;
          if (!key || !newValue) return;
          const setter = SYNCED_KEYS[key];
          if (!setter) return;
          // Ignore notre propre écho
          if (newValue === lastWrittenSettings.current[key]) return;
          try {
            const parsed = JSON.parse(newValue);
            lastWrittenSettings.current[key] = newValue;
            setter(parsed);
          } catch (e) {
            console.warn(`[realtime settings] parse failed for ${key}`, e);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[realtime settings] ${status}`, err || '');
        }
      });
    return () => { try { supabase.removeChannel(channel); } catch (e) {} };
  }, [loading]);

  // Si l'utilisateur n'a pas accès à l'onglet courant, retour aux dossiers
  useEffect(() => {
    if (activeTab === 'paiements' && !permissions.voirRapportPaiements) setActiveTab('dossiers');
    if (activeTab === 'dashboard' && !permissions.voirDashboard) setActiveTab('dossiers');
    if (activeTab === 'reglages' && !permissions.voirReglages) setActiveTab('dossiers');
  }, [permissions, activeTab]);

  // Persiste l'onglet courant dans le hash URL pour que F5 / refresh garde
  // la position. On préserve la sous-section après '/' (gérée dans ReglagesView).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = window.location.hash.replace(/^#/, '');
    const sub = current.includes('/') ? '/' + current.split('/').slice(1).join('/') : '';
    const target = activeTab + sub;
    if (current !== target) {
      window.history.replaceState(null, '', `#${target}`);
    }
  }, [activeTab]);

  // Écoute le bouton retour navigateur pour resync activeTab depuis le hash.
  useEffect(() => {
    const onPop = () => {
      const h = window.location.hash.replace(/^#/, '').split('/')[0];
      if (h && VALID_TABS.includes(h) && h !== activeTab) setActiveTab(h);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [activeTab]);

  // 🏢 Persiste la société active dans le hash URL (?soc=yolico).
  // F5 / refresh garde le filtre société courant.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash.replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const params = new URLSearchParams(queryPart || '');
    if (activeSociete) params.set('soc', activeSociete);
    else params.delete('soc');
    const newHash = pathPart + (params.toString() ? '?' + params.toString() : '');
    if (raw !== newHash) window.history.replaceState(null, '', `#${newHash}`);
  }, [activeSociete]);

  const STATUTS_ORDERED = useMemo(() => statutsOrder.map(id => STATUTS.find(s => s.id === id)).filter(Boolean), [statutsOrder]);

  // Calculs auto
  const calculs = useMemo(() => {
    // Calcule la puissance totale (somme des puissances des produits solaires)
    const produitsList = formData.produits || [];
    const solarProducts = produitsList.filter(p => findProduit(produits, p.type).autoTarif);
    const totalPuissance = solarProducts.reduce((s, p) => s + (parseInt(p.puissance) || 0), 0);

    // Calcule l'auto-tarif d'un prestataire en sommant tous les produits du dossier
    const computeAutoTarif = (tarifsPrestataire) => {
      if (!tarifsPrestataire) return 0;
      return produitsList.reduce((sum, p) => {
        const prodInfo = findProduit(produits, p.type);
        if (prodInfo.autoTarif) {
          // Produit solaire — grille Wc (pas de quantité)
          return sum + findClosestTarif(tarifsPrestataire, parseInt(p.puissance) || 0);
        }
        // Autre produit — prix unitaire × quantité
        const unitPrice = parseFloat(tarifsPrestataire[p.type]) || 0;
        const qty = parseInt(p.quantite) || 1;
        return sum + (unitPrice * qty);
      }, 0);
    };

    const montantTotal = parseFloat(formData.montantTotal) || 0;
    const tauxTvaForm = parseFloat(formData.tauxTvaVente) || 20;
    const montantHt = formData.montantHtCustom !== '' ? (parseFloat(formData.montantHtCustom) || 0) : montantTotal / (1 + tauxTvaForm / 100);
    const tvaVente = montantTotal - montantHt;
    const tauxTva = montantHt > 0 ? ((tvaVente / montantHt) * 100) : 0;

    const fournisseursDetail = (formData.fournisseurs || []).map(f => {
      const tarifWc = parseFloat(tarifsFournisseurs?.[f.nom]) || 0;
      const autoHt = tarifWc > 0 && totalPuissance > 0 ? tarifWc * totalPuissance : 0;
      const ht = (f.htCustom !== '' && f.htCustom !== undefined && f.htCustom !== null) ? (parseFloat(f.htCustom) || 0) : autoHt;
      return { nom: f.nom, ht, ttc: computeTtcPresta(ht, !!f.sansTva, f.tauxTva), sansTva: !!f.sansTva, paye: !!f.paye, datePaye: f.datePaye || '', autoHt, tarifWc, bl: f.bl || '', factureNo: f.factureNo || '', facturePdfUrl: f.facturePdfUrl || '' };
    });
    const fournisseurHt = fournisseursDetail.reduce((s, f) => s + f.ht, 0);
    const fournisseurTtc = fournisseursDetail.reduce((s, f) => s + f.ttc, 0);

    const regiesDetail = (formData.regies || []).map(r => {
      const autoHt = computeAutoTarif(tarifsRegies[r.nom]);
      const ht = r.htCustom !== '' ? (parseFloat(r.htCustom) || 0) : autoHt;
      return { nom: r.nom, ht, ttc: computeTtcPresta(ht, !!r.sansTva, r.tauxTva), sansTva: !!r.sansTva, paye: !!r.paye, datePaye: r.datePaye || '', autoHt, bl: r.bl || '', factureNo: r.factureNo || '', facturePdfUrl: r.facturePdfUrl || '' };
    });
    const regieHt = regiesDetail.reduce((s, r) => s + r.ht, 0);
    const regieTtc = regiesDetail.reduce((s, r) => s + r.ttc, 0);
    const regieAutoHt = regiesDetail[0]?.autoHt || 0;

    const poseursDetail = (formData.poseurs || []).map(p => {
      const autoHt = computeAutoTarif(tarifsPoseurs[p.nom]);
      const ht = p.htCustom !== '' ? (parseFloat(p.htCustom) || 0) : autoHt;
      // Poseurs : jamais de TVA (toujours HT). TTC = HT.
      return { nom: p.nom, ht, ttc: ht, sansTva: true, paye: !!p.paye, datePaye: p.datePaye || '', autoHt, bl: p.bl || '', factureNo: p.factureNo || '', facturePdfUrl: p.facturePdfUrl || '' };
    });
    const poseurHt = poseursDetail.reduce((s, p) => s + p.ht, 0);
    const poseurTtc = poseursDetail.reduce((s, p) => s + p.ttc, 0);

    const margeTtc = montantTotal - fournisseurTtc - regieTtc - poseurTtc;
    const margeHt = montantHt - fournisseurHt - regieHt - poseurHt;
    const tva = margeTtc - margeHt;

    // useAutoTarif : indique si AU MOINS un produit a un tarif auto défini quelque part
    const hasAnyAutoTarif = regiesDetail.some(r => r.autoHt > 0) || poseursDetail.some(p => p.autoHt > 0);

    return { montantTotal, montantHt, tvaVente, tauxTva, fournisseursDetail, fournisseurHt, fournisseurTtc, regiesDetail, regieHt, regieAutoHt, regieTtc, poseursDetail, poseurHt, poseurTtc, margeTtc, margeHt, tva, puissance: totalPuissance, useAutoTarif: hasAnyAutoTarif, computeAutoTarif };
  }, [formData, tarifsPoseurs, tarifsRegies, produits, tarifsFournisseurs]);

  const resetForm = () => { setFormData(emptyForm); setEditingId(null); setShowForm(false); };

  const handleSubmit = () => {
    if (!formData.nom.trim()) {
      // Avant : return silencieux → l'user clique "Enregistrer" et ne sait
      // pas pourquoi rien ne se passe. Maintenant on signale l'erreur.
      alert("❌ Le nom du client est obligatoire pour créer ou modifier un dossier.");
      // Tente de focuser le champ Nom pour aider l'user.
      try {
        const nomInput = document.querySelector('input[placeholder*="Nom" i], input[name="nom"]');
        if (nomInput && typeof nomInput.focus === 'function') nomInput.focus();
      } catch (e) {}
      return;
    }
    let dossier = { ...formData, ...calculs, savedAt: new Date().toISOString() };
    // Auto-statut : si le statut courant est dans le cycle workflow, on le
    // recalcule depuis l'état du dossier (CQ, envoi banque, retour, etc.).
    dossier = applyAutoStatut(dossier);
    // Auto-archivage / désarchivage selon ANNULER (cohérent avec QuickView)
    if (dossier.statut === 'W2_ANNULER' && !dossier.archived) {
      dossier.archived = true;
      dossier.archivedAt = new Date().toISOString();
      dossier.autoArchived = true;
      dossier.autoArchivedReason = 'annule';
    } else if (dossier.statut !== 'W2_ANNULER' && dossier.archived && dossier.autoArchivedReason === 'annule') {
      dossier.archived = false;
      dossier.archivedAt = null;
      dossier.autoArchived = false;
      dossier.autoArchivedReason = null;
    }
    const userTag = currentUser || '(anonyme)';

    // Construit l'historique des changements de statut
    const now = new Date().toISOString();
    if (editingId) {
      const old = dossiers.find(d => d.localId === editingId);
      const oldHist = old?.historique || [];
      // 📜 Diff de tous les champs modifiés (hors métadonnées et hors statut).
      // Une entrée d'historique unique par save, regroupant tous les changements.
      const SKIP_FIELDS = new Set([
        'statut', 'historique', 'savedAt', 'modifiedBy', 'modifiedAt',
        'createdBy', 'createdAt', 'documents',
        // Calculs dérivés (recalculés à chaque save, pas des choix user)
        'montantTotal', 'montantHt', 'tvaVente', 'tauxTva', 'fournisseursDetail',
        'fournisseurHt', 'fournisseurTtc', 'regiesDetail', 'regieHt', 'regieAutoHt',
        'regieTtc', 'poseursDetail', 'poseurHt', 'poseurTtc', 'margeTtc', 'margeHt',
        'tva', 'puissance', 'useAutoTarif', 'computeAutoTarif',
      ]);
      const fieldChanges = [];
      if (old) {
        for (const key of Object.keys(dossier)) {
          if (SKIP_FIELDS.has(key)) continue;
          const before = old[key];
          const after = dossier[key];
          if (JSON.stringify(before) === JSON.stringify(after)) continue;
          fieldChanges.push({ field: key, from: before, to: after });
        }
      }
      let newHist = oldHist;
      if (fieldChanges.length > 0) {
        newHist = [...newHist, { date: now, action: 'modification', user: userTag, changes: fieldChanges }];
      }
      // Ajoute une entrée si le statut a changé
      if (old && old.statut !== dossier.statut) {
        newHist = [...newHist, { date: now, from: old.statut, to: dossier.statut, action: 'changement_statut', user: userTag, bizDate: statutMilestoneDate(dossier, old.statut, dossier.statut) }];
      }
      dossier.historique = newHist;
      dossier.modifiedBy = userTag;
      dossier.modifiedAt = now;
      // Préserve createdBy si déjà présent
      dossier.createdBy = old?.createdBy || userTag;
      dossier.createdAt = old?.createdAt || now;
      setDossiers(dossiers.map(d => d.localId === editingId ? { ...d, ...dossier, documents: d.documents || [] } : d));
      showToast(`✓ Dossier ${dossier.nom || ''} ${dossier.prenom || ''} sauvegardé`, 'success');
    } else {
      // Nouveau dossier — première entrée d'historique = création
      dossier.historique = [{ date: now, from: null, to: dossier.statut, action: 'création', user: userTag }];
      dossier.createdBy = userTag;
      dossier.createdAt = now;
      dossier.modifiedBy = userTag;
      dossier.modifiedAt = now;
      const newLocalId = Date.now().toString();
      // Si l'utilisateur a scanné un bon de commande, on l'attache comme
      // document client. Le fichier est déjà dans le bucket Supabase Storage
      // (uploadé pendant le scan), on reprend juste son ID et son path.
      let initialDocs = [];
      const bon = dossier.scannedBon;
      if (bon && bon.fileId && bon.bucketPath) {
        initialDocs.push({
          id: bon.fileId,
          name: bon.name,
          size: bon.size,
          type: bon.type,
          storage: 'bucket',
          storagePath: bon.bucketPath,
          category: 'client',
          subCategory: null,
          uploadedAt: now,
          montant: null,
          datePiece: null,
          note: '📸 Importé par scan IA du bon de commande',
        });
      } else if (bon && bon.dataUrl) {
        // Compat ascendante : ancien format (dataUrl inline) — fallback KV
        const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        window.storage.set(`file:${fileId}`, JSON.stringify({ dataUrl: bon.dataUrl, name: bon.name, type: bon.type })).catch(() => {});
        initialDocs.push({
          id: fileId,
          name: bon.name,
          size: bon.size,
          type: bon.type,
          storage: 'kv',
          category: 'client',
          subCategory: null,
          uploadedAt: now,
          montant: null,
          datePiece: null,
          note: '📸 Importé par scan IA du bon de commande',
        });
      }
      // Si l'utilisateur a scanné un dossier complet multi-pages, chaque section
      // découpée par l'IA devient un document séparé avec sa sous-catégorie.
      const sections = Array.isArray(dossier.scannedSections) ? dossier.scannedSections : [];
      sections.forEach(s => {
        if (!s.fileId || !s.bucketPath) return;
        initialDocs.push({
          id: s.fileId,
          name: s.name,
          size: s.size,
          type: s.type,
          storage: 'bucket',
          storagePath: s.bucketPath,
          // sharedFile = true uniquement en fallback (pdf-lib serveur en panne) :
          // dans ce cas plusieurs docs partagent le même bucketPath et on a un
          // bookmark de page. Si standalone, chaque section a son propre PDF.
          sharedFile: !s.standalone,
          pageStart: s.standalone ? null : (s.pageStart || null),
          pageEnd: s.standalone ? null : (s.pageEnd || null),
          category: 'client',
          subCategory: s.subCategory || null,
          uploadedAt: now,
          montant: null,
          datePiece: null,
          note: s.note || `📂 ${s.label || ''}`,
          // 🚨 Verdict anti-fraude IA persisté sur le document
          fraudRisk: s.fraudRisk || 'low',
          fraudFlags: Array.isArray(s.fraudFlags) ? s.fraudFlags : [],
        });
      });
      // PDF d'origine du scan dossier complet : conservé comme document
      // "Dossier complet" pour pouvoir le revoir en entier (panneau côte à
      // côte) et être nettoyé avec le dossier. scanDossierPdfId mémorise son
      // id pour que le panneau le retrouve en priorité.
      const dossierPdf = dossier.scannedDossierPdf;
      if (dossierPdf && dossierPdf.bucketPath && sections.length > 0) {
        const origPdfId = `${Date.now()}_origpdf`;
        initialDocs.push({
          id: origPdfId,
          name: dossierPdf.name || 'dossier-complet.pdf',
          size: 0,
          type: 'application/pdf',
          storage: 'bucket',
          storagePath: dossierPdf.bucketPath,
          category: 'client',
          subCategory: null,
          uploadedAt: now,
          montant: null,
          datePiece: null,
          note: '📄 Dossier complet scanné (PDF original)',
          isScanSourcePdf: true,
        });
        dossier.scanDossierPdfId = origPdfId;
      }
      // Persiste les métadonnées PDF anti-fraude sur le dossier (utile pour
      // afficher 'PDF édité après création' dans la modale Documents).
      if (dossier.pdfMeta) {
        dossier.scanPdfMeta = dossier.pdfMeta;
      }
      // On retire scannedBon/scannedSections/pdfMeta du dossier persisté (transport seulement)
      delete dossier.scannedBon;
      delete dossier.scannedSections;
      delete dossier.scannedDossierPdf;
      delete dossier.pdfMeta;
      setDossiers([{ ...dossier, localId: newLocalId, documents: initialDocs }, ...dossiers]);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1500);
      showToast(`✨ Dossier ${dossier.nom || ''} ${dossier.prenom || ''} créé`, 'success');
    }
    resetForm();
  };

  const startEdit = (d) => {
    setFormData({
      id: d.id || '', dateInsta: d.dateInsta || new Date().toISOString().split('T')[0],
      dateSignature: d.dateSignature || '',
      societe: d.societe || activeSociete || (societes[0]?.id || ''),
      dateAccord: d.dateAccord || '', dateConsuel: d.dateConsuel || '',
      dateControleQualite: d.dateControleQualite || '', statutControleQualite: d.statutControleQualite || '',
      creditsClientCQ: Array.isArray(d.creditsClientCQ)
        ? d.creditsClientCQ
        : (d.montantCreditClientCQ ? [{ type: 'autre', montant: String(d.montantCreditClientCQ) }] : []),
      vocalCQUrl: d.vocalCQUrl || '',
      vocalCQStoragePath: d.vocalCQStoragePath || '',
      onoffCallMeta: d.onoffCallMeta || null,
      tentativesCQ: d.tentativesCQ || [],
      dateEnvoiFin: d.dateEnvoiFin || '', dateRetourFin: d.dateRetourFin || '',
      statutFin: d.statutFin || '',
      motifManqueDoc: d.motifManqueDoc || '',
      dateNotifRegie: d.dateNotifRegie || '',
      dateRecuRegie: d.dateRecuRegie || '',
      dateRenvoiDocs: d.dateRenvoiDocs || '',
      envoisHistorique: d.envoisHistorique || [],
      dateEnvoiPose: d.dateEnvoiPose || '', dateVisitePose: d.dateVisitePose || '',
      statutPose: d.statutPose || '',
      tentativesPose: d.tentativesPose || [],
      dateRecusOriginauxPoseur: d.dateRecusOriginauxPoseur || '',
      dateEnvoiOriginauxBanque: d.dateEnvoiOriginauxBanque || '',
      dateRecusOriginauxBanque: d.dateRecusOriginauxBanque || '',
      pasOriginauxRequis: d.pasOriginauxRequis || false,
      dateEnvoiConsuel: d.dateEnvoiConsuel || '', dateAccordConsuel: d.dateAccordConsuel || '',
      statutConsuel: d.statutConsuel || '',
      visitesConsuel: d.visitesConsuel || [],
      dateEnvoiRaccordement: d.dateEnvoiRaccordement || '', dateAccordRaccordement: d.dateAccordRaccordement || '',
      statutRaccordement: d.statutRaccordement || '',
      dateEnvoiMairie: d.dateEnvoiMairie || '', dateRecepisseMairie: d.dateRecepisseMairie || '', dateAccordMairie: d.dateAccordMairie || '',
      recepisseMairieFileId: d.recepisseMairieFileId || '',
      statutMairie: d.statutMairie || '',
      envoisMairie: d.envoisMairie || [],
      dateControleLivraison: d.dateControleLivraison || '', dateAppelBanque: d.dateAppelBanque || '', datePaiementBanque: d.datePaiementBanque || '',
      tentativesControleLivraison: d.tentativesControleLivraison || [],
      tvaStatus: d.tvaStatus || '',
      tvaDateDemarche: d.tvaDateDemarche || '',
      tvaDateRecuperee: d.tvaDateRecuperee || '',
      tvaNotes: d.tvaNotes || '',
      nom: d.nom || '', prenom: d.prenom || '',
      telephone: d.telephone || '', email: d.email || '',
      adresse: d.adresse || '', codePostal: d.codePostal || '', ville: d.ville || '',
      statut: d.statut || 'M_ATT_DOSSIER', statutLocked: !!d.statutLocked, financement: d.financement || 'PROJEXIO',
      montantTotal: d.montantTotal?.toString() || '', montantHtCustom: d.montantHtCustom || '', tauxTvaVente: d.tauxTvaVente || 20,
      payeClient: d.payeClient || false, payeClientDate: d.payeClientDate || '',
      montantPret: d.montantPret || '', reportMois: d.reportMois || '',
      tauxDebiteur: d.tauxDebiteur || '', taeg: d.taeg || '',
      nbEcheances: d.nbEcheances || '', montantEcheance: d.montantEcheance || '',
      periodicite: d.periodicite || 'Mensuelle',
      produits: d.produits?.length > 0
        ? d.produits.map(p => ({ type: p.type, puissance: p.puissance || 0, description: p.description || '', quantite: p.quantite || 1 }))
        : [{ type: d.produit || 'PANNEAU_SOLAIRE', puissance: d.puissance || 6000, description: '', quantite: 1 }],
      puissance: d.puissance || 6000,
      fournisseurs: d.fournisseurs?.length > 0
        ? d.fournisseurs.map(f => ({ nom: f.nom, htCustom: f.htCustom || '', paye: f.paye || false, datePaye: f.datePaye || '', bl: f.bl || '', factureNo: f.factureNo || '', facturePdfUrl: f.facturePdfUrl || '' }))
        : [],
      regie: d.regie || '', regieHtCustom: d.regieHtCustom || '',
      regies: (d.regies && d.regies.length > 0)
        ? d.regies.map(r => ({ nom: r.nom || '', htCustom: r.htCustom || '', paye: r.paye || false, datePaye: r.datePaye || '', bl: r.bl || '', factureNo: r.factureNo || '', facturePdfUrl: r.facturePdfUrl || '' }))
        : (d.regie ? [{ nom: d.regie, htCustom: d.regieHtCustom || '', paye: d.regiePaye || false, datePaye: d.regieDatePaye || '', bl: '', factureNo: '', facturePdfUrl: '' }] : []),
      typeRegie: d.typeRegie || (d.regie ? 'externe' : 'externe'),
      teleprospecteur: d.teleprospecteur || '',
      teleprospecteurMontant: d.teleprospecteurMontant || '',
      teleprospecteurPaye: d.teleprospecteurPaye || false,
      teleprospecteurDatePaye: d.teleprospecteurDatePaye || '',
      confirmateur: d.confirmateur || '',
      confirmateurMontant: d.confirmateurMontant || '',
      confirmateurPaye: d.confirmateurPaye || false,
      confirmateurDatePaye: d.confirmateurDatePaye || '',
      commercial: d.commercial || '',
      commercialMontant: d.commercialMontant || '',
      commercialPaye: d.commercialPaye || false,
      commercialDatePaye: d.commercialDatePaye || '',
      coordinateurProjet: d.coordinateurProjet || '',
      coordinateurProjetMontant: d.coordinateurProjetMontant || '',
      coordinateurProjetPaye: d.coordinateurProjetPaye || false,
      coordinateurProjetDatePaye: d.coordinateurProjetDatePaye || '',
      responsableEnvoiPose: d.responsableEnvoiPose || '',
      responsableEnvoiPoseMontant: d.responsableEnvoiPoseMontant || '',
      responsableEnvoiPosePaye: d.responsableEnvoiPosePaye || false,
      responsableEnvoiPoseDatePaye: d.responsableEnvoiPoseDatePaye || '',
      provenanceLead: d.provenanceLead || '',
      regiePaye: d.regiePaye || false, regieDatePaye: d.regieDatePaye || '',
      poseurs: d.poseurs?.length > 0
        ? d.poseurs.map(p => ({ nom: p.nom, htCustom: p.htCustom || '', paye: p.paye || false, datePaye: p.datePaye || '', bl: p.bl || '', factureNo: p.factureNo || '', facturePdfUrl: p.facturePdfUrl || '' }))
        : (d.poseur
            ? [{ nom: d.poseur, htCustom: d.poseurHtCustom || '', paye: d.poseurPaye || false, datePaye: d.poseurDatePaye || '', bl: '', factureNo: '', facturePdfUrl: '' }]
            : []),
      accordDef: d.accordDef || false, consuel: d.consuel || false,
      observations: d.observations || '',
      instructionsPose: d.instructionsPose || '',
      typeToit: d.typeToit || '',
      orientationPanneaux: d.orientationPanneaux || '',
      litigeAccordPdfUrl: d.litigeAccordPdfUrl || '',
      litigeMontantRembourse: d.litigeMontantRembourse || '',
      litigeRegieNom: d.litigeRegieNom || '',
      litigeRegieRembourse: d.litigeRegieRembourse || false,
      litigeDateRembourse: d.litigeDateRembourse || '',
      litigeFactureNo: d.litigeFactureNo || '',
      litigeNote: d.litigeNote || '',
      historique: d.historique || [],
      createdBy: d.createdBy || '', createdAt: d.createdAt || '',
      modifiedBy: d.modifiedBy || '', modifiedAt: d.modifiedAt || '',
    });
    setEditingId(d.localId);
    setShowForm(true);
  };

  // Suppression d'un dossier + nettoyage des fichiers associés (admin uniquement)
  const deleteDossier = async (id) => {
    if (!isAdmin) {
      alert('🔒 Suppression réservée à l\'admin.');
      return;
    }
    const d = dossiers.find(x => x.localId === id);
    if (!window.confirm(`Supprimer le dossier ${d?.nom || ''} ?${d?.documents?.length ? ` (${d.documents.length} document(s) seront aussi supprimés)` : ''}`)) return;
    if (d?.documents?.length) {
      // Plusieurs documents peuvent partager le même bucketPath (scan dossier
      // complet) — on dédoublonne pour ne supprimer chaque fichier physique
      // qu'une seule fois.
      const bucketPathsToDelete = new Set();
      const kvIdsToDelete = new Set();
      for (const doc of d.documents) {
        if (doc.storage === 'bucket' && doc.storagePath) {
          bucketPathsToDelete.add(doc.storagePath);
        } else {
          kvIdsToDelete.add(doc.id);
        }
      }
      for (const path of bucketPathsToDelete) {
        try { await deleteFileFromBucket(path); } catch (e) {}
      }
      for (const id of kvIdsToDelete) {
        try { await window.storage.delete(`file:${id}`); } catch (e) {}
      }
    }
    // 🪦 Tombstone : on persiste le localId du dossier explicitement supprimé
    // pour que la détection de perte de données ne le considère pas comme
    // un dossier 'manquant' aux prochains démarrages. Sinon faux positif :
    // 'tu as 10 dossiers mais le backup en a 11' alors que le user a juste
    // supprimé volontairement.
    try {
      const existing = await window.storage.get('dossiers-deleted-tombstones');
      let list = [];
      try { list = JSON.parse(existing?.value || '[]'); } catch (e) {}
      if (!Array.isArray(list)) list = [];
      if (!list.includes(id)) list.push(id);
      // Cap à 1000 pour pas que la liste grossisse à l'infini
      if (list.length > 1000) list = list.slice(-1000);
      await window.storage.set('dossiers-deleted-tombstones', JSON.stringify(list));
    } catch (e) { console.warn('[tombstone] save failed', e); }
    setDossiers(dossiers.filter(x => x.localId !== id));
  };

  // Mise à jour ciblée d'un dossier (utilisé par le modal documents)
  const updateDossier = (updated) => {
    setDossiers(prev => prev.map(d => d.localId === updated.localId ? updated : d));
  };

  const copyToClipboard = (d) => {
    const statutLabel = STATUTS.find(s => s.id === d.statut)?.label || '';
    const ligne = ['Voir', d.id || '', formatDateForSheet(d.dateInsta), d.accordDef ? 'TRUE' : 'FALSE', d.consuel ? 'TRUE' : 'FALSE', statutLabel, '', d.nom?.toUpperCase() || '', d.prenom?.toUpperCase() || '', '', d.financement, formatEuro(d.montantTotal), formatEuro(d.montantTotal), formatEuro(d.montantHt), '', '', d.payeClient ? 'PAYER' : 'PAS PAYER', d.payeClient ? 'TRUE' : 'FALSE', d.puissance, 500].join('\t');
    navigator.clipboard.writeText(ligne).then(() => {
      setCopiedId(d.localId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const exportCSV = () => {
    if (!isAdmin) {
      alert('🔒 Export réservé à l\'admin.');
      return;
    }
    if (dossiers.length === 0) return;
    const headers = ['ID', 'Date', 'Nom', 'Prénom', 'Tél', 'Email', 'Ville', 'Statut', 'Financement', 'Prix vente TTC', 'Prix vente HT', 'TVA %', 'Puissance', 'Fournisseurs', 'Total fourn TTC', 'Régie', 'Régie TTC', 'Poseurs', 'Total poseur TTC', 'Marge TTC', 'Marge HT', 'Documents'];
    const rows = dossiers.map(d => {
      const statutLabel = STATUTS.find(s => s.id === d.statut)?.label || '';
      const fournLabel = (d.fournisseursDetail || []).map(f => `${f.nom} (${f.ht.toFixed(2)} HT)`).join(' + ');
      const poseurLabel = (d.poseursDetail || []).map(p => `${p.nom} (${p.ht.toFixed(2)} HT)`).join(' + ');
      return [d.id, formatDateForSheet(d.dateInsta), d.nom, d.prenom, d.telephone || '', d.email || '', d.ville || '', statutLabel, d.financement, d.montantTotal, d.montantHt?.toFixed(2), d.tauxTva?.toFixed(2) + '%', d.puissance, fournLabel, d.fournisseurTtc?.toFixed(2), d.regie, d.regieTtc?.toFixed(2), poseurLabel, d.poseurTtc?.toFixed(2), d.margeTtc?.toFixed(2), d.margeHt?.toFixed(2), (d.documents || []).length];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossiers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 📊 Export comptable : génère le grand livre — UN seul fichier CSV par
  // société (jamais de mélange Yolico/Elsun). Chaque fichier est organisé
  // en comptes par tiers : un poseur / régie / fournisseur / commission
  // interne = un compte, listant tout ce qu'on lui doit (dossier par
  // dossier, avec N° facture), ce qui est réglé, et son solde restant.
  const exportComptable = () => {
    if (!isAdmin && currentUserRole !== 'compta') {
      alert('🔒 Export comptable réservé à l\'admin et à la compta.');
      return;
    }
    if (dossiersEnriched.length === 0) {
      alert('Aucun dossier à exporter.');
      return;
    }
    const stamp = new Date().toISOString().split('T')[0];
    const fmt = (n) => (typeof n === 'number' && !isNaN(n)) ? n.toFixed(2).replace('.', ',') : '';
    const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const toCsv = (rows) => '﻿' + rows.map(r => r.map(escapeCsv).join(';')).join('\n');

    // ─── Découpage par société ───────────────────────────────────────────
    // L'export ne mélange jamais Yolico et Elsun dans un même fichier.
    // Si une société est active dans le filtre du haut, on n'exporte qu'elle.
    // Sinon, chaque société a son propre jeu de 3 CSV.
    const groupes = [];
    if (activeSociete) {
      const soc = societes.find(s => s.id === activeSociete);
      groupes.push({ id: activeSociete, label: soc?.label || activeSociete, dossiers: dossiersEnriched.filter(d => d.societe === activeSociete) });
    } else {
      societes.forEach(soc => {
        groupes.push({ id: soc.id, label: soc.label || soc.id, dossiers: dossiersEnriched.filter(d => d.societe === soc.id) });
      });
      // Filet de sécurité : dossiers rattachés à aucune société connue.
      const knownIds = new Set(societes.map(s => s.id));
      const orphelins = dossiersEnriched.filter(d => !knownIds.has(d.societe || ''));
      if (orphelins.length > 0) groupes.push({ id: 'sans-societe', label: 'Sans société', dossiers: orphelins });
    }

    // Construit LE grand livre comptable d'une société : un seul fichier,
    // organisé en COMPTES PAR TIERS. Chaque poseur / régie / fournisseur /
    // commission interne a son propre compte = la liste de tout ce qu'on
    // lui doit, dossier par dossier, avec le N° de facture, ce qui est
    // réglé ou non, et un total (dû / payé / reste à payer).
    const buildGrandLivre = (dossiersSub, sufx, socLabel) => {
      // Regroupe les sommes dues par tiers (clé = catégorie + nom).
      const comptes = new Map();
      const ajoute = (categorie, ordreCat, nom, d, factureNo, ht, ttc, paye, datePaye) => {
        if (!nom || !String(nom).trim()) return;
        const key = categorie + '||' + nom;
        if (!comptes.has(key)) comptes.set(key, { categorie, ordreCat, nom, lignes: [], totHt: 0, totTtc: 0, payeTtc: 0 });
        const c = comptes.get(key);
        c.lignes.push({
          dossierId: d.id || '',
          client: `${d.nom || ''} ${d.prenom || ''}`.trim(),
          datePose: formatDateForSheet(d.dateInsta),
          factureNo: factureNo || '',
          ht: ht || 0, ttc: ttc || 0,
          paye: !!paye, datePaye: formatDateForSheet(datePaye),
        });
        c.totHt += ht || 0;
        c.totTtc += ttc || 0;
        if (paye) c.payeTtc += ttc || 0;
      };
      dossiersSub.forEach(d => {
        (d.poseursDetail || []).forEach(p => ajoute('Poseur', 1, p.nom, d, p.factureNo, p.ht, p.ttc, p.paye, p.datePaye));
        (d.regiesDetail || []).forEach(r => ajoute('Régie', 2, r.nom, d, r.factureNo, r.ht, r.ttc, r.paye, r.datePaye));
        (d.fournisseursDetail || []).forEach(f => ajoute('Fournisseur', 3, f.nom, d, f.factureNo, f.ht, f.ttc, f.paye, f.datePaye));
        ROLES_INTERNES.forEach(role => {
          const nom = d[role.key];
          if (!nom) return;
          const m = d[role.key + 'Montant'];
          const tarif = (m !== '' && m !== undefined && m !== null) ? parseFloat(m) : (tarifsInternes[role.key] || 0);
          if (tarif <= 0) return;
          // Équipe interne : pas de N° facture (pas de facturation).
          ajoute(role.label, 4, nom, d, '', tarif, tarif, !!d[role.key + 'Paye'], d[role.key + 'DatePaye']);
        });
      });
      // Tri : poseurs, puis régies, puis fournisseurs, puis interne ; par nom.
      const comptesList = [...comptes.values()].sort((a, b) =>
        a.ordreCat !== b.ordreCat ? a.ordreCat - b.ordreCat : a.nom.localeCompare(b.nom));

      const rows = [['Tiers', 'Catégorie', 'N° BC dossier', 'Client', 'Date pose',
        'N° facture', 'Montant HT', 'Montant TTC', 'Règlement', 'Date règlement']];
      let gTotHt = 0, gTotTtc = 0, gPayeTtc = 0;
      comptesList.forEach(c => {
        c.lignes.forEach(l => {
          rows.push([c.nom, c.categorie, l.dossierId, l.client, l.datePose,
            l.factureNo, fmt(l.ht), fmt(l.ttc), l.paye ? 'Réglé' : 'À payer', l.datePaye]);
        });
        const reste = c.totTtc - c.payeTtc;
        // Ligne de total du compte : dû / payé / reste à payer.
        rows.push([c.nom, '► TOTAL', '', '', '', '',
          fmt(c.totHt), fmt(c.totTtc),
          `Payé ${fmt(c.payeTtc)} — Reste ${fmt(reste)}`, '']);
        rows.push([]); // ligne vide entre deux comptes
        gTotHt += c.totHt;
        gTotTtc += c.totTtc;
        gPayeTtc += c.payeTtc;
      });
      if (comptesList.length === 0) {
        rows.push(['(aucun prestataire enregistré sur cette société)']);
      } else {
        rows.push([`RÉCAPITULATIF ${socLabel}`, '► TOTAL GÉNÉRAL', '', '', '', '',
          fmt(gTotHt), fmt(gTotTtc),
          `Payé ${fmt(gPayeTtc)} — Reste ${fmt(gTotTtc - gPayeTtc)}`, '']);
      }
      return { name: `grand-livre_${sufx}_${stamp}.csv`, csv: toCsv(rows) };
    };

    // Un seul fichier par société.
    const allFiles = [];
    const groupesNonVides = groupes.filter(g => g.dossiers.length > 0);
    groupesNonVides.forEach(g => { allFiles.push(buildGrandLivre(g.dossiers, g.id, g.label)); });
    if (allFiles.length === 0) {
      alert('Aucun dossier à exporter pour cette sélection.');
      return;
    }

    // Téléchargements : déclenchés en synchrone dans le handler du clic.
    // C'est obligatoire — un a.click() différé (setTimeout) perd le "user
    // gesture" et le navigateur bloque alors les téléchargements.
    allFiles.forEach((f) => {
      const blob = new Blob([f.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });

    const nbSoc = groupesNonVides.length;
    const nomsSoc = groupesNonVides.map(g => g.label).join(', ');
    showToast(`📊 Grand livre exporté — ${nbSoc} fichier${nbSoc > 1 ? 's' : ''} (${nomsSoc})`, 'success', 4000);
  };

  // Dossiers enrichis : calcule à la volée HT, marges, totaux poseurs/régie/fournisseur, etc.
  // Permet d'afficher correctement les anciens dossiers qui n'ont pas ces champs stockés.
  const dossiersEnriched = useMemo(() => {
    return dossiers.map(d => enrichDossier(d, tarifsPoseurs, tarifsRegies, produits, tarifsFournisseurs));
  }, [dossiers, tarifsPoseurs, tarifsRegies, produits, tarifsFournisseurs]);

  const stats = useMemo(() => {
    const totalCA = dossiersEnriched.reduce((s, d) => s + (d.montantTotal || 0), 0);
    const totalMargeTtc = dossiersEnriched.reduce((s, d) => s + (d.margeTtc || 0), 0);
    const totalMargeHt = dossiersEnriched.reduce((s, d) => s + (d.margeHt || 0), 0);
    return { count: dossiersEnriched.length, totalCA, totalMargeTtc, totalMargeHt };
  }, [dossiersEnriched]);

  // Rapport paiements
  const rapportPaiements = useMemo(() => {
    const ROLES_INTERNES_LABELS = ['Téléprospecteur', 'Confirmateur', 'Commercial', 'Coordinateur projet', 'Resp. envoi pose'];
    // 🏢 Filtre société : si une société est sélectionnée, on ne compte que ses
    // dossiers. Évite que Projexio (qui finance Yolico ET Elsun) apparaisse
    // avec un total fusionné — la compta voit la vraie dette par marque.
    const dossiersFiltres = activeSociete
      ? dossiersEnriched.filter(d => d.societe === activeSociete)
      : dossiersEnriched;
    const map = {};
    // Clé inclut la société → 'IONERGIK chez Yolico' et 'IONERGIK chez Elsun'
    // restent séparés même en vue 'Toutes'. C'est la réalité comptable.
    const addEntry = (nom, type, ttc, paye, datePaye, dossier) => {
      if (!nom || !ttc) return;
      const soc = dossier.societe || '';
      const key = `${type}::${nom}::${soc}`;
      if (!map[key]) map[key] = { nom, type, societe: soc, totalDu: 0, totalPaye: 0, totalRestant: 0, totalAPayerMaintenant: 0, totalEnAttenteFinanceur: 0, totalPayeAvance: 0, lignes: [] };
      map[key].totalDu += ttc;
      const isInterne = ROLES_INTERNES_LABELS.includes(type);
      const payeAvance = paye && !dossier.payeClient && !isInterne;
      if (paye) {
        map[key].totalPaye += ttc;
        if (payeAvance) map[key].totalPayeAvance += ttc;
      } else {
        map[key].totalRestant += ttc;
        // Équipe interne : à payer maintenant dès qu'il y a une commission due (peu importe paiement client)
        // Externes : à payer maintenant SEULEMENT si le client a payé
        if (isInterne || dossier.payeClient) map[key].totalAPayerMaintenant += ttc;
        else map[key].totalEnAttenteFinanceur += ttc;
      }
      map[key].lignes.push({ dossierId: dossier.id || '—', dossierLocalId: dossier.localId, client: `${dossier.nom} ${dossier.prenom || ''}`.trim(), date: dossier.dateInsta, ttc, paye, datePaye, financeurPaye: !!dossier.payeClient, financement: dossier.financement, payeAvance, isInterne, prestataireType: type, societe: soc });
    };
    dossiersFiltres.forEach(d => {
      (d.fournisseursDetail || []).forEach(f => addEntry(f.nom, 'Fournisseur', f.ttc, f.paye, f.datePaye, d));
      // Multi-régies : itère sur regiesDetail
      (d.regiesDetail || []).forEach(r => addEntry(r.nom, 'Régie', r.ttc, r.paye, r.datePaye, d));
      (d.poseursDetail || []).forEach(p => addEntry(p.nom, 'Poseur', p.ttc, p.paye, p.datePaye, d));
      // Commissions équipe interne — dès qu'un nom est rempli
      ROLES_INTERNES.forEach(role => {
        const nom = d[role.key];
        if (!nom) return;
        const m = d[role.key + 'Montant'];
        const tarif = (m !== '' && m !== undefined && m !== null) ? parseFloat(m) : (tarifsInternes[role.key] || 0);
        if (tarif > 0) {
          addEntry(nom, role.label, tarif, d[role.key + 'Paye'], d[role.key + 'DatePaye'], d);
        }
      });
    });
    const list = Object.values(map).sort((a, b) => b.totalAPayerMaintenant - a.totalAPayerMaintenant);
    const totalGeneralPaye = list.reduce((s, p) => s + p.totalPaye, 0);
    const totalGeneralRestant = list.reduce((s, p) => s + p.totalRestant, 0);
    const totalAPayerMaintenant = list.reduce((s, p) => s + p.totalAPayerMaintenant, 0);
    const totalEnAttenteFinanceur = list.reduce((s, p) => s + p.totalEnAttenteFinanceur, 0);
    const totalPayeAvance = list.reduce((s, p) => s + p.totalPayeAvance, 0);

    const encaissMap = {};
    dossiersFiltres.forEach(d => {
      // Dossiers morts → on ne les attend plus chez le financeur.
      // (Annulé / déposé / refus financement / client a refusé la pose.)
      // Si déjà payé par le financeur on garde la ligne pour traçabilité du
      // chiffre encaissé, mais on ne l'ajoute jamais au "à recevoir".
      const isDead = d.statut === 'W2_ANNULER'
        || d.statut === 'W1_DEPOSER'
        || d.statut === 'B3_REFUS_FINANCEMENT'
        || d.statutFin === 'refusé'
        || d.statutPose === 'client_refuse';
      if (isDead && !d.payeClient) return;

      const fin = d.financement || 'AUTRE';
      const soc = d.societe || '';
      // Banque × société = clé unique. Projexio peut nous devoir 30k sur Yolico
      // ET 20k sur Elsun — deux dettes distinctes à recouvrer séparément.
      const key = `${fin}::${soc}`;
      const m = d.montantTotal || 0;
      if (!encaissMap[key]) encaissMap[key] = { nom: fin, societe: soc, totalAttendu: 0, totalRecu: 0, totalRestant: 0, lignes: [] };
      encaissMap[key].totalAttendu += m;
      if (d.payeClient) encaissMap[key].totalRecu += m;
      else encaissMap[key].totalRestant += m;
      encaissMap[key].lignes.push({ dossierId: d.id || '—', dossierLocalId: d.localId, client: `${d.nom} ${d.prenom || ''}`.trim(), date: d.dateInsta, ttc: m, paye: d.payeClient, societe: soc });
    });
    const encaissList = Object.values(encaissMap).sort((a, b) => b.totalRestant - a.totalRestant);
    const totalEncaisseClient = encaissList.reduce((s, e) => s + e.totalRecu, 0);
    const totalAEncaisserClient = encaissList.reduce((s, e) => s + e.totalRestant, 0);

    // Pénalités régies (poses ratées) — agrégées par régie × société
    const penaliteMap = {};
    dossiersFiltres.forEach(d => {
      (d.tentativesPose || []).forEach((t, idx) => {
        const regie = t.regie || '(régie non spécifiée)';
        const soc = d.societe || '';
        const key = `${regie}::${soc}`;
        if (!penaliteMap[key]) penaliteMap[key] = { nom: regie, societe: soc, totalDu: 0, totalPaye: 0, totalRestant: 0, lignes: [] };
        penaliteMap[key].totalDu += t.penalite || 0;
        if (t.regleAt) penaliteMap[key].totalPaye += t.penalite || 0;
        else penaliteMap[key].totalRestant += t.penalite || 0;
        penaliteMap[key].lignes.push({
          dossierLocalId: d.localId,
          dossierId: d.id || '—',
          client: `${d.nom} ${d.prenom || ''}`.trim(),
          date: t.date,
          motif: t.motif,
          penalite: t.penalite || 0,
          regleAt: t.regleAt || null,
          definitif: !!t.definitif,
          tentativeIdx: idx,
          societe: soc,
        });
      });
    });
    const penalitesList = Object.values(penaliteMap).sort((a, b) => b.totalRestant - a.totalRestant);
    const totalPenalitesDu = penalitesList.reduce((s, p) => s + p.totalDu, 0);
    const totalPenalitesPaye = penalitesList.reduce((s, p) => s + p.totalPaye, 0);
    const totalPenalitesRestant = penalitesList.reduce((s, p) => s + p.totalRestant, 0);

    // ⚖️ Litiges client — remboursements dus par les régies (même mécanique
    // que les pénalités, mais avec un PDF d'accord transactionnel et des
    // montants en général plus élevés).
    const litigeMap = {};
    dossiersFiltres.forEach(d => {
      const montant = parseFloat(d.litigeMontantRembourse);
      if (!montant || isNaN(montant) || montant <= 0) return;
      const regie = d.litigeRegieNom || '(régie non identifiée)';
      const soc = d.societe || '';
      const key = `${regie}::${soc}`;
      if (!litigeMap[key]) litigeMap[key] = { nom: regie, societe: soc, totalDu: 0, totalPaye: 0, totalRestant: 0, lignes: [] };
      litigeMap[key].totalDu += montant;
      if (d.litigeRegieRembourse) litigeMap[key].totalPaye += montant;
      else litigeMap[key].totalRestant += montant;
      litigeMap[key].lignes.push({
        dossierLocalId: d.localId,
        dossierId: d.id || '—',
        client: `${d.nom} ${d.prenom || ''}`.trim(),
        montant,
        rembourse: !!d.litigeRegieRembourse,
        dateRembourse: d.litigeDateRembourse || null,
        factureNo: d.litigeFactureNo || '',
        accordPdfUrl: d.litigeAccordPdfUrl || '',
        note: d.litigeNote || '',
        societe: soc,
      });
    });
    const litigesList = Object.values(litigeMap).sort((a, b) => b.totalRestant - a.totalRestant);
    const totalLitigesDu = litigesList.reduce((s, p) => s + p.totalDu, 0);
    const totalLitigesPaye = litigesList.reduce((s, p) => s + p.totalPaye, 0);
    const totalLitigesRestant = litigesList.reduce((s, p) => s + p.totalRestant, 0);

    return { list, totalGeneralPaye, totalGeneralRestant, totalAPayerMaintenant, totalEnAttenteFinanceur, totalPayeAvance, totalEncaisseClient, totalAEncaisserClient, encaissList, penalitesList, totalPenalitesDu, totalPenalitesPaye, totalPenalitesRestant, litigesList, totalLitigesDu, totalLitigesPaye, totalLitigesRestant, activeSociete };
  }, [dossiersEnriched, tarifsInternes, activeSociete]);

  // Dashboard
  const dashboard = useMemo(() => {
    // 🏢 Si une société est active dans le filtre, on restreint TOUS les calculs
    // (stats, alertes, rappels) à cette société. Sinon vue consolidée.
    // Renamed local en 'dossiersDash' pour éviter le shadowing du nom externe.
    const dossiersDash = activeSociete
      ? dossiersEnriched.filter(d => d.societe === activeSociete)
      : dossiersEnriched;
    const moisMap = {};
    dossiersDash.forEach(d => {
      if (!d.dateInsta) return;
      const k = d.dateInsta.substring(0, 7);
      if (!moisMap[k]) moisMap[k] = { mois: k, count: 0, ca: 0, margeTtc: 0 };
      moisMap[k].count += 1;
      moisMap[k].ca += d.montantTotal || 0;
      moisMap[k].margeTtc += d.margeTtc || 0;
    });
    const statsMois = Object.values(moisMap).sort((a, b) => a.mois.localeCompare(b.mois));
    const todayStr = new Date().toISOString().substring(0, 7);
    const moisCourant = statsMois.find(m => m.mois === todayStr) || { count: 0, ca: 0, margeTtc: 0 };
    const lm = new Date(); lm.setMonth(lm.getMonth() - 1);
    const lastStr = lm.toISOString().substring(0, 7);
    const moisPrecedent = statsMois.find(m => m.mois === lastStr) || { count: 0, ca: 0, margeTtc: 0 };

    // 🏦 PROJEXIO — plafond mensuel de 2,5 M€ d'envois en banque.
    // Règles de comptage demandées :
    //   ✓ Refusé par la banque (statutFin === 'refusé') → COMPTÉ
    //     (le dossier a quand même consommé du quota chez Projexio).
    //   ✗ Annulé par nous (statut === 'W2_ANNULER') → EXCLU
    //     (on a retiré le dossier nous-mêmes, Projexio le sait).
    // Filtre temporel : mois du `dateEnvoiFin` (date d'envoi au financeur).
    const projexioMoisCourant = (() => {
      let total = 0, count = 0;
      const dossiersList = [];
      dossiersDash.forEach(d => {
        if (d.financement !== 'PROJEXIO') return;
        if (!d.dateEnvoiFin) return;
        if (d.dateEnvoiFin.substring(0, 7) !== todayStr) return;
        if (d.statut === 'W2_ANNULER') return;
        const m = parseFloat(d.montantTotal) || 0;
        total += m;
        count += 1;
        dossiersList.push({ localId: d.localId, nom: d.nom, prenom: d.prenom, montant: m, statut: d.statut });
      });
      return { total, count, dossiers: dossiersList };
    })();

    const poseurMap = {};
    dossiersDash.forEach(d => {
      (d.poseursDetail || []).forEach(p => {
        if (!poseurMap[p.nom]) poseurMap[p.nom] = { nom: p.nom, count: 0, ca: 0, coutTotal: 0, puissanceTotale: 0, margeApportee: 0 };
        poseurMap[p.nom].count += 1;
        poseurMap[p.nom].ca += d.montantTotal || 0;
        poseurMap[p.nom].coutTotal += p.ttc || 0;
        poseurMap[p.nom].puissanceTotale += d.puissance || 0;
        poseurMap[p.nom].margeApportee += d.margeTtc || 0;
      });
    });
    const statsPoseurs = Object.values(poseurMap).sort((a, b) => b.count - a.count);

    const regieMap = {};
    dossiersDash.forEach(d => {
      const regiesArr = d.regiesDetail || [];
      if (regiesArr.length === 0) {
        // Pas de régie sur ce dossier
        const r = 'Sans régie';
        if (!regieMap[r]) regieMap[r] = { nom: r, count: 0, ca: 0, coutTotal: 0, margeApportee: 0 };
        regieMap[r].count += 1;
        regieMap[r].ca += d.montantTotal || 0;
        regieMap[r].margeApportee += d.margeTtc || 0;
      } else {
        // Pour chaque régie du dossier, on l'attribue (la marge est répartie au prorata du coût)
        const totalCout = regiesArr.reduce((s, r) => s + r.ttc, 0);
        regiesArr.forEach(reg => {
          const r = reg.nom || 'Inconnu';
          if (!regieMap[r]) regieMap[r] = { nom: r, count: 0, ca: 0, coutTotal: 0, margeApportee: 0 };
          regieMap[r].count += 1;
          regieMap[r].ca += d.montantTotal || 0;
          regieMap[r].coutTotal += reg.ttc || 0;
          regieMap[r].margeApportee += (d.margeTtc || 0) * (totalCout > 0 ? reg.ttc / totalCout : 1);
        });
      }
    });
    const statsRegies = Object.values(regieMap).sort((a, b) => b.count - a.count);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Nombre de jours pleins écoulés depuis une date passée. On normalise la
    // référence à minuit AVANT de comparer : sans ça, un dossier créé
    // aujourd'hui à 16h donnait floor((minuit - 16h) / 24h) = -1 jour.
    // Clamp à 0 : "il y a -1 jour" n'a aucun sens.
    const joursEcoules = (ref) => {
      if (!ref) return 0;
      const r = new Date(ref);
      if (isNaN(r.getTime())) return 0;
      r.setHours(0, 0, 0, 0);
      return Math.max(0, Math.round((today - r) / 86400000));
    };
    const rappelsClient = dossiers
      .filter(d => !d.payeClient && d.dateInsta && d.montantTotal)
      .map(d => ({ ...d, joursAttente: joursEcoules(d.dateInsta) }))
      .filter(d => d.joursAttente >= 30)
      .sort((a, b) => b.joursAttente - a.joursAttente);

    const rappelsPrestataires = [];
    dossiersDash.forEach(d => {
      // Prestataires externes (poseurs, fournisseurs, régie externe) : pose faite + client a payé
      if (d.dateInsta && d.payeClient) {
        const j = joursEcoules(d.dateInsta);
        (d.fournisseursDetail || []).forEach(f => {
          if (!f.paye && f.ttc > 0) rappelsPrestataires.push({ type: 'Fournisseur', nom: f.nom, ttc: f.ttc, dossier: d, joursAttente: j });
        });
        // Régies (multi) — regiesDetail contient soit le nouveau format soit le fallback de l'ancien
        (d.regiesDetail || []).forEach(r => {
          if (!r.paye && r.ttc > 0 && r.nom) rappelsPrestataires.push({ type: 'Régie', nom: r.nom, ttc: r.ttc, dossier: d, joursAttente: j });
        });
        (d.poseursDetail || []).forEach(p => {
          if (!p.paye && p.ttc > 0) rappelsPrestataires.push({ type: 'Poseur', nom: p.nom, ttc: p.ttc, dossier: d, joursAttente: j });
        });
      }

      // Commissions équipe interne : dès qu'un nom est rempli (peu importe pose / paiement client)
      // Si pas de date de pose, on calcule l'attente depuis la création du dossier
      const refDate = d.dateInsta || d.createdAt || d.modifiedAt;
      const j = refDate ? joursEcoules(refDate) : 0;
      const ROLES_KEYS_LOCAL = [
        { key: 'teleprospecteur', label: 'Téléprospecteur' },
        { key: 'confirmateur', label: 'Confirmateur' },
        { key: 'commercial', label: 'Commercial' },
        { key: 'coordinateurProjet', label: 'Coordinateur projet' },
        { key: 'responsableEnvoiPose', label: 'Resp. envoi pose' },
      ];
      ROLES_KEYS_LOCAL.forEach(role => {
        const nom = d[role.key];
        if (!nom) return;
        if (d[role.key + 'Paye']) return;
        const m = d[role.key + 'Montant'];
        const tarif = (m !== '' && m !== undefined && m !== null) ? parseFloat(m) : (tarifsInternes[role.key] || 0);
        if (tarif > 0) {
          rappelsPrestataires.push({ type: role.label, nom, ttc: tarif, dossier: d, joursAttente: j });
        }
      });
    });
    rappelsPrestataires.sort((a, b) => b.joursAttente - a.joursAttente);

    // Rappels par stagnation de statut — seuils en jours par type de statut
    const SEUILS_STATUT = {
      A_EN_COURS: 30,
      M_ATT_ACCORD_DEF: 30,
      ATTENTE_DEBLOCAGE: 30,
      M_PREFIN: 30,
      M_NRP_CQ_LIVRAISON: 7,
      M_CONTROLE_LIV_BANQUE: 14,
      M_LITIGE: 7,
      M_DEPLACEMENT: 14,
      M_DEPOSER: 14,
      M_CONFORMITE_CONTRAT: 14,
      M_MANQUE_RECEP: 7,
      M_SAV: 21,
      M_ATT_NRP_CL: 14,
      // Statuts "finaux" → pas de rappel
      ACCEPTE: null,
      DOSSIER_PAYER: null,
      W_DOSSIER_PAYER: null,
      ANNULER: null,
    };

    const rappelsStagnation = [];
    dossiersDash.forEach(d => {
      const seuil = SEUILS_STATUT[d.statut];
      if (seuil == null) return; // statut final ou non listé

      // Trouve la date d'entrée dans le statut actuel (dernière entrée d'historique avec to=statut actuel, ou création)
      let dateEntreeStatut = null;
      const hist = (d.historique || []).slice().reverse();
      for (const h of hist) {
        if (h.action === 'changement_statut' && h.to === d.statut) { dateEntreeStatut = h.date; break; }
        if (h.action === 'création' && h.to === d.statut) { dateEntreeStatut = h.date; break; }
      }
      if (!dateEntreeStatut) dateEntreeStatut = d.createdAt || d.savedAt || d.dateInsta;
      if (!dateEntreeStatut) return;

      const jours = joursEcoules(dateEntreeStatut);
      if (jours < seuil) return;

      // Niveau d'alerte selon dépassement
      let level = 'warn'; // jaune
      if (jours >= seuil * 2) level = 'critical'; // rouge
      else if (jours >= seuil * 1.5) level = 'high'; // orange

      rappelsStagnation.push({
        dossier: d,
        statutId: d.statut,
        jours,
        seuil,
        depassement: jours - seuil,
        level,
        dateEntreeStatut,
      });
    });
    rappelsStagnation.sort((a, b) => b.jours - a.jours);

    // Rappels financement — envoyés sans retour depuis +2 jours
    const rappelsFinancement = [];
    dossiersDash.forEach(d => {
      if (!d.dateEnvoiFin) return; // pas envoyé
      if (d.dateRetourFin) return; // déjà reçu retour
      if (d.statutFin === 'accepté' || d.statutFin === 'refusé' || d.statutFin === 'manque_doc') return; // déjà répondu
      const jours = joursEcoules(d.dateEnvoiFin);
      if (jours < 2) return; // encore dans les 2 jours acceptables
      let level = 'warn';
      if (jours >= 7) level = 'critical';
      else if (jours >= 5) level = 'high';
      rappelsFinancement.push({ dossier: d, jours, level });
    });
    rappelsFinancement.sort((a, b) => b.jours - a.jours);

    // Rappels Manque docs — la banque demande des pièces complémentaires.
    // Tant que dateRenvoiDocs n'est pas remplie → urgent (les filles doivent
    // récupérer les docs côté client puis renvoyer à la banque).
    const rappelsManqueDoc = [];
    dossiersDash.forEach(d => {
      if (d.statutFin !== 'manque_doc') return;
      if (d.dateRenvoiDocs) return; // déjà renvoyés (l'user oubliera juste de repasser à 'envoyé')
      // Jours depuis le retour banque (ou envoi initial à défaut)
      const ref = d.dateRetourFin || d.dateEnvoiFin;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 7) level = 'critical';
      else if (jours >= 3) level = 'high';
      rappelsManqueDoc.push({ dossier: d, jours, level });
    });
    rappelsManqueDoc.sort((a, b) => b.jours - a.jours);

    // Rappels Paiement — contrôle livraison fait sans paiement reçu depuis +2 jours
    const rappelsPaiement = [];
    dossiersDash.forEach(d => {
      if (!d.dateControleLivraison) return; // pas de contrôle
      if (d.datePaiementBanque || d.payeClient) return; // déjà payé
      const jours = joursEcoules(d.dateControleLivraison);
      if (jours < 2) return;
      let level = 'warn';
      if (jours >= 7) level = 'critical';
      else if (jours >= 5) level = 'high';
      rappelsPaiement.push({ dossier: d, jours, level });
    });
    rappelsPaiement.sort((a, b) => b.jours - a.jours);

    // Statuts finaux qui n'ont plus besoin d'alertes
    const finalStatuses = ['W2_ANNULER', 'ANNULER', 'W_DOSSIER_PAYER', 'DOSSIER_PAYER', 'F1_ACCEPTE', 'ACCEPTE'];

    // Rappels Contrôle livraison — Consuel accepté + originaux reçus banque mais contrôle pas encore fait
    const rappelsControleLivraison = [];
    dossiersDash.forEach(d => {
      // Consuel accepté ?
      const consuelAccepte = d.statutConsuel === 'accepté' || (d.dateConsuel && d.statutConsuel !== 'visite');
      if (!consuelAccepte) return;
      // Originaux reçus banque (ou pas requis) ?
      const originauxOk = d.dateRecusOriginauxBanque || d.pasOriginauxRequis;
      if (!originauxOk) return;
      if (d.dateControleLivraison) return; // déjà fait
      if (finalStatuses.includes(d.statut)) return;
      const ref = d.dateRecusOriginauxBanque || d.dateConsuel || d.savedAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 5) level = 'critical';
      else if (jours >= 3) level = 'high';
      rappelsControleLivraison.push({ dossier: d, jours, level });
    });
    rappelsControleLivraison.sort((a, b) => b.jours - a.jours);

    // Rappels Contrôle qualité — dossiers à valider/refuser (pas encore décidé)
    const rappelsControleQualite = [];
    dossiersDash.forEach(d => {
      if (d.statutControleQualite === 'ok' || d.statutControleQualite === 'pas_ok') return; // déjà décidé
      if (finalStatuses.includes(d.statut)) return;
      const ref = d.createdAt || d.savedAt || d.dateInsta;
      if (!ref) return;
      const jours = joursEcoules(ref);
      let level = 'warn';
      if (jours >= 5) level = 'critical';
      else if (jours >= 2) level = 'high';
      rappelsControleQualite.push({ dossier: d, jours, level });
    });
    rappelsControleQualite.sort((a, b) => b.jours - a.jours);

    // Rappels À envoyer en banque — CQ validé mais pas encore envoyé
    const rappelsAEnvoyerBanque = [];
    dossiersDash.forEach(d => {
      if (d.statutControleQualite !== 'ok') return; // pas validé OK
      if (d.dateEnvoiFin) return; // déjà envoyé
      if (finalStatuses.includes(d.statut)) return;
      // Calcul depuis la date de validation CQ (ou createdAt fallback)
      const ref = d.dateControleQualite || d.createdAt || d.savedAt;
      if (!ref) return;
      const jours = joursEcoules(ref);
      let level = 'warn';
      if (jours >= 3) level = 'critical';
      else if (jours >= 1) level = 'high';
      rappelsAEnvoyerBanque.push({ dossier: d, jours, level });
    });
    rappelsAEnvoyerBanque.sort((a, b) => b.jours - a.jours);

    // Rappels À envoyer en pose — financement accordé mais pas encore envoyé en pose
    const rappelsAEnvoyerPose = [];
    dossiersDash.forEach(d => {
      if (d.statutFin !== 'accepté') return; // pas accordé par banque
      if (d.dateEnvoiPose) return; // déjà envoyé en pose
      if (finalStatuses.includes(d.statut)) return;
      // Calcul depuis la date d'accord (ou date retour fin fallback)
      const ref = d.dateAccord || d.dateRetourFin || d.savedAt;
      if (!ref) return;
      const jours = joursEcoules(ref);
      let level = 'warn';
      if (jours >= 5) level = 'critical';
      else if (jours >= 2) level = 'high';
      rappelsAEnvoyerPose.push({ dossier: d, jours, level });
    });
    rappelsAEnvoyerPose.sort((a, b) => b.jours - a.jours);

    // Rappels Poseur à assigner — date de pose remplie mais aucun poseur dans
    // l'équipe. Cas typique : la banque a accordé, on a calé une date avec le
    // client, mais on a oublié de désigner qui pose.
    // Skippé si le dossier est dans un statut final (annulé volontairement,
    // dossier payé, etc.) — l'utilisateur a déjà clôturé.
    const rappelsPoseurNonAssigne = [];
    dossiersDash.forEach(d => {
      if (finalStatuses.includes(d.statut)) return;
      // Ne concerne que les dossiers dont le financement est bouclé (accord
      // banque, ou comptant). Avant ça, "poseur à assigner" n'a aucun sens,
      // même si une date de pose traîne — typiquement extraite par le scan IA
      // d'un dossier encore au stade contrôle qualité.
      const financementBoucle = d.statutFin === 'accepté' || d.financement === 'COMPTANT';
      if (!financementBoucle) return;
      // Une date de pose est-elle posée ? (envoi en pose, visite, ou pose)
      const aUneDate = !!(d.dateEnvoiPose || d.dateVisitePose || d.dateInsta);
      if (!aUneDate) return;
      // Un poseur est-il assigné ?
      const poseurs = d.poseurs || [];
      const poseurAssigne = poseurs.some(p => p && p.nom && p.nom.trim());
      if (poseurAssigne) return;
      // Référence pour les jours : la date la plus proche (dateInsta > dateVisitePose > dateEnvoiPose)
      const refDate = d.dateInsta || d.dateVisitePose || d.dateEnvoiPose;
      const jours = refDate ? joursEcoules(refDate) : 0;
      // Niveau : critique si la date de pose est proche ou passée
      let level = 'warn';
      if (d.dateInsta) {
        const joursAvantPose = Math.floor((new Date(d.dateInsta) - today) / 86400000);
        if (joursAvantPose <= 3) level = 'critical';
        else if (joursAvantPose <= 7) level = 'high';
      } else if (jours >= 2) {
        level = 'high';
      }
      rappelsPoseurNonAssigne.push({ dossier: d, jours, level });
    });
    rappelsPoseurNonAssigne.sort((a, b) => b.jours - a.jours);

    // Rappels Pose non finie — date de pose passée depuis +3 jours mais pas
    // encore marquée "posée" (dateInsta vide, statutPose != 'visite_ok').
    // Cas typique : on a planifié, le poseur y est allé, mais on a oublié
    // de cocher "posé". Ou la pose a été décalée sans mise à jour.
    const rappelsPoseNonFinie = [];
    dossiersDash.forEach(d => {
      if (!d.dateEnvoiPose) return; // pas de date de pose planifiée
      if (d.dateInsta) return; // déjà marquée posée
      if (d.statutPose === 'visite_ok') return; // déjà OK
      if (d.statutPose === 'client_refuse') return; // client a refusé
      if (finalStatuses.includes(d.statut)) return;
      // Jours depuis la date prévue (peut être négatif si la date est future)
      const jours = joursEcoules(d.dateEnvoiPose);
      if (jours < 3) return; // moins de 3 jours après la date prévue → pas encore d'alerte
      let level = 'warn';
      if (jours >= 7) level = 'critical';
      else if (jours >= 5) level = 'high';
      rappelsPoseNonFinie.push({ dossier: d, jours, level });
    });
    rappelsPoseNonFinie.sort((a, b) => b.jours - a.jours);

    // Rappels Mairie — dossier créé mais déclaration mairie pas envoyée (ou refusée et non renvoyée)
    const rappelsAEnvoyerMairie = [];
    dossiersDash.forEach(d => {
      if (d.statutMairie === 'accepté' || d.dateAccordMairie) return; // déjà accepté
      if (finalStatuses.includes(d.statut)) return;
      if (d.dateEnvoiMairie && d.statutMairie !== 'refusé') return; // envoyé, en attente de réponse (pas une alerte)
      // Si refusé : il faut renvoyer → reste en alerte
      const ref = d.savedAt || d.createdAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 10) level = 'critical';
      else if (jours >= 5) level = 'high';
      const refus = d.statutMairie === 'refusé';
      rappelsAEnvoyerMairie.push({ dossier: d, jours, level, refus });
    });
    rappelsAEnvoyerMairie.sort((a, b) => b.jours - a.jours);

    // Rappels À envoyer Consuel — pose terminée mais Consuel pas encore envoyé
    const rappelsAEnvoyerConsuel = [];
    dossiersDash.forEach(d => {
      // Pose terminée ? (statut visite_ok OU date de pose remplie)
      const poseFinie = d.statutPose === 'visite_ok' || !!d.dateInsta;
      if (!poseFinie) return;
      if (d.dateEnvoiConsuel) return; // déjà envoyé
      if (finalStatuses.includes(d.statut)) return;
      // Calcul depuis la date de pose (ou aujourd'hui si pas de date)
      const ref = d.dateInsta || d.savedAt || d.createdAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 5) level = 'critical';
      else if (jours >= 2) level = 'high';
      rappelsAEnvoyerConsuel.push({ dossier: d, jours, level });
    });
    rappelsAEnvoyerConsuel.sort((a, b) => b.jours - a.jours);

    // Rappels À envoyer Raccordement — pose terminée mais demande de
    // raccordement Enedis pas encore envoyée. Même logique que le Consuel.
    const rappelsAEnvoyerRaccordement = [];
    dossiersDash.forEach(d => {
      const poseFinie = d.statutPose === 'visite_ok' || !!d.dateInsta;
      if (!poseFinie) return;
      if (d.dateEnvoiRaccordement) return; // déjà envoyé
      if (finalStatuses.includes(d.statut)) return;
      const ref = d.dateInsta || d.savedAt || d.createdAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 5) level = 'critical';
      else if (jours >= 2) level = 'high';
      rappelsAEnvoyerRaccordement.push({ dossier: d, jours, level });
    });
    rappelsAEnvoyerRaccordement.sort((a, b) => b.jours - a.jours);

    // Rappels Originaux — pose terminée mais originaux pas reçus banque
    const rappelsOriginaux = [];
    dossiersDash.forEach(d => {
      if (d.pasOriginauxRequis) return; // pas concerné
      // Pose terminée ?
      const poseFinie = d.statutPose === 'visite_ok' || !!d.dateInsta;
      if (!poseFinie) return;
      if (d.dateRecusOriginauxBanque) return; // déjà reçus banque
      if (finalStatuses.includes(d.statut)) return;
      // Calcul depuis la date de pose
      const ref = d.dateInsta || d.savedAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 7) level = 'critical';
      else if (jours >= 3) level = 'high';
      // Détermine l'étape actuelle pour afficher la bonne info
      let etape = 'attente_poseur';
      if (d.dateRecusOriginauxPoseur && !d.dateEnvoiOriginauxBanque) etape = 'a_envoyer_banque';
      else if (d.dateEnvoiOriginauxBanque && !d.dateRecusOriginauxBanque) etape = 'attente_banque';
      rappelsOriginaux.push({ dossier: d, jours, level, etape });
    });
    rappelsOriginaux.sort((a, b) => b.jours - a.jours);

    // 💰 Récupération TVA — délai 6 mois (180 jours) à partir du paiement banque
    const rappelsRecupTva = [];
    dossiersDash.forEach(d => {
      // Seulement si client payé et démarche pas encore terminée
      if (!d.payeClient) return;
      if (d.tvaStatus === 'recuperee' || d.tvaStatus === 'non_concerne') return;
      // Date de référence : datePaiementBanque ou payeClientDate
      const refDate = d.datePaiementBanque || d.payeClientDate;
      if (!refDate) return;
      const debut = new Date(refDate);
      const limite = new Date(debut);
      limite.setMonth(limite.getMonth() + 6);
      const joursRestants = Math.floor((limite - today) / 86400000);
      const joursDepuisPaiement = Math.floor((today - debut) / 86400000);
      // Niveau d'urgence
      let level = 'info';
      if (joursRestants < 0) level = 'expired';        // 🔴 dépassé
      else if (joursRestants <= 7) level = 'critical'; // 🔥 < 1 semaine
      else if (joursRestants <= 30) level = 'high';    // ⚠️ < 1 mois
      else if (joursRestants <= 60) level = 'warn';    // ⏰ < 2 mois
      else if (joursRestants <= 120) level = 'info';   // 📋 normal
      else return; // > 4 mois : on ne montre pas encore
      rappelsRecupTva.push({
        dossier: d,
        joursRestants,
        joursDepuisPaiement,
        dateLimite: limite.toISOString().split('T')[0],
        level,
        statut: d.tvaStatus || '',
      });
    });
    rappelsRecupTva.sort((a, b) => a.joursRestants - b.joursRestants); // les plus urgents en premier

    // 🧾 Factures manquantes — pour la compta : dossiers posés où au moins
    // un prestataire (poseur/régie/fournisseur) a un nom mais pas de facture
    // uploadée. Plus la pose est ancienne, plus c'est urgent.
    const rappelsFacturesManquantes = [];
    dossiersDash.forEach(d => {
      const posee = d.statutPose === 'visite_ok' || !!d.dateInsta;
      if (!posee) return;
      if (finalStatuses.includes(d.statut)) {
        // Sauf annulé : si déjà payé, on garde l'alerte tant que les factures
        // manquent (la compta peut avoir besoin de les récupérer même après).
        if (d.statut === 'W2_ANNULER' || d.statut === 'ANNULER') return;
      }
      const poseursManquants = (d.poseurs || []).filter(p => p.nom && !p.factureFile).map(p => p.nom);
      const regiesManquantes = (d.regies || []).filter(r => r.nom && !r.factureFile).map(r => r.nom);
      const fournisseursManquants = (d.fournisseurs || []).filter(f => f.nom && !f.factureFile).map(f => f.nom);
      const total = poseursManquants.length + regiesManquantes.length + fournisseursManquants.length;
      if (total === 0) return;
      const ref = d.dateInsta || d.savedAt;
      const jours = ref ? joursEcoules(ref) : 0;
      let level = 'warn';
      if (jours >= 30) level = 'critical';
      else if (jours >= 14) level = 'high';
      rappelsFacturesManquantes.push({
        dossier: d, jours, level,
        poseurs: poseursManquants,
        regies: regiesManquantes,
        fournisseurs: fournisseursManquants,
        total,
      });
    });
    rappelsFacturesManquantes.sort((a, b) => b.jours - a.jours);

    return { statsMois, moisCourant, moisPrecedent, projexioMoisCourant, statsPoseurs, statsRegies, rappelsClient, rappelsPrestataires, rappelsStagnation, rappelsFinancement, rappelsManqueDoc, rappelsPaiement, rappelsControleLivraison, rappelsControleQualite, rappelsAEnvoyerBanque, rappelsAEnvoyerPose, rappelsPoseurNonAssigne, rappelsPoseNonFinie, rappelsAEnvoyerMairie, rappelsAEnvoyerConsuel, rappelsAEnvoyerRaccordement, rappelsOriginaux, rappelsRecupTva, rappelsFacturesManquantes };
  }, [dossiersEnriched, tarifsInternes, activeSociete]);

  // Archivage manuel : un dossier est archivé seulement si on l'a archivé volontairement
  // Si un dossier archivé passe en SAV, il est désarchivé automatiquement (voir onUpdate)
  const isArchived = (d) => d.archived === true;

  // Comptage des dossiers actifs vs archivés (selon les permissions de filtrage)
  const dossiersVisibles = useMemo(() => {
    return dossiersEnriched.filter(d => {
      if (permissions.filtreDossiers === 'tous') return true;
      if (permissions.filtreDossiers === 'mes') return d.createdBy === currentUser;
      if (permissions.filtreDossiers === 'chantiers') return (d.poseurs || []).some(p => p.nom === currentUser);
      return true;
    });
  }, [dossiersEnriched, permissions.filtreDossiers, currentUser]);
  const nbActifs = dossiersVisibles.filter(d => !isArchived(d)).length;
  const nbArchives = dossiersVisibles.filter(d => isArchived(d)).length;

  const filteredDossiers = dossiersEnriched
    // Filtre actifs/archivés selon l'onglet
    .filter(d => activeTab === 'archives' ? isArchived(d) : !isArchived(d))
    // 🏢 Filtre société : si une société est sélectionnée, on ne voit que ses
    // dossiers. Les dossiers sans société assignée (legacy) sont toujours visibles.
    .filter(d => !activeSociete || !d.societe || d.societe === activeSociete)
    // Filtre selon le rôle de l'utilisateur courant
    .filter(d => {
      if (permissions.filtreDossiers === 'tous') return true;
      if (permissions.filtreDossiers === 'mes') {
        // Commercial : voit ses dossiers (créés par lui)
        return d.createdBy === currentUser;
      }
      if (permissions.filtreDossiers === 'chantiers') {
        // Poseur : voit les dossiers où son entité rattachée est poseur
        return (d.poseurs || []).some(p => p.nom === currentUserLinkedTo);
      }
      if (permissions.filtreDossiers === 'regies') {
        // Régie : voit les dossiers où son entité rattachée est régie
        return (d.regies || []).some(r => r.nom === currentUserLinkedTo);
      }
      return true;
    })
    .filter(d => filterStatut === 'all' || d.statut === filterStatut)
    .filter(d => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (d.nom?.toLowerCase().includes(s) || d.prenom?.toLowerCase().includes(s)
           || d.id?.toString().includes(s) || d.telephone?.includes(s)
           || d.email?.toLowerCase().includes(s) || d.ville?.toLowerCase().includes(s)
           || d.codePostal?.includes(s));
    })
    .sort((a, b) => {
      if (sortBy === 'date') return (b.dateInsta || '').localeCompare(a.dateInsta || '');
      if (sortBy === 'montant') return (b.montantTotal || 0) - (a.montantTotal || 0);
      if (sortBy === 'marge') return (b.margeTtc || 0) - (a.margeTtc || 0);
      if (sortBy === 'nom') return (a.nom || '').localeCompare(b.nom || '');
      const ia = statutsOrder.indexOf(a.statut), ib = statutsOrder.indexOf(b.statut);
      const ra = ia === -1 ? 999 : ia, rb = ib === -1 ? 999 : ib;
      if (ra !== rb) return ra - rb;
      return (b.dateInsta || '').localeCompare(a.dateInsta || '');
    });

  const isPoseur = currentUserRole === 'poseur';
  const isRegie = currentUserRole === 'regie';

  // Récap financier du poseur OU de la régie connecté(e) : ce que l'entreprise
  // lui doit / lui a payé. Chaque ligne = un dossier où son entité rattachée
  // apparaît (dans poseursDetail ou regiesDetail selon le rôle).
  const prestaRecap = useMemo(() => {
    if (!(isPoseur || isRegie) || !currentUserLinkedTo) return null;
    const detailKey = isPoseur ? 'poseursDetail' : 'regiesDetail';
    const lignes = [];
    let totalDu = 0, totalPaye = 0;
    dossiersEnriched.forEach(d => {
      (d[detailKey] || []).forEach(p => {
        if (p.nom !== currentUserLinkedTo) return;
        const ttc = p.ttc || 0;
        if (p.paye) totalPaye += ttc; else totalDu += ttc;
        lignes.push({
          localId: d.localId,
          client: `${d.nom || ''} ${d.prenom || ''}`.trim() || '(sans nom)',
          ville: d.ville || '',
          dateInsta: d.dateInsta || '',
          ttc,
          paye: !!p.paye,
          datePaye: p.datePaye || '',
        });
      });
    });
    lignes.sort((a, b) => Number(a.paye) - Number(b.paye) || (b.dateInsta || '').localeCompare(a.dateInsta || ''));
    return { lignes, totalDu, totalPaye, total: totalDu + totalPaye, label: isPoseur ? 'Mes chantiers' : 'Mes dossiers' };
  }, [isPoseur, isRegie, currentUserLinkedTo, dossiersEnriched]);

  // Dossier actuellement affiché dans le modal documents
  const currentDocsDossier = useMemo(() =>
    showDocsForId ? dossiers.find(d => d.localId === showDocsForId) : null,
    [showDocsForId, dossiers]
  );
  const currentHistDossier = useMemo(() =>
    showHistForId ? dossiers.find(d => d.localId === showHistForId) : null,
    [showHistForId, dossiers]
  );
  const currentQuickDossier = useMemo(() =>
    showQuickViewId ? dossiersEnriched.find(d => d.localId === showQuickViewId) : null,
    [showQuickViewId, dossiersEnriched]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-pink-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-pink-50 to-amber-50 p-4 md:p-8">
      {celebrating && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 animate-bounce">
            <div className="text-4xl text-center mb-1">🎉</div>
            <div className="font-bold text-purple-600">Dossier enregistré !</div>
          </div>
        </div>
      )}

      {/* Toast léger pour feedback succès/info/erreur (auto-disparait en 2,5s) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] pointer-events-none">
          <div className={`px-4 py-3 rounded-xl shadow-2xl border-2 font-semibold text-sm max-w-md animate-in fade-in slide-in-from-bottom ${
            toast.type === 'error' ? 'bg-rose-50 border-rose-300 text-rose-800' :
            toast.type === 'info' ? 'bg-blue-50 border-blue-300 text-blue-800' :
            'bg-emerald-50 border-emerald-300 text-emerald-800'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap lg:flex-nowrap">
            <div className="flex-shrink-0">
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 bg-clip-text text-transparent">
                Saisie de dossiers ⚡
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">Créez vos dossiers d'installation en un clin d'œil</p>
            </div>
            <div className="flex gap-2 items-center flex-wrap lg:flex-nowrap flex-1 lg:justify-end">
              {/* 🏢 Sélecteur société — placé avant le badge utilisateur pour
                  qu'on choisisse SA marque avant de regarder qui on est */}
              {societes.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveSociete('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${!activeSociete ? 'bg-slate-700 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    title="Voir tous les dossiers (toutes sociétés)"
                  >
                    👀 Toutes
                  </button>
                  {societes.map(s => (
                    <SocieteBadge
                      key={s.id}
                      societe={s}
                      variant="large"
                      active={activeSociete === s.id}
                      onClick={() => setActiveSociete(s.id)}
                    />
                  ))}
                </>
              )}
              {/* Boutons d'action — collés à droite du sélecteur société */}
              {isAdmin && dossiers.length > 0 && (
                <button onClick={exportCSV} className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-slate-200 whitespace-nowrap flex-shrink-0">
                  <Download className="w-4 h-4" />Export CSV
                </button>
              )}
              {(isAdmin || currentUserRole === 'compta') && dossiers.length > 0 && (
                <button
                  onClick={exportComptable}
                  title="Télécharge le grand livre comptable — un fichier CSV par société, un compte par tiers (poseur/régie/fournisseur) avec dû, payé et solde"
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-emerald-200 whitespace-nowrap flex-shrink-0"
                >
                  📊 Export comptable
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setShowImport(true)} className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-slate-200 whitespace-nowrap flex-shrink-0">
                  <Upload className="w-4 h-4" />Importer
                </button>
              )}
              <button onClick={() => { setShowForm(true); setEditingId(null); setFormData(emptyForm); }} className="bg-gradient-to-r from-violet-500 to-pink-500 text-white px-5 py-3 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                <Plus className="w-5 h-5" />Nouveau dossier
              </button>
              {/* Groupe utilisateur poussé tout à droite (ml-auto) — séparé visuellement
                  des boutons d'action. Plus propre. */}
              <div className="flex gap-2 items-center ml-auto">
                {currentUser && (() => {
                  const roleMeta = {
                    admin: { emoji: '👑', label: 'Admin', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
                    commercial: { emoji: '💼', label: 'Commercial', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
                    envoi_finance: { emoji: '🏦', label: 'Envoi finance', bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300' },
                    poseur: { emoji: '🔧', label: 'Poseur', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
                    regie: { emoji: '🤝', label: 'Régie', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
                    compta: { emoji: '💰', label: 'Compta', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
                    administratif: { emoji: '🏛️', label: 'Administratif', bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-300' },
                  };
                  const r = currentUserRole && roleMeta[currentUserRole];
                  return (
                    <div
                      className={`px-4 py-3 rounded-2xl font-semibold shadow-md border flex items-center gap-2 ${r ? `${r.bg} ${r.text} ${r.border}` : 'bg-slate-100 text-slate-700 border-slate-300'}`}
                      title={r ? `Connecté(e) en tant que ${currentUser} — rôle ${r.label}` : `Connecté(e) en tant que ${currentUser}`}
                    >
                      <span className="text-base leading-none">{currentUserEmoji}</span>
                      <span className="text-sm">{currentUserFirstName}</span>
                    </div>
                  );
                })()}
                {canPreviewRole && (
                  <div className="relative">
                    <select
                      value={viewAsRole || ''}
                      onChange={(e) => setViewAsRole(e.target.value || null)}
                      className={`pl-8 pr-7 py-3 rounded-2xl font-semibold shadow-md border text-xs cursor-pointer appearance-none ${viewAsRole ? 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300' : 'bg-white text-slate-600 border-slate-200'}`}
                      title="DEV uniquement — prévisualiser un autre rôle"
                    >
                      <option value="">👁️ Voir comme…</option>
                      <option value="admin">👑 Admin</option>
                      <option value="commercial">💼 Commercial</option>
                      <option value="envoi_finance">🏦 Envoi finance</option>
                      <option value="poseur">🔧 Poseur</option>
                      <option value="regie">🤝 Régie</option>
                      <option value="compta">💰 Compta</option>
                      <option value="administratif">🏛️ Administratif</option>
                    </select>
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-sm">👁️</span>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] opacity-60">▼</span>
                  </div>
                )}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-700 px-3 py-2 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-slate-200"
                    title="Se déconnecter"
                  >
                    <span className="text-2xl leading-none">🚪</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Onglets — selon permissions du rôle actif */}
          <div className="flex gap-2 mb-3 bg-white rounded-2xl p-1.5 shadow-sm border border-violet-100 w-fit flex-wrap">
            <TabButton active={activeTab === 'dossiers'} onClick={() => setActiveTab('dossiers')} icon={FileText} label={`Dossiers (${nbActifs})`} color="from-violet-500 to-pink-500" />
            <TabButton active={activeTab === 'archives'} onClick={() => setActiveTab('archives')} icon={Check} label={`Archivés (${nbArchives})`} color="from-slate-500 to-gray-600" />
            <TabButton active={activeTab === 'calendrier'} onClick={() => setActiveTab('calendrier')} icon={Calendar} label="Calendrier" color="from-orange-500 to-red-500" />
            {permissions.voirRapportPaiements && <TabButton active={activeTab === 'paiements'} onClick={() => setActiveTab('paiements')} icon={Euro} label="Rapport paiements" color="from-emerald-500 to-teal-500" badge={rapportPaiements.totalGeneralRestant > 0 ? formatEuro(rapportPaiements.totalGeneralRestant) + ' dû' : null} badgeColor="bg-rose-100 text-rose-700" />}
            {permissions.voirDashboard && <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={BarChart3} label="Tableau de bord" color="from-blue-500 to-cyan-500" badge={(dashboard.rappelsClient.length + dashboard.rappelsPrestataires.length) > 0 ? `🔔 ${dashboard.rappelsClient.length + dashboard.rappelsPrestataires.length}` : null} badgeColor="bg-amber-100 text-amber-700" />}
            {permissions.voirReglages && <TabButton active={activeTab === 'reglages'} onClick={() => setActiveTab('reglages')} icon={Settings} label="Réglages" color="from-slate-600 to-slate-700" />}
          </div>

          {/* Barre d'alertes rapides */}
          <AlertesBar
            rappelsControleQualite={dashboard.rappelsControleQualite || []}
            rappelsAEnvoyerBanque={dashboard.rappelsAEnvoyerBanque || []}
            rappelsFinancement={dashboard.rappelsFinancement || []}
            rappelsManqueDoc={dashboard.rappelsManqueDoc || []}
            rappelsAEnvoyerPose={dashboard.rappelsAEnvoyerPose || []}
            rappelsPoseurNonAssigne={dashboard.rappelsPoseurNonAssigne || []}
            rappelsPoseNonFinie={dashboard.rappelsPoseNonFinie || []}
            rappelsAEnvoyerMairie={dashboard.rappelsAEnvoyerMairie || []}
            rappelsAEnvoyerConsuel={dashboard.rappelsAEnvoyerConsuel || []}
            rappelsAEnvoyerRaccordement={dashboard.rappelsAEnvoyerRaccordement || []}
            rappelsOriginaux={dashboard.rappelsOriginaux || []}
            rappelsControleLivraison={dashboard.rappelsControleLivraison || []}
            rappelsPaiement={dashboard.rappelsPaiement || []}
            rappelsStagnation={dashboard.rappelsStagnation || []}
            rappelsRecupTva={dashboard.rappelsRecupTva || []}
            rappelsFacturesManquantes={dashboard.rappelsFacturesManquantes || []}
            isAdmin={isAdmin}
            currentUserRole={currentUserRole}
            onClick={(type) => setShowAlertesType(type)}
          />

        </div>

        {/* DOSSIERS / ARCHIVES — même vue, filtre auto */}
        {(activeTab === 'dossiers' || activeTab === 'archives') && (
          <>
            {/* RÉCAP POSEUR / RÉGIE — ce que l'entreprise lui doit / lui a payé */}
            {(isPoseur || isRegie) && prestaRecap && activeTab === 'dossiers' && (
              <div className="bg-white rounded-3xl shadow-md border-2 border-amber-200 overflow-hidden mb-4">
                <div className="p-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    {isPoseur ? '🔧' : '🤝'} {prestaRecap.label} — récap paiements
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Ce que l'entreprise vous doit et ce qui a déjà été réglé.</p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-4 text-white">
                      <div className="text-xs font-semibold opacity-90 uppercase">⏳ Reste à vous payer</div>
                      <div className="text-2xl font-bold mt-1">{formatEuro(prestaRecap.totalDu)}</div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-white">
                      <div className="text-xs font-semibold opacity-90 uppercase">✓ Déjà payé</div>
                      <div className="text-2xl font-bold mt-1">{formatEuro(prestaRecap.totalPaye)}</div>
                    </div>
                  </div>
                  {prestaRecap.lignes.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm">Aucun dossier pour le moment.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {prestaRecap.lignes.map((l, i) => (
                        <div key={i} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm ${l.paye ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${l.paye ? 'bg-emerald-500' : 'bg-orange-500'}`}>
                              {l.paye && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </span>
                            <span className="font-semibold text-slate-700 truncate">{l.client}</span>
                            {l.ville && <span className="text-[11px] text-slate-400 truncate">📍 {l.ville}</span>}
                            {l.dateInsta && <span className="text-[10px] text-slate-400">📅 {formatDateForSheet(l.dateInsta)}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`font-bold ${l.paye ? 'text-emerald-700' : 'text-orange-700'}`}>{formatEuro(l.ttc)}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${l.paye ? 'bg-emerald-200 text-emerald-800' : 'bg-orange-200 text-orange-800'}`}>
                              {l.paye ? `✓ Payé${l.datePaye ? ' · ' + formatDateForSheet(l.datePaye) : ''}` : '⏳ En attente'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'archives' && (
              <div className="bg-gradient-to-r from-slate-100 to-gray-100 border border-slate-300 rounded-2xl p-3 mb-3 flex items-center gap-3">
                <Check className="w-5 h-5 text-slate-600 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-bold text-sm text-slate-700">📦 Archivés ({nbArchives})</div>
                  <div className="text-[11px] text-slate-500">Dossiers payés, annulés ou acceptés définitivement — n'apparaissent plus dans les alertes</div>
                </div>
              </div>
            )}
            {dossiers.length > 0 && (
              <div className="bg-white rounded-2xl p-3 shadow-md border border-violet-100 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowStatutFilter(!showStatutFilter)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-600 uppercase">Filtrer par statut</span>
                    <span className="text-[10px] text-slate-500">{showStatutFilter ? '▲' : '▼'}</span>
                  </button>

                  {/* Indicateur du filtre actif quand replié */}
                  {!showStatutFilter && filterStatut !== 'all' && (() => {
                    const cur = STATUTS_ORDERED.find(s => s.id === filterStatut);
                    if (!cur) return null;
                    const count = dossiers.filter(d => d.statut === filterStatut).length;
                    return (
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-gradient-to-r ${cur.color} text-white shadow-md`}>
                          <span>{cur.emoji}</span>{cur.label}
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/30">{count}</span>
                        </span>
                        <button onClick={() => setFilterStatut('all')} className="text-[10px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg flex items-center gap-0.5" title="Effacer le filtre">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })()}

                  {!showStatutFilter && filterStatut === 'all' && (
                    <span className="text-[11px] text-slate-400 italic">Tous les statuts affichés</span>
                  )}

                  {showStatutFilter && (() => {
                    const emptyCount = STATUTS_ORDERED.filter(s => dossiers.filter(d => d.statut === s.id).length === 0).length;
                    if (emptyCount === 0) return null;
                    return (
                      <button onClick={() => setShowEmptyStatuts(!showEmptyStatuts)} className="ml-auto text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg flex items-center gap-1">
                        {showEmptyStatuts ? '👁️ Masquer' : '👁️ Voir'} les {emptyCount} vides
                      </button>
                    );
                  })()}
                </div>

                {showStatutFilter && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    <button onClick={() => setFilterStatut('all')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${filterStatut === 'all' ? 'bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-md scale-105' : 'bg-slate-100 text-slate-600'}`}>
                      📋 Tous
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterStatut === 'all' ? 'bg-white/30' : 'bg-white text-slate-700'}`}>{dossiers.length}</span>
                    </button>
                    {STATUTS_ORDERED.map(s => {
                      const count = dossiers.filter(d => d.statut === s.id).length;
                      const sel = filterStatut === s.id;
                      const empty = count === 0;
                      if (empty && !showEmptyStatuts && !sel) return null;
                      return (
                        <button key={s.id} onClick={() => setFilterStatut(s.id)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${sel ? `bg-gradient-to-r ${s.color} text-white shadow-md scale-105` : empty ? 'bg-slate-50 text-slate-400 opacity-70' : `${s.bg} ${s.text}`}`}>
                          <span>{s.emoji}</span>{s.label}
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${sel ? 'bg-white/30' : empty ? 'bg-slate-200 text-slate-500' : 'bg-white/80'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {dossiers.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-md border border-violet-100 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm" />
                  </div>

                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-100">
                    <option value="statut">↕️ Trier : Statut</option>
                    <option value="date">📅 Date récente</option>
                    <option value="montant">💰 Montant (gros → petit)</option>
                    <option value="marge">📈 Marge (gros → petit)</option>
                    <option value="nom">🔤 Nom (A → Z)</option>
                  </select>

                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    <button onClick={() => setViewMode('compact')} title="Vue compacte"
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'compact' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      ▭ Compact
                    </button>
                    <button onClick={() => setViewMode('detaille')} title="Vue détaillée"
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'detaille' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      ☰ Détaillé
                    </button>
                  </div>

                  {filterStatut !== 'all' && (
                    <button onClick={() => setFilterStatut('all')} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-2 rounded-lg flex items-center gap-1">
                      <X className="w-3 h-3" />Effacer le filtre
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {filteredDossiers.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center shadow-md border border-violet-100">
                  <div className="text-6xl mb-3">{dossiers.length === 0 ? '⚡' : '🔍'}</div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{dossiers.length === 0 ? 'Aucun dossier' : 'Aucun résultat'}</h3>
                  <p className="text-slate-500 text-sm">{dossiers.length === 0 ? 'Cliquez sur "Nouveau dossier" pour commencer' : 'Modifiez vos filtres'}</p>
                </div>
              ) : (
                filteredDossiers.map(d => <DossierCard key={d.localId} d={d} statut={STATUTS.find(s => s.id === d.statut)} isCopied={copiedId === d.localId} onCopy={copyToClipboard} onEdit={startEdit} onDelete={deleteDossier} onShowDocs={setShowDocsForId} onShowHist={setShowHistForId} onShowQuick={setShowQuickViewId} viewMode={viewMode} isAdmin={isAdmin} produits={produits} readOnly={isPoseur || isRegie} societes={societes} />)
              )}
            </div>

            <div className="mt-8 text-center text-sm text-slate-400">
              <p>💾 Sauvegarde automatique</p>
            </div>
          </>
        )}

        {/* PAIEMENTS */}
        {activeTab === 'paiements' && <PaiementsView
          rapportPaiements={rapportPaiements}
          societes={societes}
          onShowQuick={(id, scrollTo) => { setShowQuickViewId(id); setQuickViewScrollTo(scrollTo || null); }}
          onTogglePenalite={(dossierLocalId, tentativeIdx) => {
            const now = new Date().toISOString();
            setDossiers(dossiers.map(d => {
              if (d.localId !== dossierLocalId) return d;
              const tent = [...(d.tentativesPose || [])];
              if (!tent[tentativeIdx]) return d;
              tent[tentativeIdx] = { ...tent[tentativeIdx], regleAt: tent[tentativeIdx].regleAt ? null : now };
              return { ...d, tentativesPose: tent, savedAt: now, modifiedAt: now };
            }));
          }}
          onToggleLitige={(dossierLocalId) => {
            const now = new Date().toISOString();
            const today = now.split('T')[0];
            setDossiers(dossiers.map(d => {
              if (d.localId !== dossierLocalId) return d;
              const willBeRembourse = !d.litigeRegieRembourse;
              return {
                ...d,
                litigeRegieRembourse: willBeRembourse,
                litigeDateRembourse: willBeRembourse ? (d.litigeDateRembourse || today) : d.litigeDateRembourse,
                savedAt: now,
                modifiedAt: now,
              };
            }));
          }}
        />}

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && <DashboardView dossiers={dossiers} dashboard={dashboard} STATUTS={STATUTS} onCreate={() => { setShowForm(true); setEditingId(null); setFormData(emptyForm); }} onShowQuick={(id, scrollTo) => { setShowQuickViewId(id); setQuickViewScrollTo(scrollTo || null); }} />}

        {activeTab === 'calendrier' && (
          <CalendrierView
            dossiers={dossiers}
            STATUTS={STATUTS}
            onShowQuick={setShowQuickViewId}
            isAdmin={isAdmin}
          />
        )}

        {/* RÉGLAGES */}
        {activeTab === 'reglages' && (
          <ReglagesView
            statutsOrder={statutsOrder} setStatutsOrder={setStatutsOrder} STATUTS_ORDERED={STATUTS_ORDERED} dossiers={dossiers}
            tarifsPoseurs={tarifsPoseurs} setTarifsPoseurs={setTarifsPoseurs}
            tarifsRegies={tarifsRegies} setTarifsRegies={setTarifsRegies}
            tarifsInternes={tarifsInternes} setTarifsInternes={setTarifsInternes}
            nomsInternes={nomsInternes} setNomsInternes={setNomsInternes}
            listeFournisseurs={listeFournisseurs} setListeFournisseurs={setListeFournisseurs}
            tarifsFournisseurs={tarifsFournisseurs} setTarifsFournisseurs={setTarifsFournisseurs}
            produits={produits} setProduits={setProduits}
            users={users} setUsers={setUsers}
            poseursContacts={poseursContacts} setPoseursContacts={setPoseursContacts}
            regiesContacts={regiesContacts} setRegiesContacts={setRegiesContacts}
            emailConfig={emailConfig} setEmailConfig={setEmailConfig}
            gmailOAuth={gmailOAuth} setGmailOAuth={setGmailOAuth}
            societes={societes} setSocietes={setSocietes}
          />
        )}

        {/* FORMULAIRE */}
        {showForm && (
          <FormulaireDossier
            formData={formData} setFormData={setFormData} editingId={editingId} calculs={calculs}
            STATUTS_ORDERED={STATUTS_ORDERED} POSEURS={POSEURS} REGIES={REGIES} FOURNISSEURS={FOURNISSEURS}
            tarifsPoseurs={tarifsPoseurs} tarifsRegies={tarifsRegies} tarifsInternes={tarifsInternes}
            nomsInternes={nomsInternes} setNomsInternes={setNomsInternes}
            produits={produits}
            societes={societes}
            currentUser={currentUser}
            onClose={resetForm} onSubmit={handleSubmit} isAdmin={isAdmin}
          />
        )}

        {/* MODAL DOCUMENTS */}
        {currentDocsDossier && (
          <DocumentsModal
            dossier={currentDocsDossier}
            onClose={() => setShowDocsForId(null)}
            onUpdate={updateDossier}
            isAdmin={isAdmin}
          />
        )}

        {/* MODAL HISTORIQUE */}
        {currentHistDossier && (
          <HistoriqueModal
            dossier={currentHistDossier}
            onClose={() => setShowHistForId(null)}
          />
        )}

        {/* PANNEAU APERÇU RAPIDE (slide-in droite) */}
        {currentQuickDossier && (
          <QuickViewPanel
            dossier={currentQuickDossier}
            scrollTo={quickViewScrollTo}
            onClose={() => { setShowQuickViewId(null); setQuickViewScrollTo(null); }}
            onEdit={() => { startEdit(currentQuickDossier); setShowQuickViewId(null); setQuickViewScrollTo(null); }}
            onShowDocs={() => { setShowDocsForId(currentQuickDossier.localId); setShowQuickViewId(null); setQuickViewScrollTo(null); }}
            onShowHist={() => { setShowHistForId(currentQuickDossier.localId); setShowQuickViewId(null); setQuickViewScrollTo(null); }}
            onUpdate={(updates) => {
              const now = new Date().toISOString();
              const userTag = currentUser || '(anonyme)';
              setDossiers(dossiers.map(d => {
                if (d.localId !== currentQuickDossier.localId) return d;
                let merged = { ...d, ...updates, savedAt: now, modifiedBy: userTag, modifiedAt: now };
                // 📜 Trace tous les changements de champs (hors statut, qui a son
                // entrée dédiée juste après). Une entrée d'historique par appel
                // onUpdate, regroupant toutes les modifs faites simultanément.
                const fieldChanges = [];
                for (const key of Object.keys(updates)) {
                  if (key === 'statut' || key === 'historique') continue;
                  const before = d[key];
                  const after = updates[key];
                  if (JSON.stringify(before) === JSON.stringify(after)) continue;
                  fieldChanges.push({ field: key, from: before, to: after });
                }
                if (fieldChanges.length > 0) {
                  merged.historique = [...(merged.historique || []), { date: now, action: 'modification', user: userTag, changes: fieldChanges }];
                }
                // Trace le changement de statut manuel s'il y en a un
                if (updates.statut && updates.statut !== d.statut) {
                  merged.historique = [...(merged.historique || []), { date: now, from: d.statut, to: updates.statut, action: 'changement_statut', user: userTag, bizDate: statutMilestoneDate(merged, d.statut, updates.statut) }];
                  // Désarchivage automatique si statut → SAV (ou Litige/Problème)
                  if (d.archived && ['D_SAV', 'C_LITIGE', 'M_NRP_CQ_LIVRAISON', 'F1_CONTROLE_LIV_BANQUE', 'CONFORMITE_CONTRAT'].includes(updates.statut)) {
                    merged.archived = false;
                    merged.reprisDuArchive = now;
                  }
                }
                // Auto-statut : recalcule le statut depuis l'état du dossier
                // (CQ, envoi banque, accord, date pose, poseur, etc.).
                // applyAutoStatut respecte les statuts hors cycle (SAV, LITIGE,
                // ANNULER, etc.) — il ne touche qu'aux statuts d'AUTO_STATUTS.
                const beforeAuto = merged.statut;
                merged = applyAutoStatut(merged);
                if (merged.statut !== beforeAuto) {
                  merged.historique = [...(merged.historique || []), { date: now, from: beforeAuto, to: merged.statut, action: 'auto_statut', user: userTag, bizDate: statutMilestoneDate(merged, beforeAuto, merged.statut) }];
                }

                // Auto-archivage sur ANNULER : on n'a plus besoin du dossier
                // dans la liste principale. Les pénalités et chiffres restent
                // visibles dans le Rapport paiements et le Dashboard (qui
                // utilisent tous les dossiers, archivés inclus).
                if (merged.statut === 'W2_ANNULER' && !merged.archived && updates.archived === undefined) {
                  merged.archived = true;
                  merged.archivedAt = now;
                  merged.autoArchived = true;
                  merged.autoArchivedReason = 'annule';
                }
                // Auto-désarchivage si le dossier sort d'ANNULER alors qu'il
                // avait été archivé pour ça (ex : suppression de la tentative
                // définitive qui le bloquait en annulation).
                if (merged.statut !== 'W2_ANNULER' && merged.archived && merged.autoArchivedReason === 'annule') {
                  merged.archived = false;
                  merged.archivedAt = null;
                  merged.autoArchived = false;
                  merged.autoArchivedReason = null;
                  merged.reprisDuArchive = now;
                }

                // Auto-archivage : si tout est payé (client + poseurs + fournisseurs + régie + équipe interne) → archiver auto
                // Sauf si l'utilisateur vient juste de désarchiver manuellement (updates.archived === false)
                if (!merged.archived && updates.archived === undefined) {
                  const clientPaye = merged.payeClient === true;
                  const poseurs = merged.poseurs || [];
                  const tousPoseursPayes = poseurs.length === 0 || poseurs.every(p => !p.nom || p.paye);
                  const fournisseurs = merged.fournisseurs || [];
                  const tousFournPayes = fournisseurs.length === 0 || fournisseurs.every(f => !f.nom || f.paye);
                  const regiePayee = !merged.regie || merged.regiePaye === true;
                  // Multi-régies : toutes payées
                  const toutesRegiesPayees = (merged.regies || []).every(r => !r.nom || r.paye);
                  // Équipe interne : tous les rôles renseignés doivent être payés (peu importe typeRegie)
                  const ROLES_KEYS = ['teleprospecteur', 'confirmateur', 'commercial', 'coordinateurProjet', 'responsableEnvoiPose'];
                  const equipeInternePayee = ROLES_KEYS.every(k => !merged[k] || merged[k + 'Paye']);
                  if (clientPaye && tousPoseursPayes && tousFournPayes && regiePayee && toutesRegiesPayees && equipeInternePayee) {
                    merged.archived = true;
                    merged.archivedAt = now;
                    merged.autoArchived = true; // pour info
                  }
                }
                return merged;
              }));
            }}
            STATUTS={STATUTS}
            STATUTS_ORDERED={STATUTS_ORDERED}
            FINANCEMENTS={FINANCEMENTS}
            POSEURS={POSEURS}
            REGIES={REGIES}
            FOURNISSEURS={FOURNISSEURS}
            tarifsInternes={tarifsInternes}
            nomsInternes={nomsInternes}
            setNomsInternes={setNomsInternes}
            produits={produits}
            isAdmin={isAdmin}
            permissions={permissions}
            poseursContacts={effectivePoseursContacts}
            regiesContacts={effectiveRegiesContacts}
            emailConfig={emailConfig}
            gmailOAuth={gmailOAuth}
            societes={societes}
          />
        )}

        {/* MODAL IMPORT DOSSIERS */}
        {showImport && (
          <ImportDossiersModal
            onClose={() => setShowImport(false)}
            onImport={(newDossiers) => {
              setDossiers([...dossiers, ...newDossiers]);
              setShowImport(false);
            }}
            existingDossiers={dossiers}
            STATUTS_ORDERED={STATUTS_ORDERED}
            POSEURS={POSEURS}
            REGIES={REGIES}
            FOURNISSEURS={FOURNISSEURS}
            produits={produits}
          />
        )}

        {/* RECHERCHE GLOBALE Ctrl+K */}
        {showSearch && (
          <GlobalSearchModal
            dossiers={dossiers}
            STATUTS={STATUTS}
            isAdmin={isAdmin}
            onClose={() => setShowSearch(false)}
            onSelect={(localId) => {
              setShowSearch(false);
              setShowQuickViewId(localId);
            }}
          />
        )}

        {/* ASSISTANT IA — secrétaire qui rédige les mails clients */}
        {showAssistantIa && (
          <AssistantIaModal
            dossiers={dossiers}
            gmailOAuth={gmailOAuth}
            emailConfig={emailConfig}
            currentUser={currentUser}
            onClose={() => setShowAssistantIa(false)}
            onSent={(localId, entry) => {
              const userTag = currentUser || '(anonyme)';
              setDossiers(prev => prev.map(d => d.localId === localId
                ? { ...d, historique: [...(d.historique || []), { date: new Date().toISOString(), user: userTag, ...entry }] }
                : d
              ));
            }}
          />
        )}

        {/* Bouton flottant 🤖 Assistant IA — accessible partout, comme une
            secrétaire toujours dispo. Bottom-right pour ne pas gêner les
            actions principales. */}
        <button
          onClick={() => setShowAssistantIa(true)}
          title="Assistant IA — envoie un mail à un client en lui donnant un ordre"
          className="fixed bottom-6 right-6 z-40 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-bold text-sm"
        >
          <Sparkles className="w-5 h-5" />
          <span className="hidden sm:inline">Assistant IA</span>
        </button>

        {/* MODAL ALERTES (financement, consuel, paiement, stagnation) */}
        {showAlertesType && (
          <AlertesModal
            type={showAlertesType}
            dashboard={dashboard}
            STATUTS={STATUTS}
            poseursContacts={effectivePoseursContacts}
            regiesContacts={effectiveRegiesContacts}
            onLogAction={(localId, entry) => {
              const userTag = currentUser || '(anonyme)';
              setDossiers(prev => prev.map(d => d.localId === localId
                ? { ...d, historique: [...(d.historique || []), { date: new Date().toISOString(), user: userTag, ...entry }] }
                : d
              ));
            }}
            onClose={() => setShowAlertesType(null)}
            onSelect={(localId) => {
              // Mappe le type d'alerte vers la section à scroller / déplier
              // dans le panneau aperçu rapide.
              const scrollMap = {
                controleQualite: 'cq',
                aEnvoyerBanque: 'financement',
                financement: 'financement',
                aEnvoyerPose: 'pose',
                poseurNonAssigne: 'poseurs',
                poseNonFinie: 'pose',
                aEnvoyerMairie: 'mairie',
                aEnvoyerConsuel: 'consuel',
                aEnvoyerRaccordement: 'raccordement',
                facturesManquantes: 'poseurs',
                originaux: 'paiement',
                controle: 'paiement',
                paiement: 'paiement',
                recup_tva: 'paiement',
                stagnation: null, // pas de section précise, on ouvre juste le panneau
              };
              const target = scrollMap[showAlertesType] || null;
              setShowAlertesType(null);
              setShowQuickViewId(localId);
              setQuickViewScrollTo(target);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ===================== COMPOSANTS =====================

function TabButton({ active, onClick, icon: Icon, label, color, badge, badgeColor }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${active ? `bg-gradient-to-r ${color} text-white shadow-md` : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon className="w-4 h-4" />{label}
      {badge && <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] ${active ? 'bg-white/30' : badgeColor}`}>{badge}</span>}
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color, small }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500 uppercase">{label}</div>
          <div className={`font-bold text-slate-800 truncate ${small ? 'text-base' : 'text-2xl'}`}>{value}</div>
        </div>
        <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function StatusBreakdown({ dossiers, STATUTS, onSelect, filterStatut }) {
  const counts = STATUTS
    .map(s => ({ ...s, count: dossiers.filter(d => d.statut === s.id).length }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const isFiltering = filterStatut && filterStatut !== 'all';

  return (
    <div className="bg-white rounded-2xl p-4 shadow-md border border-slate-100 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-semibold text-slate-500 uppercase">Par statut</div>
        {isFiltering ? (
          <button onClick={() => onSelect && onSelect('all')} className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
            <X className="w-2.5 h-2.5" />Effacer filtre
          </button>
        ) : (
          <div className="text-[10px] font-bold text-slate-400">{counts.length} actif{counts.length > 1 ? 's' : ''}</div>
        )}
      </div>
      {counts.length === 0 ? (
        <div className="text-sm text-slate-400 italic">Aucun dossier</div>
      ) : (
        <div className="flex flex-wrap gap-1 content-start flex-1">
          {counts.map(s => {
            const sel = filterStatut === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect && onSelect(sel ? 'all' : s.id)}
                title={sel ? 'Cliquer pour effacer le filtre' : `Filtrer par ${s.label}`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold transition-all hover:scale-105 ${sel ? `bg-gradient-to-r ${s.color} text-white shadow-md scale-105` : `${s.bg} ${s.text}`}`}
              >
                <span>{s.emoji}</span>
                <span>{s.label}</span>
                <span className={`px-1 rounded-full text-[10px] font-bold min-w-[16px] text-center ${sel ? 'bg-white/30 text-white' : 'bg-white/80 text-slate-700'}`}>{s.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 🏢 Map des classes Tailwind pour les badges société (statique pour pas
// que le purger CSS les vire en prod).
const SOCIETE_BADGE_CLASSES = {
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  blue:    'bg-blue-100 text-blue-700 border-blue-200',
  violet:  'bg-violet-100 text-violet-700 border-violet-200',
  amber:   'bg-amber-100 text-amber-700 border-amber-200',
  rose:    'bg-rose-100 text-rose-700 border-rose-200',
  slate:   'bg-slate-100 text-slate-700 border-slate-200',
};

// 🏢 Badge unifié pour les sociétés. Affiche le logo s'il est uploadé,
// sinon retombe sur emoji + couleur.
// Variants : 'inline' (petit, dans une carte), 'large' (boutons),
// 'iconOnly' (uniquement logo/emoji sans label).
function SocieteBadge({ societe, variant = 'inline', active = false, onClick = null }) {
  if (!societe) return null;
  const hasLogo = !!societe.logoUrl;
  const cls = SOCIETE_BADGE_CLASSES[societe.color] || SOCIETE_BADGE_CLASSES.violet;
  // Mode iconOnly : juste le logo ou l'emoji, pas de label/couleur
  if (variant === 'iconOnly') {
    return hasLogo
      ? <img src={societe.logoUrl} alt={societe.label} title={societe.label} className="h-5 w-auto object-contain inline-block align-middle" />
      : <span title={societe.label}>{societe.emoji}</span>;
  }
  // Mode large : bouton du sélecteur (header App, form)
  // Si logo uploadé → on n'affiche QUE le logo (sans label) pour gagner de la
  // place dans le header. Le logo parle de lui-même. Sans logo → emoji + label.
  if (variant === 'large') {
    const colorMap = {
      emerald: { active: 'bg-emerald-500 text-white border-emerald-600 shadow-md', inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
      blue:    { active: 'bg-blue-500 text-white border-blue-600 shadow-md',       inactive: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50' },
      violet:  { active: 'bg-violet-500 text-white border-violet-600 shadow-md',   inactive: 'bg-white text-violet-700 border-violet-200 hover:bg-violet-50' },
      amber:   { active: 'bg-amber-500 text-white border-amber-600 shadow-md',     inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50' },
      rose:    { active: 'bg-rose-500 text-white border-rose-600 shadow-md',       inactive: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50' },
      slate:   { active: 'bg-slate-700 text-white border-slate-800 shadow-md',     inactive: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' },
    };
    const c = (colorMap[societe.color] || colorMap.violet)[active ? 'active' : 'inactive'];
    if (hasLogo) {
      // Logo-only : carré compact, sans label
      const cls = active
        ? 'bg-slate-700 border-slate-800 shadow-md ring-2 ring-slate-400'
        : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300';
      return (
        <button
          onClick={onClick}
          title={societe.label}
          className={`px-2 py-1.5 rounded-lg border-2 transition-all flex items-center justify-center min-w-[44px] ${cls}`}
        >
          <img src={societe.logoUrl} alt={societe.label} className="h-6 w-auto object-contain" />
        </button>
      );
    }
    return (
      <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all flex items-center gap-1.5 ${c}`}>
        <span>{societe.emoji}</span>
        <span>{societe.label}</span>
      </button>
    );
  }
  // Mode inline (défaut) : badge compact avec logo ou emoji + label
  return (
    <span title={`Société : ${societe.label}`} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${hasLogo ? 'bg-white text-slate-700 border-slate-300' : cls}`}>
      {hasLogo
        ? <img src={societe.logoUrl} alt={societe.label} className="h-3.5 w-auto object-contain" />
        : <span>{societe.emoji}</span>}
      <span>{societe.label}</span>
    </span>
  );
}

function DossierCard({ d, statut, isCopied, onCopy, onEdit, onDelete, onShowDocs, onShowHist, onShowQuick, viewMode, isAdmin, produits, readOnly, societes = [] }) {
  const docCount = (d.documents || []).length;
  // 🏢 Badge société (Yolico / Elsun) — visible si dossier rattaché à une société
  const societeMeta = d.societe ? societes.find(s => s.id === d.societe) : null;
  // Migration en lecture : si pas de produits[], reconstruit depuis l'ancien format
  const dossierProduits = (d.produits && d.produits.length > 0)
    ? d.produits
    : [{ type: d.produit || 'PANNEAU_SOLAIRE', puissance: d.puissance || 0, description: '' }];

  // Bouton 📎 réutilisable
  const DocsBtn = ({ size = 'normal' }) => {
    const cls = size === 'small' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';
    const padding = size === 'small' ? 'p-1' : 'p-1.5';
    return (
      <button
        onClick={() => onShowDocs(d.localId)}
        title={docCount > 0 ? `${docCount} document(s)` : 'Ajouter des documents'}
        className={`${padding} relative rounded-lg ${docCount > 0 ? 'text-violet-600 bg-violet-50 hover:bg-violet-100' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}
      >
        <Paperclip className={cls} />
        {docCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-gradient-to-br from-violet-500 to-pink-500 text-white text-[9px] rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center font-bold shadow-sm">
            {docCount}
          </span>
        )}
      </button>
    );
  };

  // Bouton 📜 historique réutilisable
  const histCount = (d.historique || []).length;
  const HistBtn = ({ size = 'normal' }) => {
    const cls = size === 'small' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5';
    const padding = size === 'small' ? 'p-1' : 'p-1.5';
    return (
      <button
        onClick={() => onShowHist(d.localId)}
        title={histCount > 0 ? `Historique (${histCount} évènement${histCount > 1 ? 's' : ''})` : 'Pas d\'historique'}
        className={`${padding} relative rounded-lg ${histCount > 0 ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
      >
        <Activity className={cls} />
        {histCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-gradient-to-br from-amber-500 to-orange-500 text-white text-[9px] rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center font-bold shadow-sm">
            {histCount}
          </span>
        )}
      </button>
    );
  };

  // ===== VUE COMPACTE =====
  if (viewMode === 'compact') {
    return (
      <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border-l-4 px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderLeftColor: '#a855f7' }}>
        {d.id && <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex-shrink-0">#{d.id}</span>}
        {societeMeta && <SocieteBadge societe={societeMeta} variant="inline" />}
        {readOnly
          ? <span className="font-bold text-slate-800 text-sm">{d.nom}{d.prenom ? ` ${d.prenom}` : ''}</span>
          : <button onClick={(e) => { e.stopPropagation(); onShowQuick(d.localId); }} className="font-bold text-slate-800 text-sm hover:text-violet-600 hover:underline transition-colors text-left" title="Voir l'aperçu rapide">{d.nom}{d.prenom ? ` ${d.prenom}` : ''}</button>}
        {statut && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statut.bg} ${statut.text}`}><span>{statut.emoji}</span>{statut.label}</span>}
        {(() => {
          const nCQ = (d.tentativesCQ || []).length;
          const nLiv = (d.tentativesControleLivraison || []).length;
          const showCQ = nCQ > 0 && !d.statutControleQualite;
          const showLiv = nLiv > 0 && !d.dateControleLivraison;
          if (!showCQ && !showLiv) return null;
          const total = (showCQ ? nCQ : 0) + (showLiv ? nLiv : 0);
          const tip = [showCQ ? `${nCQ} essai${nCQ > 1 ? 's' : ''} CQ sans réponse` : null, showLiv ? `${nLiv} essai${nLiv > 1 ? 's' : ''} contrôle livraison sans réponse` : null].filter(Boolean).join(' · ');
          return (
            <span title={tip} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
              🔁 {total} essai{total > 1 ? 's' : ''}
            </span>
          );
        })()}
        <span className="text-[11px] text-slate-500">📅 {formatDateForSheet(d.dateInsta)}</span>
        {(() => {
          const firstProd = dossierProduits[0];
          const prod = findProduit(produits, firstProd?.type);
          const label = prod.autoTarif && firstProd.puissance ? `${prod.emoji} ${firstProd.puissance}` : `${prod.emoji} ${prod.label}`;
          return (
            <span className="text-[11px] text-amber-700">
              {label}{dossierProduits.length > 1 ? ` +${dossierProduits.length - 1}` : ''}
            </span>
          );
        })()}
        {!readOnly && <span className="text-[11px] text-violet-700">💳 {d.financement}</span>}
        <span className="ml-auto inline-flex items-center gap-2">
          {!readOnly && <span className="font-bold text-blue-600 text-sm">{formatEuro(d.montantTotal)}</span>}
          {isAdmin && (
            <span className={`text-[11px] font-semibold ${d.margeTtc >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ({formatEuro(d.margeTtc)})
            </span>
          )}
          {!readOnly && (
            <>
              <button onClick={() => onCopy(d)} aria-label={isCopied ? 'Copié' : 'Copier infos client'} title={isCopied ? 'Copié' : 'Copier les coordonnées'} className={`p-1 rounded ${isCopied ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}>
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <DocsBtn size="small" /><HistBtn size="small" />
              <button onClick={() => onEdit(d)} aria-label="Modifier le dossier" title="Modifier le dossier" className="p-1 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
              {isAdmin && <button onClick={() => onDelete(d.localId)} aria-label="Supprimer le dossier" title="Supprimer le dossier" className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
            </>
          )}
        </span>
      </div>
    );
  }

  // ===== VUE DÉTAILLÉE =====
  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: '#a855f7' }}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {d.id && <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">#{d.id}</span>}
              <h3 className="font-bold text-slate-800 text-sm">
                {readOnly
                  ? <span>{d.nom} {d.prenom && <span className="font-normal text-slate-600">{d.prenom}</span>}</span>
                  : <button onClick={(e) => { e.stopPropagation(); onShowQuick(d.localId); }} className="hover:text-violet-600 hover:underline transition-colors text-left" title="Voir l'aperçu rapide">{d.nom} {d.prenom && <span className="font-normal text-slate-600">{d.prenom}</span>}</button>}
              </h3>
              {!readOnly && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
                  💰 {formatEuro(d.montantTotal)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {statut && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${statut.bg} ${statut.text}`}><span>{statut.emoji}</span>{statut.label}</span>}
              {(() => {
                const nCQ = (d.tentativesCQ || []).length;
                const nLiv = (d.tentativesControleLivraison || []).length;
                const showCQ = nCQ > 0 && !d.statutControleQualite;
                const showLiv = nLiv > 0 && !d.dateControleLivraison;
                if (!showCQ && !showLiv) return null;
                const total = (showCQ ? nCQ : 0) + (showLiv ? nLiv : 0);
                const tip = [showCQ ? `${nCQ} essai${nCQ > 1 ? 's' : ''} CQ sans réponse` : null, showLiv ? `${nLiv} essai${nLiv > 1 ? 's' : ''} contrôle livraison sans réponse` : null].filter(Boolean).join(' · ');
                return (
                  <span title={tip} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                    🔁 {total} essai{total > 1 ? 's' : ''}
                  </span>
                );
              })()}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700"><Calendar className="w-3 h-3" />{formatDateForSheet(d.dateInsta)}</span>
              {d.dateSignature && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700">✍️ {formatDateForSheet(d.dateSignature)}</span>}
              {dossierProduits.map((p, i) => {
                const prod = findProduit(produits, p.type);
                const qty = p.quantite || 1;
                const qtyPrefix = (!prod.autoTarif && qty > 1) ? `${qty}× ` : '';
                const label = prod.autoTarif && p.puissance
                  ? `${prod.emoji} ${p.puissance} Wc`
                  : `${qtyPrefix}${prod.emoji} ${prod.label}${p.description ? ' · ' + p.description : ''}`;
                return (
                  <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                    {label}
                  </span>
                );
              })}
              {!readOnly && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700">💳 {d.financement}</span>}
              {docCount > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700">
                  <Paperclip className="w-3 h-3" />{docCount} doc{docCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {/* BARRE D'ACTIVITÉ — qui a créé / modifié */}
            {(d.createdBy || d.modifiedBy || (d.historique && d.historique.length > 0)) && (() => {
              const fmtRel = (iso) => {
                if (!iso) return '';
                try {
                  const date = new Date(iso);
                  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                  if (days === 0) return `auj. à ${time}`;
                  if (days === 1) return `hier à ${time}`;
                  if (days < 7) return `il y a ${days}j à ${time}`;
                  if (days < 30) return `il y a ${Math.floor(days / 7)}sem à ${time}`;
                  return `${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} à ${time}`;
                } catch (e) { return ''; }
              };
              const lastHist = (d.historique || []).slice(-1)[0];
              const lastModBy = d.modifiedBy && d.modifiedBy !== d.createdBy ? d.modifiedBy : null;
              return (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px]">
                  {d.createdBy && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-semibold">
                      <span className="text-base leading-none">👤</span>
                      <span>Créé par <strong>{d.createdBy}</strong></span>
                      {d.createdAt && <span className="text-cyan-500 font-normal">· {fmtRel(d.createdAt)}</span>}
                    </span>
                  )}
                  {lastModBy && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
                      <span className="text-base leading-none">✏️</span>
                      <span>Modif par <strong>{lastModBy}</strong></span>
                      {d.modifiedAt && <span className="text-blue-500 font-normal">· {fmtRel(d.modifiedAt)}</span>}
                    </span>
                  )}
                  {lastHist && lastHist.action === 'changement_statut' && lastHist.user && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                      <span className="text-base leading-none">🔄</span>
                      <span>Statut chgé par <strong>{lastHist.user}</strong></span>
                      {lastHist.date && <span className="text-amber-500 font-normal">· {fmtRel(lastHist.date)}</span>}
                    </span>
                  )}
                </div>
              );
            })()}
            {(d.telephone || d.email || d.adresse || d.ville) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {d.telephone && <a href={`tel:${d.telephone}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">📞 {d.telephone}</a>}
                {d.email && <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 text-cyan-700">✉️ {d.email}</a>}
                {(d.adresse || d.ville) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([d.adresse, d.codePostal, d.ville].filter(Boolean).join(' '))}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700">📍 {[d.adresse, d.codePostal, d.ville].filter(Boolean).join(', ')}</a>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {!readOnly && (
              <>
                <button onClick={() => onCopy(d)} aria-label={isCopied ? 'Copié' : 'Copier infos client'} title={isCopied ? 'Copié' : 'Copier les coordonnées'} className={`p-1.5 rounded-lg ${isCopied ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'}`}>
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <DocsBtn /><HistBtn />
                <button onClick={() => onEdit(d)} aria-label="Modifier le dossier" title="Modifier le dossier" className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"><Edit3 className="w-3.5 h-3.5" /></button>
              </>
            )}
            {isAdmin && <button onClick={() => onDelete(d.localId)} aria-label="Supprimer le dossier" title="Supprimer le dossier" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
        {/* Grille chiffres — masquée en lecture seule (poseur / régie) */}
        {readOnly ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
            <Mini label="Date de pose" value={formatDateForSheet(d.dateInsta) || '—'} color="text-blue-600" />
            {(() => {
              if (dossierProduits.length > 1) {
                return <Mini label="Matériel posé" value={`${dossierProduits.length} installations`} color="text-amber-600" />;
              }
              const p = findProduit(produits, dossierProduits[0]?.type);
              const val = p.autoTarif && dossierProduits[0]?.puissance ? `${p.emoji} ${dossierProduits[0].puissance} Wc` : `${p.emoji} ${p.label}`;
              return <Mini label="Matériel posé" value={val} color="text-amber-600" />;
            })()}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
            <Mini label="Vente TTC" value={formatEuro(d.montantTotal)} color="text-blue-600" />
            <Mini label="Vente HT" value={formatEuro(d.montantHt)} color="text-cyan-600" />
            {isAdmin && <Mini label="Marge TTC" value={formatEuro(d.margeTtc)} color={d.margeTtc >= 0 ? 'text-emerald-600' : 'text-rose-600'} />}
            {!isAdmin && <Mini label="Financement" value={d.financement} color="text-violet-600" />}
            {!isAdmin && (() => {
              if (dossierProduits.length > 1) {
                return <Mini label="Produits" value={`${dossierProduits.length} installations`} color="text-amber-600" />;
              }
              const p = findProduit(produits, dossierProduits[0]?.type);
              const val = p.autoTarif && dossierProduits[0]?.puissance ? `${p.emoji} ${dossierProduits[0].puissance} Wc` : `${p.emoji} ${p.label}`;
              return <Mini label="Produit" value={val} color="text-amber-600" />;
            })()}
          </div>
        )}
        {/* INTERVENANTS — bloc unifié : poseurs + régies + fournisseurs côte à côte */}
        {isAdmin && ((d.poseursDetail?.length || 0) + (d.regiesDetail?.length || 0) + (d.fournisseursDetail?.length || 0) > 0) && (
          <div className="mt-1.5 grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {/* Poseurs */}
            {(d.poseursDetail?.length || 0) > 0 && (
              <div className="bg-amber-50 rounded-lg p-1.5 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-700 uppercase mb-1 flex items-center justify-between gap-1">
                  <span>🔧 Poseurs ({d.poseursDetail.length})</span>
                  <span className="font-bold text-amber-800">{formatEuro(d.poseurTtc)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.poseursDetail.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white text-amber-700 border border-amber-200">
                      <span className="font-bold">{p.nom}</span>
                      <span className="text-amber-500">·</span>
                      <span>{formatEuro(p.ttc)}</span>
                      {p.factureNo && <><span className="text-amber-400">·</span><span className="text-amber-600">🧾 {p.factureNo}</span></>}
                      {p.facturePdfUrl && (
                        <a href={p.facturePdfUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-0.5 px-1 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded font-bold" title="Ouvrir la facture PDF">📄</a>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Régies */}
            {(d.regiesDetail?.length || 0) > 0 && (
              <div className="bg-purple-50 rounded-lg p-1.5 border border-purple-200">
                <div className="text-[10px] font-bold text-purple-700 uppercase mb-1 flex items-center justify-between gap-1">
                  <span>🤝 Régies ({d.regiesDetail.length})</span>
                  <span className="font-bold text-purple-800">{formatEuro(d.regieTtc)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.regiesDetail.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white text-purple-700 border border-purple-200">
                      <span className="font-bold">{r.nom}</span>
                      <span className="text-purple-500">·</span>
                      <span>{formatEuro(r.ttc)}</span>
                      {r.factureNo && <><span className="text-purple-400">·</span><span className="text-purple-600">🧾 {r.factureNo}</span></>}
                      {r.facturePdfUrl && (
                        <a href={r.facturePdfUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-0.5 px-1 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded font-bold" title="Ouvrir la facture PDF">📄</a>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* Fournisseurs */}
            {(d.fournisseursDetail?.length || 0) > 0 && (
              <div className="bg-orange-50 rounded-lg p-1.5 border border-orange-200">
                <div className="text-[10px] font-bold text-orange-700 uppercase mb-1 flex items-center justify-between gap-1">
                  <span>📦 Fournisseurs ({d.fournisseursDetail.length})</span>
                  <span className="font-bold text-orange-800">{formatEuro(d.fournisseurTtc)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.fournisseursDetail.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white text-orange-700 border border-orange-200">
                      <span className="font-bold">{f.nom}</span>
                      <span className="text-orange-500">·</span>
                      <span>{formatEuro(f.ttc)}</span>
                      {f.factureNo && <><span className="text-orange-400">·</span><span className="text-orange-600">🧾 {f.factureNo}</span></>}
                      {f.facturePdfUrl && (
                        <a href={f.facturePdfUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ml-0.5 px-1 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded font-bold" title="Ouvrir la facture PDF">📄</a>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, sub, color }) {
  return (
    <div className="bg-slate-50 rounded p-1.5">
      <div className="text-[9px] font-semibold text-slate-500 uppercase">{label}</div>
      <div className={`text-xs font-bold ${color || 'text-slate-700'} truncate`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500">{sub}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 🎤 VOCAL CQ — helpers réutilisables (formulaire d'édition + QuickView).
// Le vocal du contrôle qualité peut venir de 3 sources :
//   (1) un lien externe collé/poussé par ONOFF dans `vocalCQUrl`
//   (2) un fichier téléversé dans le bucket Supabase → path stocké dans
//       `vocalCQStoragePath` tel quel (ex. "vocal_cq_xxx.m4a")
//   (3) un fichier téléversé en fallback KV (si bucket refuse le mime
//       type audio) → path préfixé "kv:file:vocal_cq_xxx"
// Le path prime sur le lien si les deux existent.
// ────────────────────────────────────────────────────────────────────────

// Lit un fichier audio depuis le bucket OU la KV et l'affiche via <audio>.
// Le préfixe "kv:" du path indique un stockage de secours en base64.
function VocalCqAudio({ storagePath, fallbackUrl, className }) {
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!storagePath) { setResolvedUrl(null); setError(null); return; }
    let cancelled = false;
    (async () => {
      try {
        if (storagePath.startsWith('kv:')) {
          const key = storagePath.slice(3);
          const row = await window.storage.get(key);
          if (cancelled) return;
          if (!row?.value) { setError("Audio introuvable (stockage de secours)."); return; }
          try {
            const data = JSON.parse(row.value);
            if (!data.dataUrl) { setError("Audio KV corrompu."); return; }
            setResolvedUrl(data.dataUrl);
            setError(null);
          } catch (ex) {
            setError("Audio KV corrompu.");
          }
          return;
        }
        const { url, error: e } = await getSignedUrl(storagePath, 3600);
        if (cancelled) return;
        if (e || !url) setError(e?.message || 'URL audio indisponible');
        else { setResolvedUrl(url); setError(null); }
      } catch (ex) {
        if (!cancelled) setError(ex.message || 'Erreur chargement audio');
      }
    })();
    return () => { cancelled = true; };
  }, [storagePath]);

  const playUrl = storagePath
    ? resolvedUrl
    : (fallbackUrl && isSafeMediaUrl(fallbackUrl) ? fallbackUrl : null);

  if (storagePath && !resolvedUrl && !error) {
    return <div className="text-[10px] text-slate-500 italic">⏳ Chargement de l'audio…</div>;
  }
  if (error) {
    return <div className="p-2 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-700">⚠️ {error}</div>;
  }
  if (!storagePath && fallbackUrl && !isSafeMediaUrl(fallbackUrl)) {
    return <div className="p-2 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-700">⚠️ Lien audio invalide. Seuls les liens HTTPS sont acceptés.</div>;
  }
  if (!playUrl) return null;

  return <audio controls src={playUrl} className={className || 'w-full'} preload="none" />;
}

// Bouton + input file caché. Téléverse dans le bucket Supabase et, si le
// bucket refuse (mime type pas en whitelist), bascule sur un stockage de
// secours en base64 dans la table KV `storage`. Appelle onUploaded(path).
function UploadVocalCqButton({ onUploaded, label = '📤 Téléverser un fichier audio', className }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(file.name)) {
      alert('❌ Choisis un fichier audio (mp3, m4a, wav, ogg, webm, aac).');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BUCKET) {
      alert(`❌ Fichier trop gros : ${(file.size / 1024 / 1024).toFixed(1)} Mo. Max : ${MAX_FILE_SIZE_BUCKET / 1024 / 1024} Mo.`);
      return;
    }
    setUploading(true);
    try {
      const fileId = `vocal_cq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // 1️⃣ Bucket Supabase (50 Mo) — la voie noble
      const { path, error: upErr } = await uploadFileToBucket(file, fileId);
      if (!upErr && path) {
        onUploaded(path);
        return;
      }
      // 2️⃣ Fallback KV — pour quand le bucket refuse le mime type audio.
      // Le fichier est encodé en base64 et stocké dans la table `storage`.
      // Limite ~3,7 Mo (largement assez pour un vocal CQ de quelques minutes).
      if (file.size > MAX_FILE_SIZE_KV) {
        alert(`❌ Le bucket Supabase refuse ce fichier (« ${upErr?.message || 'erreur inconnue'} »).\n\nLe stockage de secours ne supporte que les fichiers ≤ ${(MAX_FILE_SIZE_KV / 1024 / 1024).toFixed(1)} Mo (le tien fait ${(file.size / 1024 / 1024).toFixed(1)} Mo).\n\nPour téléverser des vocaux plus longs, autorise les mime types audio dans le bucket Supabase.`);
        return;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        const kvKey = `file:${fileId}`;
        const result = await window.storage.set(kvKey, JSON.stringify({ dataUrl, name: file.name, type: file.type }));
        if (!result) {
          alert(`❌ Échec du stockage de secours.\n\nDétail bucket : ${upErr?.message || 'inconnu'}`);
          return;
        }
        onUploaded(`kv:${kvKey}`);
      } catch (ex) {
        alert(`❌ Lecture du fichier échouée : ${ex.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input type="file" accept="audio/*" ref={inputRef} onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={className || 'px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-[10px] font-bold disabled:opacity-60'}
      >
        {uploading ? '⏳ Téléversement…' : label}
      </button>
    </>
  );
}

// ====================== MODAL DOCUMENTS ======================

function DocumentsModal({ dossier, onClose, onUpdate, isAdmin }) {
  const documents = dossier.documents || [];
  // On lit poseurs/fournisseurs/regies directement (pas les versions ...Detail enrichies)
  // car le dossier passé ici est brut (state), pas dossiersEnriched.
  const fournisseursDuDossier = (dossier.fournisseurs || []).map(f => f.nom).filter(Boolean);
  const fournisseursUniques = [...new Set(fournisseursDuDossier)];
  const poseursDuDossier = (dossier.poseurs || []).map(p => p.nom).filter(Boolean);
  const poseursUniques = [...new Set(poseursDuDossier)];
  const regiesDuDossier = (dossier.regies || []).map(r => r.nom).filter(Boolean);
  const regiesUniques = [...new Set(regiesDuDossier)];

  // Catégories disponibles dans le modal
  const categories = useMemo(() => {
    const cats = [
      { id: 'client', key: 'client', subCategory: null, label: 'Client', sublabel: `${dossier.nom}${dossier.prenom ? ' ' + dossier.prenom : ''}`, emoji: '👤', color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50', border: 'border-blue-200', accent: 'text-blue-700', desc: 'Bons de commande, contrat, mandat...' },
    ];
    // Catégories sensibles : admin uniquement (factures = révèlent les coûts)
    if (isAdmin) {
      poseursUniques.forEach(nom => {
        cats.push({ id: `poseur:${nom}`, key: 'poseur', subCategory: nom, label: 'Poseur', sublabel: nom, emoji: '🔧', color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-700', desc: `Factures ${nom}` });
      });
      const regieSublabel = regiesUniques.length > 0 ? regiesUniques.join(', ') : (dossier.regie || '—');
      cats.push({ id: 'regie', key: 'regie', subCategory: null, label: 'Régie', sublabel: regieSublabel, emoji: '🤝', color: 'from-purple-500 to-violet-500', bg: 'bg-purple-50', border: 'border-purple-200', accent: 'text-purple-700', desc: 'Factures de la régie' });
      fournisseursUniques.forEach(nom => {
        cats.push({ id: `fournisseur:${nom}`, key: 'fournisseur', subCategory: nom, label: 'Fournisseur', sublabel: nom, emoji: '📦', color: 'from-orange-500 to-red-500', bg: 'bg-orange-50', border: 'border-orange-200', accent: 'text-orange-700', desc: `Factures ${nom}` });
      });
    }
    return cats;
  }, [dossier, fournisseursUniques, poseursUniques, regiesUniques, isAdmin]);

  const [activeCatId, setActiveCatId] = useState(categories[0].id);
  const activeCat = categories.find(c => c.id === activeCatId) || categories[0];
  const [uploading, setUploading] = useState(false);
  // Sous-catégorie choisie pour le prochain upload manuel dans l'onglet Client.
  // Si l'utilisateur veut classer son PDF directement dans la bonne section.
  const [nextSubCat, setNextSubCat] = useState('bon_commande');
  // Aperçu inline (overlay plein écran) — pas de window.open car bloqué par le sandbox
  const [preview, setPreview] = useState(null); // { doc, dataUrl } | null

  // Docs virtuels : les factures uploadées directement depuis l'aperçu rapide
  // (sur chaque poseur/régie/fournisseur via FactureFileInput) sont stockées
  // sur le prestataire (p.factureFile, r.factureFile, f.factureFile) et pas
  // dans dossier.documents[]. On les expose ici comme docs virtuels pour
  // qu'ils apparaissent dans la modale Documents sous le bon onglet.
  // virtualSource permet de retracer l'origine pour la suppression.
  const virtualFactureDocs = useMemo(() => {
    const out = [];
    (dossier.poseurs || []).forEach((p, idx) => {
      if (p.factureFile && p.nom) {
        out.push({
          id: p.factureFile,
          name: `Facture ${p.nom}${p.factureNo ? ' n°' + p.factureNo : ''}.pdf`,
          size: 0, type: 'application/pdf',
          category: 'poseur', subCategory: p.nom,
          uploadedAt: p.dateFacture || dossier.dateInsta || new Date().toISOString(),
          note: '📎 Facture liée au bloc Poseur du dossier',
          virtual: true,
          virtualSource: { kind: 'poseur', index: idx },
        });
      }
    });
    (dossier.regies || []).forEach((r, idx) => {
      if (r.factureFile && r.nom) {
        out.push({
          id: r.factureFile,
          name: `Facture ${r.nom}${r.factureNo ? ' n°' + r.factureNo : ''}.pdf`,
          size: 0, type: 'application/pdf',
          category: 'regie', subCategory: null,
          uploadedAt: r.dateFacture || dossier.dateInsta || new Date().toISOString(),
          note: '📎 Facture liée au bloc Régie du dossier',
          virtual: true,
          virtualSource: { kind: 'regie', index: idx },
        });
      }
    });
    (dossier.fournisseurs || []).forEach((f, idx) => {
      if (f.factureFile && f.nom) {
        out.push({
          id: f.factureFile,
          name: `Facture ${f.nom}${f.factureNo ? ' n°' + f.factureNo : ''}.pdf`,
          size: 0, type: 'application/pdf',
          category: 'fournisseur', subCategory: f.nom,
          uploadedAt: f.dateFacture || dossier.dateInsta || new Date().toISOString(),
          note: '📎 Facture liée au bloc Fournisseur du dossier',
          virtual: true,
          virtualSource: { kind: 'fournisseur', index: idx },
        });
      }
    });
    // Récépissé mairie principal (uploadé depuis la section Mairie du dossier)
    if (dossier.recepisseMairieFileId) {
      out.push({
        id: dossier.recepisseMairieFileId,
        name: `Récépissé mairie${dossier.dateRecepisseMairie ? ' du ' + new Date(dossier.dateRecepisseMairie).toLocaleDateString('fr-FR') : ''}.pdf`,
        size: 0, type: 'application/pdf',
        category: 'client', subCategory: 'recepisse_mairie',
        uploadedAt: dossier.dateRecepisseMairie || dossier.savedAt || new Date().toISOString(),
        note: '🏛️ Récépissé lié à la section Mairie du dossier',
        virtual: true,
        virtualSource: { kind: 'mairie' },
      });
    }
    // Récépissés des renvois mairie (en cas de refus puis renvoi)
    (dossier.envoisMairie || []).forEach((env, idx) => {
      if (env.recepisseFileId) {
        out.push({
          id: env.recepisseFileId,
          name: `Récépissé mairie — envoi n°${idx + 1}${env.dateRecepisse ? ' (' + new Date(env.dateRecepisse).toLocaleDateString('fr-FR') + ')' : ''}.pdf`,
          size: 0, type: 'application/pdf',
          category: 'client', subCategory: 'recepisse_mairie',
          uploadedAt: env.dateRecepisse || env.dateEnvoi || dossier.savedAt || new Date().toISOString(),
          note: `🏛️ Récépissé du renvoi n°${idx + 1} (historique mairie)`,
          virtual: true,
          virtualSource: { kind: 'mairie_envoi', index: idx },
        });
      }
    });
    return out;
  }, [dossier.poseurs, dossier.regies, dossier.fournisseurs, dossier.dateInsta, dossier.recepisseMairieFileId, dossier.dateRecepisseMairie, dossier.envoisMairie, dossier.savedAt]);

  // Documents pour la catégorie active.
  // Cas spécial Client : on prend TOUS les docs client (toutes sous-catégories),
  // ils seront groupés à l'affichage par sous-catégorie (Bon de commande,
  // Mandat, Pièce d'identité, etc.). Les autres catégories (poseur, régie,
  // fournisseur) gardent leur filtre strict par subCategory + fusion avec
  // les factures virtuelles uploadées depuis l'aperçu rapide.
  const docsActive = activeCat.key === 'client'
    ? [
        ...documents.filter(d => d.category === 'client'),
        ...virtualFactureDocs.filter(d => d.category === 'client'),
      ]
    : [
        ...documents.filter(d => d.category === activeCat.key && (d.subCategory || null) === (activeCat.subCategory || null)),
        ...virtualFactureDocs.filter(d => d.category === activeCat.key && (d.subCategory || null) === (activeCat.subCategory || null)),
      ];

  // Groupement par sous-catégorie pour l'affichage de l'onglet Client
  const docsActiveGrouped = useMemo(() => {
    if (activeCat.key !== 'client') return null;
    const groups = new Map();
    docsActive.forEach(d => {
      const key = d.subCategory || 'autre';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    // Ordre des sous-catégories selon CLIENT_DOC_SUBCATS, puis le reste
    const ordered = [];
    CLIENT_DOC_SUBCATS.forEach(sub => {
      if (groups.has(sub.id)) {
        ordered.push({ subcat: sub, docs: groups.get(sub.id) });
        groups.delete(sub.id);
      }
    });
    // Restant (sous-catégories inconnues ou null)
    groups.forEach((docs, key) => {
      const subcat = { id: key, label: key === 'autre' ? 'Autre' : key, emoji: '📑' };
      ordered.push({ subcat, docs });
    });
    return ordered;
  }, [activeCat.key, docsActive]);

  // En mode équipe : ne compter QUE les documents visibles (client uniquement).
  // Inclut aussi les docs virtuels (factures prestataires + récépissé mairie).
  const visibleDocs = isAdmin
    ? [...documents, ...virtualFactureDocs]
    : [...documents.filter(d => d.category === 'client'), ...virtualFactureDocs.filter(d => d.category === 'client')];
  const totalSize = visibleDocs.reduce((s, d) => s + (d.size || 0), 0);
  const totalCount = visibleDocs.length;

  // handleUpload accepte optionnellement une subCategoryOverride pour les
  // dropzones par catégorie de l'onglet Client (chaque carte de catégorie a
  // sa propre zone de drop qui force le subCategory).
  const handleUpload = async (file, subCategoryOverride = null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BUCKET) {
      alert(`❌ Fichier trop gros : ${formatFileSize(file.size)}\n\nMax autorisé : ${formatFileSize(MAX_FILE_SIZE_BUCKET)}.`);
      return;
    }
    setUploading(true);
    try {
      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Upload dans le bucket Supabase Storage (gère les gros fichiers jusqu'à 50 Mo).
      const { path, error: upErr } = await uploadFileToBucket(file, fileId);
      if (upErr || !path) {
        // Fallback KV si le bucket n'est pas accessible (pas encore setup, etc.)
        if (file.size > MAX_FILE_SIZE_KV) {
          alert(`❌ Échec de l'upload (bucket indisponible) et le fichier dépasse ${formatFileSize(MAX_FILE_SIZE_KV)} pour le stockage de secours.\n\nDétail : ${upErr?.message || 'inconnu'}\n\nVérifie que le bucket "dossier-documents" existe dans Supabase.`);
          return;
        }
        const dataUrl = await readFileAsDataURL(file);
        const result = await window.storage.set(`file:${fileId}`, JSON.stringify({ dataUrl, name: file.name, type: file.type }));
        if (!result) {
          alert(`❌ Échec du stockage du fichier.\n\nDétail : ${upErr?.message || 'inconnu'}`);
          return;
        }
        const newDocKv = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          storage: 'kv',
          category: activeCat.key,
          // Onglet Client : la sous-catégorie peut être forcée par la card
          // de catégorie (subCategoryOverride), sinon on tombe sur le default.
          subCategory: activeCat.key === 'client' ? (subCategoryOverride || nextSubCat || 'autre') : (activeCat.subCategory || null),
          uploadedAt: new Date().toISOString(),
          montant: null,
          datePiece: null,
          note: '',
        };
        onUpdate({ ...dossier, documents: [...documents, newDocKv] });
        return;
      }
      const newDoc = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: 'bucket',
        storagePath: path,
        category: activeCat.key,
        // Onglet Client : utilise la sous-catégorie choisie (sinon "autre")
        subCategory: activeCat.key === 'client' ? (nextSubCat || 'autre') : (activeCat.subCategory || null),
        uploadedAt: new Date().toISOString(),
        montant: null,
        datePiece: null,
        note: '',
      };
      onUpdate({ ...dossier, documents: [...documents, newDoc] });
    } catch (e) {
      alert('Erreur upload : ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Supprimer "${doc.name}" ?`)) return;
    // Doc virtuel = facture liée au bloc poseur/régie/fournisseur du dossier.
    // On supprime le fichier puis on vide le champ factureFile du prestataire.
    if (doc.virtual && doc.virtualSource) {
      try { await window.storage.delete(`file:${doc.id}`); } catch (e) {}
      const { kind, index } = doc.virtualSource;
      const patch = {};
      if (kind === 'poseur') {
        const list = [...(dossier.poseurs || [])];
        if (list[index]) { list[index] = { ...list[index], factureFile: '' }; patch.poseurs = list; }
      } else if (kind === 'regie') {
        const list = [...(dossier.regies || [])];
        if (list[index]) { list[index] = { ...list[index], factureFile: '' }; patch.regies = list; }
      } else if (kind === 'fournisseur') {
        const list = [...(dossier.fournisseurs || [])];
        if (list[index]) { list[index] = { ...list[index], factureFile: '' }; patch.fournisseurs = list; }
      }
      onUpdate({ ...dossier, ...patch });
      return;
    }
    if (doc.storage === 'bucket' && doc.storagePath) {
      // Si plusieurs documents partagent le même bucketPath (scan dossier
      // complet : 1 PDF + N sections virtuelles), on ne supprime le fichier
      // physique du bucket QUE si c'est le dernier doc qui pointe dessus.
      const otherDocsUsingSameFile = documents.filter(d =>
        d.id !== doc.id && d.storage === 'bucket' && d.storagePath === doc.storagePath
      );
      if (otherDocsUsingSameFile.length === 0) {
        try { await deleteFileFromBucket(doc.storagePath); } catch (e) {}
      }
    } else {
      try { await window.storage.delete(`file:${doc.id}`); } catch (e) {}
    }
    onUpdate({ ...dossier, documents: documents.filter(d => d.id !== doc.id) });
  };

  // Charge un fichier pour aperçu / téléchargement.
  // Bucket : on utilise une URL SIGNÉE (instantané, pas de download du blob).
  // KV : on récupère le dataUrl base64 comme avant.
  // Pour les sections virtuelles (doc.pageStart), on ajoute le fragment
  // #page=X à l'URL pour ouvrir directement à la bonne page.
  const loadFileData = async (doc) => {
    try {
      if (doc.storage === 'bucket' && doc.storagePath) {
        const { url, error } = await getSignedUrl(doc.storagePath, 3600);
        if (error || !url) return null;
        const urlWithPage = (doc.pageStart && doc.type === 'application/pdf')
          ? `${url}#page=${doc.pageStart}`
          : url;
        return { dataUrl: urlWithPage, name: doc.name, type: doc.type, isBlobUrl: false, isSignedUrl: true };
      }
      const r = await window.storage.get(`file:${doc.id}`);
      if (!r?.value) return null;
      const parsed = JSON.parse(r.value);
      return { ...parsed, isBlobUrl: false };
    } catch (e) { return null; }
  };

  const handleOpen = async (doc) => {
    const data = await loadFileData(doc);
    if (!data) { alert('❌ Fichier introuvable dans le stockage.'); return; }
    setPreview({ doc, dataUrl: data.dataUrl, type: data.type || doc.type, isBlobUrl: !!data.isBlobUrl });
  };

  const handleDownload = async (doc) => {
    const data = await loadFileData(doc);
    if (!data) { alert('❌ Fichier introuvable dans le stockage.'); return; }
    // URL signée (bucket) ou blob URL : on l'utilise directement
    if (data.isSignedUrl || data.isBlobUrl) {
      // Pour les signed URL on enlève le fragment #page pour le téléchargement
      const downloadUrl = data.dataUrl.split('#')[0];
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = doc.name;
      a.target = '_blank'; // évite que ça remplace la page si le navigateur ouvre au lieu de télécharger
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        if (data.isBlobUrl) URL.revokeObjectURL(data.dataUrl);
      }, 200);
      return;
    }
    try {
      // Conversion data URL → blob URL pour un téléchargement robuste dans le sandbox
      const parts = data.dataUrl.split(',');
      const byteString = atob(parts[1]);
      const arr = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
      const blob = new Blob([arr], { type: data.type || 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 200);
    } catch (e) {
      // Fallback : essai direct avec le data URL
      const a = document.createElement('a');
      a.href = data.dataUrl;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 200);
    }
  };

  const updateDocMeta = (docId, updates) => {
    onUpdate({
      ...dossier,
      documents: documents.map(d => d.id === docId ? { ...d, ...updates } : d)
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 text-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Paperclip className="w-5 h-5" />
                <h2 className="text-xl font-bold truncate">Documents — {dossier.nom}{dossier.prenom ? ' ' + dossier.prenom : ''}</h2>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap opacity-90">
                {dossier.id && <span>#{dossier.id}</span>}
                <span>📅 {formatDateForSheet(dossier.dateInsta)}</span>
                <span>📂 {totalCount} document{totalCount > 1 ? 's' : ''}</span>
                <span>💾 {formatFileSize(totalSize)}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/20 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar catégories + zone */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Sidebar */}
          <div className="md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 overflow-y-auto">
            <div className="p-3 space-y-1.5">
              {categories.map(cat => {
                const sel = cat.id === activeCatId;
                // Compte les docs régulier + virtuels (factures sur prestataires, récépissé mairie)
                const count = cat.key === 'client'
                  ? documents.filter(d => d.category === 'client').length + virtualFactureDocs.filter(d => d.category === 'client').length
                  : documents.filter(d => d.category === cat.key && (d.subCategory || null) === (cat.subCategory || null)).length + virtualFactureDocs.filter(d => d.category === cat.key && (d.subCategory || null) === (cat.subCategory || null)).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCatId(cat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2 ${sel ? `bg-gradient-to-r ${cat.color} text-white shadow-md` : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700'}`}
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold uppercase truncate">{cat.label}</div>
                      <div className={`text-xs truncate ${sel ? 'opacity-90' : 'text-slate-500'}`}>{cat.sublabel}</div>
                    </div>
                    {count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${sel ? 'bg-white/30' : 'bg-violet-100 text-violet-700'}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Générateurs de documents PDF — pré-remplis depuis le dossier. */}
            <div className="px-3">
              <PdfGeneratorPanel dossier={dossier} />
            </div>
            <div className="p-3 mx-3 mb-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-700 leading-relaxed">
              💡 Max <strong>50 Mo / fichier</strong> grâce au stockage Supabase. Les PDF lourds passent sans problème.
            </div>
          </div>

          {/* Zone active */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {/* Bandeau catégorie */}
            <div className={`${activeCat.bg} ${activeCat.border} border-2 rounded-2xl p-4 mb-4`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 bg-gradient-to-br ${activeCat.color} rounded-xl flex items-center justify-center text-xl shadow-md`}>
                  {activeCat.emoji}
                </div>
                <div>
                  <div className={`text-xs font-bold uppercase ${activeCat.accent}`}>{activeCat.label}</div>
                  <div className="text-base font-bold text-slate-800">{activeCat.sublabel}</div>
                </div>
              </div>
              <div className="text-xs text-slate-600">{activeCat.desc}</div>
            </div>

            {/* Onglet Client : grille de cartes (une par type de document)
                avec sa propre drop zone. Plus de menu déroulant. */}
            {activeCat.key === 'client' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CLIENT_DOC_SUBCATS.map(subcat => {
                  const docsInCat = docsActive.filter(d => (d.subCategory || 'autre') === subcat.id);
                  return (
                    <SubCategoryCard
                      key={subcat.id}
                      subcat={subcat}
                      docs={docsInCat}
                      uploading={uploading}
                      onFile={(file) => handleUpload(file, subcat.id)}
                      onOpen={handleOpen}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                      onUpdateMeta={updateDocMeta}
                    />
                  );
                })}
              </div>
            ) : (
              <>
                {/* Autres catégories (poseur, régie, fournisseur) : drop zone unique + liste */}
                <DropZone onFile={(f) => handleUpload(f)} uploading={uploading} accent={activeCat.accent} />
                <div className="mt-4 space-y-2">
                  {docsActive.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Aucun document pour le moment</p>
                      <p className="text-xs">Ajoute-en avec la zone ci-dessus</p>
                    </div>
                  ) : (
                    docsActive.map(doc => (
                      <DocumentItem
                        key={doc.id}
                        doc={doc}
                        onOpen={() => handleOpen(doc)}
                        onDownload={() => handleDownload(doc)}
                        onDelete={() => handleDelete(doc)}
                        onUpdateMeta={(u) => updateDocMeta(doc.id, u)}
                      />
                    ))
                  )}
                </div>
              </>
            )}

            {/* Total catégorie */}
            {docsActive.length > 0 && (() => {
              const totalCat = docsActive.reduce((s, d) => s + (parseFloat(d.montant) || 0), 0);
              if (totalCat <= 0) return null;
              return (
                <div className={`mt-3 ${activeCat.bg} ${activeCat.border} border rounded-xl px-4 py-2.5 flex items-center justify-between`}>
                  <span className="text-xs font-bold text-slate-600 uppercase">Total saisi</span>
                  <span className={`font-bold ${activeCat.accent}`}>{formatEuro(totalCat)}</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* OVERLAY APERÇU PLEIN ÉCRAN */}
        {preview && (
          <FilePreviewOverlay
            preview={preview}
            onClose={() => setPreview(null)}
            onDownload={() => handleDownload(preview.doc)}
          />
        )}
      </div>
    </div>
  );
}

// ====================== APERÇU FICHIER ======================

function FilePreviewOverlay({ preview, onClose, onDownload }) {
  const { doc, dataUrl, type } = preview;
  const isImage = (type || '').startsWith('image/');
  const isPdf = (type || '') === 'application/pdf' || /\.pdf$/i.test(doc.name);
  const [blobUrl, setBlobUrl] = useState(null);

  // Si le dataUrl est déjà une URL HTTPS (signed URL Supabase) ou blob, on
  // l'utilise tel quel. Sinon (data: URL base64 venant du stockage KV), on
  // convertit en blob URL pour un meilleur rendu mobile + iframe sandboxé.
  useEffect(() => {
    if (!dataUrl) return;
    // Cas URL HTTPS ou blob URL : utilisation directe
    if (dataUrl.startsWith('http') || dataUrl.startsWith('blob:')) {
      setBlobUrl(dataUrl);
      return;
    }
    // Cas data URL base64 : conversion en blob URL
    try {
      const parts = dataUrl.split(',');
      const byteString = atob(parts[1]);
      const arr = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
      const blob = new Blob([arr], { type: type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch (e) {
      // Dernier recours : on essaie d'afficher tel quel
      setBlobUrl(dataUrl);
    }
  }, [dataUrl, type]);

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[70] flex flex-col" onClick={onClose}>
      {/* Barre d'actions */}
      <div className="flex items-center justify-between gap-2 p-3 bg-slate-900 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isImage ? <FileImage className="w-5 h-5 flex-shrink-0" /> : isPdf ? <FileText className="w-5 h-5 flex-shrink-0" /> : <File className="w-5 h-5 flex-shrink-0" />}
          <div className="font-semibold truncate text-sm">{doc.name}</div>
          <span className="text-xs opacity-75 flex-shrink-0">{formatFileSize(doc.size)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onDownload} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md">
            <Download className="w-3.5 h-3.5" />Télécharger
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg" title="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
        {!blobUrl ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-white">
            <Sparkles className="w-10 h-10 animate-spin mb-2 text-violet-400" />
            <p className="text-sm">Préparation...</p>
          </div>
        ) : isImage ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100 overflow-auto p-2 m-2 md:m-4 rounded-2xl">
            <img src={blobUrl} alt={doc.name} className="max-w-full max-h-full object-contain" />
          </div>
        ) : isPdf ? (
          <PdfViewer blobUrl={blobUrl} onDownload={onDownload} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-white m-2 md:m-4 rounded-2xl">
            <File className="w-16 h-16 text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-700 mb-1">Aperçu non disponible</h3>
            <p className="text-sm text-slate-500 mb-4 max-w-md">Ce type de fichier ({type || 'inconnu'}) ne peut pas être affiché directement. Télécharge-le pour l'ouvrir avec une autre application.</p>
            <button onClick={onDownload} className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-pink-500 text-white rounded-xl font-semibold flex items-center gap-2 shadow-md">
              <Download className="w-4 h-4" />Télécharger le fichier
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Visualiseur PDF basé sur PDF.js (charge la lib depuis CDN au premier usage)
function PdfViewer({ blobUrl, onDownload }) {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;

    const loadPdfJs = () => new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const existingScript = document.querySelector('script[data-pdfjs]');
      if (existingScript) {
        // Un autre composant l'a déjà demandé — attend qu'il soit prêt
        existingScript.addEventListener('load', () => resolve(window.pdfjsLib));
        existingScript.addEventListener('error', () => reject(new Error('pdf.js: échec du chargement')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.dataset.pdfjs = 'true';
      script.onload = () => resolve(window.pdfjsLib);
      script.onerror = () => reject(new Error('pdf.js: impossible de charger depuis CDN'));
      document.head.appendChild(script);
    });

    const renderPdf = async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        if (cancelled) return;

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjsLib.getDocument(blobUrl).promise;
        if (cancelled) return;

        setProgress({ current: 0, total: pdf.numPages });

        const rendered = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          // Échelle adaptative : 1.5x pour bonne qualité, mais limite la largeur si trop gros
          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = Math.min(1400, baseViewport.width * 1.5);
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');

          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;

          rendered.push(canvas.toDataURL('image/jpeg', 0.85));
          setProgress({ current: pageNum, total: pdf.numPages });
        }

        if (!cancelled) {
          setPages(rendered);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Erreur de lecture du PDF');
          setLoading(false);
        }
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [blobUrl]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white">
        <Sparkles className="w-10 h-10 animate-spin text-violet-400 mb-3" />
        <p className="text-sm font-semibold">Chargement du PDF...</p>
        {progress.total > 0 && (
          <p className="text-xs opacity-75 mt-1">Page {progress.current} / {progress.total}</p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-white m-2 md:m-4 rounded-2xl">
        <FileText className="w-16 h-16 text-rose-300 mb-3" />
        <h3 className="text-base font-bold text-slate-700 mb-1">Aperçu impossible</h3>
        <p className="text-xs text-slate-400 mb-3 max-w-md">{error}</p>
        <p className="text-sm text-slate-500 mb-4">Télécharge le fichier — il s'ouvrira avec ton lecteur PDF habituel.</p>
        <button onClick={onDownload} className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-md text-sm">
          <Download className="w-5 h-5" />Télécharger le PDF
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-slate-300 p-2 md:p-4">
      <div className="flex flex-col items-center gap-4">
        {pages.map((src, i) => (
          <img key={i} src={src} alt={`Page ${i + 1}`} className="max-w-full shadow-2xl bg-white border border-slate-200" loading="lazy" />
        ))}
        {pages.length > 1 && (
          <div className="text-xs text-slate-500 py-2 font-semibold">
            {pages.length} page{pages.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// Carte d'une sous-catégorie de documents Client (Bon de commande, Mandat,
// Pièce d'identité, etc.). Chaque carte a sa propre zone de drop et affiche
// les docs déjà uploadés pour cette catégorie.
function SubCategoryCard({ subcat, docs, uploading, onFile, onOpen, onDownload, onDelete, onUpdateMeta }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const hasDocs = docs.length > 0;
  const c = SUBCAT_COLOR_CLASSES[subcat.color] || SUBCAT_COLOR_CLASSES.slate;
  return (
    <div className={`bg-white border-2 ${c.border} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow`}>
      <div className={`h-1.5 ${c.bar}`} />
      <div className={`px-3 py-2 ${c.headerBg} border-b ${c.border} flex items-center gap-2`}>
        <span className="text-base">{subcat.emoji}</span>
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{subcat.label}</span>
        {hasDocs && (
          <span className={`ml-auto text-[10px] font-bold ${c.count} rounded-full px-2 py-0.5`}>{docs.length}</span>
        )}
      </div>
      {/* Zone de drop compacte (toujours visible, même quand il y a des docs) */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed cursor-pointer transition-all ${dragging ? 'border-violet-500 bg-violet-50' : hasDocs ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-300 bg-slate-50 hover:bg-violet-50 hover:border-violet-300'} ${hasDocs ? 'py-2 px-3' : 'py-5 px-3'}`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <div className="text-center text-xs text-violet-600 font-semibold">
            <Sparkles className="w-4 h-4 mx-auto mb-0.5 animate-spin" />
            Upload…
          </div>
        ) : (
          <div className="text-center text-xs text-slate-500">
            <Upload className={`mx-auto ${hasDocs ? 'w-4 h-4 mb-0.5' : 'w-6 h-6 mb-1'}`} />
            {hasDocs ? 'Ajouter un autre fichier' : 'Glisser un fichier ici ou cliquer'}
          </div>
        )}
      </div>
      {/* Liste des docs de cette catégorie */}
      {hasDocs && (
        <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
          {docs.map(doc => (
            <DocumentItem
              key={doc.id}
              doc={doc}
              onOpen={() => onOpen(doc)}
              onDownload={() => onDownload(doc)}
              onDelete={() => onDelete(doc)}
              onUpdateMeta={(u) => onUpdateMeta(doc.id, u)}
              subCats={CLIENT_DOC_SUBCATS}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DropZone({ onFile, uploading, accent }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragging ? 'border-violet-500 bg-violet-50 scale-[1.02]' : 'border-slate-300 bg-slate-50 hover:bg-violet-50 hover:border-violet-300'}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {uploading ? (
        <>
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-violet-500 animate-spin" />
          <div className="text-sm font-semibold text-violet-600">Enregistrement...</div>
        </>
      ) : (
        <>
          <Upload className={`w-8 h-8 mx-auto mb-2 ${dragging ? 'text-violet-500' : 'text-slate-400'}`} />
          <div className="text-sm font-semibold text-slate-700">Glisse un fichier ici ou clique pour choisir</div>
          <div className="text-xs text-slate-500 mt-1">PDF, image (max 50 Mo)</div>
        </>
      )}
    </div>
  );
}

function DocumentItem({ doc, onOpen, onDownload, onDelete, onUpdateMeta, subCats, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [showFraud, setShowFraud] = useState(false);
  const isImage = (doc.type || '').startsWith('image/');
  const isPdf = (doc.type || '') === 'application/pdf';
  const Icon = isImage ? FileImage : isPdf ? FileText : File;
  const iconColor = isImage ? 'from-pink-500 to-rose-500' : isPdf ? 'from-red-500 to-orange-500' : 'from-slate-400 to-slate-500';
  // 🚨 Anti-fraude : niveau de risque détecté par l'IA (low/medium/high)
  const fraudRisk = doc.fraudRisk || 'low';
  const fraudFlags = Array.isArray(doc.fraudFlags) ? doc.fraudFlags : [];
  const hasFraudFlags = fraudFlags.length > 0;
  const fraudColor = fraudRisk === 'high' ? 'bg-rose-50 border-rose-300 text-rose-700' : fraudRisk === 'medium' ? 'bg-amber-50 border-amber-300 text-amber-700' : '';
  const fraudIcon = fraudRisk === 'high' ? '🚨' : fraudRisk === 'medium' ? '⚠️' : '';

  return (
    <div className={`bg-white border rounded-xl overflow-hidden hover:border-violet-300 transition-colors ${fraudRisk === 'high' ? 'border-rose-300' : fraudRisk === 'medium' ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className={`flex items-center gap-2 ${compact ? 'p-2' : 'p-3 gap-3'}`}>
        <div className={`${compact ? 'w-7 h-7' : 'w-10 h-10'} bg-gradient-to-br ${iconColor} rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon className={`${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-white`} />
        </div>
        <div className="flex-1 min-w-0">
          <button onClick={onOpen} className={`font-semibold text-slate-800 ${compact ? 'text-xs' : 'text-sm'} truncate hover:text-violet-600 text-left w-full block`}>{doc.name}</button>
          {!compact && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
              <span>{formatFileSize(doc.size)}</span>
              <span>•</span>
              <span>📅 {formatDateForSheet(doc.uploadedAt?.split('T')[0])}</span>
              {doc.montant && <><span>•</span><span className="text-emerald-600 font-semibold">{formatEuro(parseFloat(doc.montant))}</span></>}
              {doc.datePiece && <><span>•</span><span className="text-blue-600">📄 {formatDateForSheet(doc.datePiece)}</span></>}
            </div>
          )}
          {compact && (
            <div className="text-[10px] text-slate-500">{formatFileSize(doc.size)}</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {hasFraudFlags && (
            <button
              onClick={() => setShowFraud(!showFraud)}
              title={`${fraudRisk === 'high' ? 'Forte' : 'Légère'} suspicion de fraude — clique pour les détails`}
              className={`${compact ? 'p-1' : 'p-1.5'} rounded-lg ${fraudRisk === 'high' ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
            >
              <span className={compact ? 'text-xs' : 'text-sm'}>{fraudIcon}</span>
            </button>
          )}
          <button onClick={onOpen} title="Ouvrir / aperçu" className={`${compact ? 'p-1' : 'p-1.5'} text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg`}><Eye className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /></button>
          <button onClick={onDownload} title="Télécharger" className={`${compact ? 'p-1' : 'p-1.5'} text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg`}><Download className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /></button>
          <button onClick={() => setExpanded(!expanded)} title="Détails" className={`${compact ? 'p-1' : 'p-1.5'} rounded-lg ${expanded ? 'text-violet-600 bg-violet-50' : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50'}`}><Edit3 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /></button>
          <button onClick={onDelete} title="Supprimer" className={`${compact ? 'p-1' : 'p-1.5'} text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg`}><Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /></button>
        </div>
      </div>
      {/* Panneau anti-fraude — visible au clic du badge */}
      {showFraud && hasFraudFlags && (
        <div className={`px-3 py-2 border-t ${fraudColor}`}>
          <div className="text-xs font-bold mb-1">{fraudIcon} Suspicion de fraude — {fraudRisk === 'high' ? 'forte' : 'à vérifier'}</div>
          <ul className="text-[11px] space-y-0.5">
            {fraudFlags.map((flag, i) => <li key={i}>• {flag}</li>)}
          </ul>
          <div className="text-[10px] italic mt-1 opacity-70">⚠️ L'IA peut se tromper — vérifie manuellement avant toute conclusion.</div>
        </div>
      )}
      {expanded && (
        <div className="bg-slate-50 px-3 py-3 border-t border-slate-200 space-y-2">
          {/* Sélecteur de sous-catégorie (uniquement pour les docs Client) */}
          {subCats && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">📂 Catégorie</label>
              <select
                value={doc.subCategory || 'autre'}
                onChange={(e) => onUpdateMeta({ subCategory: e.target.value })}
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {subCats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">💰 Montant TTC (€)</label>
              <input
                type="number"
                step="0.01"
                defaultValue={doc.montant ?? ''}
                onBlur={(e) => onUpdateMeta({ montant: e.target.value === '' ? null : parseFloat(e.target.value) })}
                placeholder="—"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">📅 Date pièce</label>
              <div className="flex gap-1">
                <input
                  type="date"
                  value={doc.datePiece || ''}
                  onChange={(e) => onUpdateMeta({ datePiece: e.target.value || null })}
                  className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <button type="button" onClick={() => onUpdateMeta({ datePiece: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold whitespace-nowrap">Auj.</button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">📝 Note</label>
              <input
                type="text"
                defaultValue={doc.note || ''}
                onBlur={(e) => onUpdateMeta({ note: e.target.value })}
                placeholder="N° facture, BC..."
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================== AUTRES VUES (inchangées) ======================

function PaiementsView({ rapportPaiements, societes = [], onShowQuick, onTogglePenalite, onToggleLitige }) {
  // Helper pour afficher le badge société à côté du nom prestataire/banque
  const renderSocieteBadge = (societeId) => {
    if (!societeId) return null;
    const s = societes.find(x => x.id === societeId);
    if (!s) return null;
    return <span className="ml-1.5"><SocieteBadge societe={s} variant="inline" /></span>;
  };
  // Mappe le type de prestataire vers l'ancre de scroll dans le QuickViewPanel
  const scrollTargetFor = (type) => {
    if (type === 'Fournisseur') return 'fournisseurs';
    if (type === 'Régie') return 'regie';
    if (type === 'Poseur') return 'poseurs';
    return 'equipeInterne'; // rôles internes (Téléprospecteur, Confirmateur, ...)
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-semibold opacity-90 uppercase">✅ Reçu des financeurs</div>
          <div className="text-3xl font-bold mt-1">{formatEuro(rapportPaiements.totalEncaisseClient)}</div>
          <div className="text-sm opacity-90 mt-2">À recevoir : {formatEuro(rapportPaiements.totalAEncaisserClient)}</div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-semibold opacity-90 uppercase">⏳ Reste à payer</div>
          <div className="text-3xl font-bold mt-1">{formatEuro(rapportPaiements.totalGeneralRestant)}</div>
          <div className="text-sm opacity-90 mt-2">Déjà payé : {formatEuro(rapportPaiements.totalGeneralPaye)}</div>
        </div>
        <div className="bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl p-5 text-white shadow-lg">
          <div className="text-xs font-semibold opacity-90 uppercase">💰 Trésorerie nette</div>
          <div className="text-3xl font-bold mt-1">{formatEuro(rapportPaiements.totalEncaisseClient - rapportPaiements.totalGeneralPaye)}</div>
          <div className="text-sm opacity-90 mt-2">Reçu − Payé</div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-md border border-emerald-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Euro className="w-5 h-5 text-emerald-500" />Argent à recevoir par financeur
          </h2>
        </div>
        {rapportPaiements.encaissList.length === 0 ? (
          <div className="p-12 text-center text-slate-500">Aucun financement enregistré.</div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {rapportPaiements.encaissList.map((e, idx) => {
              const restant = e.totalRestant > 0;
              const dossiersAttente = e.lignes.filter(l => !l.paye);
              const progress = e.totalAttendu > 0 ? (e.totalRecu / e.totalAttendu) * 100 : 0;
              return (
                <div key={idx} className={`rounded-2xl border-2 overflow-hidden ${restant ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                  <div className={`p-4 ${restant ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'} text-white`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-xs opacity-90 uppercase">💳 Financeur</div>
                        <div className="text-xl font-bold flex items-center flex-wrap">{e.nom}{renderSocieteBadge(e.societe)}</div>
                      </div>
                      {restant ? (
                        <div className="text-right">
                          <div className="text-xs opacity-90 uppercase">⏳ Vous doit</div>
                          <div className="text-2xl font-bold">{formatEuro(e.totalRestant)}</div>
                        </div>
                      ) : <div className="px-3 py-1.5 bg-white/30 rounded-full text-sm font-bold">✓ Tout payé</div>}
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-500 uppercase">Attendu</div>
                        <div className="text-sm font-bold text-slate-800">{formatEuro(e.totalAttendu)}</div>
                      </div>
                      <div className="bg-emerald-100 rounded-lg p-2 border border-emerald-200">
                        <div className="text-[10px] font-bold text-emerald-700 uppercase">✓ Reçu</div>
                        <div className="text-sm font-bold text-emerald-800">{formatEuro(e.totalRecu)}</div>
                      </div>
                      <div className={`rounded-lg p-2 border ${restant ? 'bg-amber-100 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className={`text-[10px] font-bold uppercase ${restant ? 'text-amber-700' : 'text-slate-400'}`}>⏳ À recevoir</div>
                        <div className={`text-sm font-bold ${restant ? 'text-amber-800' : 'text-slate-400'}`}>{formatEuro(e.totalRestant)}</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1">
                        <span className="font-semibold">Progression</span>
                        <span className="font-bold">{progress.toFixed(0)}% reçu</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    {dossiersAttente.length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-bold text-amber-700 list-none flex items-center gap-1">
                          <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                          Voir les {dossiersAttente.length} en attente
                        </summary>
                        <div className="mt-2 space-y-1">
                          {dossiersAttente.map((l, i) => {
                            const canOpen = !!(l.dossierLocalId && onShowQuick);
                            const handleOpen = (ev) => { ev.stopPropagation(); if (canOpen) onShowQuick(l.dossierLocalId, 'paiement'); };
                            return (
                              <div
                                key={i}
                                onClick={handleOpen}
                                role={canOpen ? 'button' : undefined}
                                tabIndex={canOpen ? 0 : undefined}
                                onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(e); } } : undefined}
                                title={canOpen ? `Ouvrir ${l.client || 'le dossier'} — section paiement client` : undefined}
                                className={`bg-white/80 rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 border border-amber-200 ${canOpen ? 'cursor-pointer hover:ring-2 hover:ring-violet-300 transition' : ''}`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {l.dossierId !== '—' && <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1 rounded">#{l.dossierId}</span>}
                                  <span className="font-semibold text-slate-700 truncate text-sm">{l.client}</span>
                                </div>
                                <span className="font-bold text-amber-700 text-sm">{formatEuro(l.ttc)}</span>
                                {canOpen && <span className="text-slate-400 text-xs">›</span>}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-md border border-violet-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-pink-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-500" />Détail par prestataire
          </h2>
          <p className="text-xs text-slate-500 mt-1">💡 Vous payez seulement quand le financeur a payé</p>
        </div>

        {(rapportPaiements.totalAPayerMaintenant > 0 || rapportPaiements.totalEnAttenteFinanceur > 0 || rapportPaiements.totalPayeAvance > 0) && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">🔥 À payer maintenant</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalAPayerMaintenant)}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-fuchsia-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">💜 Payé d'avance</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalPayeAvance)}</div>
            </div>
            <div className="bg-gradient-to-br from-slate-400 to-gray-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">⏸️ Bloqué</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalEnAttenteFinanceur)}</div>
            </div>
          </div>
        )}

        {rapportPaiements.list.length === 0 ? (
          <div className="p-12 text-center text-slate-500">Aucun prestataire à afficher.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rapportPaiements.list.map((p, idx) => {
              const isInternal = ['Téléprospecteur', 'Confirmateur', 'Commercial', 'Coordinateur projet', 'Resp. envoi pose'].includes(p.type);
              const colors = p.type === 'Fournisseur' ? 'bg-amber-100 text-amber-700' :
                             p.type === 'Régie' ? 'bg-purple-100 text-purple-700' :
                             isInternal ? 'bg-fuchsia-100 text-fuchsia-700' :
                             'bg-blue-100 text-blue-700';
              return (
                <details key={idx} className="group">
                  <summary className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 list-none flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors}`}>{p.type}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate flex items-center flex-wrap">{p.nom}{renderSocieteBadge(p.societe)}</div>
                        <div className="text-xs text-slate-500">{p.lignes.length} dossier{p.lignes.length > 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <SmallStat label="Dû" value={formatEuro(p.totalDu)} color="text-slate-700" />
                      <SmallStat label="Payé" value={formatEuro(p.totalPaye)} color="text-emerald-600" />
                      <SmallStat label="🔥 À payer" value={formatEuro(p.totalAPayerMaintenant)} color={p.totalAPayerMaintenant > 0 ? "text-orange-600" : "text-slate-400"} />
                      <SmallStat label="💜 Avance" value={formatEuro(p.totalPayeAvance)} color={p.totalPayeAvance > 0 ? "text-purple-600" : "text-slate-400"} />
                      <SmallStat label="⏸️ Bloqué" value={formatEuro(p.totalEnAttenteFinanceur)} color={p.totalEnAttenteFinanceur > 0 ? "text-slate-500" : "text-slate-400"} />
                      <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
                    </div>
                  </summary>
                  <div className="bg-slate-50 px-4 py-3 space-y-1.5">
                    {p.lignes.map((l, i) => {
                      const etat = l.paye ? (l.payeAvance ? 'paye_avance' : 'paye') : l.financeurPaye ? 'a_payer' : 'bloque';
                      const styles = {
                        paye: { bg: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-500', label: '✓ Payé', labelBg: 'bg-emerald-200 text-emerald-800', amount: 'text-emerald-700' },
                        paye_avance: { bg: 'bg-purple-50 border-purple-300', icon: 'bg-purple-500', label: '💜 Payé d\'avance', labelBg: 'bg-purple-200 text-purple-800', amount: 'text-purple-700' },
                        a_payer: { bg: 'bg-orange-50 border-orange-300', icon: 'bg-orange-500', label: '🔥 À payer', labelBg: 'bg-orange-200 text-orange-800', amount: 'text-orange-700' },
                        bloque: { bg: 'bg-slate-100 border-slate-300', icon: 'bg-slate-400', label: '⏸️ Bloqué financeur', labelBg: 'bg-slate-200 text-slate-700', amount: 'text-slate-500' },
                      }[etat];
                      const canOpen = !!(l.dossierLocalId && onShowQuick);
                      const handleOpen = () => canOpen && onShowQuick(l.dossierLocalId, scrollTargetFor(l.prestataireType || p.type));
                      return (
                        <div
                          key={i}
                          onClick={handleOpen}
                          role={canOpen ? 'button' : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } } : undefined}
                          title={canOpen ? `Ouvrir ${l.client || 'le dossier'} — section ${p.type}` : undefined}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border ${styles.bg} ${canOpen ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-violet-300 transition' : ''}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${styles.icon}`}>
                              {l.paye && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </div>
                            {l.dossierId !== '—' && <span className="text-xs font-mono text-slate-500">#{l.dossierId}</span>}
                            <span className="font-medium text-slate-700 truncate">{l.client || '(sans nom)'}</span>
                            <span className="text-[10px] text-slate-400">💳 {l.financement}</span>
                            {l.paye && l.datePaye && <span className="text-[10px] text-slate-500">📅 {formatDateForSheet(l.datePaye)}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${styles.amount}`}>{formatEuro(l.ttc)}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${styles.labelBg}`}>{styles.label}</span>
                            {canOpen && <span className="text-slate-400 text-xs">›</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {/* PÉNALITÉS RÉGIES (poses ratées) */}
      <div className="bg-white rounded-3xl shadow-md border border-rose-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-orange-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />Pénalités régies (poses ratées)
          </h2>
          <p className="text-xs text-slate-500 mt-1">💡 Coche dès qu'une régie t'a remboursé sa pénalité</p>
        </div>

        {rapportPaiements.totalPenalitesDu > 0 && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-rose-500 to-red-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">⚠️ Total dû par les régies</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalPenalitesDu)}</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">✅ Déjà remboursé</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalPenalitesPaye)}</div>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">⏳ Reste à recevoir</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalPenalitesRestant)}</div>
            </div>
          </div>
        )}

        {rapportPaiements.penalitesList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Aucune pénalité enregistrée.</div>
        ) : (
          <div className="p-4 space-y-3">
            {rapportPaiements.penalitesList.map((p) => (
              <details key={`${p.nom}::${p.societe || ''}`} className="border border-rose-200 rounded-xl overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 bg-rose-50 hover:bg-rose-100 flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-slate-800 flex items-center flex-wrap">🤝 {p.nom}{renderSocieteBadge(p.societe)}</span>
                  <span className="text-xs text-slate-500">{p.lignes.length} pose{p.lignes.length > 1 ? 's' : ''} ratée{p.lignes.length > 1 ? 's' : ''}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {p.totalRestant > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700">{formatEuro(p.totalRestant)} dû</span>
                    )}
                    {p.totalPaye > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700">{formatEuro(p.totalPaye)} reçu</span>
                    )}
                  </span>
                </summary>
                <div className="px-4 py-3 space-y-1.5 bg-white">
                  {p.lignes.map((l, idx) => {
                    const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '?';
                    const motifLabel = l.motif === 'client_absent' ? 'Client absent' : l.motif === 'client_refuse' ? 'Client refuse' : 'Autre';
                    const paye = !!l.regleAt;
                    return (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${paye ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-rose-200'}`}>
                        <button
                          onClick={() => onTogglePenalite(l.dossierLocalId, l.tentativeIdx)}
                          title={paye ? 'Marquer non payée' : 'Marquer comme payée'}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${paye ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-slate-300 hover:border-emerald-400'}`}
                        >
                          {paye && <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => onShowQuick && onShowQuick(l.dossierLocalId, null)}
                          className="font-semibold text-slate-700 hover:text-violet-600 hover:underline text-sm text-left flex-1 min-w-0 truncate"
                        >
                          {l.client}
                        </button>
                        <span className="text-xs text-slate-500">{fmtD(l.date)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">{motifLabel}</span>
                        {l.definitif && <span className="text-[9px] px-1 py-0.5 rounded bg-red-700 text-white font-bold">DÉF.</span>}
                        <span className={`font-bold ${paye ? 'text-emerald-700 line-through' : 'text-rose-700'}`}>{formatEuro(l.penalite)}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* ⚖️ LITIGES CLIENT — remboursements dus par les régies */}
      <div className="bg-white rounded-3xl shadow-md border border-purple-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-rose-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            ⚖️ Litiges client (remboursements régies)
          </h2>
          <p className="text-xs text-slate-500 mt-1">💡 Quand un client porte plainte et qu'on lui rembourse, la régie qui a apporté le dossier doit nous rembourser à son tour. Coche dès qu'elle l'a fait.</p>
        </div>

        {rapportPaiements.totalLitigesDu > 0 && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-purple-500 to-fuchsia-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">⚖️ Total dû par les régies</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalLitigesDu)}</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">✅ Déjà remboursé</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalLitigesPaye)}</div>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold opacity-90 uppercase">⏳ Reste à recevoir</div>
              <div className="text-2xl font-bold">{formatEuro(rapportPaiements.totalLitigesRestant)}</div>
            </div>
          </div>
        )}

        {rapportPaiements.litigesList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Aucun litige avec remboursement enregistré.</div>
        ) : (
          <div className="p-4 space-y-3">
            {rapportPaiements.litigesList.map((p) => (
              <details key={`${p.nom}::${p.societe || ''}`} className="border border-purple-200 rounded-xl overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 bg-purple-50 hover:bg-purple-100 flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-slate-800 flex items-center flex-wrap">🤝 {p.nom}{renderSocieteBadge(p.societe)}</span>
                  <span className="text-xs text-slate-500">{p.lignes.length} litige{p.lignes.length > 1 ? 's' : ''}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {p.totalRestant > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700">{formatEuro(p.totalRestant)} dû</span>
                    )}
                    {p.totalPaye > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700">{formatEuro(p.totalPaye)} reçu</span>
                    )}
                  </span>
                </summary>
                <div className="px-4 py-3 space-y-1.5 bg-white">
                  {p.lignes.map((l, idx) => {
                    const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '?';
                    return (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${l.rembourse ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-purple-200'}`}>
                        <button
                          onClick={() => onToggleLitige && onToggleLitige(l.dossierLocalId)}
                          title={l.rembourse ? 'Marquer non remboursé' : 'Marquer comme remboursé'}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${l.rembourse ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-slate-300 hover:border-emerald-400'}`}
                        >
                          {l.rembourse && <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => onShowQuick && onShowQuick(l.dossierLocalId, null)}
                          className="font-semibold text-slate-700 hover:text-violet-600 hover:underline text-sm text-left flex-1 min-w-0 truncate"
                        >
                          {l.client}
                        </button>
                        {l.accordPdfUrl && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold" title="Accord transactionnel joint">📎 PDF</span>
                        )}
                        {l.rembourse && l.dateRembourse && (
                          <span className="text-[10px] text-slate-500">📅 {fmtD(l.dateRembourse)}</span>
                        )}
                        {l.factureNo && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">{l.factureNo}</span>
                        )}
                        <span className={`font-bold ${l.rembourse ? 'text-emerald-700 line-through' : 'text-purple-700'}`}>{formatEuro(l.montant)}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SmallStat({ label, value, color }) {
  return (
    <div className="text-right text-xs">
      <div className="font-semibold text-slate-500 uppercase text-[10px]">{label}</div>
      <div className={`font-bold ${color}`}>{value}</div>
    </div>
  );
}

function PrestatairesPayerSection({ rappels, onShowQuick }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'interne' | 'externe'
  const [tri, setTri] = useState('jours'); // 'jours' | 'montant'
  const ROLES_INTERNES_LABELS = ['Téléprospecteur', 'Confirmateur', 'Commercial', 'Coordinateur projet', 'Resp. envoi pose'];

  const isInterne = (r) => ROLES_INTERNES_LABELS.includes(r.type);

  const filtered = rappels.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'interne') return isInterne(r);
    if (filter === 'externe') return !isInterne(r);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (tri === 'montant') return b.ttc - a.ttc;
    return b.joursAttente - a.joursAttente;
  });

  const totalA = filtered.reduce((s, r) => s + r.ttc, 0);
  const nbInterne = rappels.filter(isInterne).length;
  const nbExterne = rappels.length - nbInterne;

  const getScrollSection = (r) => {
    return isInterne(r) ? 'equipeInterne' : r.type === 'Régie' ? 'regie' : r.type === 'Fournisseur' ? 'fournisseurs' : 'poseurs';
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-bold text-orange-600 flex items-center gap-1">
          <Flame className="w-4 h-4" />Prestataires à payer ({filtered.length})
          {filter !== 'all' && <span className="text-xs font-normal text-slate-500">/ {rappels.length}</span>}
        </h3>
        <div className="text-[11px] font-semibold text-slate-600">Total : <span className="text-orange-700 font-bold">{formatEuro(totalA)}</span></div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <button onClick={() => setFilter('all')} className={`text-[10px] px-2 py-1 rounded-full font-semibold ${filter === 'all' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>Tous ({rappels.length})</button>
        <button onClick={() => setFilter('externe')} className={`text-[10px] px-2 py-1 rounded-full font-semibold ${filter === 'externe' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>🌐 Externes ({nbExterne})</button>
        <button onClick={() => setFilter('interne')} className={`text-[10px] px-2 py-1 rounded-full font-semibold ${filter === 'interne' ? 'bg-fuchsia-500 text-white' : 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200'}`}>👥 Équipe interne ({nbInterne})</button>
        <span className="ml-auto text-[10px] text-slate-500 font-semibold">Trier :</span>
        <button onClick={() => setTri('jours')} className={`text-[10px] px-2 py-1 rounded-full font-semibold ${tri === 'jours' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>⏰ Anciens</button>
        <button onClick={() => setTri('montant')} className={`text-[10px] px-2 py-1 rounded-full font-semibold ${tri === 'montant' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>💰 Montants</button>
      </div>

      <div className="space-y-1.5">
        {sorted.slice(0, 30).map((r, i) => (
          <button
            key={i}
            onClick={() => onShowQuick && onShowQuick(r.dossier.localId, getScrollSection(r))}
            className={`w-full ${isInterne(r) ? 'bg-fuchsia-50 hover:bg-fuchsia-100 border-fuchsia-200' : 'bg-orange-50 hover:bg-orange-100 border-orange-200'} border rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-left transition-colors`}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isInterne(r) ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-amber-100 text-amber-700'}`}>{r.type}</span>
              <span className="font-semibold text-slate-700 truncate">{r.nom}</span>
              <span className="text-xs text-slate-500">→ {r.dossier.nom}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isInterne(r) ? 'bg-fuchsia-200 text-fuchsia-800' : 'bg-orange-200 text-orange-800'}`}>{r.joursAttente}j</span>
              <span className={`font-bold ${isInterne(r) ? 'text-fuchsia-700' : 'text-orange-700'}`}>{formatEuro(r.ttc)}</span>
            </div>
          </button>
        ))}
      </div>
      {sorted.length > 30 && (
        <div className="text-[11px] text-center text-slate-500 mt-2 italic">{sorted.length - 30} autres non affichés</div>
      )}
    </>
  );
}

function DashboardView({ dossiers, dashboard, STATUTS, onCreate, onShowQuick }) {
  if (dossiers.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center shadow-md border border-violet-100">
        <div className="text-6xl mb-3">📊</div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Tableau de bord vide</h3>
        <p className="text-slate-500 text-sm mb-5">Créez votre premier dossier pour voir vos statistiques.</p>
        <button onClick={onCreate} className="bg-gradient-to-r from-violet-500 to-pink-500 text-white px-5 py-3 rounded-2xl font-semibold inline-flex items-center gap-2">
          <Plus className="w-5 h-5" />Créer un dossier
        </button>
      </div>
    );
  }

  // 🏦 Plafond mensuel PROJEXIO : couleur graduée selon le taux de remplissage.
  const proj = dashboard.projexioMoisCourant || { total: 0, count: 0 };
  const projPct = Math.min(100, (proj.total / PROJEXIO_CAP_MENSUEL) * 100);
  const projOver = proj.total > PROJEXIO_CAP_MENSUEL;
  const projReste = Math.max(0, PROJEXIO_CAP_MENSUEL - proj.total);
  const projLevel = projOver ? 'over' : projPct >= 90 ? 'critical' : projPct >= 70 ? 'warn' : 'ok';
  // Barre toujours blanche pour bien ressortir sur le fond coloré, quel
  // que soit le niveau (vert/orange/rouge).
  const projColors = {
    ok:       { bg: 'from-emerald-500 to-green-600', hint: '✅ Marge confortable' },
    warn:     { bg: 'from-amber-500 to-orange-500',  hint: '⚠️ Tu approches du plafond' },
    critical: { bg: 'from-orange-500 to-rose-500',   hint: '🚨 Plus que 10 % de marge' },
    over:     { bg: 'from-rose-600 to-red-700',      hint: '⛔ Plafond dépassé — Projexio ne traite plus' },
  }[projLevel];

  return (
    <div className="space-y-4">
      {/* 🏦 PROJEXIO — Plafond mensuel 2,5 M€ */}
      <div className={`bg-gradient-to-r ${projColors.bg} rounded-2xl p-4 text-white shadow-md`}>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏦</span>
            <div>
              <div className="text-xs font-semibold uppercase opacity-90">Plafond mensuel PROJEXIO</div>
              <div className="text-[10px] opacity-75">{proj.count} dossier{proj.count > 1 ? 's' : ''} envoyé{proj.count > 1 ? 's' : ''} ce mois (refus banque inclus, annulés par toi exclus)</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatEuro(proj.total)}</div>
            <div className="text-[11px] opacity-90">/ {formatEuro(PROJEXIO_CAP_MENSUEL)} ({projPct.toFixed(0)} %)</div>
          </div>
        </div>
        <div className="h-2 bg-black/25 rounded-full overflow-hidden">
          <div className="h-full bg-white transition-all" style={{ width: `${projPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[11px]">
          <span className="opacity-90">{projColors.hint}</span>
          <span className="font-semibold">
            {projOver
              ? `Dépassement : ${formatEuro(proj.total - PROJEXIO_CAP_MENSUEL)}`
              : `Reste : ${formatEuro(projReste)}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-4 text-white">
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold opacity-90 uppercase">Ce mois</div>
            <Activity className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-3xl font-bold">{dashboard.moisCourant.count}</div>
          <div className="text-xs opacity-90 mt-1">{formatEuro(dashboard.moisCourant.ca)} CA</div>
        </div>
        <div className="bg-gradient-to-br from-slate-500 to-gray-600 rounded-2xl p-4 text-white">
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold opacity-90 uppercase">Mois précédent</div>
            <Calendar className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-3xl font-bold">{dashboard.moisPrecedent.count}</div>
          <div className="text-xs opacity-90 mt-1">{formatEuro(dashboard.moisPrecedent.ca)} CA</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-white">
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold opacity-90 uppercase">Marge ce mois</div>
            <TrendingUp className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-2xl font-bold truncate">{formatEuro(dashboard.moisCourant.margeTtc)}</div>
        </div>
        <div className={`bg-gradient-to-br ${dashboard.moisCourant.ca >= dashboard.moisPrecedent.ca ? 'from-emerald-500 to-green-500' : 'from-rose-500 to-pink-500'} rounded-2xl p-4 text-white`}>
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold opacity-90 uppercase">Évolution</div>
            <Zap className="w-5 h-5 opacity-80" />
          </div>
          <div className="text-3xl font-bold">
            {dashboard.moisPrecedent.ca > 0 ? `${dashboard.moisCourant.ca >= dashboard.moisPrecedent.ca ? '+' : ''}${(((dashboard.moisCourant.ca - dashboard.moisPrecedent.ca) / dashboard.moisPrecedent.ca) * 100).toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

      {/* RAPPELS — FINANCEMENT EN ATTENTE DE RETOUR */}
      {dashboard.rappelsFinancement && dashboard.rappelsFinancement.length > 0 && (
        <div className="bg-white rounded-3xl shadow-md border-2 border-blue-200 overflow-hidden">
          <div className="p-5 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              💳 Financements en attente de retour
              <span className="ml-auto text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{dashboard.rappelsFinancement.length} dossier{dashboard.rappelsFinancement.length > 1 ? 's' : ''}</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">Dossiers envoyés au financeur depuis +2 jours sans réponse — pense à relancer.</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {dashboard.rappelsFinancement.map((r) => {
              const d = r.dossier;
              const statut = STATUTS.find(s => s.id === d.statut);
              const levelStyle = r.level === 'critical' ? 'text-rose-600' : r.level === 'high' ? 'text-orange-600' : 'text-amber-600';
              const levelBg = r.level === 'critical' ? 'bg-rose-50' : r.level === 'high' ? 'bg-orange-50' : 'bg-amber-50';
              return (
                <button
                  key={d.localId}
                  onClick={() => onShowQuick && onShowQuick(d.localId)}
                  className={`w-full px-4 py-2.5 hover:${levelBg} flex items-center gap-3 text-left transition-colors border-l-4 border-transparent hover:border-blue-400`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-gradient-to-br ${statut?.color || 'from-slate-400 to-slate-500'} text-white shadow-sm`}>
                    {statut?.emoji || '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm truncate">{d.nom} {d.prenom}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">💳 {d.financement}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Envoyé le {d.dateEnvoiFin && new Date(d.dateEnvoiFin).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-base font-bold ${levelStyle}`}>{r.jours}j</div>
                    <div className="text-[9px] text-slate-400">sans retour</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* RAPPELS — PAIEMENT EN ATTENTE APRÈS CONTRÔLE LIVRAISON */}
      {dashboard.rappelsPaiement && dashboard.rappelsPaiement.length > 0 && (
        <div className="bg-white rounded-3xl shadow-md border-2 border-emerald-200 overflow-hidden">
          <div className="p-5 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              💰 Paiements en attente après contrôle livraison
              <span className="ml-auto text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{dashboard.rappelsPaiement.length} dossier{dashboard.rappelsPaiement.length > 1 ? 's' : ''}</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">Contrôle livraison fait depuis +2 jours, banque pas encore payé — relance la banque.</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {dashboard.rappelsPaiement.map((r) => {
              const d = r.dossier;
              const statut = STATUTS.find(s => s.id === d.statut);
              const levelStyle = r.level === 'critical' ? 'text-rose-600' : r.level === 'high' ? 'text-orange-600' : 'text-amber-600';
              return (
                <button
                  key={d.localId}
                  onClick={() => onShowQuick && onShowQuick(d.localId)}
                  className="w-full px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3 text-left transition-colors border-l-4 border-transparent hover:border-emerald-400"
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-gradient-to-br ${statut?.color || 'from-slate-400 to-slate-500'} text-white shadow-sm`}>
                    {statut?.emoji || '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm truncate">{d.nom} {d.prenom}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">💳 {d.financement}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Contrôle le {d.dateControleLivraison && new Date(d.dateControleLivraison).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className={`text-base font-bold ${levelStyle}`}>{r.jours}j</div>
                    <div className="text-[9px] text-slate-400">sans paiement</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(dashboard.rappelsClient.length > 0 || dashboard.rappelsPrestataires.length > 0) && (
        <div className="bg-white rounded-3xl shadow-md border border-amber-200 overflow-hidden">
          <div className="p-5 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />Rappels de paiement (+30 jours)
            </h2>
          </div>
          {dashboard.rappelsClient.length > 0 && (
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-rose-600 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />Financeurs en retard ({dashboard.rappelsClient.length})
              </h3>
              <div className="space-y-1.5">
                {dashboard.rappelsClient.slice(0, 20).map(d => (
                  <button
                    key={d.localId}
                    onClick={() => onShowQuick && onShowQuick(d.localId, 'paiement')}
                    className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-semibold text-slate-700 truncate">{d.nom} {d.prenom}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">💳 {d.financement}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 font-bold">{d.joursAttente}j</span>
                      <span className="font-bold text-rose-700">{formatEuro(d.montantTotal)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {dashboard.rappelsPrestataires.length > 0 && (
            <div className="p-4">
              <PrestatairesPayerSection rappels={dashboard.rappelsPrestataires} onShowQuick={onShowQuick} />
            </div>
          )}
        </div>
      )}

      <PerfList titre="🔧 Performance des poseurs" data={dashboard.statsPoseurs} medal="🔧" border="border-amber-100" header="from-amber-50 to-orange-50" iconColor="text-amber-500" />
      <PerfList titre="🤝 Performance des régies" data={dashboard.statsRegies} medal="🤝" border="border-purple-100" header="from-purple-50 to-violet-50" iconColor="text-purple-500" />

      {/* ACTIVITÉ PAR UTILISATEUR */}
      {(() => {
        // Aggrège l'activité par utilisateur
        const userMap = {};
        const ensureUser = (name) => {
          const key = name || '(anonyme)';
          if (!userMap[key]) userMap[key] = { name: key, created: 0, modified: 0, statusChanges: 0, ca: 0, lastActivity: null };
          return userMap[key];
        };
        dossiers.forEach(d => {
          if (d.createdBy) {
            const u = ensureUser(d.createdBy);
            u.created++;
            u.ca += d.montantTotal || 0;
            if (d.createdAt && (!u.lastActivity || d.createdAt > u.lastActivity)) u.lastActivity = d.createdAt;
          }
          if (d.modifiedBy && d.modifiedBy !== d.createdBy) {
            const u = ensureUser(d.modifiedBy);
            u.modified++;
            if (d.modifiedAt && (!u.lastActivity || d.modifiedAt > u.lastActivity)) u.lastActivity = d.modifiedAt;
          }
          // Compte les changements de statut depuis l'historique
          (d.historique || []).forEach(h => {
            if (h.action === 'changement_statut' && h.user) {
              const u = ensureUser(h.user);
              u.statusChanges++;
              if (h.date && (!u.lastActivity || h.date > u.lastActivity)) u.lastActivity = h.date;
            }
          });
        });
        const users = Object.values(userMap).sort((a, b) =>
          (b.created + b.modified + b.statusChanges) - (a.created + a.modified + a.statusChanges)
        );
        if (users.length === 0) {
          // Pas encore d'activité tracée — affiche quand même le bloc avec un message
          return (
            <div className="bg-white rounded-3xl shadow-md border border-cyan-100 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-blue-50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  👤 Activité par utilisateur
                </h2>
              </div>
              <div className="p-8 text-center">
                <div className="text-5xl mb-3">📭</div>
                <h3 className="text-base font-bold text-slate-700 mb-2">Aucune activité tracée pour le moment</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                  Le suivi par utilisateur démarre à partir de maintenant.<br />
                  <strong>Ce que tu dois faire :</strong>
                </p>
                <ol className="text-xs text-slate-600 mt-3 inline-block text-left space-y-1">
                  <li>1. Clique sur <strong>"👤 Mon nom"</strong> dans le header (en haut à droite)</li>
                  <li>2. Tape ton nom (ex: "Théo")</li>
                  <li>3. <strong>Modifie un dossier existant</strong> ou crée-en un nouveau</li>
                  <li>4. L'activité apparaîtra ici 🎉</li>
                </ol>
                <p className="text-[10px] text-slate-400 italic mt-4">
                  Note : les anciens dossiers ne sont pas tagués rétroactivement (info pas connue).
                </p>
              </div>
            </div>
          );
        }

        const formatLast = (iso) => {
          if (!iso) return '—';
          try {
            const d = new Date(iso);
            const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (days === 0) return "aujourd'hui";
            if (days === 1) return "hier";
            if (days < 7) return `il y a ${days}j`;
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
          } catch (e) { return '—'; }
        };

        const totalActions = users.reduce((s, u) => s + u.created + u.modified + u.statusChanges, 0);

        return (
          <div className="bg-white rounded-3xl shadow-md border border-cyan-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-blue-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                👤 Activité par utilisateur
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Qui crée et modifie les dossiers — {totalActions} action{totalActions > 1 ? 's' : ''} au total</p>
            </div>
            <div className="divide-y divide-slate-100">
              {users.map((u, idx) => {
                const totalUserActions = u.created + u.modified + u.statusChanges;
                const pct = totalActions > 0 ? (totalUserActions / totalActions) * 100 : 0;
                const isAnonymous = u.name === '(anonyme)';
                return (
                  <div key={u.name} className="p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-bold w-8 h-8 rounded-full flex items-center justify-center ${idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white' : idx === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500 text-white' : idx === 2 ? 'bg-gradient-to-br from-amber-700 to-orange-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <div>
                          <div className={`font-bold ${isAnonymous ? 'text-rose-700 italic' : 'text-slate-800'}`}>
                            {isAnonymous ? '⚠️ ' : '👤 '}{u.name}
                          </div>
                          <div className="text-[10px] text-slate-500">Dernière activité : {formatLast(u.lastActivity)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">✨ {u.created} créé{u.created > 1 ? 's' : ''}</span>
                        {u.modified > 0 && <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">✏️ {u.modified} modif</span>}
                        {u.statusChanges > 0 && <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">🔄 {u.statusChanges} statut{u.statusChanges > 1 ? 's' : ''}</span>}
                        {u.ca > 0 && <span className="text-xs px-2 py-1 rounded-full bg-violet-50 text-violet-700 font-semibold">💰 {formatEuro(u.ca)}</span>}
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${isAnonymous ? 'bg-rose-400' : 'bg-gradient-to-r from-cyan-400 to-blue-500'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{pct.toFixed(0)}% de l'activité totale</div>
                  </div>
                );
              })}
              {users.find(u => u.name === '(anonyme)') && (
                <div className="p-3 bg-rose-50 border-t border-rose-100 text-xs text-rose-700">
                  ⚠️ Les actions <strong>(anonyme)</strong> ont été faites sans nom défini. Demande à ton équipe de cliquer sur <strong>"👤 Mon nom"</strong> dans le header pour identifier leurs actions.
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PerfList({ titre, data, medal, border, header, iconColor }) {
  return (
    <div className={`bg-white rounded-3xl shadow-md border ${border} overflow-hidden`}>
      <div className={`p-5 border-b border-slate-100 bg-gradient-to-r ${header}`}>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Award className={`w-5 h-5 ${iconColor}`} />{titre}
        </h2>
      </div>
      <div className="divide-y divide-slate-100">
        {data.map((p, idx) => {
          const margePct = p.ca > 0 ? (p.margeApportee / p.ca) * 100 : 0;
          const m = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : medal;
          return (
            <div key={p.nom} className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xl">{m}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{p.nom}</div>
                    <div className="text-xs text-slate-500">{p.count} dossier{p.count > 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <SmallStat label="CA" value={formatEuro(p.ca)} color="text-blue-600" />
                  <SmallStat label="Coût" value={formatEuro(p.coutTotal)} color="text-amber-600" />
                  <SmallStat label="Marge" value={`${margePct.toFixed(1)}%`} color="text-emerald-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReglagesView({ statutsOrder, setStatutsOrder, STATUTS_ORDERED, dossiers, tarifsPoseurs, setTarifsPoseurs, tarifsRegies, setTarifsRegies, tarifsInternes, setTarifsInternes, nomsInternes, setNomsInternes, listeFournisseurs, setListeFournisseurs, tarifsFournisseurs, setTarifsFournisseurs, produits, setProduits, users, setUsers, poseursContacts, setPoseursContacts, regiesContacts, setRegiesContacts, emailConfig, setEmailConfig, gmailOAuth, setGmailOAuth, societes = [], setSocietes }) {
  // Init depuis le hash URL pour qu'un refresh garde la sous-section.
  // Format : #reglages/utilisateurs → section = 'utilisateurs'
  const sectionFromHash = (typeof window !== 'undefined' && window.location.hash)
    ? window.location.hash.replace(/^#/, '').split('/')[1] || 'statuts'
    : 'statuts';
  const [section, setSection] = useState(sectionFromHash);
  // Sync le hash quand la section change (préfixe 'reglages' déjà géré par l'App)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = `reglages/${section}`;
    if (window.location.hash.replace(/^#/, '') !== target) {
      window.history.replaceState(null, '', `#${target}`);
    }
  }, [section]);
  // Nombre de comptes Supabase, remonté par UsersManager pour le badge de l'onglet.
  const [usersCount, setUsersCount] = useState(null);

  const sections = [
    { id: 'statuts',      label: 'Statuts',      emoji: '📊', color: 'from-pink-500 to-rose-500' },
    { id: 'societes',     label: 'Sociétés',     emoji: '🏢', color: 'from-emerald-500 to-teal-500' },
    { id: 'utilisateurs', label: 'Utilisateurs', emoji: '👥', color: 'from-cyan-500 to-blue-500' },
    { id: 'produits',     label: 'Produits',     emoji: '🛒', color: 'from-amber-500 to-yellow-500' },
    { id: 'poseurs',      label: 'Poseurs',      emoji: '🔧', color: 'from-amber-500 to-orange-500' },
    { id: 'fournisseurs', label: 'Fournisseurs', emoji: '📦', color: 'from-blue-500 to-cyan-500' },
    { id: 'regies',       label: 'Régies',       emoji: '🤝', color: 'from-purple-500 to-violet-500' },
    { id: 'commissions',  label: 'Équipe interne', emoji: '👥', color: 'from-fuchsia-500 to-pink-500' },
    { id: 'email',        label: 'Email d\'envoi', emoji: '📧', color: 'from-blue-500 to-indigo-500' },
    { id: 'onoff',        label: 'ONOFF (CQ)',   emoji: '📞', color: 'from-purple-500 to-violet-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-2 shadow-md border border-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {sections.map(s => {
            const sel = section === s.id;
            // Pas de compteur pour "utilisateurs" : les vrais comptes sont
            // chargés dans UsersManager (Supabase), ReglagesView ne les a pas.
            const count = s.id === 'statuts' ? STATUTS_ORDERED.length
                        : s.id === 'utilisateurs' ? usersCount
                        : s.id === 'produits' ? produits.length
                        : s.id === 'poseurs' ? Object.keys(tarifsPoseurs).length
                        : s.id === 'fournisseurs' ? listeFournisseurs.length
                        : s.id === 'regies' ? Object.keys(tarifsRegies).length
                        : null;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  sel
                    ? `bg-gradient-to-r ${s.color} text-white shadow-md scale-105`
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-lg">{s.emoji}</span>
                <span>{s.label}</span>
                {count !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sel ? 'bg-white/30' : 'bg-white text-slate-700'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {section === 'statuts' && (
        <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-pink-50 to-rose-50">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-pink-500" />Ordre des statuts
            </h2>
            <p className="text-xs text-slate-500 mt-1">Utilisez les flèches pour réorganiser</p>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm font-semibold text-slate-600">📋 {STATUTS_ORDERED.length} statuts</div>
              <button onClick={() => setStatutsOrder(STATUTS.map(s => s.id))} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3" />Réinitialiser
              </button>
            </div>
            <div className="space-y-1.5">
              {STATUTS_ORDERED.map((s, idx) => {
                const count = dossiers.filter(d => d.statut === s.id).length;
                const moveUp = () => {
                  if (idx === 0) return;
                  const n = [...statutsOrder];
                  [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                  setStatutsOrder(n);
                };
                const moveDown = () => {
                  if (idx === statutsOrder.length - 1) return;
                  const n = [...statutsOrder];
                  [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
                  setStatutsOrder(n);
                };
                return (
                  <div key={s.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="flex-shrink-0 w-7 h-7 bg-white rounded-lg flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200">{idx + 1}</span>
                    <span className={`flex-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${s.bg} ${s.text}`}>
                      <span>{s.emoji}</span>{s.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">{count}</span>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={moveUp} disabled={idx === 0} className="p-1 text-slate-500 hover:bg-violet-50 rounded disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={moveDown} disabled={idx === statutsOrder.length - 1} className="p-1 text-slate-500 hover:bg-violet-50 rounded disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'societes' && (
        <SocietesManager societes={societes} setSocietes={setSocietes} dossiers={dossiers} />
      )}

      {section === 'utilisateurs' && (
        <UsersManager users={users} setUsers={setUsers} dossiers={dossiers} poseursList={Object.keys(tarifsPoseurs)} regiesList={Object.keys(tarifsRegies)} onCountChange={setUsersCount} />
      )}

      {section === 'produits' && (
        <ProduitsManager produits={produits} setProduits={setProduits} dossiers={dossiers} />
      )}

      {section === 'poseurs' && (
        <PrestataireManager titre="🔧 Poseurs" description="Tarifs HT par puissance. Tél/email du poseur → onglet Utilisateurs (compte rattaché à ce poseur)." data={tarifsPoseurs} setData={setTarifsPoseurs} dossiers={dossiers} dossierField="poseur" type="poseur" produits={produits} contacts={poseursContacts} setContacts={setPoseursContacts} contactsObjectShape={true} />
      )}

      {section === 'fournisseurs' && (
        <FournisseursManager data={listeFournisseurs} setData={setListeFournisseurs} dossiers={dossiers} tarifs={tarifsFournisseurs} setTarifs={setTarifsFournisseurs} />
      )}

      {section === 'regies' && (
        <PrestataireManager titre="🤝 Régies commerciales" description="Tarifs HT par puissance. Tél/email de la régie → onglet Utilisateurs (compte rattaché à cette régie)." data={tarifsRegies} setData={setTarifsRegies} dossiers={dossiers} dossierField="regie" type="régie" produits={produits} contacts={regiesContacts} setContacts={setRegiesContacts} contactsObjectShape={true} />
      )}

      {section === 'commissions' && (
        <CommissionsInternesManager tarifs={tarifsInternes} setTarifs={setTarifsInternes} noms={nomsInternes} setNoms={setNomsInternes} dossiers={dossiers} />
      )}

      {section === 'email' && (
        <EmailConfigManager config={emailConfig} setConfig={setEmailConfig} gmailOAuth={gmailOAuth} setGmailOAuth={setGmailOAuth} />
      )}

      {section === 'onoff' && <OnoffConfigManager />}
    </div>
  );
}

// Petit panneau de config ONOFF Business. Génère un token aléatoire côté nav
// (crypto.getRandomValues), le persiste dans window.storage pour que l'user
// puisse revenir le récupérer plus tard, et fournit les boutons "Copier" pour
// l'URL du webhook + le token. Aucune appel terminal nécessaire.
function OnoffConfigManager() {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState('');
  const webhookUrl = `${window.location.origin}/api/cq-recording`;

  useEffect(() => {
    (async () => {
      try {
        const row = await window.storage.get('onoff-webhook-token');
        if (row?.value) setToken(row.value);
      } catch (e) {
        console.warn('[onoff] load token failed', e);
      }
    })();
  }, []);

  const generate = async () => {
    // 32 octets aléatoires → 64 caractères hex (identique à `openssl rand -hex 32`).
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setToken(hex);
    try {
      await window.storage.set('onoff-webhook-token', hex);
    } catch (e) {
      console.warn('[onoff] save token failed', e);
    }
  };

  const regenerate = async () => {
    if (!window.confirm('Générer un NOUVEAU token va invalider l\'actuel. Tu devras le remettre dans Vercel ET dans ONOFF. Confirmer ?')) return;
    await generate();
  };

  const copy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch (e) {
      alert('Impossible de copier — sélectionne et fais Cmd+C.');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-slate-200 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          📞 ONOFF Business — Appel CQ auto-enregistré
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Configure une seule fois. Ensuite, tes appels CQ depuis ONOFF s'attacheront automatiquement au bon dossier — l'enregistrement audio apparaît dans la fiche.
        </p>
      </div>

      {/* 1. Token */}
      <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50/50">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h4 className="font-bold text-purple-700 text-sm">🔐 1. Token sécurisé</h4>
          {token ? (
            <button onClick={regenerate} className="text-[11px] font-bold text-rose-600 hover:underline">🔄 Regénérer</button>
          ) : null}
        </div>
        {token ? (
          <>
            <div className="flex items-center gap-2 bg-white border border-purple-300 rounded-lg p-2 font-mono text-[11px] break-all">
              <span className="flex-1 select-all">{token}</span>
              <button
                onClick={() => copy('token', token)}
                className="flex-shrink-0 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold whitespace-nowrap"
              >
                {copied === 'token' ? '✓ Copié' : '📋 Copier'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Ce même token doit être collé dans <strong>Vercel</strong> (étape 2) ET dans <strong>ONOFF</strong> (étape 3). Les deux doivent matcher pour que ça fonctionne.
            </p>
          </>
        ) : (
          <button
            onClick={generate}
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2"
          >
            🎲 Générer un token
          </button>
        )}
      </div>

      {/* 2. Vercel */}
      <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/50">
        <h4 className="font-bold text-blue-700 text-sm mb-2">⚙️ 2. Ajouter dans Vercel</h4>
        <ol className="text-sm text-slate-700 space-y-1.5 list-decimal list-inside">
          <li>
            Va sur <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">vercel.com/dashboard</a> → projet <strong>crm-solaire</strong> → <strong>Settings</strong> → <strong>Environment Variables</strong>
          </li>
          <li>Clique <strong>Add Environment Variable</strong></li>
          <li>
            Key :{' '}
            <button onClick={() => copy('varname', 'ONOFF_WEBHOOK_TOKEN')} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-300 rounded text-[11px] font-mono font-bold hover:bg-blue-50">
              ONOFF_WEBHOOK_TOKEN {copied === 'varname' ? '✓' : '📋'}
            </button>
          </li>
          <li>Value : <strong>colle le token de l'étape 1</strong> (clique 📋 ci-dessus)</li>
          <li>Coche les <strong>3 environnements</strong> (Production + Preview + Development) → <strong>Save</strong></li>
          <li>Onglet <strong>Deployments</strong> → dernier déploiement → menu <strong>…</strong> → <strong>Redeploy</strong></li>
        </ol>
      </div>

      {/* 3. ONOFF */}
      <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50/50">
        <h4 className="font-bold text-purple-700 text-sm mb-2">📞 3. Configurer ONOFF Business</h4>
        <ol className="text-sm text-slate-700 space-y-1.5 list-decimal list-inside">
          <li>
            Connecte-toi sur <a href="https://admin.onoffbusiness.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-semibold hover:underline">admin.onoffbusiness.com</a>
          </li>
          <li>
            Active l'enregistrement : bannière du haut → <strong>Call recording</strong> → <strong>Activate</strong> → <strong>I understand</strong>
            <br/>
            <span className="text-[11px] text-amber-700">⚠️ Légal : préviens le client en début d'appel que la conversation est enregistrée.</span>
          </li>
          <li>Va dans <strong>Integrations</strong> → choisis <strong>Call webhook</strong></li>
          <li>
            URL :{' '}
            <button onClick={() => copy('url', webhookUrl)} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-purple-300 rounded text-[11px] font-mono font-bold hover:bg-purple-50">
              {webhookUrl} {copied === 'url' ? '✓' : '📋'}
            </button>
          </li>
          <li>API key : <strong>colle le token de l'étape 1</strong></li>
          <li>Clique <strong>Integrate</strong> — ONOFF envoie un appel de test pour valider</li>
        </ol>
      </div>

      {!token && (
        <p className="text-xs text-slate-400 italic">💡 Commence par cliquer "Générer un token" en haut.</p>
      )}
    </div>
  );
}

function EmailConfigManager({ config, setConfig, gmailOAuth, setGmailOAuth }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  // Functional setState pour éviter les race conditions React 18 quand
  // l'utilisateur tape vite (chaque update voit toujours le dernier state).
  const update = (patch) => setConfig(prev => ({ ...prev, ...patch }));

  // Démarre le flow OAuth Google : on passe par /api/google-oauth-start
  // qui valide le JWT et redirige vers Google.
  const connectGmail = async () => {
    setOauthBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Reconnecte-toi d\'abord.');
        setOauthBusy(false);
        return;
      }
      // Redirection vers le start endpoint qui redirige ensuite vers Google
      window.location.href = `/api/google-oauth-start?token=${encodeURIComponent(session.access_token)}`;
    } catch (e) {
      alert(`Erreur démarrage OAuth : ${e.message}`);
      setOauthBusy(false);
    }
  };

  const disconnectGmail = async () => {
    if (!window.confirm('Déconnecter Gmail du CRM ? Tu pourras te reconnecter en 1 clic ensuite.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/gmail-oauth', { method: 'DELETE', headers });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      setGmailOAuth({ connected: false, email: null, connectedAt: null });
    } catch (e) {
      alert(`Erreur déconnexion : ${e.message}`);
    }
  };

  // Test envoi via OAuth (utilise /api/send-email avec provider 'gmail-oauth')
  const testSendOAuth = async () => {
    if (!gmailOAuth.connected) {
      alert('Connecte Gmail d\'abord.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: 'gmail-oauth',
          to: gmailOAuth.email,
          subject: '✅ Test CRM Solaire — Gmail OAuth OK',
          text: 'Si tu reçois ce mail, l\'envoi automatique via Gmail OAuth marche. Tu peux utiliser le bouton "Envoyer email" dans le CRM.',
          fromName: config.fromName || 'CRM Solaire',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      setTestResult({ ok: true, msg: `Envoyé à ${gmailOAuth.email} — vérifie ta boîte mail.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  // Test envoi via app password (legacy / fallback)
  const testSend = async () => {
    if (!config.smtpUser || !config.smtpPass) {
      alert("Renseigne d'abord l'email + le mot de passe d'application.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: config.smtpUser,
          subject: '✅ Test CRM Solaire — config email OK',
          text: 'Si tu reçois ce mail, la config Gmail est OK.',
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass,
          fromName: config.fromName || 'CRM Solaire',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      setTestResult({ ok: true, msg: `Envoyé à ${config.smtpUser} — vérifie ta boîte mail.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  // Auto-détection du serveur SMTP à partir du domaine de l'email
  const detectedSmtp = (() => {
    const email = (config.smtpUser || '').toLowerCase();
    const domain = email.includes('@') ? email.split('@')[1] : '';
    if (!domain) return null;
    if (domain === 'gmail.com' || domain.endsWith('.gmail.com')) return { host: 'smtp.gmail.com', port: 465, label: 'Gmail' };
    if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com') return { host: 'smtp-mail.outlook.com', port: 587, label: 'Outlook/Hotmail' };
    if (domain === 'yahoo.com' || domain === 'yahoo.fr') return { host: 'smtp.mail.yahoo.com', port: 465, label: 'Yahoo' };
    if (domain.endsWith('ovh.fr') || domain.endsWith('ovh.com') || domain.endsWith('ovh.net')) return { host: 'ssl0.ovh.net', port: 465, label: 'OVH' };
    if (domain === 'orange.fr' || domain === 'wanadoo.fr') return { host: 'smtp.orange.fr', port: 465, label: 'Orange' };
    if (domain === 'free.fr') return { host: 'smtp.free.fr', port: 465, label: 'Free' };
    if (domain === 'sfr.fr') return { host: 'smtp.sfr.fr', port: 465, label: 'SFR' };
    // Google Workspace (domaine perso routé via Google) → on suppose Gmail SMTP
    // L'utilisateur peut écraser avec le formulaire avancé.
    return { host: 'smtp.gmail.com', port: 465, label: 'Google Workspace (présumé)' };
  })();

  return (
    <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">📧 Email d'envoi automatique</h2>
        <p className="text-xs text-slate-500 mt-1">Renseigne ton email + mot de passe — les emails du CRM partiront automatiquement depuis ton adresse.</p>
      </div>
      <div className="p-5 space-y-4">

        {/* Formulaire principal : email + password + SMTP auto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">📧 E-mail <span className="text-rose-500">*</span></label>
            <input
              type="email"
              value={config.smtpUser || ''}
              onChange={(e) => update({ smtpUser: e.target.value })}
              placeholder="rodney@gmail.com"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">🔑 Mot de passe <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={config.smtpPass || ''}
                onChange={(e) => update({ smtpPass: e.target.value })}
                placeholder="Mot de passe d'application Google"
                className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700">
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Serveur SMTP</label>
            <input
              type="text"
              value={detectedSmtp ? detectedSmtp.host : ''}
              disabled
              placeholder="Auto-détecté à partir de l'email"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Nom de l'émetteur</label>
            <input
              type="text"
              value={config.fromName || ''}
              onChange={(e) => update({ fromName: e.target.value })}
              placeholder="Rodney HADDAD"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
            />
          </div>
        </div>

        {detectedSmtp && config.smtpUser && (
          <div className="text-[11px] text-slate-500 px-1">
            ℹ️ Le CRM utilisera <strong>{detectedSmtp.host}:{detectedSmtp.port}</strong> ({detectedSmtp.label}). Le destinataire verra "<strong>{config.fromName || 'CRM Solaire'}</strong> &lt;{config.smtpUser}&gt;".
          </div>
        )}

        {/* Aide : Gmail = app password obligatoire */}
        {config.smtpUser && (config.smtpUser.includes('@gmail.com') || detectedSmtp?.host === 'smtp.gmail.com') && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
            <div className="font-bold mb-1">⚠️ Pour Gmail / Google Workspace :</div>
            <div>Google n'accepte PAS ton vrai mot de passe Google ici. Tu dois utiliser un <strong>mot de passe d'application</strong> :</div>
            <ol className="list-decimal ml-5 mt-1.5 space-y-0.5">
              <li>Active la <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">validation en 2 étapes</a></li>
              <li>Va sur <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">myaccount.google.com/apppasswords</a></li>
              <li>Crée un mot de passe pour "CRM Solaire" (16 caractères)</li>
              <li>Colle-les dans le champ Mot de passe ci-dessus</li>
            </ol>
          </div>
        )}

        {/* Test */}
        <div className="border-t border-slate-200 pt-4">
          <button
            onClick={testSend}
            disabled={testing || !config.smtpUser || !config.smtpPass}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2"
          >
            {testing ? '⏳ Test en cours…' : '✉️ M\'envoyer un mail de test'}
          </button>
          {testResult && (
            <div className={`mt-3 p-3 rounded-xl text-xs ${testResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
              {testResult.ok ? '✅ ' : '❌ '}{testResult.msg}
            </div>
          )}
        </div>

        {/* Méthode alternative OAuth (1 clic sans password mais setup Google Cloud) */}
        <div className="border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
          >
            {showAdvanced ? '▾ Masquer' : '▸ Voir'} la méthode alternative (OAuth Google — sans password mais setup ~30 min)
          </button>
          {showAdvanced && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              {gmailOAuth?.connected ? (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg">
                  <div className="text-xs font-bold text-emerald-800">✅ OAuth Gmail connecté : {gmailOAuth.email}</div>
                  <button onClick={disconnectGmail} className="mt-2 px-3 py-1 bg-white border border-rose-300 text-rose-600 rounded text-xs font-semibold hover:bg-rose-50">🔌 Déconnecter OAuth</button>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-slate-600 leading-relaxed">
                    Avec OAuth, pas de mot de passe à copier — tu cliques "Connecter Gmail" → consent screen Google → fini. Mais ça nécessite un setup Google Cloud côté admin (~30 min, 1 fois).
                  </div>
                  <button
                    onClick={connectGmail}
                    disabled={oauthBusy}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    {oauthBusy ? '⏳ Redirection…' : '🔗 Connecter Gmail (OAuth)'}
                  </button>
                  <details className="text-[11px] text-slate-600">
                    <summary className="cursor-pointer font-bold">⚙️ Voir les étapes setup Google Cloud</summary>
                    <ol className="list-decimal ml-5 space-y-0.5 mt-2">
                      <li><a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">console.cloud.google.com</a> → New project "CRM Solaire"</li>
                      <li>APIs &amp; Services → Library → Gmail API → Enable</li>
                      <li>OAuth consent screen : External → ajoute scopes <code>gmail.send</code> + <code>userinfo.email</code> + ton email en test user</li>
                      <li>Credentials → OAuth client ID → Web app → redirect URI <code>https://crm-solaire.vercel.app/api/google-oauth-callback</code></li>
                      <li>Vercel env : <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code></li>
                    </ol>
                  </details>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sécurité */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
          🔒 <strong>Sécurité :</strong> ces identifiants sont stockés dans la base Supabase du CRM (accessibles aux utilisateurs connectés). Pour Gmail, utilise un mot de passe d'application dédié au CRM — révocable à tout moment depuis Google sans toucher à ton vrai mot de passe.
        </div>
      </div>
    </div>
  );
}

function CommissionsInternesManager({ tarifs, setTarifs, noms, setNoms, dossiers }) {
  const [addingFor, setAddingFor] = useState(null); // role.key en cours d'ajout
  const [newName, setNewName] = useState('');

  const addName = (roleKey) => {
    const n = newName.trim();
    if (!n) return;
    const list = noms[roleKey] || [];
    if (list.find(x => x.toLowerCase() === n.toLowerCase())) {
      alert(`"${n}" existe déjà pour ce rôle`);
      return;
    }
    setNoms({ ...noms, [roleKey]: [...list, n] });
    setNewName('');
    setAddingFor(null);
  };

  const removeName = (roleKey, nom) => {
    const usedIn = dossiers.filter(d => d[roleKey] === nom).length;
    const msg = usedIn > 0
      ? `⚠️ "${nom}" est utilisé dans ${usedIn} dossier(s). Le retirer de la liste ? (Les dossiers existants gardent le nom.)`
      : `Retirer "${nom}" de la liste ?`;
    if (!window.confirm(msg)) return;
    setNoms({ ...noms, [roleKey]: (noms[roleKey] || []).filter(x => x !== nom) });
  };

  return (
    <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 to-pink-50">
        <h2 className="text-lg font-bold text-slate-800">👥 Commissions équipe interne</h2>
        <p className="text-xs text-slate-500 mt-1">Pour chaque rôle : un tarif par défaut + une liste de personnes assignables. Tu pourras toujours saisir un nom à la volée dans une fiche dossier.</p>
      </div>
      <div className="p-4 space-y-3">
        {ROLES_INTERNES.map(role => {
          const liste = noms[role.key] || [];
          const nbDossiers = dossiers.filter(d => d[role.key]).length;
          return (
            <div key={role.key} className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 space-y-2">
              {/* Header : rôle + tarif par défaut */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-slate-800 text-sm">{role.emoji} {role.label}</div>
                  <div className="text-[11px] text-slate-500">{nbDossiers} dossier{nbDossiers > 1 ? 's' : ''} · {liste.length} personne{liste.length > 1 ? 's' : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Tarif</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tarifs[role.key] ?? ''}
                    onChange={(e) => setTarifs({ ...tarifs, [role.key]: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    className="w-24 px-2 py-1 bg-white border border-fuchsia-300 rounded-lg text-sm font-bold text-fuchsia-700 text-right"
                    placeholder="0"
                  />
                  <span className="text-sm font-bold text-fuchsia-700">€</span>
                </div>
              </div>

              {/* Liste des personnes assignables */}
              <div className="bg-white rounded-lg p-2 border border-fuchsia-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-fuchsia-700 uppercase">Personnes</span>
                  {addingFor !== role.key && (
                    <button onClick={() => { setAddingFor(role.key); setNewName(''); }} className="text-[11px] font-semibold text-fuchsia-600 bg-fuchsia-50 hover:bg-fuchsia-100 px-2 py-0.5 rounded flex items-center gap-1">
                      <Plus className="w-3 h-3" />Ajouter
                    </button>
                  )}
                </div>

                {addingFor === role.key && (
                  <div className="flex items-center gap-1 mb-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addName(role.key); if (e.key === 'Escape') { setAddingFor(null); setNewName(''); } }}
                      placeholder={`Nom du ${role.label.toLowerCase()}`}
                      className="flex-1 px-2 py-1 bg-white border border-fuchsia-300 rounded text-sm"
                      autoFocus
                    />
                    <button onClick={() => addName(role.key)} className="px-2 py-1 bg-fuchsia-500 text-white rounded text-[11px] font-semibold">OK</button>
                    <button onClick={() => { setAddingFor(null); setNewName(''); }} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-semibold">Annuler</button>
                  </div>
                )}

                {liste.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic px-1 py-1">Aucune personne — clique sur "Ajouter" pour créer la liste</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {liste.map(nom => (
                      <span key={nom} className="inline-flex items-center gap-1 bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        {nom}
                        <button onClick={() => removeName(role.key, nom)} className="hover:bg-fuchsia-200 rounded-full p-0.5 text-fuchsia-600" title="Retirer de la liste">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 leading-relaxed">
          💡 Les noms ajoutés ici apparaîtront dans le menu déroulant de chaque rôle quand tu remplis une fiche dossier. Tu peux aussi taper un nouveau nom à la volée — il sera automatiquement ajouté à la liste.
        </div>
      </div>
    </div>
  );
}

// Éditeur de contact (tél + email optionnel) avec brouillon local et
// bouton 'Enregistrer' explicite. Évite les sauvegardes silencieuses qui
// semblent ne pas marcher (perception utilisateur) — l'utilisateur clique,
// voit "✓ Enregistré", il est sûr que c'est en base.
function ContactRowEditor({ nom, currentTel, currentEmail, onSave, showEmail }) {
  const [tel, setTel] = useState(currentTel || '');
  const [email, setEmail] = useState(currentEmail || '');
  const [savedFlash, setSavedFlash] = useState(false);

  // Resync quand la prop change (autre device, reload), seulement si pas en cours d'édition
  useEffect(() => { setTel(currentTel || ''); }, [currentTel]);
  useEffect(() => { setEmail(currentEmail || ''); }, [currentEmail]);

  const dirty = (tel || '') !== (currentTel || '') || (showEmail && (email || '') !== (currentEmail || ''));

  const save = () => {
    onSave(tel.trim(), email.trim());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="mt-1 space-y-1">
      <input
        type="tel"
        value={tel}
        onChange={(e) => setTel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
        placeholder="📞 tél. (WhatsApp)"
        className="w-full px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
      />
      {showEmail && (
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
          placeholder="📧 email"
          className="w-full px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      )}
      {dirty && (
        <button
          type="button"
          onClick={save}
          className="w-full px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
        >
          💾 Enregistrer
        </button>
      )}
      {savedFlash && (
        <div className="text-[9px] text-emerald-700 font-bold text-center">✓ Enregistré</div>
      )}
    </div>
  );
}

function PrestataireManager({ titre, description, data, setData, dossiers, dossierField, type, produits, contacts, setContacts, contactsObjectShape = false }) {
  // contactsObjectShape=false : contacts = { [nom]: 'tel' } (legacy poseurs)
  // contactsObjectShape=true  : contacts = { [nom]: { tel, email } } (régies)
  const getTel = (nom) => {
    const c = (contacts || {})[nom];
    if (c == null) return '';
    return typeof c === 'string' ? c : (c.tel || '');
  };
  const getEmail = (nom) => {
    const c = (contacts || {})[nom];
    if (c == null || typeof c === 'string') return '';
    return c.email || '';
  };
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const noms = Object.keys(data);
  // Produits non-solaires (avec tarif flat par produit)
  const otherProducts = (produits || []).filter(p => !p.autoTarif);

  const add = () => {
    const nom = newName.trim().toUpperCase();
    if (!nom) return;
    if (data[nom]) { alert(`"${nom}" existe déjà`); return; }
    setData({ ...data, [nom]: {} });
    setNewName(''); setShowAdd(false);
  };

  const rename = (oldN, newN) => {
    const c = newN.trim().toUpperCase();
    if (!c || c === oldN) return;
    if (data[c]) { alert(`"${c}" existe déjà`); return; }
    setData(prev => {
      const nd = {};
      Object.keys(prev).forEach(k => { nd[k === oldN ? c : k] = prev[k]; });
      return nd;
    });
    // Migre aussi le contact (tél/email) si présent, en functional setState
    // pour éviter d'écraser une modif récente du contact.
    if (setContacts) {
      setContacts(prev => {
        if (!prev || prev[oldN] === undefined) return prev;
        const nc = { ...prev };
        nc[c] = nc[oldN];
        delete nc[oldN];
        return nc;
      });
    }
  };

  const del = (nom) => {
    // Pour les régies, on vérifie aussi dans le tableau multi-régies
    const usedSingle = dossiers.filter(d => d[dossierField] === nom).length;
    const usedMulti = dossierField === 'regie' ? dossiers.filter(d => (d.regies || []).some(r => r.nom === nom)).length : 0;
    const used = usedSingle + usedMulti;
    const msg = used > 0 ? `⚠️ "${nom}" utilisé dans ${used} dossier(s). Supprimer ?` : `Supprimer "${nom}" ?`;
    if (!window.confirm(msg)) return;
    setData(prev => { const nd = { ...prev }; delete nd[nom]; return nd; });
    if (setContacts) {
      setContacts(prev => {
        if (!prev || prev[nom] === undefined) return prev;
        const nc = { ...prev }; delete nc[nom]; return nc;
      });
    }
  };

  // Sauvegarde tél + email d'un prestataire en UN SEUL setContacts.
  // Utiliser 2 setContacts back-to-back fait perdre la 1ère valeur (closure stale).
  // Utilise functional setState pour être safe sur React 18 batching.
  const saveContact = (nom, tel, email) => {
    if (!setContacts) return;
    const tVal = (tel || '').trim();
    const eVal = (email || '').trim();
    setContacts(prev => {
      const nc = { ...(prev || {}) };
      if (contactsObjectShape) {
        const next = { tel: tVal, email: eVal };
        if (!next.tel && !next.email) delete nc[nom]; else nc[nom] = next;
      } else {
        if (tVal) nc[nom] = tVal; else delete nc[nom];
      }
      return nc;
    });
  };

  const updateTarif = (nom, key, v) => {
    const num = parseFloat(v);
    const t = { ...data[nom] };
    if (isNaN(num) || num === 0) delete t[key]; else t[key] = num;
    setData({ ...data, [nom]: t });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50">
          <h2 className="text-lg font-bold text-slate-800">{titre}</h2>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-semibold text-slate-600">📋 {noms.length} {type}{noms.length > 1 ? 's' : ''}</div>
            {!showAdd ? (
              <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Plus className="w-3 h-3" />Ajouter
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); } }} placeholder={`Nom du ${type}`} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" autoFocus />
                <button onClick={add} className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-semibold">OK</button>
                <button onClick={() => { setShowAdd(false); setNewName(''); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">Annuler</button>
              </div>
            )}
          </div>

          {/* GRILLE 1 : Panneaux solaires par Wc (existant) */}
          <div className="mb-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
              <span>☀️</span><span>Panneaux solaires — tarifs par Wc</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[140px] border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">Nom</th>
                    {PUISSANCES_PRINCIPALES.map(p => <th key={p} className="px-2 py-2 text-right font-bold text-slate-600 whitespace-nowrap">{p} Wc</th>)}
                    <th className="px-2 py-2 text-center font-bold text-slate-600">Dossiers</th>
                    <th className="px-2 py-2 text-center font-bold text-slate-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {noms.map(nom => {
                    const used = dossiers.filter(d => d[dossierField] === nom).length;
                    return (
                      <tr key={nom} className="border-t border-slate-200 hover:bg-slate-50 group">
                        <td className="px-2 py-1.5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 min-w-[140px] border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                          <input type="text" defaultValue={nom} onBlur={(e) => rename(nom, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:border-violet-400 focus:bg-white focus:outline-none rounded text-xs font-semibold" />
                          {/* Tél/email gérés dans Réglages → Utilisateurs (compte rattaché à ce {type}) — source de vérité unique, plus de bug d'effacement */}
                        </td>
                        {PUISSANCES_PRINCIPALES.map(p => {
                          const isExact = data[nom][p] !== undefined;
                          const tarif = findClosestTarif(data[nom], p);
                          return (
                            <td key={p} className="px-1 py-1.5 text-right">
                              <input type="number" defaultValue={isExact ? data[nom][p] : ''} onBlur={(e) => updateTarif(nom, p, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} placeholder={tarif > 0 ? tarif : '—'} className={`w-16 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-violet-400 text-xs ${isExact ? 'font-semibold text-slate-800' : 'text-slate-400'}`} />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${used > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{used}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button onClick={() => del(nom)} className="p-1 text-rose-500 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* GRILLE 2 : Autres produits — prix flat par produit (opt-in) */}
          {otherProducts.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                <span>🛒</span><span>Autres produits — prix HT unitaire (multiplié par la quantité)</span>
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[140px] border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">Nom</th>
                      {otherProducts.map(p => (
                        <th key={p.id} className="px-2 py-2 text-center font-bold text-slate-600 whitespace-nowrap" title={p.label}>
                          <div className="flex items-center justify-center gap-1">
                            <span>{p.emoji}</span><span>{p.label}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {noms.map(nom => (
                      <tr key={nom} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-semibold text-slate-700 sticky left-0 bg-white z-10 min-w-[140px] border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">{nom}</td>
                        {otherProducts.map(p => {
                          const val = data[nom]?.[p.id];
                          const isSet = val !== undefined && val !== null && val !== '';
                          return (
                            <td key={p.id} className="px-1 py-1.5 text-right">
                              <input type="number" step="0.01" defaultValue={isSet ? val : ''} onBlur={(e) => updateTarif(nom, p.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} placeholder="—" className={`w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-violet-400 text-xs ${isSet ? 'font-semibold text-slate-800' : 'text-slate-400'}`} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-700 leading-relaxed">
                💡 Prix HT que tu paies à ce {type} pour <strong>1 unité</strong> de chaque produit. Sur un dossier, ce prix est multiplié par la quantité saisie (ex: 3 climatisations → 3× le prix unitaire). Laisse vide pour saisir manuellement.
              </div>
            </div>
          )}

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            💡 Cliquez sur un nom ou tarif pour modifier. Tarif en <strong>gras</strong> = saisi, en <span className="text-slate-400">gris</span> = vide. Tu peux laisser vide et saisir le HT manuellement à chaque dossier — ou pré-remplir ici pour gagner du temps. Sur un dossier mixte (panneaux + PAC), les tarifs auto se cumulent.
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== SocietesManager : CRUD des sociétés du groupe ==========
// Permet d'ajouter / éditer / supprimer les sociétés émettrices (Yolico,
// Elsun, ou n'importe quelle autre marque). Chaque société = nom + emoji
// + couleur (+ signature email, phase 2).
function SocietesManager({ societes, setSocietes, dossiers }) {
  // Handler upload logo : lit l'image en data URL (max ~200KB conseillé).
  // On garde tout dans la row 'societes' du KV (pas de bucket séparé).
  const handleLogoUpload = async (societeId, file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      alert('❌ Choisis un fichier image (PNG, JPG, SVG, WebP).');
      return;
    }
    if (file.size > 500 * 1024) {
      alert(`❌ Logo trop lourd (${Math.round(file.size / 1024)} Ko). Max 500 Ko — réduis-le avec un outil en ligne (tinypng.com).`);
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result;
        if (typeof dataUrl === 'string') {
          setSocietes(societes.map(s => s.id === societeId ? { ...s, logoUrl: dataUrl } : s));
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      alert('Erreur lecture image : ' + e.message);
    }
  };
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏢');
  const [newColor, setNewColor] = useState('violet');
  const COLORS = [
    { id: 'emerald', label: 'Vert',    cls: 'bg-emerald-500' },
    { id: 'blue',    label: 'Bleu',    cls: 'bg-blue-500' },
    { id: 'violet',  label: 'Violet',  cls: 'bg-violet-500' },
    { id: 'amber',   label: 'Orange',  cls: 'bg-amber-500' },
    { id: 'rose',    label: 'Rose',    cls: 'bg-rose-500' },
    { id: 'slate',   label: 'Gris',    cls: 'bg-slate-500' },
  ];
  const slugify = (str) => String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `soc_${Date.now().toString(36)}`;
  const addSociete = () => {
    const label = newLabel.trim();
    if (!label) { alert('Le nom est obligatoire'); return; }
    let id = slugify(label);
    if (societes.find(s => s.id === id)) id = `${id}_${Date.now().toString(36).slice(-4)}`;
    setSocietes([...societes, { id, label, emoji: newEmoji || '🏢', color: newColor, signature: '' }]);
    setNewLabel(''); setNewEmoji('🏢'); setNewColor('violet'); setShowAdd(false);
  };
  const updateSociete = (id, patch) => {
    setSocietes(societes.map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const deleteSociete = (id) => {
    const label = societes.find(s => s.id === id)?.label || id;
    const used = (dossiers || []).filter(d => d.societe === id).length;
    const msg = used > 0
      ? `⚠️ "${label}" est utilisée par ${used} dossier(s). Supprimer ? Les dossiers concernés perdront leur badge société.`
      : `Supprimer "${label}" ?`;
    if (!window.confirm(msg)) return;
    setSocietes(societes.filter(s => s.id !== id));
  };
  return (
    <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
        <h2 className="text-lg font-bold text-slate-800">🏢 Sociétés du groupe</h2>
        <p className="text-xs text-slate-500 mt-1">Configure les marques sur lesquelles tu travailles (Yolico, Elsun, etc.). Chaque dossier appartient à une société — badge coloré + filtre dans la liste.</p>
      </div>
      <div className="p-4 space-y-2">
        {societes.length === 0 ? (
          <div className="text-center py-8 text-slate-400 italic">Aucune société. Ajoute la première ci-dessous.</div>
        ) : (
          <div className="space-y-3">
            {societes.map(s => {
              const used = (dossiers || []).filter(d => d.societe === s.id).length;
              return (
                <div key={s.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  {/* Ligne 1 : Logo + nom + actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Zone logo : preview + upload + remove */}
                    <div className="flex items-center gap-1">
                      <label className="w-20 h-12 bg-white border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-violet-400 overflow-hidden" title="Cliquer pour uploader un logo">
                        {s.logoUrl ? (
                          <img src={s.logoUrl} alt={s.label} className="max-h-full max-w-full object-contain" />
                        ) : (
                          <span className="text-2xl">{s.emoji || '🏢'}</span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUpload(s.id, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {s.logoUrl && (
                        <button
                          onClick={() => updateSociete(s.id, { logoUrl: '' })}
                          className="p-1 text-rose-500 hover:bg-rose-100 rounded"
                          title="Retirer le logo (retombe sur l'emoji)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      defaultValue={s.label}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) updateSociete(s.id, { label: v }); }}
                      className="flex-1 min-w-[150px] px-3 py-2 bg-white border border-slate-300 rounded text-sm font-bold"
                      placeholder="Nom de la société"
                    />
                    <span className="text-[10px] text-slate-500">{used} dossier{used > 1 ? 's' : ''}</span>
                    <button onClick={() => deleteSociete(s.id)} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded" title="Supprimer cette société">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Ligne 2 : Emoji fallback + couleur (si pas de logo uploadé) */}
                  {!s.logoUrl && (
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
                      <span className="font-semibold uppercase">Sans logo →</span>
                      <input
                        type="text"
                        defaultValue={s.emoji}
                        onBlur={(e) => { const v = e.target.value.trim() || '🏢'; if (v !== s.emoji) updateSociete(s.id, { emoji: v }); }}
                        maxLength={16}
                        className="w-12 px-1 py-1 bg-white border border-slate-300 rounded text-center text-base"
                        title="Emoji utilisé si aucun logo"
                      />
                      <span>+</span>
                      <div className="flex gap-1">
                        {COLORS.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => updateSociete(s.id, { color: c.id })}
                            className={`w-6 h-6 rounded-full border-2 ${c.cls} ${s.color === c.id ? 'border-slate-800 ring-2 ring-offset-1 ring-slate-400' : 'border-white opacity-60 hover:opacity-100'}`}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Preview badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Aperçu :</span>
                    <SocieteBadge societe={s} variant="inline" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} className="w-full mt-3 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter une société
          </button>
        ) : (
          <div className="mt-3 p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl space-y-2">
            <h3 className="text-sm font-bold text-emerald-800">➕ Nouvelle société</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Emoji</label>
                <input type="text" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} maxLength={16} placeholder="🏢" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-center text-lg" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Nom *</label>
                <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSociete(); }} placeholder="Ex : Yolico, Elsun, Solar Pro…" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold" autoFocus />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Couleur du badge</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c.id} type="button" onClick={() => setNewColor(c.id)} className={`w-8 h-8 rounded-full border-2 ${c.cls} ${newColor === c.id ? 'border-slate-800 ring-2 ring-offset-1 ring-slate-400' : 'border-white opacity-60 hover:opacity-100'}`} title={c.label} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAdd(false); setNewLabel(''); }} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold">Annuler</button>
              <button onClick={addSociete} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold">✓ Créer</button>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
          💡 Les dossiers existants sans société assignée restent visibles dans tous les filtres. Pour leur assigner une société : ouvre le dossier et clique le bouton 🏢 en haut du formulaire.
        </div>
      </div>
    </div>
  );
}

function UsersManager({ users, setUsers, dossiers, poseursList = [], regiesList = [], onCountChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState(''); // = nom (display_name)
  const [newPrenom, setNewPrenom] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmoji, setNewEmoji] = useState('👤');
  const [newRole, setNewRole] = useState('commercial');
  const [newLinkedTo, setNewLinkedTo] = useState(''); // poseur/régie rattaché
  const [newTel, setNewTel] = useState(''); // 📞 tél (WhatsApp/SMS) — surtout pour les poseurs/régies
  const [expandedUserId, setExpandedUserId] = useState(null); // ID du compte en cours d'édition
  // Buffer d'édition local par compte — évite le save auto au blur (qui
  // déclenchait un refresh visible). On save tout d'un coup au clic 💾.
  // Structure : { [userId]: { prenom, displayName, email, tel, emoji } }
  const [editBuffer, setEditBuffer] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);

  // Ouvre une ligne en édition : init le buffer avec les valeurs actuelles.
  const openEdit = (u) => {
    const m = u.user_metadata || {};
    setEditBuffer(prev => ({
      ...prev,
      [u.id]: {
        prenom: m.prenom || '',
        displayName: m.display_name || u.email?.split('@')[0] || '',
        email: u.email || '',
        tel: m.tel || '',
        emoji: m.emoji || '👤',
      },
    }));
    setExpandedUserId(u.id);
  };

  // Sauve toutes les modifs en attente puis ferme la ligne.
  const saveEdit = async (u) => {
    const buf = editBuffer[u.id];
    if (!buf) { setExpandedUserId(null); return; }
    const m = u.user_metadata || {};
    const origin = {
      prenom: m.prenom || '',
      displayName: m.display_name || u.email?.split('@')[0] || '',
      email: u.email || '',
      tel: m.tel || '',
      emoji: m.emoji || '👤',
    };
    const metaPatch = {};
    if (buf.prenom.trim() !== origin.prenom) metaPatch.prenom = buf.prenom.trim();
    if (buf.displayName.trim() && buf.displayName.trim() !== origin.displayName) metaPatch.display_name = buf.displayName.trim();
    if (buf.tel.trim() !== origin.tel) metaPatch.tel = buf.tel.trim();
    if (buf.emoji.trim() && buf.emoji.trim() !== origin.emoji) metaPatch.emoji = buf.emoji.trim();
    const emailChanged = buf.email.trim() && buf.email.trim() !== origin.email;
    if (Object.keys(metaPatch).length === 0 && !emailChanged) {
      // Rien à sauver
      setExpandedUserId(null);
      return;
    }
    setSavingUserId(u.id);
    try {
      if (Object.keys(metaPatch).length > 0) {
        await updateSupabaseUserMeta(u, metaPatch);
      }
      if (emailChanged) {
        await updateSupabaseUserEmail(u, buf.email.trim());
      }
      setExpandedUserId(null);
      setEditBuffer(prev => { const n = { ...prev }; delete n[u.id]; return n; });
    } finally {
      setSavingUserId(null);
    }
  };

  // Annule sans sauver
  const cancelEdit = (u) => {
    setExpandedUserId(null);
    setEditBuffer(prev => { const n = { ...prev }; delete n[u.id]; return n; });
  };

  // Met à jour un champ du buffer pour le user en cours d'édition.
  const setBufferField = (userId, field, value) => {
    setEditBuffer(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
  };
  const [supabaseUsers, setSupabaseUsers] = useState([]);
  const [loadingSupabase, setLoadingSupabase] = useState(false);
  const [supabaseError, setSupabaseError] = useState('');
  const [supabaseSuccess, setSupabaseSuccess] = useState('');
  const [bootstrapMode, setBootstrapMode] = useState(false);

  // Picker emoji — large sélection groupée. On peut aussi taper/coller
  // n'importe quel emoji dans le champ (Win + . sur Windows, Ctrl+Cmd+Espace sur Mac).
  const COMMON_EMOJIS = [
    // Personnes
    '👤', '👨', '👩', '🧑', '👦', '👧', '👴', '👵', '🧒',
    // Rôles & métiers
    '👑', '💼', '🔧', '🛠️', '🤝', '💰', '🏦', '👷', '👨‍💼', '👩‍💼', '👨‍💻', '👩‍💻', '🧑‍🔧', '🏗️',
    // Émotions / styles
    '😀', '😎', '🥳', '🤩', '🙂', '😊', '🤓', '🧐', '😇', '🤠',
    // Symboles métier
    '⭐', '🔥', '⚡', '💡', '✨', '🌟', '💎', '🎯', '🚀', '💪', '🦾',
    // Solaire / outils
    '☀️', '🔆', '⚙️', '🔩', '🪛', '🪚',
    // Fun
    '💩', '🪵', '🖕',
  ];

  const ROLES = [
    { id: 'admin', label: '👑 Admin', desc: 'Accès complet, voit tout, fait tout', color: 'bg-violet-100 text-violet-700 border-violet-300' },
    { id: 'commercial', label: '💼 Commercial', desc: 'Voit tous les dossiers, sans les marges ni les coûts', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    { id: 'envoi_finance', label: '🏦 Envoi finance', desc: 'Gère l\'envoi des dossiers aux banques, sans compta ni tableau de bord', color: 'bg-rose-100 text-rose-700 border-rose-300' },
    { id: 'poseur', label: '🔧 Poseur', desc: 'Voit uniquement ses chantiers + récap paiements, lecture seule', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { id: 'regie', label: '🤝 Régie', desc: 'Voit uniquement ses dossiers + récap paiements, lecture seule', color: 'bg-purple-100 text-purple-700 border-purple-300' },
    { id: 'compta', label: '💰 Compta', desc: 'Gère les paiements et factures', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { id: 'administratif', label: '🏛️ Administratif', desc: 'Démarches mairie, raccordement, Consuel, récup. TVA — ne voit que ces alertes', color: 'bg-sky-100 text-sky-700 border-sky-300' },
  ];

  // La gestion des comptes passe par /api/users (fonction serverless Vercel).
  // La clé service_role reste côté serveur — jamais exposée au navigateur.
  const supabaseAdminEnabled = true;

  // Helper : appelle /api/users avec le JWT de la session courante.
  const callUsersApi = async (method, { body, query } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    const res = await fetch(`/api/users${qs}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erreur ${res.status}`);
    }
    return data;
  };

  // Récupère la liste des utilisateurs Supabase + sync le state local users
  // (qui sert au reste du CRM, notamment pour récupérer tél/email d'un poseur
  // ou d'une régie à partir de leur compte rattaché).
  const fetchSupabaseUsers = async () => {
    setLoadingSupabase(true);
    setSupabaseError('');
    try {
      const data = await callUsersApi('GET');
      const list = data.users || [];
      setSupabaseUsers(list);
      setBootstrapMode(!!data.bootstrap);
      if (onCountChange) onCountChange(list.length);
      // Sync local users : rebuild depuis Supabase pour que linkedTo/tel/email
      // soient à jour partout (le CRM utilise users[].linkedTo pour résoudre
      // les contacts tél/email des prestataires).
      const enriched = list.map(u => {
        const m = u.user_metadata || {};
        return {
          name: m.display_name || u.email?.split('@')[0] || '(sans nom)',
          prenom: m.prenom || '',
          emoji: m.emoji || '👤',
          role: m.role || 'commercial',
          email: u.email || '',
          linkedTo: m.linkedTo || '',
          tel: m.tel || '',
        };
      });
      // Préserve les users locaux qui n'ont pas de compte Supabase (ex : '(anonyme)')
      const localOnly = (users || []).filter(u => !enriched.find(e => e.name.toLowerCase() === (u.name || '').toLowerCase()));
      setUsers([...enriched, ...localOnly]);
    } catch (e) {
      setSupabaseError(`Erreur lors du chargement : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Promeut l'utilisateur connecté en admin (utilisable uniquement tant qu'aucun
  // admin n'existe — mode bootstrap côté serveur).
  const bootstrapSelfAdmin = async () => {
    if (!window.confirm("Te promouvoir admin du CRM ?\n\nÇa n'est possible que tant qu'aucun admin n'existe. Une fois fait, tu pourras créer les autres comptes.")) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      await callUsersApi('POST', { body: { bootstrap_self: true } });
      setSupabaseSuccess('✅ Tu es maintenant admin. Reconnexion automatique…');
      // Rafraîchit la session pour récupérer les nouvelles user_metadata,
      // puis recharge la page pour que tout le CRM voie le bon rôle.
      try { await supabase.auth.refreshSession(); } catch (_) {}
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
      setLoadingSupabase(false);
    }
  };

  useEffect(() => {
    fetchSupabaseUsers();
  }, []);

  // Crée un nouveau compte Supabase
  const createSupabaseUser = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      setSupabaseError('Email et mot de passe sont obligatoires');
      return;
    }
    if (newPassword.length < 6) {
      setSupabaseError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if ((newRole === 'poseur' || newRole === 'regie') && !newLinkedTo) {
      setSupabaseError(`Sélectionne le ${newRole === 'poseur' ? 'poseur' : 'la régie'} auquel ce compte est rattaché.`);
      return;
    }
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      const displayName = newName.trim() || newEmail.split('@')[0];
      const meta = {
        email: newEmail.trim(),
        password: newPassword,
        display_name: displayName,
        emoji: newEmoji.trim() || '👤',
        role: newRole,
      };
      if (newPrenom.trim()) meta.prenom = newPrenom.trim();
      if (newRole === 'poseur' || newRole === 'regie') meta.linkedTo = newLinkedTo;
      if (newTel.trim()) meta.tel = newTel.trim();
      const data = await callUsersApi('POST', { body: meta });
      const bootstrapMsg = data.bootstrapped ? ' (1er compte → admin auto)' : '';
      setSupabaseSuccess(`✅ Compte créé pour ${newEmail.trim()}${bootstrapMsg} ! Mot de passe : ${newPassword}`);
      // Ajoute aussi dans la liste locale des users (pour les rôles dans le CRM)
      if (!users.find(u => u.name.toLowerCase() === displayName.toLowerCase())) {
        setUsers([...users, { name: displayName, emoji: newEmoji.trim() || '👤', role: data.bootstrapped ? 'admin' : newRole, email: newEmail.trim() }]);
      }
      setNewName(''); setNewPrenom(''); setNewEmail(''); setNewPassword(''); setNewEmoji('👤'); setNewRole('commercial'); setNewLinkedTo(''); setNewTel('');
      setShowAdd(false);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Supprime un compte Supabase
  const deleteSupabaseUser = async (userId, email) => {
    if (!window.confirm(`⚠️ Supprimer définitivement le compte ${email} ?\n\nCette action est irréversible. L'utilisateur ne pourra plus se connecter.`)) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      await callUsersApi('DELETE', { query: { user_id: userId } });
      setSupabaseSuccess(`✅ Compte ${email} supprimé`);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Réinitialise le mot de passe
  const resetPasswordSupabaseUser = async (userId, email) => {
    const newPwd = window.prompt(`Nouveau mot de passe pour ${email} ?\n(minimum 6 caractères)`);
    if (!newPwd || newPwd.length < 6) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      await callUsersApi('PATCH', { body: { user_id: userId, password: newPwd } });
      setSupabaseSuccess(`✅ Mot de passe de ${email} mis à jour : ${newPwd}`);
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Change le rôle d'un compte Supabase (préserve display_name + emoji).
  // Si on quitte poseur/regie, on retire le rattachement devenu inutile.
  const updateSupabaseUserRole = async (user, newRole) => {
    if (newRole === (user.user_metadata?.role || '')) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      const existingMeta = user.user_metadata || {};
      const nextMeta = { ...existingMeta, role: newRole };
      if (newRole !== 'poseur' && newRole !== 'regie') delete nextMeta.linkedTo;
      await callUsersApi('PATCH', {
        body: { user_id: user.id, user_metadata: nextMeta },
      });
      const label = (ROLES.find(r => r.id === newRole) || {}).label || newRole;
      setSupabaseSuccess(`✅ Rôle de ${user.email} → ${label}`);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Change l'entité rattachée (poseur/régie) d'un compte Supabase.
  const updateSupabaseUserLinkedTo = async (user, linkedTo) => {
    if (linkedTo === (user.user_metadata?.linkedTo || '')) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      const existingMeta = user.user_metadata || {};
      await callUsersApi('PATCH', {
        body: { user_id: user.id, user_metadata: { ...existingMeta, linkedTo } },
      });
      setSupabaseSuccess(`✅ ${user.email} rattaché à ${linkedTo || '(aucun)'}`);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Change l'email (= login) d'un compte Supabase.
  const updateSupabaseUserEmail = async (user, newEmailRaw) => {
    const newE = (newEmailRaw || '').trim();
    if (!newE || newE === user.email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newE)) { alert('Email invalide'); return; }
    if (!window.confirm(`⚠️ Changer l'email de connexion de ${user.email} → ${newE} ?\n\nL'utilisateur devra utiliser ce nouvel email pour se connecter.`)) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      await callUsersApi('PATCH', { body: { user_id: user.id, email: newE } });
      setSupabaseSuccess(`✅ Email mis à jour : ${user.email} → ${newE}`);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
    }
    setLoadingSupabase(false);
  };

  // Met à jour le nom affiché et/ou l'emoji d'un compte Supabase.
  const updateSupabaseUserMeta = async (user, patch) => {
    const existingMeta = user.user_metadata || {};
    const next = { ...existingMeta, ...patch };
    // Pas de changement réel → on ne fait rien
    if (Object.keys(patch).every(k => (existingMeta[k] || '') === (patch[k] || ''))) return;
    setLoadingSupabase(true);
    setSupabaseError('');
    setSupabaseSuccess('');
    try {
      await callUsersApi('PATCH', {
        body: { user_id: user.id, user_metadata: next },
      });
      setSupabaseSuccess(`✅ Compte ${user.email} mis à jour`);
      await fetchSupabaseUsers();
    } catch (e) {
      setSupabaseError(`Erreur : ${e.message}`);
      console.error(e);
    }
    setLoadingSupabase(false);
  };

  // Génère un mot de passe simple aléatoire
  const generatePassword = () => {
    const adjectifs = ['Soleil', 'Vert', 'Solaire', 'Brillant', 'Energie'];
    const num = Math.floor(Math.random() * 9000) + 1000;
    const adj = adjectifs[Math.floor(Math.random() * adjectifs.length)];
    setNewPassword(`${adj}${num}!`);
  };


  return (
    <div className="space-y-4">
      {/* Section principale : Comptes de connexion Supabase */}
      <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <h2 className="text-lg font-bold text-slate-800">🔐 Comptes de connexion au CRM</h2>
          <p className="text-xs text-slate-500 mt-1">Crée ici les comptes pour ton équipe. Chaque personne se connectera au CRM avec son email et son mot de passe.</p>
        </div>
        <div className="p-4">
          <>
              {bootstrapMode && (
                <div className="mb-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-sm">
                  <div className="font-bold text-amber-800 mb-1">⚠️ Aucun admin défini pour l'instant</div>
                  <p className="text-amber-700 mb-3">
                    Tant qu'aucun compte n'a le rôle admin, personne ne peut créer / supprimer / réinitialiser de comptes.
                    Tu es actuellement connectée — clique ci-dessous pour te promouvoir admin.
                  </p>
                  <button
                    onClick={bootstrapSelfAdmin}
                    disabled={loadingSupabase}
                    className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 shadow-md"
                  >
                    {loadingSupabase ? '⏳ Promotion…' : '👑 Je suis l\'admin'}
                  </button>
                </div>
              )}
              {supabaseError && (
                <div className="mb-3 p-3 bg-rose-50 border border-rose-300 rounded-xl text-sm text-rose-700">
                  {supabaseError}
                </div>
              )}
              {supabaseSuccess && (
                <div className="mb-3 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-sm text-emerald-700">
                  {supabaseSuccess}
                  <button onClick={() => setSupabaseSuccess('')} className="ml-2 text-xs underline">Fermer</button>
                </div>
              )}

              {/* Bouton Ajouter */}
              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-semibold text-slate-600">
                  📋 {supabaseUsers.length} compte{supabaseUsers.length > 1 ? 's' : ''} de connexion
                </div>
                {!showAdd && (
                  <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-md">
                    <Plus className="w-3 h-3" />Ajouter un membre
                  </button>
                )}
              </div>

              {/* Formulaire d'ajout */}
              {showAdd && (
                <div className="mb-4 p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl">
                  <h3 className="text-sm font-bold text-emerald-800 mb-3">➕ Nouveau membre</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Prénom</label>
                      <input type="text" value={newPrenom} onChange={(e) => setNewPrenom(e.target.value)} placeholder="Marie" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Nom</label>
                      <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dupont" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Emoji</label>
                      <input type="text" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="👤" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-center" maxLength={16} />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {COMMON_EMOJIS.map(em => (
                          <button key={em} type="button" onClick={() => setNewEmoji(em)} className={`w-7 h-7 text-base rounded hover:bg-violet-100 ${newEmoji === em ? 'bg-violet-200 ring-2 ring-violet-400' : 'bg-slate-50'}`}>{em}</button>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Email *</label>
                      <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="marie.dupont@email.com" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Mot de passe * (min 6 caractères)</label>
                      <div className="flex gap-2">
                        <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Solaire2026!" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono" />
                        <button onClick={generatePassword} className="px-3 py-2 bg-violet-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap">🎲 Générer</button>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Rôle</label>
                      <select value={newRole} onChange={(e) => { setNewRole(e.target.value); setNewLinkedTo(''); }} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold">
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>)}
                      </select>
                    </div>
                    {(newRole === 'poseur' || newRole === 'regie') && (
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">
                          Rattaché à {newRole === 'poseur' ? 'quel poseur' : 'quelle régie'} * <span className="text-slate-400 normal-case font-normal">— ce compte ne verra que ces dossiers</span>
                        </label>
                        <select value={newLinkedTo} onChange={(e) => setNewLinkedTo(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold">
                          <option value="">— Choisir {newRole === 'poseur' ? 'le poseur' : 'la régie'} —</option>
                          {(newRole === 'poseur' ? poseursList : regiesList).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">
                        📞 Téléphone (WhatsApp/SMS) <span className="text-slate-400 normal-case font-normal">— optionnel mais recommandé pour les poseurs/régies (relances facture)</span>
                      </label>
                      <input type="tel" value={newTel} onChange={(e) => setNewTel(e.target.value)} placeholder="0612345678" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 justify-end">
                    <button onClick={() => { setShowAdd(false); setNewEmail(''); setNewPassword(''); setNewName(''); setSupabaseError(''); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">Annuler</button>
                    <button onClick={createSupabaseUser} disabled={loadingSupabase} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {loadingSupabase ? '⏳ Création...' : '✅ Créer le compte'}
                    </button>
                  </div>
                </div>
              )}

              {/* Liste des comptes Supabase */}
              {loadingSupabase && !showAdd ? (
                <div className="text-center py-6 text-slate-400 text-sm">⏳ Chargement...</div>
              ) : supabaseUsers.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <div className="text-5xl mb-3">🔐</div>
                  <p className="text-sm font-semibold">Aucun compte de connexion créé</p>
                  <p className="text-xs mt-1">Clique sur <strong>"Ajouter un membre"</strong> pour créer le premier compte.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {supabaseUsers.map(u => {
                    const meta = u.user_metadata || {};
                    const displayName = meta.display_name || u.email?.split('@')[0] || 'Sans nom';
                    const prenom = meta.prenom || '';
                    const fullName = prenom ? `${prenom} ${displayName}`.trim() : displayName;
                    const emoji = meta.emoji || '👤';
                    const role = meta.role || 'commercial';
                    const roleInfo = ROLES.find(r => r.id === role) || ROLES[1];
                    const tel = meta.tel || '';
                    const linkedTo = meta.linkedTo || '';
                    const isExpanded = expandedUserId === u.id;
                    const fieldCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
                    const labelCls = "block text-[10px] font-bold text-slate-500 uppercase mb-1";

                    if (!isExpanded) {
                      // === LIGNE COMPACTE : clic = expand ===
                      return (
                        <div
                          key={u.id}
                          onClick={() => openEdit(u)}
                          className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-violet-300 cursor-pointer px-3 py-2 flex items-center gap-3"
                          title="Cliquer pour éditer"
                        >
                          <span className="text-xl flex-shrink-0">{emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">{fullName}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {u.email}{tel ? ` · 📞 ${tel}` : ''}
                            </div>
                          </div>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleInfo.color}`}>{roleInfo.label}</span>
                          {/* Le rattachement poseur/régie ne concerne QUE ces 2 rôles.
                              Une donnée linkedTo qui traîne sur un admin/autre rôle
                              ne doit pas s'afficher (lien sans aucun sens). */}
                          {(role === 'poseur' || role === 'regie') && linkedTo && <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">🔗 {linkedTo}</span>}
                          {(role === 'poseur' || role === 'regie') && !linkedTo && (
                            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">⚠️ Non rattaché</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                            className="flex-shrink-0 px-2 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded text-[11px] font-bold"
                            title="Éditer"
                          >
                            ✏️ Éditer
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSupabaseUser(u.id, u.email); }}
                            className="flex-shrink-0 p-1.5 text-rose-500 hover:bg-rose-100 rounded"
                            title="Supprimer le compte"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    }

                    // === LIGNE EXPANDED : éditeur complet avec save manuel ===
                    const buf = editBuffer[u.id] || { prenom, displayName, email: u.email || '', tel, emoji };
                    const dirty = (
                      buf.prenom.trim() !== prenom ||
                      buf.displayName.trim() !== displayName ||
                      buf.email.trim() !== (u.email || '') ||
                      buf.tel.trim() !== tel ||
                      buf.emoji.trim() !== emoji
                    );
                    const saving = savingUserId === u.id;
                    return (
                      <div key={u.id} className="rounded-xl border-2 border-violet-300 bg-violet-50/30 p-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-bold text-violet-700">✏️ Édition du compte</div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => cancelEdit(u)}
                              disabled={saving}
                              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold disabled:opacity-50"
                            >
                              ✕ Annuler
                            </button>
                            <button
                              onClick={() => saveEdit(u)}
                              disabled={saving || !dirty}
                              className={`px-4 py-1.5 rounded text-xs font-bold text-white ${dirty && !saving ? 'bg-violet-600 hover:bg-violet-700' : 'bg-slate-300 cursor-not-allowed'}`}
                            >
                              {saving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                            </button>
                          </div>
                        </div>
                        {/* Ligne emoji + prénom + nom */}
                        <div className="grid grid-cols-12 gap-2 mb-2">
                          <div className="col-span-2">
                            <label className={labelCls}>Emoji</label>
                            <input
                              type="text"
                              value={buf.emoji}
                              onChange={(e) => setBufferField(u.id, 'emoji', e.target.value)}
                              maxLength={16}
                              disabled={saving}
                              className="w-full px-1 py-1.5 bg-white border border-slate-300 rounded text-center text-xl"
                              title="Tape, colle un emoji, ou choisis dans le picker ci-dessous"
                            />
                            <div className="flex flex-wrap gap-0.5 mt-1 max-h-32 overflow-y-auto">
                              {COMMON_EMOJIS.map(em => (
                                <button key={em} type="button" onClick={() => setBufferField(u.id, 'emoji', em)} className={`w-6 h-6 text-sm rounded hover:bg-violet-100 ${buf.emoji === em ? 'bg-violet-200 ring-1 ring-violet-400' : 'bg-slate-50'}`} title={`Choisir ${em}`}>{em}</button>
                              ))}
                            </div>
                          </div>
                          <div className="col-span-5">
                            <label className={labelCls}>Prénom</label>
                            <input
                              type="text"
                              value={buf.prenom}
                              onChange={(e) => setBufferField(u.id, 'prenom', e.target.value)}
                              disabled={saving}
                              className={fieldCls}
                              placeholder="Marie"
                            />
                          </div>
                          <div className="col-span-5">
                            <label className={labelCls}>Nom</label>
                            <input
                              type="text"
                              value={buf.displayName}
                              onChange={(e) => setBufferField(u.id, 'displayName', e.target.value)}
                              disabled={saving}
                              className={fieldCls + ' font-bold'}
                              placeholder="Dupont"
                            />
                          </div>
                        </div>
                        {/* Ligne email + tél */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className={labelCls}>✉️ Email (login)</label>
                            <input
                              type="email"
                              value={buf.email}
                              onChange={(e) => setBufferField(u.id, 'email', e.target.value)}
                              disabled={saving}
                              className={fieldCls}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>📞 Téléphone (WhatsApp/SMS)</label>
                            <input
                              type="tel"
                              value={buf.tel}
                              onChange={(e) => setBufferField(u.id, 'tel', e.target.value)}
                              disabled={saving}
                              className={fieldCls}
                              placeholder="0612345678"
                            />
                          </div>
                        </div>
                        {/* Ligne rôle + linkedTo — save auto (selects = clic délibéré) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className={labelCls}>🎭 Rôle <span className="text-slate-400 normal-case font-normal">(save auto)</span></label>
                            <select
                              value={role}
                              onChange={(e) => updateSupabaseUserRole(u, e.target.value)}
                              disabled={loadingSupabase}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-sm font-bold border-2 cursor-pointer ${roleInfo.color}`}
                            >
                              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                          </div>
                          {(role === 'poseur' || role === 'regie') && (
                            <div>
                              <label className={labelCls}>🔗 Rattaché à {role === 'poseur' ? 'ce poseur' : 'cette régie'} <span className="text-slate-400 normal-case font-normal">(save auto)</span></label>
                              <select
                                value={linkedTo}
                                onChange={(e) => updateSupabaseUserLinkedTo(u, e.target.value)}
                                disabled={loadingSupabase}
                                className={`w-full px-2.5 py-1.5 rounded-lg text-sm font-bold border-2 cursor-pointer ${linkedTo ? 'bg-white border-slate-300 text-slate-700' : 'bg-rose-50 border-rose-300 text-rose-700'}`}
                              >
                                <option value="">⚠️ Choisir</option>
                                {(role === 'poseur' ? poseursList : regiesList).map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-violet-200">
                          <div className="text-[11px] text-slate-500">{u.last_sign_in_at ? `🕐 Dernière connexion : ${new Date(u.last_sign_in_at).toLocaleDateString('fr-FR')}` : '🆕 Jamais connecté'}</div>
                          <div className="flex gap-2">
                            <button onClick={() => resetPasswordSupabaseUser(u.id, u.email)} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-semibold">🔑 Reset mdp</button>
                            <button onClick={() => deleteSupabaseUser(u.id, u.email)} className="px-3 py-1.5 bg-rose-100 hover:bg-rose-500 hover:text-white text-rose-700 rounded text-xs font-semibold flex items-center gap-1">
                              <Trash2 className="w-3 h-3" /> Supprimer
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 leading-relaxed">
                💡 Une fois un compte créé, envoie à ton équipier l'URL du CRM (<strong>{typeof window !== 'undefined' ? window.location.origin : 'crm-solaire.vercel.app'}</strong>), son <strong>email</strong> et son <strong>mot de passe</strong>. Il pourra se connecter depuis n'importe quel appareil.
              </div>
            </>
        </div>
      </div>
    </div>
  );
}

function ProduitsManager({ produits, setProduits, dossiers }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🔧');

  const slugify = (str) => str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    let id = slugify(label) || `PRODUIT_${Date.now()}`;
    if (produits.find(p => p.id === id)) {
      id = `${id}_${Date.now().toString(36).slice(-4)}`;
    }
    setProduits([...produits, { id, label, emoji: newEmoji.trim() || '🔧', autoTarif: false }]);
    setNewLabel(''); setNewEmoji('🔧'); setShowAdd(false);
  };

  const updateProduit = (id, updates) => {
    setProduits(produits.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const del = (p) => {
    if (p.autoTarif) {
      alert('Le produit "Panneaux solaires" ne peut pas être supprimé : il sert pour les tarifs auto par Wc.');
      return;
    }
    const used = dossiers.filter(d => (d.produits || []).some(pp => pp.type === p.id) || d.produit === p.id).length;
    const msg = used > 0 ? `⚠️ "${p.label}" utilisé dans ${used} dossier(s). Supprimer quand même ?` : `Supprimer "${p.label}" ?`;
    if (!window.confirm(msg)) return;
    setProduits(produits.filter(prod => prod.id !== p.id));
  };

  return (
    <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-yellow-50">
        <h2 className="text-lg font-bold text-slate-800">🛒 Produits que tu vends</h2>
        <p className="text-xs text-slate-500 mt-1">Personnalise la liste — ajoute, renomme ou supprime tes produits. ☀️ Panneaux solaires reste là, c'est lui qui utilise les tarifs auto par Wc.</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold text-slate-600">📋 {produits.length} produit{produits.length > 1 ? 's' : ''}</div>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Plus className="w-3 h-3" />Ajouter un produit
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="text" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))} placeholder="🔧" className="w-14 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center" maxLength={4} />
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setShowAdd(false); setNewLabel(''); } }} placeholder="Nom du produit" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" autoFocus />
              <button onClick={add} className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-semibold">OK</button>
              <button onClick={() => { setShowAdd(false); setNewLabel(''); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">Annuler</button>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          {produits.map(p => {
            const used = dossiers.filter(d => (d.produits || []).some(pp => pp.type === p.id) || d.produit === p.id).length;
            return (
              <div key={p.id} className={`rounded-xl border p-2.5 flex items-center gap-2 flex-wrap ${p.autoTarif ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                <input type="text" value={p.emoji} onChange={(e) => updateProduit(p.id, { emoji: e.target.value.slice(0, 4) })} className="w-12 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-center text-base" maxLength={4} />
                <input type="text" value={p.label} onChange={(e) => updateProduit(p.id, { label: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} className="flex-1 min-w-[150px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold" />
                {p.autoTarif && (
                  <span className="text-[10px] font-bold px-2 py-1 bg-amber-200 text-amber-800 rounded-full">⚡ Tarifs auto par Wc</span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${used > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'}`}>{used} dossier{used > 1 ? 's' : ''}</span>
                <button onClick={() => del(p)} disabled={p.autoTarif} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed" title={p.autoTarif ? 'Produit système, non supprimable' : 'Supprimer'}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 leading-relaxed">
          💡 Quand tu crées un dossier, tu pourras choisir un ou <strong>plusieurs produits</strong> — utile pour les clients qui prennent panneaux + pompe à chaleur, ou panneaux + batterie, etc.
        </div>
      </div>
    </div>
  );
}

function FournisseursManager({ data, setData, dossiers, tarifs, setTarifs }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const add = () => {
    const nom = newName.trim().toUpperCase();
    if (!nom) return;
    if (data.includes(nom)) { alert(`"${nom}" existe déjà`); return; }
    setData([...data, nom]); setNewName(''); setShowAdd(false);
  };
  const rename = (oldN, newN) => {
    const c = newN.trim().toUpperCase();
    if (!c || c === oldN) return;
    if (data.includes(c)) { alert(`"${c}" existe déjà`); return; }
    setData(data.map(f => f === oldN ? c : f));
    // Renomme aussi la clé du tarif si elle existe
    if (setTarifs && tarifs && tarifs[oldN] !== undefined) {
      const next = { ...tarifs };
      next[c] = next[oldN];
      delete next[oldN];
      setTarifs(next);
    }
  };
  const del = (nom) => {
    const used = dossiers.filter(d => (d.fournisseursDetail || []).some(f => f.nom === nom)).length;
    const msg = used > 0 ? `⚠️ "${nom}" utilisé dans ${used} dossier(s). Supprimer ?` : `Supprimer "${nom}" ?`;
    if (!window.confirm(msg)) return;
    setData(data.filter(f => f !== nom));
    if (setTarifs && tarifs && tarifs[nom] !== undefined) {
      const next = { ...tarifs }; delete next[nom]; setTarifs(next);
    }
  };
  const setTarif = (nom, val) => {
    if (!setTarifs) return;
    const num = parseFloat(val);
    const next = { ...(tarifs || {}) };
    if (isNaN(num) || num <= 0) { delete next[nom]; }
    else { next[nom] = num; }
    setTarifs(next);
  };

  return (
    <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50">
        <h2 className="text-lg font-bold text-slate-800">📦 Fournisseurs (matériel)</h2>
        <p className="text-xs text-slate-500 mt-1">Tarif au Wc (€) — multiplié par la puissance solaire du dossier pour calculer le HT automatiquement.</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold text-slate-600">📋 {data.length} fournisseur{data.length > 1 ? 's' : ''}</div>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="text-xs font-semibold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Plus className="w-3 h-3" />Ajouter
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); } }} placeholder="Nom du fournisseur" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" autoFocus />
              <button onClick={add} className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-semibold">OK</button>
              <button onClick={() => { setShowAdd(false); setNewName(''); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">Annuler</button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {data.map(nom => {
            const used = dossiers.filter(d => (d.fournisseursDetail || []).some(f => f.nom === nom)).length;
            const tarif = tarifs?.[nom];
            return (
              <div key={nom} className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input type="text" defaultValue={nom} onBlur={(e) => rename(nom, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} className="flex-1 px-2 py-1 bg-white border border-transparent hover:border-slate-300 focus:border-violet-400 focus:outline-none rounded text-sm font-semibold" />
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${used > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'}`} title={`${used} dossier(s) utilisent ce fournisseur`}>{used}</span>
                  <button onClick={() => del(nom)} className="p-1 text-rose-500 hover:bg-rose-100 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">💰 Tarif</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={tarif != null ? String(tarif) : ''}
                    onBlur={(e) => setTarif(nom, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    placeholder="0,00"
                    className="w-20 px-2 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-700 text-right"
                  />
                  <span className="text-[10px] text-slate-500">€ / Wc</span>
                  {tarif > 0 && (
                    <span className="text-[10px] text-slate-400 ml-auto">ex : 6000 Wc → {(tarif * 6000).toFixed(2)} €</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FormulaireDossier({ formData, setFormData, editingId, calculs, STATUTS_ORDERED, POSEURS, REGIES, FOURNISSEURS, tarifsPoseurs, tarifsRegies, tarifsInternes, nomsInternes, setNomsInternes, produits, societes = [], currentUser, onClose, onSubmit, isAdmin }) {
  const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm";

  // Sous-étapes du "Process du dossier" dépliables (comme dans la QuickView).
  // Par défaut tout est replié quand on ouvre un dossier existant ; tout étendu
  // pour une nouvelle saisie afin de guider le remplissage initial.
  const [foldedSteps, setFoldedSteps] = useState(() => ({
    cq: !!editingId, mairie: !!editingId, financement: !!editingId,
    pose: !!editingId, consuel: !!editingId, raccordement: !!editingId, paiement: !!editingId,
  }));
  const toggleStep = (k) => setFoldedSteps(prev => ({ ...prev, [k]: !prev[k] }));

  // Scan IA d'un bon de commande manuscrit → pré-remplissage du formulaire.
  const [scanState, setScanState] = useState({ status: 'idle', error: '', result: null });
  const scanBusy = scanState.status === 'compressing' || scanState.status === 'analyzing';
  // Scan d'un dossier complet (multi-pages → split par catégorie)
  const [dossierScanState, setDossierScanState] = useState({ status: 'idle', error: '', sections: null });
  const dossierScanBusy = ['uploading', 'classifying', 'splitting', 'fraud-check'].includes(dossierScanState.status);

  // 📄 Panneau "PDF scanné côte à côte" : permet de comparer le document
  // source scanné avec ce que l'IA a rempli dans le formulaire.
  const [scanPanel, setScanPanel] = useState({ open: false, loading: false, url: '', name: '', error: '' });

  // Localise le document source scanné à afficher : d'abord le scan en cours
  // (bon de commande ou dossier complet), sinon un PDF client déjà attaché.
  const scannedSource = useMemo(() => {
    const fd = formData || {};
    // PDF complet d'un scan "dossier complet" — prioritaire : on veut voir
    // TOUT le dossier (toutes les pages), pas seulement la 1re section.
    if (fd.scannedDossierPdf && fd.scannedDossierPdf.bucketPath) {
      return { storage: 'bucket', path: fd.scannedDossierPdf.bucketPath, name: fd.scannedDossierPdf.name || 'Dossier complet', type: 'application/pdf' };
    }
    const bon = fd.scannedBon;
    if (bon && bon.bucketPath) return { storage: 'bucket', path: bon.bucketPath, name: bon.name, type: bon.type };
    if (bon && bon.dataUrl) return { storage: 'inline', dataUrl: bon.dataUrl, name: bon.name, type: bon.type };
    const sec = Array.isArray(fd.scannedSections) ? fd.scannedSections.find(s => s && s.bucketPath) : null;
    if (sec) return { storage: 'bucket', path: sec.bucketPath, name: sec.name, type: sec.type };
    const docs = Array.isArray(fd.documents) ? fd.documents : [];
    // Dossier déjà enregistré : on privilégie le PDF complet d'origine
    // (marqué isScanSourcePdf), sinon le 1er PDF client.
    const scanDoc = docs.find(d => d && d.isScanSourcePdf)
      || docs.find(d => d && d.category === 'client'
        && (d.type === 'application/pdf' || /\.pdf$/i.test(d.name || '')));
    if (scanDoc) {
      return scanDoc.storage === 'bucket' && scanDoc.storagePath
        ? { storage: 'bucket', path: scanDoc.storagePath, name: scanDoc.name, type: scanDoc.type }
        : { storage: 'kv', docId: scanDoc.id, name: scanDoc.name, type: scanDoc.type };
    }
    return null;
  }, [formData]);

  // Convertit un dataURL base64 en blob URL (meilleur rendu PDF en iframe).
  const dataUrlToBlobUrl = (dataUrl, type) => {
    try {
      const parts = String(dataUrl).split(',');
      const bytes = atob(parts[1]);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: type || 'application/pdf' }));
    } catch (e) { return dataUrl; }
  };

  const toggleScanPanel = async () => {
    if (scanPanel.open) { setScanPanel(s => ({ ...s, open: false })); return; }
    const src = scannedSource;
    if (!src) {
      setScanPanel({ open: true, loading: false, url: '', name: '', error: 'Aucun document scanné rattaché à ce dossier.' });
      return;
    }
    setScanPanel({ open: true, loading: true, url: '', name: src.name || 'Document scanné', error: '' });
    try {
      let url = '';
      if (src.storage === 'bucket') {
        const { url: signed, error } = await getSignedUrl(src.path, 3600);
        if (error || !signed) throw new Error('URL introuvable');
        url = signed;
      } else if (src.storage === 'inline') {
        url = dataUrlToBlobUrl(src.dataUrl, src.type);
      } else if (src.storage === 'kv') {
        const r = await window.storage.get(`file:${src.docId}`);
        if (!r || !r.value) throw new Error('Fichier introuvable');
        url = dataUrlToBlobUrl(JSON.parse(r.value).dataUrl, src.type);
      }
      setScanPanel({ open: true, loading: false, url, name: src.name || 'Document scanné', error: '' });
    } catch (e) {
      setScanPanel({ open: true, loading: false, url: '', name: src.name || '', error: 'Impossible de charger le document scanné.' });
    }
  };

  const handleScanBon = async (file) => {
    if (!file) return;
    const isImage = file.type && file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isImage && !isPdf) {
      setScanState({ status: 'error', error: 'Choisis une photo (JPEG, PNG) ou un PDF.', result: null });
      return;
    }
    setScanState({ status: 'compressing', error: '', result: null });
    try {
      let mediaType, scannedBonName, scannedBonSize, fileToUpload;
      if (isPdf) {
        // PDF : pas de compression, on uploade tel quel (Claude lit les PDF nativement)
        mediaType = 'application/pdf';
        scannedBonName = file.name || 'bon-commande.pdf';
        scannedBonSize = file.size;
        fileToUpload = file;
      } else {
        // Image : on compresse en JPEG 2200px pour réduire la taille
        const compressed = await compressImageForUpload(file);
        mediaType = compressed.mediaType;
        scannedBonName = (file.name || 'bon-commande.jpg').replace(/\.[^.]+$/, '') + '.jpg';
        scannedBonSize = Math.round(compressed.base64.length * 0.75);
        // Reconvertit le base64 compressé en Blob pour l'upload bucket
        const bytes = atob(compressed.base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        fileToUpload = new File([arr], scannedBonName, { type: mediaType });
      }
      // 1) Upload du fichier dans le bucket Supabase Storage (bypass la limite 4 Mo
      //    de body Vercel pour les Functions). On utilise un fileId qui servira
      //    aussi de document ID au moment du Submit (pas de double upload).
      const scanFileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { path: bucketPath, error: upErr } = await uploadFileToBucket(fileToUpload, scanFileId);
      if (upErr || !bucketPath) {
        throw new Error(`Upload bucket impossible : ${upErr?.message || 'inconnu'}`);
      }
      setScanState({ status: 'analyzing', error: '', result: null });
      // 2) Appel à l'API d'extraction avec le path du bucket (au lieu du body inline)
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/extract-bon', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storagePath: bucketPath,
          mediaType,
          availableSocietes: (societes || []).map(s => ({ id: s.id, label: s.label })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      const d = payload.data || {};
      // Pré-remplit le formulaire — uniquement les champs reconnus, le reste est conservé.
      setFormData(prev => {
        const next = { ...prev };
        // On stocke le fichier scanné (déjà dans le bucket) pour l'enregistrer
        // comme document à la sauvegarde, sans re-uploader.
        next.scannedBon = {
          fileId: scanFileId,
          bucketPath,
          name: scannedBonName,
          type: mediaType,
          size: scannedBonSize,
        };
        if (d.nom) next.nom = String(d.nom).toUpperCase();
        if (d.prenom) next.prenom = String(d.prenom);
        if (d.adresse) next.adresse = String(d.adresse);
        if (d.codePostal) next.codePostal = String(d.codePostal);
        if (d.ville) next.ville = String(d.ville).toUpperCase();
        if (d.telephone) next.telephone = String(d.telephone);
        if (d.email) next.email = String(d.email);
        if (d.financement) next.financement = String(d.financement).toUpperCase();
        if (d.dateSignature) next.dateSignature = normalizeDateToIso(String(d.dateSignature));
        if (d.societe && societes && societes.find(s => s.id === d.societe)) {
          next.societe = String(d.societe);
        }
        const ttc = parseFloat(d.montantTTC);
        if (!isNaN(ttc) && ttc > 0) next.montantTotal = String(ttc);
        const ht = parseFloat(d.montantHT);
        if (!isNaN(ht) && ht > 0) next.montantHtCustom = String(ht);
        // 🏦 Détails du prêt — l'IA extrait ces champs depuis le bloc
        // "PAIEMENT AVEC FINANCEMENT" du BC. On les pousse dans formData
        // pour pré-remplir la sous-section "Détails du prêt".
        const pickNum = (v) => {
          const n = parseFloat(v);
          return !isNaN(n) && n > 0 ? String(n) : '';
        };
        const pret = pickNum(d.montantPret); if (pret) next.montantPret = pret;
        const rep = pickNum(d.reportMois); if (rep) next.reportMois = rep;
        const td = pickNum(d.tauxDebiteur); if (td) next.tauxDebiteur = td;
        const tg = pickNum(d.taeg); if (tg) next.taeg = tg;
        const nbe = pickNum(d.nbEcheances); if (nbe) next.nbEcheances = nbe;
        const me = pickNum(d.montantEcheance); if (me) next.montantEcheance = me;
        if (d.periodicite && typeof d.periodicite === 'string') next.periodicite = d.periodicite;
        // 🏠 Toiture/orientation — uniquement si l'IA les a vus sur le BC, sinon vide.
        if (d.typeToiture && typeof d.typeToiture === 'string') next.typeToiture = d.typeToiture;
        if (d.orientationPanneaux && typeof d.orientationPanneaux === 'string') next.orientationPanneaux = d.orientationPanneaux;
        // 📦 Multi-produits : si l'IA renvoie un array 'produits', on l'utilise
        // tel quel. Sinon fallback sur les champs legacy 'produit' + 'puissance'.
        const VALID_TYPES = new Set(['PANNEAU_SOLAIRE', 'PERGOLA', 'POMPE_A_CHALEUR', 'CLIMATISATION', 'BALLON_THERMO', 'BATTERIE', 'ISOLATION', 'VMC', 'AUTRE']);
        if (Array.isArray(d.produits) && d.produits.length > 0) {
          next.produits = d.produits
            .filter(p => p && VALID_TYPES.has(p.type))
            .map(p => ({
              type: p.type,
              puissance: parseInt(p.puissance) || 0,
              description: p.label || '',
              quantite: parseInt(p.quantite) || 1,
            }));
        } else {
          // Fallback legacy : 1 seul produit déduit de 'puissance'
          const p = parseInt(String(d.puissance || '').replace(/\D/g, ''), 10);
          if (p > 0) {
            const prods = (prev.produits && prev.produits.length > 0)
              ? [...prev.produits]
              : [{ type: 'PANNEAU_SOLAIRE', puissance: 0, description: '', quantite: 1 }];
            prods[0] = { ...prods[0], type: prods[0].type || 'PANNEAU_SOLAIRE', puissance: p };
            next.produits = prods;
          }
        }
        return next;
      });
      setScanState({ status: 'done', error: '', result: d });
    } catch (e) {
      setScanState({ status: 'error', error: e.message || 'Erreur inconnue', result: null });
    }
  };

  // Scan d'un dossier client complet (PDF multi-pages) : l'IA identifie chaque
  // type de document, on découpe le PDF côté navigateur avec pdf-lib, et chaque
  // section est uploadée comme un document séparé du dossier.
  const handleScanDossier = async (file) => {
    if (!file) return;
    if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''))) {
      setDossierScanState({ status: 'error', error: 'Choisis un PDF (multi-pages).', sections: null });
      return;
    }
    setDossierScanState({ status: 'uploading', error: '', sections: null });
    try {
      // 1) Upload du PDF complet dans le bucket
      const scanFileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { path: bucketPath, error: upErr } = await uploadFileToBucket(file, scanFileId);
      if (upErr || !bucketPath) throw new Error(`Upload bucket : ${upErr?.message || 'inconnu'}`);

      // 2) Appel API classify-dossier
      setDossierScanState({ status: 'classifying', error: '', sections: null });
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/classify-dossier', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storagePath: bucketPath,
          availableSocietes: (societes || []).map(s => ({ id: s.id, label: s.label })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      const result = payload.data || {};
      const sections = Array.isArray(result.sections) ? result.sections : [];
      if (sections.length === 0) throw new Error("Aucune section identifiée dans le PDF.");

      // 3) Découpage : si le serveur a su scinder le PDF (section.storagePath
      //    présent), chaque section a son propre fichier PDF dans le bucket.
      //    Sinon (PDF corrompu / pdf-lib en panne), on retombe sur le PDF
      //    complet avec un bookmark de page (#page=X).
      setDossierScanState({ status: 'splitting', error: '', sections });
      const scannedSections = sections.map((section, i) => {
        const ownPath = section.storagePath || null;
        return {
          fileId: `${scanFileId}_s${i}`,
          // Path propre si découpé, sinon path partagé avec bookmark de pages
          bucketPath: ownPath || bucketPath,
          standalone: !!ownPath,
          name: section.pageStart === section.pageEnd
            ? `${section.label} (p.${section.pageStart}).pdf`
            : `${section.label} (p.${section.pageStart}-${section.pageEnd}).pdf`,
          type: 'application/pdf',
          size: file.size,
          subCategory: section.category,
          label: section.label,
          // pageStart/pageEnd uniquement utiles si fichier partagé (bookmark)
          pageStart: ownPath ? null : section.pageStart,
          pageEnd: ownPath ? null : section.pageEnd,
          note: `📂 ${section.label} — pages ${section.pageStart}${section.pageEnd > section.pageStart ? `-${section.pageEnd}` : ''} (confiance ${section.confiance})`,
          // 🚨 Anti-fraude : on stocke le verdict IA sur le doc lui-même
          fraudRisk: section.fraudRisk || 'low',
          fraudFlags: Array.isArray(section.fraudFlags) ? section.fraudFlags : [],
        };
      });
      // Stocke aussi les métadonnées PDF (auteur/producer/dates) qui s'appliquent
      // au PDF global — utile pour signaler un fichier édité après création.
      const pdfMeta = result.pdfMeta || null;

      // 5) Pré-remplit le formulaire avec les champs extraits du bon de commande
      const d = result.bonCommande || {};
      setFormData(prev => {
        const next = { ...prev };
        next.scannedSections = scannedSections;
        // PDF complet d'origine (toutes les pages) — gardé pour pouvoir le
        // visionner côte à côte et comparer avec ce que l'IA a rempli.
        next.scannedDossierPdf = { bucketPath, name: file.name || 'dossier-complet.pdf' };
        next.pdfMeta = pdfMeta; // 🚨 Métadonnées PDF anti-fraude (créateur, dates)
        if (d.nom) next.nom = String(d.nom).toUpperCase();
        if (d.prenom) next.prenom = String(d.prenom);
        if (d.adresse) next.adresse = String(d.adresse);
        if (d.codePostal) next.codePostal = String(d.codePostal);
        if (d.ville) next.ville = String(d.ville).toUpperCase();
        if (d.telephone) next.telephone = String(d.telephone);
        if (d.email) next.email = String(d.email);
        if (d.financement) next.financement = String(d.financement).toUpperCase();
        if (d.dateSignature) next.dateSignature = normalizeDateToIso(String(d.dateSignature));
        // 🏢 Société auto-détectée par l'IA depuis le BC (logo, raison sociale, SIRET)
        if (d.societe && societes && societes.find(s => s.id === d.societe)) {
          next.societe = String(d.societe);
        }
        const ttc = parseFloat(d.montantTTC);
        if (!isNaN(ttc) && ttc > 0) next.montantTotal = String(ttc);
        const ht = parseFloat(d.montantHT);
        if (!isNaN(ht) && ht > 0) next.montantHtCustom = String(ht);
        // 🏦 Détails du prêt (idem flow plus haut)
        const pickNum = (v) => {
          const n = parseFloat(v);
          return !isNaN(n) && n > 0 ? String(n) : '';
        };
        const pret = pickNum(d.montantPret); if (pret) next.montantPret = pret;
        const rep = pickNum(d.reportMois); if (rep) next.reportMois = rep;
        const td = pickNum(d.tauxDebiteur); if (td) next.tauxDebiteur = td;
        const tg = pickNum(d.taeg); if (tg) next.taeg = tg;
        const nbe = pickNum(d.nbEcheances); if (nbe) next.nbEcheances = nbe;
        const me = pickNum(d.montantEcheance); if (me) next.montantEcheance = me;
        if (d.periodicite && typeof d.periodicite === 'string') next.periodicite = d.periodicite;
        if (d.typeToiture && typeof d.typeToiture === 'string') next.typeToiture = d.typeToiture;
        if (d.orientationPanneaux && typeof d.orientationPanneaux === 'string') next.orientationPanneaux = d.orientationPanneaux;
        // 📦 Multi-produits : utilise d.produits[] si présent
        const VALID_TYPES = new Set(['PANNEAU_SOLAIRE', 'PERGOLA', 'POMPE_A_CHALEUR', 'CLIMATISATION', 'BALLON_THERMO', 'BATTERIE', 'ISOLATION', 'VMC', 'AUTRE']);
        if (Array.isArray(d.produits) && d.produits.length > 0) {
          next.produits = d.produits
            .filter(p => p && VALID_TYPES.has(p.type))
            .map(p => ({
              type: p.type,
              puissance: parseInt(p.puissance) || 0,
              description: p.label || '',
              quantite: parseInt(p.quantite) || 1,
            }));
        } else {
          const p = parseInt(String(d.puissance || '').replace(/\D/g, ''), 10);
          if (p > 0) {
            const prods = (prev.produits && prev.produits.length > 0)
              ? [...prev.produits]
              : [{ type: 'PANNEAU_SOLAIRE', puissance: 0, description: '', quantite: 1 }];
            prods[0] = { ...prods[0], type: prods[0].type || 'PANNEAU_SOLAIRE', puissance: p };
            next.produits = prods;
          }
        }
        return next;
      });

      // Le PDF d'origine reste dans le bucket : toutes les sections pointent
      // vers ce même fichier physique avec des bookmarks pageStart/pageEnd.

      const incoherences = Array.isArray(result.incoherences) ? result.incoherences : [];

      // 6) Passe anti-fraude APPROFONDIE — chaque document sensible est
      //    repassé SEUL à l'IA (un appel dédié = analyse en profondeur).
      //    La passe rapide de classify-dossier ne fait qu'effleurer ;
      //    ici on scrute vraiment (structure cotisations, ratios, etc.).
      const SENSIBLE = new Set(['bulletin_paie', 'avis_imposition', 'taxe_fonciere', 'justif_domicile', 'rib']);
      const aScruter = scannedSections.filter(s => SENSIBLE.has(s.subCategory) && s.standalone && s.bucketPath);
      if (aScruter.length > 0) {
        setDossierScanState({ status: 'fraud-check', error: '', sections: [...sections], incoherences, fraudTotal: aScruter.length, fraudDone: 0 });
        let done = 0;
        for (const s of aScruter) {
          try {
            const fres = await fetch('/api/fraud-check', {
              method: 'POST',
              headers,
              body: JSON.stringify({ storagePath: s.bucketPath, category: s.subCategory, label: s.label }),
            });
            const fpayload = await fres.json().catch(() => ({}));
            if (fres.ok && fpayload.data) {
              const idx = scannedSections.indexOf(s);
              s.fraudRisk = fpayload.data.fraudRisk || s.fraudRisk;
              s.fraudFlags = Array.isArray(fpayload.data.fraudFlags) ? fpayload.data.fraudFlags : s.fraudFlags;
              s.fraudSynthese = fpayload.data.syntheseHumaine || '';
              if (idx >= 0 && sections[idx]) {
                sections[idx].fraudRisk = s.fraudRisk;
                sections[idx].fraudFlags = s.fraudFlags;
              }
            }
          } catch (e) { /* on garde le verdict de la passe rapide */ }
          done++;
          setDossierScanState({ status: 'fraud-check', error: '', sections: [...sections], incoherences, fraudTotal: aScruter.length, fraudDone: done });
        }
        // scannedSections (donc les futurs documents) ont reçu les verdicts approfondis
        setFormData(prev => ({ ...prev, scannedSections: [...scannedSections] }));
      }

      setDossierScanState({ status: 'done', error: '', sections, incoherences });
    } catch (e) {
      setDossierScanState({ status: 'error', error: e.message || 'Erreur inconnue', sections: null });
    }
  };

  // Verrouille la fermeture pendant un scan en cours (clic backdrop, X, Annuler,
  // touche Escape) — sinon le PDF en analyse continue côté serveur mais l'user
  // perd l'UI et ne sait pas ce qui se passe.
  const isScanBusy = scanBusy || dossierScanBusy;
  const safeClose = () => {
    if (isScanBusy) {
      alert('⏳ Un scan IA est en cours. Patiente quelques secondes ou clique sur "Annuler" dans la zone de scan pour l\'interrompre avant de fermer.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={safeClose}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full max-h-[90vh] flex overflow-hidden transition-all ${scanPanel.open ? 'max-w-6xl' : 'max-w-3xl'}`} onClick={(e) => e.stopPropagation()}>
        {/* PANNEAU PDF SCANNÉ — affiché à gauche, côte à côte avec le formulaire,
            pour comparer le document source avec ce que l'IA a rempli. */}
        {scanPanel.open && (
          <div className="w-[45%] flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-100 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2 flex-shrink-0">
              <span className="text-sm font-bold text-slate-700 truncate">📄 {scanPanel.name || 'Document scanné'}</span>
              <button type="button" onClick={() => setScanPanel(s => ({ ...s, open: false }))} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg flex-shrink-0" title="Fermer le panneau PDF"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-200">
              {scanPanel.loading ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">⏳ Chargement du document…</div>
              ) : scanPanel.error ? (
                <div className="h-full flex items-center justify-center text-center text-rose-600 text-sm p-4">⚠️ {scanPanel.error}</div>
              ) : scanPanel.url ? (
                <iframe src={scanPanel.url} title="Document scanné" className="w-full h-full border-0" />
              ) : null}
            </div>
          </div>
        )}
        {/* COLONNE FORMULAIRE */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
          <div className="sticky top-0 bg-white p-6 border-b border-slate-100 flex items-center justify-between z-10">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />{editingId ? 'Modifier le dossier' : 'Nouveau dossier'}
              {isScanBusy && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full animate-pulse">🔒 Scan IA en cours</span>}
            </h2>
            <div className="flex items-center gap-2">
              {scannedSource && (
                <button type="button" onClick={toggleScanPanel} className={`text-xs font-bold px-3 py-1.5 rounded-lg border-2 transition-all flex items-center gap-1 whitespace-nowrap ${scanPanel.open ? 'bg-cyan-500 text-white border-cyan-600' : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'}`} title="Voir le document scanné côte à côte pour comparer avec le formulaire">
                  📄 {scanPanel.open ? 'Masquer le PDF' : 'PDF scanné'}
                </button>
              )}
              <button onClick={safeClose} disabled={isScanBusy} aria-label="Fermer le formulaire" className={`text-slate-400 p-1 rounded-lg ${isScanBusy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`} title={isScanBusy ? 'Scan en cours — attends la fin' : 'Fermer'}><X className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="p-6 space-y-5">
          {/* SCAN IA — bon de commande manuscrit */}
          {!editingId && (
            <div
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f && !scanBusy) handleScanBon(f); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <label className={`px-4 py-2.5 rounded-xl font-semibold text-white text-sm shadow-md flex items-center gap-2 ${scanBusy ? 'bg-slate-400 cursor-wait' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 cursor-pointer'}`}>
                  <Sparkles className="w-4 h-4" />
                  {scanState.status === 'compressing' ? '⏳ Préparation…'
                    : scanState.status === 'analyzing' ? '🤖 Lecture en cours…'
                    : '📷 Scanner un bon de commande'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={scanBusy} onChange={(e) => handleScanBon(e.target.files?.[0])} />
                </label>
                <span className="text-xs text-slate-500 flex-1 min-w-[200px]">
                  Prends en photo le bon de commande rempli à la main — l'IA pré-remplit le formulaire. Tu pourras tout corriger ensuite.
                </span>
              </div>
              {scanState.status === 'error' && (
                <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  ⚠️ {scanState.error}
                </div>
              )}
              {scanState.status === 'done' && scanState.result && (
                <div className="mt-2 text-xs bg-white border border-violet-200 rounded-lg px-3 py-2">
                  <div className="font-semibold text-slate-700">
                    {scanState.result.confiance === 'haute' ? '🟢 Lecture fiable'
                      : scanState.result.confiance === 'moyenne' ? '🟡 À vérifier'
                      : '🔴 Lecture difficile — vérifie bien tous les champs'}
                    {' '}— formulaire pré-rempli ci-dessous.
                  </div>
                  {scanState.result.remarques && (
                    <div className="text-slate-500 mt-0.5">📝 {scanState.result.remarques}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SCAN IA — Dossier client complet (multi-pages PDF) */}
          {!editingId && (
            <div
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f && !dossierScanBusy) handleScanDossier(f); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50 p-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <label className={`px-4 py-2.5 rounded-xl font-semibold text-white text-sm shadow-md flex items-center gap-2 ${dossierScanBusy ? 'bg-slate-400 cursor-wait' : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 cursor-pointer'}`}>
                  <Sparkles className="w-4 h-4" />
                  {dossierScanState.status === 'uploading' ? '⏳ Upload…'
                    : dossierScanState.status === 'classifying' ? '🤖 Analyse IA…'
                    : dossierScanState.status === 'splitting' ? '✂️ Découpage…'
                    : dossierScanState.status === 'fraud-check' ? `🔍 Anti-fraude… (${dossierScanState.fraudDone || 0}/${dossierScanState.fraudTotal || 0})`
                    : '📂 Scanner un dossier complet (PDF)'}
                  <input type="file" accept="application/pdf" className="hidden" disabled={dossierScanBusy} onChange={(e) => handleScanDossier(e.target.files?.[0])} />
                </label>
                <span className="text-xs text-slate-500 flex-1 min-w-[200px]">
                  Upload un PDF qui contient TOUT le dossier (mandat, bon commande, financement, pièce ID, taxe foncière, etc.) — l'IA découpe chaque document et le range automatiquement.
                </span>
              </div>
              {dossierScanState.status === 'error' && (
                <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  ⚠️ {dossierScanState.error}
                </div>
              )}
              {dossierScanState.status === 'done' && dossierScanState.sections && (() => {
                // 🚨 Agrège les sections par niveau de risque pour résumé en tête
                const sections = dossierScanState.sections;
                const nHigh = sections.filter(s => s.fraudRisk === 'high').length;
                const nMedium = sections.filter(s => s.fraudRisk === 'medium').length;
                const hasAnyFraud = nHigh > 0 || nMedium > 0;
                return (
                  <div className="mt-2 text-xs bg-white border border-cyan-200 rounded-lg px-3 py-2">
                    <div className="font-semibold text-slate-700 mb-1.5">
                      ✅ {sections.length} document{sections.length > 1 ? 's' : ''} identifié{sections.length > 1 ? 's' : ''} et rangé{sections.length > 1 ? 's' : ''} dans le dossier :
                    </div>
                    {/* Incohérences détectées en recoupant les documents entre eux
                        (ex : nom du BC ≠ nom de la carte d'identité). */}
                    {Array.isArray(dossierScanState.incoherences) && dossierScanState.incoherences.length > 0 && (
                      <div className="mb-2 px-2 py-1.5 rounded-lg border-2 bg-orange-50 border-orange-300 text-orange-800">
                        <div className="font-bold text-[11px]">🔎 {dossierScanState.incoherences.length} incohérence{dossierScanState.incoherences.length > 1 ? 's' : ''} entre documents — à vérifier</div>
                        <ul className="mt-1 ml-1 text-[10px] space-y-0.5">
                          {dossierScanState.incoherences.map((inc, j) => <li key={j}>• {inc}</li>)}
                        </ul>
                        <div className="text-[10px] italic opacity-80 mt-0.5">L'IA a recoupé les documents : le formulaire a été pré-rempli avec la valeur la plus fiable (pièce d'identité). Vérifie quand même.</div>
                      </div>
                    )}
                    {/* Bandeau anti-fraude global si quelque chose est suspect */}
                    {hasAnyFraud && (
                      <div className={`mb-2 px-2 py-1.5 rounded-lg border-2 ${nHigh > 0 ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                        <div className="font-bold text-[11px]">
                          {nHigh > 0 ? '🚨' : '⚠️'} Anti-fraude :{' '}
                          {nHigh > 0 && <span>{nHigh} doc{nHigh > 1 ? 's' : ''} très suspect{nHigh > 1 ? 's' : ''}</span>}
                          {nHigh > 0 && nMedium > 0 && <span> · </span>}
                          {nMedium > 0 && <span>{nMedium} à vérifier</span>}
                        </div>
                        <div className="text-[10px] italic opacity-80 mt-0.5">Voir les détails ligne par ligne ci-dessous, ou dans la modale Documents après sauvegarde.</div>
                      </div>
                    )}
                    <ul className="space-y-1.5">
                      {sections.map((s, i) => {
                        const cat = CLIENT_DOC_SUBCATS.find(c => c.id === s.category);
                        const emoji = cat?.emoji || '📑';
                        const confiCol = s.confiance === 'haute' ? 'text-emerald-700'
                          : s.confiance === 'moyenne' ? 'text-amber-700'
                          : 'text-rose-700';
                        const fraudRisk = s.fraudRisk || 'low';
                        const fraudFlags = Array.isArray(s.fraudFlags) ? s.fraudFlags : [];
                        const fraudBgCls = fraudRisk === 'high' ? 'bg-rose-50 border-l-2 border-rose-400 pl-2 py-1 rounded'
                          : fraudRisk === 'medium' ? 'bg-amber-50 border-l-2 border-amber-400 pl-2 py-1 rounded'
                          : '';
                        const fraudIcon = fraudRisk === 'high' ? '🚨' : fraudRisk === 'medium' ? '⚠️' : '';
                        return (
                          <li key={i} className={fraudBgCls}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{emoji}</span>
                              <span className="font-semibold text-slate-700">{s.label}</span>
                              <span className="text-slate-400">— p. {s.pageStart}{s.pageEnd > s.pageStart ? `-${s.pageEnd}` : ''}</span>
                              <span className={`text-[10px] font-bold uppercase ${confiCol}`}>{s.confiance}</span>
                              {fraudIcon && (
                                <span className={`text-[10px] font-bold ${fraudRisk === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>
                                  {fraudIcon} {fraudRisk === 'high' ? 'SUSPICION FORTE' : 'À VÉRIFIER'}
                                </span>
                              )}
                            </div>
                            {fraudFlags.length > 0 && (
                              <ul className={`mt-0.5 ml-6 text-[10px] space-y-0.5 ${fraudRisk === 'high' ? 'text-rose-700' : 'text-amber-700'}`}>
                                {fraudFlags.map((flag, j) => <li key={j}>• {flag}</li>)}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}
          {/* 🏢 Société émettrice — choix obligatoire visible en haut du form
              pour éviter d'envoyer un mail Yolico à un client Elsun. */}
          {societes.length > 1 && (
            <div className="mb-4 p-3 bg-gradient-to-r from-slate-50 to-slate-100 border-2 border-slate-200 rounded-2xl">
              <div className="text-xs font-bold text-slate-600 uppercase mb-2">🏢 Société émettrice du dossier</div>
              <div className="flex gap-2 flex-wrap">
                {societes.map(s => (
                  <SocieteBadge
                    key={s.id}
                    societe={s}
                    variant="large"
                    active={formData.societe === s.id}
                    onClick={() => setFormData({ ...formData, societe: s.id })}
                  />
                ))}
              </div>
              {!formData.societe && (
                <div className="mt-2 text-[11px] text-rose-600 font-bold">⚠️ Choisis une société pour éviter d'envoyer les mauvais documents/emails au client.</div>
              )}
            </div>
          )}
          <Section title="👤 Identité & Coordonnées" color="violet">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="ID dossier"><input type="text" value={formData.id} onChange={(e) => setFormData({ ...formData, id: e.target.value })} placeholder="62007" className={inputCls} /></Field>
              <div></div>
              <div></div>
              <Field label="Nom *"><input type="text" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder="DUPONT" className={inputCls + (formData.nom.trim() ? '' : ' border-rose-400 focus:ring-rose-400')} /></Field>
              <Field label="Prénom"><input type="text" value={formData.prenom} onChange={(e) => setFormData({ ...formData, prenom: e.target.value })} placeholder="JEAN" className={inputCls} /></Field>
              <div></div>
              <Field label="📞 Téléphone"><input type="tel" value={formData.telephone} onChange={(e) => setFormData({ ...formData, telephone: e.target.value })} placeholder="06 12 34 56 78" className={inputCls} /></Field>
              <Field label="✉️ Email"><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="client@email.fr" className={inputCls} /></Field>
              <div></div>
              <div className="md:col-span-3">
                <Field label="📍 Adresse"><input type="text" value={formData.adresse} onChange={(e) => setFormData({ ...formData, adresse: e.target.value })} placeholder="12 rue des Lilas" className={inputCls} /></Field>
              </div>
              <Field label="Code postal"><input type="text" value={formData.codePostal} onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })} placeholder="13001" className={inputCls} /></Field>
              <div className="md:col-span-2">
                <Field label="Ville"><input type="text" value={formData.ville} onChange={(e) => setFormData({ ...formData, ville: e.target.value })} placeholder="MARSEILLE" className={inputCls} /></Field>
              </div>
            </div>
          </Section>

          <Section
            title="🏠 Produits installés"
            color="amber"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const items = (formData.produits || []).filter(p => p.type);
              if (items.length === 0) return '▶️ Aucun produit — clique pour ajouter';
              const totalPuissance = items.reduce((s, p) => s + (parseFloat(p.puissance) || 0), 0);
              const label = items.map(p => {
                const def = PRODUITS_DEFAULT.find(x => x.id === p.type);
                return def?.label || p.type;
              }).slice(0, 3).join(', ');
              return `▶️ ${items.length} produit${items.length > 1 ? 's' : ''}${totalPuissance > 0 ? ` · ${totalPuissance} Wc` : ''} · ${label}${items.length > 3 ? '…' : ''}`;
            })()}
          >
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">Produits ({formData.produits.length}) — un client peut avoir plusieurs produits</label>
                <button type="button" onClick={() => setFormData({ ...formData, produits: [...formData.produits, { type: '', puissance: 0, description: '', quantite: 1 }] })} className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-1 rounded-lg flex items-center gap-1">
                  <Plus className="w-3 h-3" />Ajouter
                </button>
              </div>
              {formData.produits.map((prod, idx) => {
                const prodInfo = findProduit(produits, prod.type);
                const updProd = (u) => { const l = [...formData.produits]; l[idx] = { ...l[idx], ...u }; setFormData({ ...formData, produits: l }); };
                const rmProd = () => { if (formData.produits.length === 1) return; setFormData({ ...formData, produits: formData.produits.filter((_, i) => i !== idx) }); };
                return (
                  <div key={idx} className="rounded-xl border border-amber-200 bg-white p-3">
                    <div className="flex items-end gap-2 flex-wrap">
                      <span className="flex-shrink-0 self-center text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center bg-amber-100 text-amber-600">{idx + 1}</span>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Type de produit</label>
                        <select value={prod.type} onChange={(e) => updProd({ type: e.target.value })} className={inputCls + ' font-semibold'}>
                          <option value="">— Choisir un produit —</option>
                          {produits.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                        </select>
                      </div>
                      {prodInfo.autoTarif ? (
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Puissance (Wc)</label>
                          <select value={prod.puissance || ''} onChange={(e) => updProd({ puissance: parseInt(e.target.value) || 0 })} className={inputCls}>
                            <option value="">— Choisir —</option>
                            {PUISSANCES.map(p => <option key={p} value={p}>{p} Wc</option>)}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="w-20 flex-shrink-0">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Quantité</label>
                            <input type="number" min="1" value={prod.quantite || 1} onChange={(e) => updProd({ quantite: parseInt(e.target.value) || 1 })} className={inputCls + ' text-center font-semibold'} />
                          </div>
                          <div className="flex-1 min-w-[180px]">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Description (optionnel)</label>
                            <input type="text" value={prod.description || ''} onChange={(e) => updProd({ description: e.target.value })} placeholder="Ex: 8 kW, 5 kWh..." className={inputCls} />
                          </div>
                        </>
                      )}
                      <button type="button" onClick={rmProd} disabled={formData.produits.length === 1} className="flex-shrink-0 self-center p-2 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <Field label="🏠 Type de toiture">
                <select value={formData.typeToit || ''} onChange={(e) => setFormData({ ...formData, typeToit: e.target.value })} className={inputCls + ' font-semibold'}>
                  <option value="">— Choisir —</option>
                  {TYPES_TOIT.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="📐 Orientation des panneaux">
                <select value={formData.orientationPanneaux || ''} onChange={(e) => setFormData({ ...formData, orientationPanneaux: e.target.value })} className={inputCls + ' font-semibold'}>
                  <option value="">— Choisir —</option>
                  {ORIENTATIONS_PANNEAUX.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </Field>
            </div>

            {!calculs.useAutoTarif && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 leading-relaxed mb-3">
                💡 <strong>Aucun tarif auto défini</strong> pour ces produits avec ce poseur/régie. Saisis manuellement le HT ci-dessous, ou va dans <strong>Réglages → Poseurs / Régies</strong> pour pré-remplir tes tarifs habituels.
              </div>
            )}
            {calculs.useAutoTarif && calculs.puissance > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed mb-3">
                ⚡ Puissance solaire totale : <strong>{calculs.puissance} Wc</strong> — tarifs auto poseur/régie utilisent cette puissance pour la partie solaire.
              </div>
            )}

          </Section>

          <Section
            title="💰 Prix de vente & Financement"
            color="blue"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const ttc = parseFloat(formData.montantTotal) || 0;
              if (!ttc) return '▶️ Pas de montant — clique pour saisir';
              const fin = formData.financement || 'financement à choisir';
              const paye = formData.payeClient ? ' · ✓ payé' : '';
              return `▶️ ${formatEuro(ttc)} TTC · ${fin}${paye}`;
            })()}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Prix de vente TTC (€) *"><input type="number" step="0.01" value={formData.montantTotal} onChange={(e) => setFormData({ ...formData, montantTotal: e.target.value })} placeholder="29900" className={inputCls + ' font-bold text-lg'} /></Field>
              <Field label="Mode de financement">
                <select value={formData.financement} onChange={(e) => setFormData({ ...formData, financement: e.target.value })} className={inputCls}>
                  <option value="">— Choisir un financement —</option>
                  {FINANCEMENTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="🧮 Taux de TVA">
                <div className="grid grid-cols-3 gap-1">
                  {[20, 10, 5.5].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData({ ...formData, tauxTvaVente: t, montantHtCustom: '' })}
                      className={`px-2 py-2 rounded-xl text-sm font-bold border-2 transition-all ${parseFloat(formData.tauxTvaVente) === t ? 'bg-blue-500 text-white border-blue-600 shadow-md' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                    >
                      {t}%
                    </button>
                  ))}
                </div>
              </Field>
              {(() => {
                const tauxAffiche = parseFloat(formData.tauxTvaVente) || 20;
                const ttc = parseFloat(formData.montantTotal) || 0;
                const htAuto = ttc / (1 + tauxAffiche / 100);
                return (
                  <Field label={`Prix HT (€) — auto à ${tauxAffiche}%`}>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.montantHtCustom}
                      onChange={(e) => setFormData({ ...formData, montantHtCustom: e.target.value })}
                      placeholder={`Vide = ${formatEuro(htAuto)}`}
                      className={inputCls}
                    />
                  </Field>
                );
              })()}
              <Field label="Taux TVA réel appliqué">
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold text-blue-700">{calculs.tauxTva > 0 ? `${calculs.tauxTva.toFixed(2)} %` : '—'}</div>
              </Field>
            </div>
            {isAdmin && (
              <div className="mt-3">
                <Toggle label={`✅ Payé par le financeur (${formData.financement})`} checked={formData.payeClient} onChange={(v) => {
                  const today = new Date().toISOString().split('T')[0];
                  if (v) {
                    setFormData({
                      ...formData,
                      payeClient: true,
                      payeClientDate: formData.payeClientDate || today,
                      datePaiementBanque: formData.datePaiementBanque || today,
                      statut: 'W_DOSSIER_PAYER',
                    });
                  } else {
                    setFormData({ ...formData, payeClient: false, payeClientDate: '' });
                  }
                }} />
              </div>
            )}

            {/* 🏦 Détails du financement bancaire — visible seulement si une banque
                est choisie (pas COMPTANT). Récupérable via scan IA du BC ou saisie
                manuelle. Sert à pré-remplir la zone "PAIEMENT AVEC FINANCEMENT" du BC PDF. */}
            {formData.financement && formData.financement !== 'COMPTANT' && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-[11px] font-bold text-blue-700 uppercase mb-2">🏦 Détails du prêt — {formData.financement}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Montant du prêt (€)">
                    <input type="number" step="0.01" value={formData.montantPret} onChange={(e) => setFormData({ ...formData, montantPret: e.target.value })} placeholder="35900" className={inputCls} />
                  </Field>
                  <Field label="Report (mois)">
                    <input type="number" step="1" value={formData.reportMois} onChange={(e) => setFormData({ ...formData, reportMois: e.target.value })} placeholder="6" className={inputCls} />
                  </Field>
                  <Field label="Taux débiteur fixe (%)">
                    <input type="number" step="0.01" value={formData.tauxDebiteur} onChange={(e) => setFormData({ ...formData, tauxDebiteur: e.target.value })} placeholder="6.39" className={inputCls} />
                  </Field>
                  <Field label="TAEG (%)">
                    <input type="number" step="0.01" value={formData.taeg} onChange={(e) => setFormData({ ...formData, taeg: e.target.value })} placeholder="6.58" className={inputCls} />
                  </Field>
                  <Field label="Nombre d'échéances">
                    <input type="number" step="1" value={formData.nbEcheances} onChange={(e) => setFormData({ ...formData, nbEcheances: e.target.value })} placeholder="180" className={inputCls} />
                  </Field>
                  <Field label="Montant échéance (€)">
                    <input type="number" step="0.01" value={formData.montantEcheance} onChange={(e) => setFormData({ ...formData, montantEcheance: e.target.value })} placeholder="312" className={inputCls} />
                  </Field>
                  <Field label="Périodicité">
                    <select value={formData.periodicite} onChange={(e) => setFormData({ ...formData, periodicite: e.target.value })} className={inputCls}>
                      <option value="Mensuelle">Mensuelle</option>
                      <option value="Bimestrielle">Bimestrielle</option>
                      <option value="Trimestrielle">Trimestrielle</option>
                      <option value="Semestrielle">Semestrielle</option>
                      <option value="Annuelle">Annuelle</option>
                    </select>
                  </Field>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">💡 Ces infos sont extraites automatiquement quand tu scannes un BC avec l'IA. Tu peux aussi les saisir à la main ici.</p>
              </div>
            )}
          </Section>

          <Section
            title="🤝 Régie"
            color="purple"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              if (formData.typeRegie === 'interne') {
                const noms = ROLES_INTERNES.map(r => formData[r.key]).filter(Boolean);
                if (noms.length === 0) return '▶️ Régie interne — aucun rôle assigné';
                return `▶️ Régie interne · ${noms.length} rôle${noms.length > 1 ? 's' : ''} (${noms.slice(0,2).join(', ')}${noms.length > 2 ? '…' : ''})`;
              }
              const regies = (formData.regies || []).filter(r => r.nom);
              if (regies.length === 0) return '▶️ Aucune régie — clique pour ajouter';
              return `▶️ ${regies.length} régie${regies.length > 1 ? 's' : ''} · ${regies.slice(0,2).map(r => r.nom).join(', ')}${regies.length > 2 ? '…' : ''}`;
            })()}
          >
            {/* Toggle Interne / Externe */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-2">Type de régie</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFormData({ ...formData, typeRegie: 'externe' })} className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${formData.typeRegie === 'externe' ? 'bg-purple-500 text-white border-purple-600 shadow-md' : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'}`}>🏢 Régie externe</button>
                <button type="button" onClick={() => setFormData({ ...formData, typeRegie: 'interne' })} className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${formData.typeRegie === 'interne' ? 'bg-fuchsia-500 text-white border-fuchsia-600 shadow-md' : 'bg-white text-fuchsia-600 border-fuchsia-200 hover:bg-fuchsia-50'}`}>👥 Régie interne</button>
              </div>
            </div>

            {/* Si régie externe : liste multi-régies */}
            {formData.typeRegie === 'externe' && (
              <div className="space-y-2">
                {formData.regies.length > 0 && (
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => setFormData({ ...formData, regies: [...formData.regies, { nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] })} className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-1 rounded-lg flex items-center gap-1">
                      <Plus className="w-3 h-3" />Ajouter
                    </button>
                  </div>
                )}
                {formData.regies.length === 0 && (
                  <button type="button" onClick={() => setFormData({ ...formData, regies: [{ nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] })} className="w-full px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border border-dashed border-violet-300">
                    <Plus className="w-3 h-3" />Ajouter une régie
                  </button>
                )}
                {formData.regies.map((r, idx) => {
                  const upd = (u) => { const l = [...formData.regies]; l[idx] = { ...l[idx], ...u }; setFormData({ ...formData, regies: l }); };
                  const rm = () => { setFormData({ ...formData, regies: formData.regies.filter((_, i) => i !== idx) }); };
                  const tarifAuto = calculs.regiesDetail[idx]?.autoHt || 0;
                  const ttcRegie = calculs.regiesDetail[idx]?.ttc || 0;
                  return (
                    <div key={idx} className={`rounded-xl border p-3 ${r.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-purple-200'}`}>
                      <div className="flex items-end gap-2 flex-wrap">
                        <span className={`flex-shrink-0 self-center text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center ${r.paye ? 'bg-emerald-200 text-emerald-700' : 'bg-purple-100 text-purple-600'}`}>{idx + 1}</span>
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Régie</label>
                          <select value={r.nom} onChange={(e) => upd({ nom: e.target.value, htCustom: '' })} className={inputCls}>
                            <option value="">— Choisir une régie —</option>
                            {REGIES.map(re => <option key={re} value={re}>{re}</option>)}
                          </select>
                        </div>
                        {isAdmin && (
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tarifAuto > 0 ? `HT (auto ${formatEuro(tarifAuto)})` : 'HT (€)'}</label>
                            <input type="number" step="0.01" value={r.htCustom} onChange={(e) => upd({ htCustom: e.target.value })} placeholder={tarifAuto > 0 ? 'Vide = auto' : 'Saisir'} className={inputCls} />
                          </div>
                        )}
                        <button type="button" onClick={rm} className="self-center p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {isAdmin && r.nom && (
                        <button type="button" onClick={() => upd({ paye: !r.paye, datePaye: !r.paye ? new Date().toISOString().split('T')[0] : '' })} className={`mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-bold ${r.paye ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {r.paye ? `✓ Payée (${formatEuro(ttcRegie)} TTC)` : `⏳ Non payée (${formatEuro(ttcRegie)} TTC)`}
                        </button>
                      )}
                    </div>
                  );
                })}
                {isAdmin && formData.regies.length > 1 && (
                  <div className="bg-purple-100 rounded-xl p-3 flex items-center justify-between border border-purple-300">
                    <span className="text-xs font-bold text-purple-700 uppercase">Total régies</span>
                    <div className="flex gap-3 text-sm">
                      <span className="font-bold text-purple-700">HT : {formatEuro(calculs.regieHt)}</span>
                      <span className="font-bold text-purple-800">TTC : {formatEuro(calculs.regieTtc)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Si régie interne : équipe interne */}
            {/* Régie interne : juste un message — l'équipe est dans une section séparée ci-dessous */}
            {formData.typeRegie === 'interne' && (
              <div className="text-[11px] text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-2">
                👥 Pas de régie externe — l'équipe interne gère ce dossier (renseigne les rôles dans la section <strong>"👥 Équipe interne"</strong> ci-dessous)
              </div>
            )}
          </Section>

          <Section
            title="🔧 Poseurs"
            color="emerald"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const nbPoseurs = (formData.poseurs || []).filter(p => p.nom).length;
              if (nbPoseurs === 0) return '▶️ Aucun poseur — clique pour ajouter';
              return `▶️ 🔧 ${nbPoseurs} poseur${nbPoseurs > 1 ? 's' : ''}`;
            })()}
          >
            <div className="space-y-2">
              {formData.poseurs.length > 0 && (
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setFormData({ ...formData, poseurs: [...formData.poseurs, { nom: '', htCustom: '', paye: false, datePaye: '' }] })} className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Plus className="w-3 h-3" />Ajouter
                  </button>
                </div>
              )}
              {formData.poseurs.length === 0 && (
                <button type="button" onClick={() => setFormData({ ...formData, poseurs: [{ nom: '', htCustom: '', paye: false, datePaye: '' }] })} className="w-full px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border border-dashed border-violet-300">
                  <Plus className="w-3 h-3" />Ajouter un poseur
                </button>
              )}
              {formData.poseurs.map((p, idx) => {
                const upd = (u) => { const l = [...formData.poseurs]; l[idx] = { ...l[idx], ...u }; setFormData({ ...formData, poseurs: l }); };
                const rm = () => { setFormData({ ...formData, poseurs: formData.poseurs.filter((_, i) => i !== idx) }); };
                const tarifAuto = calculs.poseursDetail[idx]?.autoHt || 0;
                return (
                  <div key={idx} className={`rounded-xl border p-3 ${p.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-amber-200'}`}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <span className={`flex-shrink-0 self-center text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center ${p.paye ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-100 text-amber-600'}`}>{idx + 1}</span>
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Poseur</label>
                        <select value={p.nom} onChange={(e) => upd({ nom: e.target.value, htCustom: '' })} className={inputCls}>
                          <option value="">— Choisir un poseur —</option>
                          {POSEURS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      {isAdmin && (
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tarifAuto > 0 ? `HT (auto: ${formatEuro(tarifAuto)})` : 'HT (€)'}</label>
                          <input type="number" step="0.01" value={p.htCustom} onChange={(e) => upd({ htCustom: e.target.value })} placeholder={tarifAuto > 0 ? "Vide = auto" : "Saisir"} className={inputCls} />
                        </div>
                      )}
                      {isAdmin && (
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Statut</label>
                          <button type="button" onClick={() => { const np = !p.paye; upd({ paye: np, datePaye: np ? (p.datePaye || new Date().toISOString().split('T')[0]) : '' }); }} className={`w-full px-2 py-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1 ${p.paye ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                            {p.paye ? <><Check className="w-3 h-3" strokeWidth={3} />Payé</> : '⏳ À payer'}
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={rm} className="flex-shrink-0 self-center p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Sous-section facturation poseur — admin only (info financière) */}
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-amber-100 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">📦 N° BL (bordereau)</label>
                          <input type="text" value={p.bl || ''} onChange={(e) => upd({ bl: e.target.value })} placeholder="Ex: 1234567" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">🧾 N° facture</label>
                          <input type="text" value={p.factureNo || ''} onChange={(e) => upd({ factureNo: e.target.value })} placeholder="Ex: FA24-001" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                            <span>🔗 Lien PDF facture</span>
                            {p.facturePdfUrl && (
                              <a href={p.facturePdfUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-violet-600 hover:underline">📄 Ouvrir</a>
                            )}
                          </label>
                          <input type="url" value={p.facturePdfUrl || ''} onChange={(e) => upd({ facturePdfUrl: e.target.value })} placeholder="https://drive.google.com/..." className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {isAdmin && formData.poseurs.length > 1 && (
                <div className="bg-amber-100 rounded-xl p-3 flex items-center justify-between border border-amber-300">
                  <span className="text-xs font-bold text-amber-700 uppercase">Total poseurs</span>
                  <div className="flex gap-3 text-sm">
                    <span className="font-bold text-amber-700">HT : {formatEuro(calculs.poseurHt)}</span>
                    <span className="font-bold text-amber-800">TTC : {formatEuro(calculs.poseurTtc)}</span>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Section séparée pour les Fournisseurs */}
          <Section
            title="📦 Fournisseurs"
            color="emerald"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const nbFourn = (formData.fournisseurs || []).filter(f => f.nom).length;
              if (nbFourn === 0) return '▶️ Aucun fournisseur — clique pour ajouter';
              return `▶️ 📦 ${nbFourn} fournisseur${nbFourn > 1 ? 's' : ''}`;
            })()}
          >
            <div className="space-y-2">
              {formData.fournisseurs.length > 0 && (
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setFormData({ ...formData, fournisseurs: [...formData.fournisseurs, { nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] })} className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Plus className="w-3 h-3" />Ajouter
                  </button>
                </div>
              )}
              {formData.fournisseurs.length === 0 && (
                <button type="button" onClick={() => setFormData({ ...formData, fournisseurs: [{ nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] })} className="w-full px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border border-dashed border-violet-300">
                  <Plus className="w-3 h-3" />Ajouter un fournisseur
                </button>
              )}
              {formData.fournisseurs.map((f, idx) => {
                const upd = (u) => { const l = [...formData.fournisseurs]; l[idx] = { ...l[idx], ...u }; setFormData({ ...formData, fournisseurs: l }); };
                const rm = () => { setFormData({ ...formData, fournisseurs: formData.fournisseurs.filter((_, i) => i !== idx) }); };
                return (
                  <div key={idx} className={`rounded-xl border p-3 ${f.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-amber-200'}`}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <span className={`flex-shrink-0 self-center text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center ${f.paye ? 'bg-emerald-200 text-emerald-700' : 'bg-amber-100 text-amber-600'}`}>{idx + 1}</span>
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Fournisseur</label>
                        <select value={f.nom} onChange={(e) => upd({ nom: e.target.value })} className={inputCls}>
                          <option value="">— Choisir un fournisseur —</option>
                          {FOURNISSEURS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      {isAdmin && (
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Prix HT (€)</label>
                          <input type="number" step="0.01" value={f.htCustom} onChange={(e) => upd({ htCustom: e.target.value })} placeholder="Saisir" className={inputCls} />
                        </div>
                      )}
                      {isAdmin && (
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Statut</label>
                          <button type="button" onClick={() => { const np = !f.paye; upd({ paye: np, datePaye: np ? (f.datePaye || new Date().toISOString().split('T')[0]) : '' }); }} className={`w-full px-2 py-2 rounded-xl border-2 text-xs font-semibold flex items-center justify-center gap-1 ${f.paye ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                            {f.paye ? <><Check className="w-3 h-3" strokeWidth={3} />Payé</> : '⏳ À payer'}
                          </button>
                        </div>
                      )}
                      <button type="button" onClick={rm} className="flex-shrink-0 self-center p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Sous-section facturation — admin only (info financière) */}
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t border-amber-100 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">📦 N° BL (bordereau)</label>
                          <input type="text" value={f.bl || ''} onChange={(e) => upd({ bl: e.target.value })} placeholder="Ex: 1234567" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">🧾 N° facture</label>
                          <input type="text" value={f.factureNo || ''} onChange={(e) => upd({ factureNo: e.target.value })} placeholder="Ex: FA24-001" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                            <span>🔗 Lien PDF facture</span>
                            {f.facturePdfUrl && (
                              <a href={f.facturePdfUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-violet-600 hover:underline">📄 Ouvrir</a>
                            )}
                          </label>
                          <input type="url" value={f.facturePdfUrl || ''} onChange={(e) => upd({ facturePdfUrl: e.target.value })} placeholder="https://drive.google.com/..." className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {isAdmin && formData.fournisseurs.length > 1 && (
                <div className="bg-amber-100 rounded-xl p-3 flex items-center justify-between border border-amber-300">
                  <span className="text-xs font-bold text-amber-700 uppercase">Total fournisseurs</span>
                  <div className="flex gap-3 text-sm">
                    <span className="font-bold text-amber-700">HT : {formatEuro(calculs.fournisseurHt)}</span>
                    <span className="font-bold text-amber-800">TTC : {formatEuro(calculs.fournisseurTtc)}</span>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ÉQUIPE INTERNE — uniquement si régie interne */}
          {formData.typeRegie === 'interne' && (
          <Section
            title="👥 Équipe interne (commissions)"
            color="purple"
            collapsible={true}
            defaultCollapsed={!editingId && !ROLES_INTERNES.some(r => formData[r.key])}
            summary={(() => {
              const remplis = ROLES_INTERNES.filter(r => formData[r.key]).length;
              if (remplis === 0) return '▶️ Aucun rôle assigné — clique pour configurer';
              const totalCommissions = ROLES_INTERNES.reduce((sum, role) => {
                if (!formData[role.key]) return sum;
                const m = formData[role.key + 'Montant'];
                const v = m !== '' && m !== undefined && m !== null ? parseFloat(m) : (tarifsInternes[role.key] || 0);
                return sum + (isNaN(v) ? 0 : v);
              }, 0);
              return `▶️ ${remplis} rôle${remplis > 1 ? 's' : ''} · ${formatEuro(totalCommissions)} de commissions`;
            })()}
          >
            <div className="space-y-2">
              <div className="text-[11px] text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-2 mb-2">
                👥 Renseigne uniquement les personnes <strong>internes</strong> à toucher une commission sur ce dossier. Tu peux laisser vide les rôles non concernés.
              </div>
              {ROLES_INTERNES.map(role => {
                const nomKey = role.key;
                const montantKey = role.key + 'Montant';
                const payeKey = role.key + 'Paye';
                const dateKey = role.key + 'DatePaye';
                const tarifAuto = tarifsInternes[role.key] || 0;
                const montantEffectif = formData[montantKey] !== '' && formData[montantKey] !== undefined && formData[montantKey] !== null
                  ? parseFloat(formData[montantKey])
                  : tarifAuto;
                const listeNoms = (nomsInternes && nomsInternes[role.key]) || [];
                const valeurActuelle = formData[nomKey] || '';
                // Détermine si la valeur actuelle est dans la liste
                const valeurDansListe = !valeurActuelle || listeNoms.includes(valeurActuelle);
                return (
                  <div key={role.key} className="bg-white border border-fuchsia-200 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                      <Field label={`${role.emoji} ${role.label}`}>
                        <div className="space-y-1">
                          <select
                            value={valeurDansListe ? valeurActuelle : '__custom__'}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__new__') {
                                // Saisir un nouveau nom
                                setFormData({ ...formData, [nomKey]: '__custom__' });
                              } else if (v === '__custom__') {
                                // ne rien faire (déjà en mode custom)
                              } else {
                                setFormData({ ...formData, [nomKey]: v });
                              }
                            }}
                            className={inputCls}
                          >
                            <option value="">— Aucun (laisser vide) —</option>
                            {listeNoms.map(n => <option key={n} value={n}>{n}</option>)}
                            {!valeurDansListe && valeurActuelle && (
                              <option value="__custom__">✏️ {valeurActuelle} (saisi à la volée)</option>
                            )}
                            <option value="__new__">➕ Saisir un nouveau nom...</option>
                          </select>
                          {(!valeurDansListe || formData[nomKey] === '__custom__') && (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={formData[nomKey] === '__custom__' ? '' : formData[nomKey]}
                                onChange={(e) => setFormData({ ...formData, [nomKey]: e.target.value })}
                                placeholder="Tape le nom"
                                className={inputCls + ' text-xs'}
                                autoFocus
                              />
                              {formData[nomKey] && formData[nomKey] !== '__custom__' && !listeNoms.find(n => n.toLowerCase() === formData[nomKey].toLowerCase()) && setNomsInternes && (
                                <button
                                  type="button"
                                  onClick={() => setNomsInternes({ ...nomsInternes, [role.key]: [...listeNoms, formData[nomKey]] })}
                                  className="px-2 py-1 bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 rounded text-[10px] font-bold whitespace-nowrap"
                                  title="Ajouter ce nom à la liste pour les futurs dossiers"
                                >
                                  💾 Mémoriser
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </Field>
                      {isAdmin && (
                        <Field label={`💰 Commission (€) — défaut ${tarifAuto}€`}>
                          <input type="number" step="0.01" value={formData[montantKey]} onChange={(e) => setFormData({ ...formData, [montantKey]: e.target.value })} placeholder={`Vide = ${tarifAuto}€ (auto)`} className={inputCls} />
                        </Field>
                      )}
                    </div>
                    {isAdmin && formData[nomKey] && formData[nomKey] !== '__custom__' && (
                      <button type="button" onClick={() => setFormData({ ...formData, [payeKey]: !formData[payeKey], [dateKey]: !formData[payeKey] ? new Date().toISOString().split('T')[0] : '' })} className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold ${formData[payeKey] ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {formData[payeKey] ? `✓ Payé (${montantEffectif}€)` : `⏳ À payer (${montantEffectif}€)`}
                      </button>
                    )}
                  </div>
                );
              })}
              {isAdmin && (() => {
                const totalCommissions = ROLES_INTERNES.reduce((sum, role) => {
                  if (!formData[role.key]) return sum;
                  const m = formData[role.key + 'Montant'];
                  const v = m !== '' && m !== undefined && m !== null ? parseFloat(m) : (tarifsInternes[role.key] || 0);
                  return sum + (isNaN(v) ? 0 : v);
                }, 0);
                const totalPaye = ROLES_INTERNES.reduce((sum, role) => {
                  if (!formData[role.key] || !formData[role.key + 'Paye']) return sum;
                  const m = formData[role.key + 'Montant'];
                  const v = m !== '' && m !== undefined && m !== null ? parseFloat(m) : (tarifsInternes[role.key] || 0);
                  return sum + (isNaN(v) ? 0 : v);
                }, 0);
                const reste = totalCommissions - totalPaye;
                if (totalCommissions === 0) return null;
                return (
                  <div className="bg-fuchsia-100 border border-fuchsia-300 rounded-xl p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-fuchsia-800">💰 Total commissions équipe</span>
                      <span className="font-bold text-fuchsia-800">{formatEuro(totalCommissions)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-emerald-700">✓ Payé : {formatEuro(totalPaye)}</span>
                      <span className={reste > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}>⏳ Reste : {formatEuro(reste)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Section>
          )}

          {/* Provenance du lead — uniquement si régie interne */}
          {formData.typeRegie === 'interne' && (
            <Section title="📍 Provenance du lead" color="cyan">
              <Field label="D'où vient ce client ?">
                <select value={formData.provenanceLead} onChange={(e) => setFormData({ ...formData, provenanceLead: e.target.value })} className={inputCls}>
                  <option value="">— Choisir une provenance —</option>
                  {PROVENANCES_LEAD.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              {formData.provenanceLead === 'Autre' && (
                <Field label="Précise la provenance">
                  <input type="text" value={formData.provenanceLeadDetail || ''} onChange={(e) => setFormData({ ...formData, provenanceLeadDetail: e.target.value })} placeholder="Ex: Pages Jaunes, Prospection terrain..." className={inputCls} />
                </Field>
              )}
            </Section>
          )}

          <Section
            title="📅 Process du dossier"
            color="blue"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const cqOk = formData.statutControleQualite === 'ok';
              const finOk = formData.statutFin === 'accepté';
              const poseOk = formData.statutPose === 'visite_ok';
              const consuelOk = formData.statutConsuel === 'accepté';
              const payeOk = formData.payeClient;
              const steps = [];
              if (cqOk) steps.push('CQ ✓');
              if (finOk) steps.push('Banque ✓');
              if (poseOk) steps.push('Pose ✓');
              if (consuelOk) steps.push('Consuel ✓');
              if (payeOk) steps.push('Payé ✓');
              return steps.length > 0 ? `▶️ ${steps.join(' · ')}` : '▶️ Pas encore commencé — clique pour ouvrir';
            })()}
          >
            {/* ============ ÉTAPE 1 : CONTRÔLE QUALITÉ ============ */}
            <div className={`border-2 rounded-xl p-3 mb-3 ${formData.statutControleQualite === 'ok' ? 'bg-emerald-50 border-emerald-200' : formData.statutControleQualite === 'pas_ok' ? 'bg-rose-50 border-rose-200' : 'bg-purple-50 border-purple-200'}`}>
              <button type="button" onClick={() => toggleStep('cq')} className={`w-full text-[11px] font-bold text-purple-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.cq ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-purple-600 text-[9px]">{foldedSteps.cq ? '▶' : '▼'}</span>
                  <span>1️⃣ 📋 Contrôle qualité (avant envoi banque)</span>
                </span>
                {formData.statutControleQualite && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutControleQualite === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutControleQualite === 'pas_ok' ? 'bg-rose-100 text-rose-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {formData.statutControleQualite === 'ok' ? '✓ Validé' : '✗ Refusé'}
                  </span>
                )}
              </button>

              {!foldedSteps.cq && (<>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">📞 Date contrôle qualité (appel client)</label>
                <div className="flex gap-1">
                  <input type="date" value={formData.dateControleQualite || ''} onChange={(e) => setFormData({ ...formData, dateControleQualite: e.target.value })} className={inputCls} />
                  <button type="button" onClick={() => setFormData({ ...formData, dateControleQualite: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">💳 Crédits / leasings en cours annoncés par le client</label>
                {(formData.creditsClientCQ || []).map((c, idx) => (
                  <div key={idx} className="flex items-center gap-1 mb-1">
                    <select
                      value={c.type || 'conso'}
                      onChange={(e) => {
                        const next = [...(formData.creditsClientCQ || [])];
                        next[idx] = { ...next[idx], type: e.target.value };
                        setFormData({ ...formData, creditsClientCQ: next });
                      }}
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
                    >
                      {CREDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="€"
                      value={c.montant || ''}
                      onChange={(e) => {
                        const next = [...(formData.creditsClientCQ || [])];
                        next[idx] = { ...next[idx], montant: e.target.value };
                        setFormData({ ...formData, creditsClientCQ: next });
                      }}
                      className="flex-shrink-0 w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (formData.creditsClientCQ || []).filter((_, i) => i !== idx);
                        setFormData({ ...formData, creditsClientCQ: next });
                      }}
                      className="flex-shrink-0 px-2 py-1 text-rose-500 hover:bg-rose-50 rounded text-sm font-bold"
                      title="Supprimer ce crédit"
                    >✕</button>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, creditsClientCQ: [...(formData.creditsClientCQ || []), { type: 'conso', montant: '' }] })}
                    className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-[10px] font-bold"
                  >+ Ajouter un crédit</button>
                  {(formData.creditsClientCQ || []).length > 0 && (
                    <span className="text-[10px] text-purple-700 font-bold">
                      Total : {(formData.creditsClientCQ || []).reduce((s, c) => s + (parseFloat(c.montant) || 0), 0).toLocaleString('fr-FR')} €
                    </span>
                  )}
                </div>
              </div>

              {/* Les boutons d'appel ONOFF sont volontairement absents du formulaire
                  d'édition : on passe les appels depuis la QuickView (panel latéral)
                  pour ne pas alourdir cette modale. */}

              {/* 3 boutons toggleables — toujours visibles */}
              <div className="mt-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Décision sur le dossier (clique pour changer)</div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setFormData({ ...formData, statutControleQualite: '' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${!formData.statutControleQualite ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ En attente</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutControleQualite: 'ok', dateControleQualite: formData.dateControleQualite || today });
                  }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutControleQualite === 'ok' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Validé</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutControleQualite: 'pas_ok', dateControleQualite: formData.dateControleQualite || today });
                  }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutControleQualite === 'pas_ok' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                </div>
              </div>

              {formData.statutControleQualite === 'ok' && !formData.dateEnvoiFin && (
                <div className="mt-2 p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-[11px] text-emerald-800 font-bold">
                  ✅ Validé — la secrétaire peut envoyer le dossier à la banque (étape 2 ci-dessous)
                </div>
              )}
              {formData.statutControleQualite === 'pas_ok' && (
                <div className="mt-2 p-2 bg-rose-100 border border-rose-300 rounded-lg text-[11px] text-rose-800 font-bold">
                  ✗ Dossier refusé — ne pas envoyer en banque
                </div>
              )}

              {/* 🎤 Vocal du contrôle qualité — fichier téléversé OU lien externe (ONOFF/Drive). */}
              <div className="mt-3 p-2 bg-white border border-purple-200 rounded-lg">
                <label className="block text-[11px] font-semibold text-purple-700 mb-1.5 flex items-center justify-between flex-wrap gap-1">
                  <span className="flex items-center gap-1">
                    🎤 Vocal du contrôle qualité
                    {formData.vocalCQStoragePath && (
                      <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">📁 Fichier</span>
                    )}
                    {!formData.vocalCQStoragePath && formData.onoffCallMeta && (
                      <span className="text-[9px] font-bold uppercase bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">📞 ONOFF</span>
                    )}
                  </span>
                  {!formData.vocalCQStoragePath && formData.vocalCQUrl && isSafeMediaUrl(formData.vocalCQUrl) && (
                    <a href={formData.vocalCQUrl} download className="text-[10px] font-bold text-purple-600 hover:underline">⬇️ Télécharger</a>
                  )}
                </label>

                <VocalCqAudio storagePath={formData.vocalCQStoragePath} fallbackUrl={formData.vocalCQUrl} />

                {formData.vocalCQStoragePath && formData.onoffCallMeta && (
                  <div className="text-[10px] text-slate-600 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {formData.onoffCallMeta.callStarted && <span>📅 {new Date(formData.onoffCallMeta.callStarted).toLocaleString('fr-FR')}</span>}
                    {formData.onoffCallMeta.callDuration > 0 && <span>⏱ {formatDurationMmSs(formData.onoffCallMeta.callDuration)}</span>}
                    {formData.onoffCallMeta.onoffUserName && <span>👤 {formData.onoffCallMeta.onoffUserName}</span>}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <UploadVocalCqButton
                    onUploaded={(path) => setFormData({ ...formData, vocalCQStoragePath: path, vocalCQUrl: '' })}
                    label={formData.vocalCQStoragePath ? '🔄 Remplacer le fichier' : '📤 Téléverser un fichier audio'}
                  />
                  {(formData.vocalCQStoragePath || formData.vocalCQUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Supprimer le vocal de ce dossier ?')) {
                          setFormData({ ...formData, vocalCQStoragePath: '', vocalCQUrl: '' });
                        }
                      }}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-bold"
                    >🗑️ Supprimer</button>
                  )}
                </div>

                <details className="mt-2">
                  <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-purple-600">🔗 Ou coller un lien externe (ONOFF / Drive…)</summary>
                  <input
                    type="url"
                    value={formData.vocalCQUrl}
                    onChange={(e) => setFormData({ ...formData, vocalCQUrl: e.target.value, vocalCQStoragePath: e.target.value ? '' : formData.vocalCQStoragePath })}
                    placeholder="https://..."
                    className={inputCls + ' mt-1.5'}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">💡 Quand l'appel passera par ONOFF, l'enregistrement viendra ici tout seul.</p>
                </details>
              </div>
              </>)}
            </div>

            {/* ============ ÉTAPE 1bis : MAIRIE (déclaration préalable) ============ */}
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3 mb-3">
              <button type="button" onClick={() => toggleStep('mairie')} className={`w-full text-[11px] font-bold text-indigo-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.mairie ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-indigo-600 text-[9px]">{foldedSteps.mairie ? '▶' : '▼'}</span>
                  <span>🏛️ Mairie (déclaration préalable / urbanisme)</span>
                </span>
                {(formData.statutMairie || formData.dateEnvoiMairie) && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutMairie === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutMairie === 'refusé' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {formData.statutMairie === 'accepté' ? '✓ Accepté' :
                     formData.statutMairie === 'refusé' ? '✗ Refusé' : '⏳ Envoyé'}
                  </span>
                )}
              </button>

              {!foldedSteps.mairie && (<>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📤 Envoi mairie</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateEnvoiMairie || ''} onChange={(e) => setFormData({ ...formData, dateEnvoiMairie: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateEnvoiMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📨 Récépissé reçu</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateRecepisseMairie || ''} onChange={(e) => setFormData({ ...formData, dateRecepisseMairie: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateRecepisseMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">✅ Accord reçu</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateAccordMairie || ''} onChange={(e) => setFormData({ ...formData, dateAccordMairie: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateAccordMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* Upload du PDF récépissé — comme une facture prestataire */}
              <div className="mt-3 p-2 bg-white border border-indigo-200 rounded-lg">
                <div className="text-[10px] font-semibold text-indigo-700 uppercase mb-1.5">📎 Récépissé de dépôt (PDF)</div>
                <FactureFileInput
                  fileId={formData.recepisseMairieFileId || ''}
                  onChange={(id) => setFormData({ ...formData, recepisseMairieFileId: id })}
                  color="indigo"
                  label="récépissé mairie"
                />
              </div>

              {formData.dateEnvoiMairie && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Décision mairie (clique pour changer)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setFormData({ ...formData, statutMairie: '' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${!formData.statutMairie ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ En attente</button>
                    <button type="button" onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setFormData({ ...formData, statutMairie: 'accepté', dateAccordMairie: formData.dateAccordMairie || today });
                    }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutMairie === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Accepté</button>
                    <button type="button" onClick={() => setFormData({ ...formData, statutMairie: 'refusé' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutMairie === 'refusé' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                  </div>
                </div>
              )}

              {formData.statutMairie === 'refusé' && (
                <div className="mt-2 p-2 bg-rose-100 border border-rose-300 rounded-lg text-[11px] text-rose-800 font-bold">
                  ✗ Refusé — modifie le projet puis renvoie la déclaration (le dossier reste en alerte 🏛️ jusqu'à acceptation).
                </div>
              )}
              {formData.statutMairie === 'accepté' && (
                <div className="mt-2 p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-[11px] text-emerald-800 font-bold">
                  ✅ Mairie accordée — tu peux poser.
                </div>
              )}

              {/* Historique des envois — utile si plusieurs aller-retours mairie */}
              <div className="mt-3 p-2 bg-white border border-indigo-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase">📋 Historique envois ({(formData.envoisMairie || []).length})</span>
                  <button type="button" onClick={() => {
                    setFormData({
                      ...formData,
                      envoisMairie: [...(formData.envoisMairie || []), { dateEnvoi: '', dateRecepisse: '', recepisseFileId: '', dateReponse: '', resultat: '', note: '' }]
                    });
                  }} className="px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-[10px] font-bold flex items-center gap-1">
                    <Plus className="w-3 h-3" />Ajouter un envoi
                  </button>
                </div>
                {(!formData.envoisMairie || formData.envoisMairie.length === 0) && (
                  <div className="text-[11px] text-slate-400 italic text-center py-2">
                    Aucun envoi enregistré. Utilise les dates ci-dessus pour le 1er envoi, puis ajoute ici les renvois si refusé.
                  </div>
                )}
                <div className="space-y-2">
                  {(formData.envoisMairie || []).map((e, idx) => {
                    const updE = (u) => {
                      const list = [...formData.envoisMairie];
                      list[idx] = { ...list[idx], ...u };
                      setFormData({ ...formData, envoisMairie: list });
                    };
                    const rmE = () => setFormData({ ...formData, envoisMairie: formData.envoisMairie.filter((_, i) => i !== idx) });
                    const bg = e.resultat === 'accepté' ? 'bg-emerald-50 border-emerald-300' : e.resultat === 'refusé' ? 'bg-rose-50 border-rose-300' : 'bg-indigo-50 border-indigo-200';
                    return (
                      <div key={idx} className={`p-2 rounded-lg border-2 ${bg}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-700">Envoi n°{idx + 1}</span>
                          <button type="button" onClick={rmE} className="px-2 py-1 bg-rose-100 hover:bg-rose-500 text-rose-600 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1" title="Supprimer">
                            <Trash2 className="w-3 h-3" /><span>Suppr.</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">Date envoi</label>
                            <div className="flex gap-1">
                              <input type="date" value={e.dateEnvoi || ''} onChange={(ev) => updE({ dateEnvoi: ev.target.value })} className={inputCls} />
                              <button type="button" onClick={() => updE({ dateEnvoi: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">Date récépissé</label>
                            <div className="flex gap-1">
                              <input type="date" value={e.dateRecepisse || ''} onChange={(ev) => updE({ dateRecepisse: ev.target.value })} className={inputCls} />
                              <button type="button" onClick={() => updE({ dateRecepisse: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">Date réponse</label>
                            <div className="flex gap-1">
                              <input type="date" value={e.dateReponse || ''} onChange={(ev) => updE({ dateReponse: ev.target.value })} className={inputCls} />
                              <button type="button" onClick={() => updE({ dateReponse: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                            </div>
                          </div>
                        </div>
                        <div className="mb-2">
                          <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">📎 Récépissé (PDF)</label>
                          <FactureFileInput
                            fileId={e.recepisseFileId || ''}
                            onChange={(id) => updE({ recepisseFileId: id })}
                            color="indigo"
                            label="récépissé mairie"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1 mb-2">
                          <button type="button" onClick={() => updE({ resultat: 'accepté' })} className={`px-2 py-1 rounded text-[10px] font-bold border ${e.resultat === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-white text-emerald-600 border-emerald-200'}`}>✓ Accepté</button>
                          <button type="button" onClick={() => updE({ resultat: 'refusé' })} className={`px-2 py-1 rounded text-[10px] font-bold border ${e.resultat === 'refusé' ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'}`}>✗ Refusé</button>
                        </div>
                        <input type="text" value={e.note || ''} onChange={(ev) => updE({ note: ev.target.value })} placeholder="Note (motif refus, modif demandée…)" className={inputCls} />
                      </div>
                    );
                  })}
                </div>
              </div>
              </>)}
            </div>

            {/* ============ ÉTAPE 2 : FINANCEMENT ============ */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 mb-3">
              <button type="button" onClick={() => toggleStep('financement')} className={`w-full text-[11px] font-bold text-blue-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.financement ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-blue-600 text-[9px]">{foldedSteps.financement ? '▶' : '▼'}</span>
                  <span>2️⃣ 💳 Financement — {formData.financement || '(à choisir)'}</span>
                </span>
                {formData.statutFin && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutFin === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutFin === 'refusé' ? 'bg-rose-100 text-rose-700' :
                    formData.statutFin === 'manque_doc' ? 'bg-orange-100 text-orange-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {formData.statutFin === 'accepté' ? '✓ Accepté' :
                     formData.statutFin === 'refusé' ? '✗ Refusé' :
                     formData.statutFin === 'manque_doc' ? '📄 Manque docs' : '⏳ Envoyé'}
                  </span>
                )}
              </button>

              {!foldedSteps.financement && (<>
              {formData.envoisHistorique && formData.envoisHistorique.length > 0 && (
                <div className="mb-2 p-2 bg-white border border-rose-200 rounded-lg">
                  <div className="text-[10px] font-bold text-rose-700 uppercase mb-1.5">📜 Banques précédentes ({formData.envoisHistorique.length})</div>
                  <div className="space-y-1.5">
                    {formData.envoisHistorique.map((env, i) => {
                      const fr = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return d; } };
                      return (
                        <div key={i} className="text-[11px] bg-rose-50/70 border border-rose-100 rounded-lg px-2 py-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-700">{env.financeur || '(banque)'}</span>
                            <span className="text-rose-600 font-semibold">✗ refusé</span>
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-slate-500 mt-0.5">
                            {fr(env.dateEnvoi) && <span>📤 envoyé {fr(env.dateEnvoi)}</span>}
                            {fr(env.dateRetour) && <span>📥 retour {fr(env.dateRetour)}</span>}
                            {fr(env.dateAccord) && <span>✅ accord {fr(env.dateAccord)}</span>}
                            {fr(env.dateRenvoiDocs) && <span>↩️ docs renvoyés {fr(env.dateRenvoiDocs)}</span>}
                          </div>
                          {env.motifManqueDoc && <div className="text-[10px] text-slate-500 italic mt-0.5">📄 Docs demandés : {env.motifManqueDoc}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📤 Envoi banque</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateEnvoiFin || ''} onChange={(e) => setFormData({ ...formData, dateEnvoiFin: e.target.value, statutFin: e.target.value && !formData.statutFin ? 'envoyé' : formData.statutFin })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateEnvoiFin: new Date().toISOString().split('T')[0], statutFin: formData.statutFin || 'envoyé' })} className="flex-shrink-0 px-2 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📥 Retour banque</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateRetourFin || ''} onChange={(e) => setFormData({ ...formData, dateRetourFin: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateRetourFin: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">✅ Accord banque</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateAccord || ''} onChange={(e) => setFormData({ ...formData, dateAccord: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateAccord: new Date().toISOString().split('T')[0], statutFin: 'accepté' })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* Statut banque — toujours visible. Chaque bouton remplit
                  les dates manquantes pour zéro friction (voir QuickViewPanel
                  pour la même logique). */}
              <div className="mt-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Statut banque (clique pour changer)</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutFin: 'envoyé', dateEnvoiFin: formData.dateEnvoiFin || today, dateRetourFin: '', dateAccord: '' });
                  }} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutFin === 'envoyé' || !formData.statutFin ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Envoyé</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutFin: 'manque_doc', dateEnvoiFin: formData.dateEnvoiFin || today, dateRetourFin: formData.dateRetourFin || today });
                  }} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutFin === 'manque_doc' ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'}`}>📄 Manque docs</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutFin: 'accepté', dateEnvoiFin: formData.dateEnvoiFin || today, dateRetourFin: formData.dateRetourFin || today, dateAccord: formData.dateAccord || today });
                  }} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutFin === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Accepté</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutFin: 'refusé', dateEnvoiFin: formData.dateEnvoiFin || today, dateRetourFin: formData.dateRetourFin || today });
                  }} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutFin === 'refusé' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                </div>
                {formData.statutFin === 'manque_doc' && (
                  <div className="mt-3 p-3 bg-orange-50 border-2 border-orange-300 rounded-xl space-y-3">
                    {/* Étape 1 : ce que la banque demande */}
                    <div>
                      <div className="text-xs font-bold text-orange-700 mb-1.5">1️⃣ 📄 {formData.financement || 'La banque'} demande :</div>
                      <textarea
                        value={formData.motifManqueDoc || ''}
                        onChange={(e) => setFormData({ ...formData, motifManqueDoc: e.target.value })}
                        placeholder="Ex : Bulletin de paie de mars, RIB, justificatif domicile…"
                        rows={2}
                        className={inputCls + ' text-xs'}
                      />
                    </div>

                    {/* Étape 2 : régie prévenue */}
                    <div>
                      <label className="block text-[11px] font-bold text-orange-700 mb-1">2️⃣ 🤝 Régie prévenue le</label>
                      <div className="flex gap-1">
                        <input type="date" value={formData.dateNotifRegie || ''} onChange={(e) => setFormData({ ...formData, dateNotifRegie: e.target.value })} className={inputCls + ' text-xs'} />
                        <button type="button" onClick={() => setFormData({ ...formData, dateNotifRegie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                      <p className="text-[10px] text-orange-700/80 mt-1">→ La régie doit ensuite récupérer le(s) doc(s) auprès du client.</p>
                    </div>

                    {/* Étape 3 : docs reçus de la régie */}
                    <div>
                      <label className="block text-[11px] font-bold text-orange-700 mb-1">3️⃣ 📥 Docs reçus de la régie le</label>
                      <div className="flex gap-1">
                        <input type="date" value={formData.dateRecuRegie || ''} onChange={(e) => setFormData({ ...formData, dateRecuRegie: e.target.value })} className={inputCls + ' text-xs'} />
                        <button type="button" onClick={() => setFormData({ ...formData, dateRecuRegie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>

                    {/* Étape 4 : renvoi à la banque */}
                    <div>
                      <label className="block text-[11px] font-bold text-orange-700 mb-1">4️⃣ 📤 Docs renvoyés à {formData.financement || 'la banque'} le</label>
                      <div className="flex gap-1">
                        <input type="date" value={formData.dateRenvoiDocs || ''} onChange={(e) => setFormData({ ...formData, dateRenvoiDocs: e.target.value })} className={inputCls + ' text-xs'} />
                        <button type="button" onClick={() => setFormData({ ...formData, dateRenvoiDocs: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>

                    {/* CTA final : repasser en Envoyé */}
                    {formData.dateRenvoiDocs && (
                      <div className="flex items-center justify-between gap-2 p-2 bg-amber-50 border border-amber-300 rounded-lg">
                        <span className="text-[11px] text-amber-800">✅ Renvoyé le {new Date(formData.dateRenvoiDocs).toLocaleDateString('fr-FR')} — passe le statut à ⏳ Envoyé</span>
                        <button type="button" onClick={() => {
                          setFormData({ ...formData, statutFin: 'envoyé', dateEnvoiFin: formData.dateRenvoiDocs, dateRetourFin: '', dateAccord: '' });
                        }} className="flex-shrink-0 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold whitespace-nowrap">⏳ Envoyé</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bloc retiré : ancien bouton "Annuler décision" remplacé par les 3 boutons toggleables ci-dessus */}

              {formData.statutFin === 'refusé' && (
                <div className="mt-3 p-3 bg-rose-50 border-2 border-rose-300 rounded-xl">
                  <div className="text-xs font-bold text-rose-700 mb-2">⚠️ Refusé par {formData.financement} → renvoyer chez :</div>
                  <select onChange={(e) => {
                    const newFin = e.target.value;
                    if (!newFin) return;
                    const today = new Date().toISOString().split('T')[0];
                    // Archive complète de la banque qui a refusé : toutes ses
                    // dates + le manque doc éventuel, pour garder une trace
                    // datée par maison de financement (cf. "Banques précédentes").
                    const archive = {
                      financeur: formData.financement,
                      dateEnvoi: formData.dateEnvoiFin || '',
                      dateRetour: formData.dateRetourFin || '',
                      dateAccord: formData.dateAccord || '',
                      statut: 'refusé',
                      motifManqueDoc: formData.motifManqueDoc || '',
                      dateRenvoiDocs: formData.dateRenvoiDocs || '',
                      note: '',
                    };
                    setFormData({
                      ...formData,
                      envoisHistorique: [...(formData.envoisHistorique || []), archive],
                      financement: newFin,
                      // Reset COMPLET du cycle financement : la nouvelle banque
                      // recommence à zéro (envoi → retour → manque doc → accord).
                      // Sans ça, les dates de l'ancienne banque restaient affichées.
                      dateEnvoiFin: today,
                      dateRetourFin: '',
                      dateAccord: '',
                      motifManqueDoc: '',
                      dateNotifRegie: '',
                      dateRecuRegie: '',
                      dateRenvoiDocs: '',
                      statutFin: 'envoyé',
                      statut: 'B1_EN_COURS_FINANCEMENT',
                    });
                  }} defaultValue="" className="w-full px-3 py-2 bg-white border-2 border-rose-300 rounded-xl text-sm font-bold text-rose-700">
                    <option value="">— Choisir une autre banque —</option>
                    {FINANCEMENTS.filter(f => f !== formData.financement).map(f => <option key={f} value={f}>📤 Renvoyer à {f}</option>)}
                  </select>
                </div>
              )}

              {formData.dateEnvoiFin && !formData.dateRetourFin && formData.statutFin === 'envoyé' && (() => {
                const jours = Math.floor((new Date() - new Date(formData.dateEnvoiFin)) / 86400000);
                if (jours <= 2) return <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-700">⏳ Envoyé il y a {jours} jour{jours > 1 ? 's' : ''} — en attente</div>;
                return <div className="mt-2 p-2 bg-rose-50 border border-rose-300 rounded-lg text-[11px] text-rose-700 font-bold">⚠️ Pas de retour depuis {jours} jours — relance la banque !</div>;
              })()}

              {/* État d'avancement du dossier — recalculé en direct depuis les
                  infos saisies. Quand on change le statut banque (ex : "Manque
                  docs"), on voit tout de suite vers quel statut workflow le
                  dossier va basculer. Il n'est figé qu'à l'enregistrement. */}
              {(() => {
                const effectif = applyAutoStatut(formData).statut || formData.statut || 'A_EN_COURS';
                const st = STATUTS.find(s => s.id === effectif);
                if (!st) return null;
                const changed = effectif !== (formData.statut || 'A_EN_COURS');
                return (
                  <div className="mt-3 p-2.5 bg-white border-2 border-blue-200 rounded-xl flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">État d'avancement</span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${st.color} text-white shadow-sm`}>
                      <span>{st.emoji}</span>{st.label}
                    </span>
                    <button type="button" onClick={() => setFormData({ ...formData, statutLocked: !formData.statutLocked })}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition ${formData.statutLocked ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      title={formData.statutLocked ? 'Statut verrouillé — clic pour repasser en calcul auto' : 'Statut en auto — clic pour figer le choix manuel'}>
                      {formData.statutLocked ? '🔒 Verrouillé' : '🔓 Auto'}
                    </button>
                    {!formData.statutLocked && changed && <span className="text-[10px] text-blue-600 font-semibold">↻ sera appliqué à l'enregistrement</span>}
                  </div>
                );
              })()}
              </>)}
            </div>

            {/* ============ ÉTAPE 2 : POSE ============ */}
            <div className={`border-2 rounded-xl p-3 mb-3 ${formData.statutPose === 'client_refuse' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-200'}`}>
              <button type="button" onClick={() => toggleStep('pose')} className={`w-full text-[11px] font-bold text-amber-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.pose ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-600 text-[9px]">{foldedSteps.pose ? '▶' : '▼'}</span>
                  <span>3️⃣ 🔧 Pose chez le client</span>
                </span>
                {formData.statutPose && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutPose === 'visite_ok' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutPose === 'client_refuse' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {formData.statutPose === 'visite_ok' ? '✓ Client OK' :
                     formData.statutPose === 'client_refuse' ? '✗ Client refuse' : '⏳ Visite prévue'}
                  </span>
                )}
              </button>

              {!foldedSteps.pose && (<>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📅 Date de pose</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateEnvoiPose || ''} onChange={(e) => setFormData({ ...formData, dateEnvoiPose: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateEnvoiPose: new Date().toISOString().split('T')[0], statutPose: formData.statutPose || 'envoyé' })} className="flex-shrink-0 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📞 Visite client</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateVisitePose || ''} onChange={(e) => setFormData({ ...formData, dateVisitePose: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateVisitePose: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">✅ Posé le</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateInsta || ''} onChange={(e) => setFormData({ ...formData, dateInsta: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateInsta: new Date().toISOString().split('T')[0], statutPose: 'visite_ok' })} className="flex-shrink-0 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* Boutons d'action visite */}
              {/* 3 boutons toggleables — toujours visibles */}
              <div className="mt-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Décision pose (clique pour changer)</div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setFormData({ ...formData, statutPose: 'envoyé' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${!formData.statutPose || formData.statutPose === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ En attente</button>
                  <button type="button" onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setFormData({ ...formData, statutPose: 'visite_ok', dateEnvoiPose: formData.dateEnvoiPose || today, dateInsta: formData.dateInsta || today });
                  }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutPose === 'visite_ok' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Posé</button>
                  <button type="button" onClick={() => setFormData({ ...formData, statutPose: 'client_refuse', statut: 'W2_ANNULER' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutPose === 'client_refuse' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Client refuse</button>
                </div>
              </div>

              {formData.statutPose === 'visite_ok' && formData.dateInsta && (
                <div className="mt-2 p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-[11px] text-emerald-800 font-bold">
                  ✅ Posé le {new Date(formData.dateInsta).toLocaleDateString('fr-FR')} — tu peux passer au Consuel
                </div>
              )}

              {formData.statutPose === 'client_refuse' && (
                <div className="mt-2 p-2 bg-rose-100 border border-rose-300 rounded-lg text-[11px] text-rose-700 font-bold">
                  ⚠️ Client a refusé la pose — dossier marqué ANNULÉ. Tu peux toujours revenir en arrière en cliquant un autre bouton.
                </div>
              )}
              </>)}
            </div>

            {/* ============ ÉTAPE 3 : CONSUEL ============ */}
            <div className="bg-cyan-50 border-2 border-cyan-200 rounded-xl p-3 mb-3">
              <button type="button" onClick={() => toggleStep('consuel')} className={`w-full text-[11px] font-bold text-cyan-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.consuel ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-cyan-600 text-[9px]">{foldedSteps.consuel ? '▶' : '▼'}</span>
                  <span>4️⃣ ⚡ Consuel (certificat conformité)</span>
                </span>
                {formData.statutConsuel && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutConsuel === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutConsuel === 'visite' ? 'bg-sky-100 text-sky-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {formData.statutConsuel === 'accepté' ? '✓ Visé' :
                     formData.statutConsuel === 'visite' ? '🔍 Visite demandée' : '⏳ Envoyé'}
                  </span>
                )}
              </button>

              {!foldedSteps.consuel && (<>
              {/* Envoi + Accord (= reçu) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📤 Envoi Consuel</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateEnvoiConsuel || ''} onChange={(e) => setFormData({ ...formData, dateEnvoiConsuel: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateEnvoiConsuel: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">✅ Accord reçu</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateConsuel || ''} onChange={(e) => setFormData({ ...formData, dateConsuel: e.target.value, consuel: !!e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateConsuel: new Date().toISOString().split('T')[0], consuel: true })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* 3 boutons toggleables — toujours visibles */}
              {formData.dateEnvoiConsuel && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Retour du Consuel (clique pour changer)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setFormData({ ...formData, statutConsuel: '' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${!formData.statutConsuel || formData.statutConsuel === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ En attente</button>
                    <button type="button" onClick={() => setFormData({ ...formData, statutConsuel: 'visite' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutConsuel === 'visite' ? 'bg-sky-500 text-white border-sky-600 shadow-md' : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'}`}>🔍 Visite demandée</button>
                    <button type="button" onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setFormData({ ...formData, statutConsuel: 'accepté', dateConsuel: formData.dateConsuel || today, consuel: true });
                    }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutConsuel === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Consuel visé</button>
                  </div>
                </div>
              )}

              {formData.statutConsuel === 'accepté' && !formData.dateControleLivraison && (
                <div className="mt-2 p-2 bg-emerald-100 border border-emerald-300 rounded-lg text-[11px] text-emerald-800 font-bold">
                  ✅ Consuel visé — appelle le client pour le contrôle livraison (étape 5 ci-dessous)
                </div>
              )}
              {formData.statutConsuel === 'visite' && (
                <div className="mt-2 p-2 bg-sky-50 border-2 border-sky-300 rounded-lg text-[11px] text-sky-800">
                  <div className="font-bold">🔍 Le Consuel demande une visite de conformité.</div>
                  <div className="text-[10px] text-sky-700/90 mt-0.5">→ Cale la date de visite ci-dessous, envoie ton poseur vérifier que tout est aux normes. Si la visite révèle un défaut → remets aux normes et ajoute une contre-visite, jusqu'à l'accord.</div>
                </div>
              )}

              {/* Visites Consuel — peuvent être plusieurs (visite + contre-visites) */}
              <div className="mt-3 p-2 bg-white border border-cyan-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-cyan-700 uppercase">🔍 Visites Consuel ({(formData.visitesConsuel || []).length})</span>
                  <button type="button" onClick={() => {
                    const isFirst = !formData.visitesConsuel || formData.visitesConsuel.length === 0;
                    setFormData({
                      ...formData,
                      visitesConsuel: [...(formData.visitesConsuel || []), { date: '', resultat: '', note: '', type: isFirst ? 'visite' : 'contre_visite' }]
                    });
                  }} className="px-2 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-[10px] font-bold flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    {(formData.visitesConsuel || []).length === 0 ? 'Ajouter une visite' : 'Ajouter une contre-visite'}
                  </button>
                </div>

                {(!formData.visitesConsuel || formData.visitesConsuel.length === 0) && (
                  <div className="text-[11px] text-slate-400 italic text-center py-2">
                    Aucune visite enregistrée. L'accord peut être donné sans visite.
                  </div>
                )}

                <div className="space-y-2">
                  {(formData.visitesConsuel || []).map((v, idx) => {
                    const isFirst = idx === 0;
                    const updateV = (updates) => {
                      const list = [...formData.visitesConsuel];
                      list[idx] = { ...list[idx], ...updates };
                      setFormData({ ...formData, visitesConsuel: list });
                    };
                    // Le résultat de la DERNIÈRE visite pilote le statut Consuel :
                    // dernière visite OK → Consuel visé ; sinon → visite demandée.
                    const setResultat = (resultat) => {
                      const list = [...formData.visitesConsuel];
                      list[idx] = { ...list[idx], resultat };
                      const last = list[list.length - 1];
                      const patch = { visitesConsuel: list };
                      if (last.resultat === 'ok') {
                        patch.statutConsuel = 'accepté';
                        patch.dateConsuel = formData.dateConsuel || last.date || new Date().toISOString().split('T')[0];
                        patch.consuel = true;
                      } else {
                        patch.statutConsuel = 'visite';
                      }
                      setFormData({ ...formData, ...patch });
                    };
                    const removeV = () => {
                      setFormData({ ...formData, visitesConsuel: formData.visitesConsuel.filter((_, i) => i !== idx) });
                    };
                    const bgCls = v.resultat === 'ok' ? 'bg-emerald-50 border-emerald-300' :
                                  v.resultat === 'a_corriger' ? 'bg-rose-50 border-rose-300' :
                                  'bg-cyan-50 border-cyan-200';
                    return (
                      <div key={idx} className={`p-2 rounded-lg border-2 ${bgCls}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-700">
                            {isFirst ? '🔍 Visite initiale' : `🔄 Contre-visite n°${idx}`}
                          </span>
                          <button type="button" onClick={removeV} className="px-2 py-1 bg-rose-100 hover:bg-rose-500 text-rose-600 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1" title="Supprimer cette visite">
                            <Trash2 className="w-3 h-3" />
                            <span>Supprimer</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">Date visite</label>
                            <div className="flex gap-1">
                              <input type="date" value={v.date || ''} onChange={(e) => updateV({ date: e.target.value })} className={inputCls} />
                              <button type="button" onClick={() => updateV({ date: new Date().toISOString().split('T')[0] })} className="px-1.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-500 mb-0.5">Résultat</label>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => setResultat('ok')} className={`flex-1 px-2 py-1 rounded text-[10px] font-bold ${v.resultat === 'ok' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100'}`}>✓ OK</button>
                              <button type="button" onClick={() => setResultat('a_corriger')} className={`flex-1 px-2 py-1 rounded text-[10px] font-bold ${v.resultat === 'a_corriger' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-rose-100'}`}>✗ À corriger</button>
                            </div>
                          </div>
                        </div>
                        <input type="text" value={v.note || ''} onChange={(e) => updateV({ note: e.target.value })} placeholder="Note / remarques (ex: chemin de câble à refaire)" className={inputCls + ' text-[11px]'} />
                        {v.resultat === 'a_corriger' && idx === formData.visitesConsuel.length - 1 && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-300 rounded-lg space-y-1.5">
                            <div className="text-[10px] text-amber-800 font-bold">🔧 À corriger — fais la mise aux normes, puis programme la contre-visite à la nouvelle date communiquée par le Consuel.</div>
                            <div>
                              <label className="block text-[9px] font-semibold text-amber-700 mb-0.5">📅 Date de la contre-visite</label>
                              <div className="flex gap-1">
                                <input type="date" value="" onChange={(e) => {
                                  if (!e.target.value) return;
                                  setFormData({ ...formData, visitesConsuel: [...formData.visitesConsuel, { date: e.target.value, resultat: '', note: '', type: 'contre_visite' }] });
                                }} className={inputCls} />
                                <button type="button" onClick={() => {
                                  setFormData({ ...formData, visitesConsuel: [...formData.visitesConsuel, { date: '', resultat: '', note: '', type: 'contre_visite' }] });
                                }} className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Pas encore</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              </>)}
            </div>

            {/* ============ ÉTAPE 3bis : RACCORDEMENT ENEDIS ============ */}
            <div className="bg-sky-50 border-2 border-sky-200 rounded-xl p-3 mb-3">
              <button type="button" onClick={() => toggleStep('raccordement')} className={`w-full text-[11px] font-bold text-sky-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.raccordement ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-sky-600 text-[9px]">{foldedSteps.raccordement ? '▶' : '▼'}</span>
                  <span>🔌 Raccordement (Enedis)</span>
                </span>
                {formData.statutRaccordement && (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    formData.statutRaccordement === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                    formData.statutRaccordement === 'refusé' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {formData.statutRaccordement === 'accepté' ? '✓ Accepté' :
                     formData.statutRaccordement === 'refusé' ? '✗ Refusé' : '⏳ Envoyé'}
                  </span>
                )}
              </button>

              {!foldedSteps.raccordement && (<>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📤 Demande envoyée</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateEnvoiRaccordement || ''} onChange={(e) => setFormData({ ...formData, dateEnvoiRaccordement: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateEnvoiRaccordement: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">✅ Raccordement effectué</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateAccordRaccordement || ''} onChange={(e) => setFormData({ ...formData, dateAccordRaccordement: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateAccordRaccordement: new Date().toISOString().split('T')[0], statutRaccordement: 'accepté' })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {formData.dateEnvoiRaccordement && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Statut raccordement (clique pour changer)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setFormData({ ...formData, statutRaccordement: '' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${!formData.statutRaccordement || formData.statutRaccordement === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ En attente</button>
                    <button type="button" onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setFormData({ ...formData, statutRaccordement: 'accepté', dateAccordRaccordement: formData.dateAccordRaccordement || today });
                    }} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutRaccordement === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Accepté</button>
                    <button type="button" onClick={() => setFormData({ ...formData, statutRaccordement: 'refusé' })} className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition-all ${formData.statutRaccordement === 'refusé' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                  </div>
                </div>
              )}
              </>)}
            </div>

            {/* ============ ÉTAPE 4 : SUIVI PAIEMENT ============ */}
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3">
              <button type="button" onClick={() => toggleStep('paiement')} className={`w-full text-[11px] font-bold text-emerald-700 uppercase flex items-center justify-between flex-wrap gap-2 hover:opacity-80 ${foldedSteps.paiement ? '' : 'mb-2'}`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-[9px]">{foldedSteps.paiement ? '▶' : '▼'}</span>
                  <span>5️⃣ 💰 Contrôle &amp; paiement</span>
                </span>
                {formData.payeClient && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">✓ Payé</span>
                )}
              </button>

              {!foldedSteps.paiement && (<>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📞 Contrôle livraison (toi → client)</label>
                  {(() => {
                    const { bloque, manquants } = controleLivraisonBlocage(formData);
                    const verrou = bloque && !formData.dateControleLivraison;
                    return (<>
                      <div className="flex gap-1">
                        <input type="date" disabled={verrou} value={formData.dateControleLivraison || ''} onChange={(e) => setFormData({ ...formData, dateControleLivraison: e.target.value })} className={`${inputCls}${verrou ? ' opacity-50 cursor-not-allowed bg-slate-100' : ''}`} />
                        <button type="button" disabled={verrou} onClick={() => setFormData({ ...formData, dateControleLivraison: new Date().toISOString().split('T')[0] })} className={`flex-shrink-0 px-2 py-1 rounded-xl text-[10px] font-bold whitespace-nowrap ${verrou ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'}`}>Auj.</button>
                      </div>
                      {verrou && (
                        <div className="mt-1 px-2 py-1.5 bg-rose-50 border border-rose-300 rounded-lg text-[10px] text-rose-800 leading-snug">
                          🔒 <span className="font-bold">Contrôle livraison bloqué</span> — il manque : {manquants.join(' · ')}.
                        </div>
                      )}
                    </>);
                  })()}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">📞 Appel banque (banque → client)</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.dateAppelBanque || ''} onChange={(e) => setFormData({ ...formData, dateAppelBanque: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => setFormData({ ...formData, dateAppelBanque: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">💰 Paiement reçu</label>
                  <div className="flex gap-1">
                    <input type="date" value={formData.datePaiementBanque || ''} onChange={(e) => setFormData({ ...formData, datePaiementBanque: e.target.value })} className={inputCls} />
                    <button type="button" onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setFormData({
                        ...formData,
                        datePaiementBanque: today,
                        payeClient: true,
                        payeClientDate: formData.payeClientDate || today,
                        statut: 'W_DOSSIER_PAYER',
                      });
                    }} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>
              </>)}
            </div>
          </Section>

          <Section
            title="📊 Statut du dossier"
            color="pink"
            collapsible={true}
            defaultCollapsed={!editingId}
            summary={(() => {
              const cur = STATUTS.find(s => s.id === formData.statut);
              return cur ? `▶️ ${cur.emoji} ${cur.label}` : '▶️ Pas de statut particulier';
            })()}
          >
            {(() => {
              const cur = STATUTS_ORDERED.find(s => s.id === formData.statut);
              return (
                <div className="space-y-2">
                  <div className="relative">
                    <select value={formData.statut} onChange={(e) => setFormData({ ...formData, statut: e.target.value, statutLocked: true })} className={`w-full ${inputCls} pl-12 font-bold text-base appearance-none cursor-pointer`}>
                      {STATUTS_ORDERED.filter(s => !s.legacy || s.id === formData.statut).map(s => (
                        <option key={s.id} value={s.id}>{s.emoji}  {s.label}</option>
                      ))}
                    </select>
                    {/* Badge coloré à gauche pour le statut sélectionné */}
                    {cur && (
                      <div className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-8 rounded-lg flex items-center justify-center text-base bg-gradient-to-br ${cur.color} text-white shadow-sm pointer-events-none`}>
                        {cur.emoji}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* BARRE D'ACTIVITÉ — toujours visible */}
            {(() => {
              const fmtRel = (iso) => {
                if (!iso) return '';
                try {
                  const date = new Date(iso);
                  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                  if (days === 0) return `auj. à ${time}`;
                  if (days === 1) return `hier à ${time}`;
                  if (days < 7) return `il y a ${days}j à ${time}`;
                  if (days < 30) return `il y a ${Math.floor(days / 7)}sem à ${time}`;
                  return `${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })} à ${time}`;
                } catch (e) { return ''; }
              };
              const lastHist = (formData.historique || []).slice(-1)[0];
              const lastModBy = formData.modifiedBy && formData.modifiedBy !== formData.createdBy ? formData.modifiedBy : null;
              const histCount = (formData.historique || []).length;
              const hasActivity = formData.createdBy || formData.modifiedBy || (formData.historique && formData.historique.length > 0);

              return (
                <div className="mt-3 p-3 bg-white border-2 border-pink-200 rounded-xl">
                  <div className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center justify-between flex-wrap gap-1">
                    <span>📜 Activité du dossier</span>
                    <span className="text-slate-500 font-normal normal-case text-[10px]">
                      {!editingId ? '🆕 Nouveau dossier' : `${histCount} évènement${histCount > 1 ? 's' : ''} enregistré${histCount > 1 ? 's' : ''}`}
                    </span>
                  </div>

                  {/* Cas 1 : nouveau dossier (création) */}
                  {!editingId && (
                    <div className="text-xs text-slate-600 leading-relaxed">
                      💡 À l'enregistrement, ce dossier sera tagué <strong className="text-violet-600">👤 créé par : <span className="text-cyan-700">{currentUser || '(anonyme)'}</span></strong>.
                      Les changements de statut seront ensuite tracés automatiquement.
                    </div>
                  )}

                  {/* Cas 2 : édition d'un ancien dossier sans activité tracée */}
                  {editingId && !hasActivity && (
                    <div className="text-xs text-slate-500 leading-relaxed">
                      ℹ️ <strong>Aucune activité tracée pour le moment.</strong> Ce dossier a probablement été créé avant que le suivi par utilisateur ne soit activé. Dès que tu enregistres une modification, l'activité commencera à être enregistrée.
                    </div>
                  )}

                  {/* Cas 3 : édition avec activité existante */}
                  {editingId && hasActivity && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      {formData.createdBy && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-semibold">
                          <span className="text-base leading-none">👤</span>
                          <span>Créé par <strong>{formData.createdBy}</strong></span>
                          {formData.createdAt && <span className="text-cyan-500 font-normal">· {fmtRel(formData.createdAt)}</span>}
                        </span>
                      )}
                      {lastModBy && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
                          <span className="text-base leading-none">✏️</span>
                          <span>Modif par <strong>{lastModBy}</strong></span>
                          {formData.modifiedAt && <span className="text-blue-500 font-normal">· {fmtRel(formData.modifiedAt)}</span>}
                        </span>
                      )}
                      {lastHist && lastHist.action === 'changement_statut' && lastHist.user && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                          <span className="text-base leading-none">🔄</span>
                          <span>Statut chgé par <strong>{lastHist.user}</strong></span>
                          {lastHist.date && <span className="text-amber-500 font-normal">· {fmtRel(lastHist.date)}</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </Section>

          {/* ⚖️ LITIGE & REMBOURSEMENT — visible uniquement si statut = LITIGE.
              Suit la même mécanique que les pénalités déplacement : la régie
              qui a apporté le dossier doit me rembourser ce que je rends
              au client. */}
          {formData.statut === 'C_LITIGE' && (
            <Section title="⚖️ Litige & remboursement client" color="rose">
              <div className="space-y-3">
                {/* Accord transactionnel — PDF */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">📎 Accord transactionnel signé (PDF)</label>
                  <FactureFileInput
                    fileId={formData.litigeAccordPdfUrl}
                    onChange={(id) => setFormData({ ...formData, litigeAccordPdfUrl: id })}
                    color="purple"
                  />
                </div>

                {/* Régie qui doit rembourser + montant */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">🤝 Régie qui doit rembourser</label>
                    <select
                      value={formData.litigeRegieNom}
                      onChange={(e) => setFormData({ ...formData, litigeRegieNom: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">— Aucune / non identifiée —</option>
                      {/* Régies déjà associées au dossier en premier */}
                      {(formData.regies || []).filter(r => r.nom).map((r, i) => (
                        <option key={`d-${i}`} value={r.nom}>{r.nom} (régie du dossier)</option>
                      ))}
                      {/* Puis le reste du catalogue */}
                      {(REGIES || []).filter(r => !(formData.regies || []).some(dr => dr.nom === r)).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">💸 Montant à me rembourser</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.litigeMontantRembourse}
                        onChange={(e) => setFormData({ ...formData, litigeMontantRembourse: e.target.value })}
                        placeholder="0,00"
                        className={inputCls + ' pr-8 font-bold text-rose-700'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                    </div>
                  </div>
                </div>

                {/* Toggle remboursement + date + N° facture */}
                <div className={`rounded-xl border-2 p-3 ${formData.litigeRegieRembourse ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-200'}`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={formData.litigeRegieRembourse}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          litigeRegieRembourse: checked,
                          litigeDateRembourse: checked && !formData.litigeDateRembourse
                            ? new Date().toISOString().split('T')[0]
                            : formData.litigeDateRembourse,
                        });
                      }}
                      className="w-5 h-5 rounded accent-emerald-500"
                    />
                    <span className={`text-sm font-bold ${formData.litigeRegieRembourse ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formData.litigeRegieRembourse ? '✅ La régie m\'a remboursé' : '⏳ En attente du remboursement de la régie'}
                    </span>
                  </label>
                  {formData.litigeRegieRembourse && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Date du remboursement</label>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={formData.litigeDateRembourse}
                            onChange={(e) => setFormData({ ...formData, litigeDateRembourse: e.target.value })}
                            className={inputCls}
                          />
                          <button type="button" onClick={() => setFormData({ ...formData, litigeDateRembourse: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">N° facture émise à la régie</label>
                        <input
                          type="text"
                          value={formData.litigeFactureNo}
                          onChange={(e) => setFormData({ ...formData, litigeFactureNo: e.target.value })}
                          placeholder="Ex : 2026-014"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes libres */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">📝 Note (motif, contexte)</label>
                  <textarea
                    value={formData.litigeNote}
                    onChange={(e) => setFormData({ ...formData, litigeNote: e.target.value })}
                    rows={2}
                    placeholder="Ex : Plainte client pour défaut esthétique des panneaux, accord signé le 12/05/2026..."
                    className={inputCls + ' resize-none'}
                  />
                </div>
              </div>
            </Section>
          )}

          {isAdmin && (
            <div className="bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />Calcul des marges
              </h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white/20 rounded-xl p-3"><div className="opacity-80 text-xs uppercase">Marge TTC</div><div className="text-xl font-bold">{formatEuro(calculs.margeTtc)}</div></div>
                <div className="bg-white/20 rounded-xl p-3"><div className="opacity-80 text-xs uppercase">Marge HT</div><div className="text-xl font-bold">{formatEuro(calculs.margeHt)}</div></div>
                <div className="bg-white/20 rounded-xl p-3"><div className="opacity-80 text-xs uppercase">TVA</div><div className="text-xl font-bold">{formatEuro(calculs.tva)}</div></div>
              </div>
            </div>
          )}

          <Section
            title="📝 Observations"
            color="slate"
            collapsible={true}
            defaultCollapsed={!editingId && !formData.observations}
            summary={formData.observations ? `▶️ ${formData.observations.slice(0, 60)}${formData.observations.length > 60 ? '...' : ''}` : '▶️ Aucune note — clique pour ajouter'}
          >
            <textarea value={formData.observations} onChange={(e) => setFormData({ ...formData, observations: e.target.value })} rows={2} placeholder="Notes..." className={inputCls + ' resize-none'} />
          </Section>

          {editingId && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
              <Paperclip className="w-5 h-5 text-violet-500 flex-shrink-0" />
              <div className="text-xs text-slate-600 flex-1">
                <strong className="text-violet-700">Documents :</strong> ferme ce formulaire et clique sur <Paperclip className="w-3 h-3 inline" /> sur la carte du dossier pour gérer les factures et bons de commande.
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-2">
            <button onClick={safeClose} disabled={isScanBusy} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 ${isScanBusy ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-200'}`} title={isScanBusy ? 'Scan IA en cours — attends la fin' : ''}>{isScanBusy ? '🔒 Scan en cours…' : 'Annuler'}</button>
            <button onClick={onSubmit} disabled={!formData.nom.trim()} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-500 to-pink-500 disabled:opacity-50 shadow-md">
              {editingId ? 'Enregistrer' : 'Créer le dossier'}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children, collapsible = false, defaultCollapsed = false, summary }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const colors = {
    violet: 'border-violet-200 bg-violet-50/50', pink: 'border-pink-200 bg-pink-50/50',
    blue: 'border-blue-200 bg-blue-50/50', amber: 'border-amber-200 bg-amber-50/50',
    emerald: 'border-emerald-200 bg-emerald-50/50', slate: 'border-slate-200 bg-slate-50/50',
    purple: 'border-purple-200 bg-purple-50/50', cyan: 'border-cyan-200 bg-cyan-50/50',
  };

  if (!collapsible) {
    return (
      <div className={`rounded-2xl p-4 border ${colors[color]}`}>
        <h3 className="font-semibold text-slate-700 mb-3 text-sm">{title}</h3>
        {children}
      </div>
    );
  }

  // Mode collapsible
  return (
    <div className={`rounded-2xl border ${colors[color]} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full p-4 flex items-center justify-between gap-2 hover:bg-white/40 transition-colors"
      >
        <div className="flex-1 text-left">
          <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
          {collapsed && summary && (
            <div className="text-[11px] text-slate-500 mt-0.5">{summary}</div>
          )}
        </div>
        <span className="text-base text-slate-500 flex-shrink-0">
          {collapsed ? '▼' : '▲'}
        </span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-sm font-semibold ${checked ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      {label}
    </button>
  );
}

// ===================== IMPORT DOSSIERS =====================

// Parse CSV/TSV content into rows. Auto-detects tab vs comma vs semicolon.
function parseDelimited(text) {
  if (!text || !text.trim()) return [];
  const firstLine = text.split('\n')[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delim = tabCount >= semiCount && tabCount >= commaCount ? '\t'
              : semiCount >= commaCount ? ';'
              : ',';
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === delim && !inQuotes) {
        fields.push(current); current = '';
      } else current += c;
    }
    fields.push(current);
    rows.push(fields.map(f => f.trim()));
  }
  return rows;
}

function parseNumber(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDateInput(str) {
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

function parseBool(str) {
  const s = String(str || '').toLowerCase().trim();
  return s === 'oui' || s === 'yes' || s === '1' || s === 'true' || s === 'x' || s === 'payé' || s === 'paye';
}

function suggestField(header) {
  // Normalise les accents avant la regex : "Prénom" → "prenom", "Téléphone" → "telephone".
  // Sans NFD, l'accent disparaissait sans remplacer la lettre ("prnom") et le match ratait.
  const h = String(header || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  const map = [
    { keys: ['nom', 'lastname'], field: 'nom' },
    { keys: ['prenom', 'firstname'], field: 'prenom' },
    { keys: ['tel', 'telephone', 'phone', 'mobile', 'portable'], field: 'telephone' },
    { keys: ['email', 'mail', 'courriel'], field: 'email' },
    { keys: ['adresse', 'address', 'rue'], field: 'adresse' },
    { keys: ['cp', 'codepostal', 'zip', 'postal'], field: 'codePostal' },
    { keys: ['ville', 'city'], field: 'ville' },
    { keys: ['statut', 'status', 'etat'], field: 'statut' },
    { keys: ['financement', 'financeur', 'finance', 'banque'], field: 'financement' },
    { keys: ['montant', 'prix', 'ttc', 'total', 'montantttc'], field: 'montantTotal' },
    { keys: ['ht', 'montantht'], field: 'montantHtCustom' },
    { keys: ['datepose', 'datinsta', 'datinst', 'dateinstall', 'dateinsta', 'pose'], field: 'dateInsta' },
    { keys: ['visite', 'visiteclient', 'rendezvous', 'rdv'], field: 'dateVisitePose' },
    { keys: ['dateaccord', 'accord'], field: 'dateAccord' },
    { keys: ['dateconsuel', 'consuel'], field: 'dateConsuel' },
    { keys: ['regie', 'commercial', 'agence'], field: 'regie' },
    { keys: ['poseur', 'installateur'], field: 'poseur' },
    { keys: ['fournisseur', 'supplier'], field: 'fournisseur' },
    { keys: ['bl', 'bordereau', 'numerobl', 'nobl'], field: 'bl' },
    { keys: ['facture', 'numerofacture', 'nofacture', 'facturen', 'invoice', 'invoiceno'], field: 'factureNo' },
    { keys: ['lienpdf', 'pdf', 'urlfacture', 'lienfacture', 'driveurl', 'lienpdffacture'], field: 'facturePdfUrl' },
    { keys: ['payeclient', 'paye', 'paid', 'reglement', 'paiement'], field: 'payeClient' },
    { keys: ['observation', 'note', 'commentaire', 'remarque'], field: 'observations' },
    { keys: ['produit', 'product', 'type'], field: 'produit' },
    { keys: ['puissance', 'wc', 'watts'], field: 'puissance' },
    { keys: ['id', 'reference', 'ref', 'numero'], field: 'id' },
  ];
  for (const m of map) {
    if (m.keys.some(k => h === k || h.includes(k))) return m.field;
  }
  return '';
}

const IMPORT_FIELDS = [
  { id: '', label: '— Ignorer —' },
  { id: 'id', label: '🔢 Référence dossier' },
  { id: 'nom', label: '👤 Nom' },
  { id: 'prenom', label: '👤 Prénom' },
  { id: 'telephone', label: '📞 Téléphone' },
  { id: 'email', label: '✉️ Email' },
  { id: 'adresse', label: '🏠 Adresse' },
  { id: 'codePostal', label: '📮 Code postal' },
  { id: 'ville', label: '🏘️ Ville' },
  { id: 'statut', label: '📊 Statut' },
  { id: 'financement', label: '💳 Financement' },
  { id: 'montantTotal', label: '💰 Montant TTC (€)' },
  { id: 'montantHtCustom', label: '💵 Montant HT (€) (optionnel)' },
  { id: 'dateInsta', label: '📅 Date pose' },
  { id: 'dateAccord', label: '📅 Date accord' },
  { id: 'dateConsuel', label: '📅 Date Consuel' },
  { id: 'regie', label: '🤝 Régie' },
  { id: 'poseur', label: '🔧 Poseur' },
  { id: 'fournisseur', label: '📦 Fournisseur (nom)' },
  { id: 'bl', label: '📦 N° BL (bordereau)' },
  { id: 'factureNo', label: '🧾 N° facture' },
  { id: 'facturePdfUrl', label: '🔗 Lien PDF facture (URL Drive)' },
  { id: 'payeClient', label: '✅ Payé client (oui/non)' },
  { id: 'observations', label: '📝 Observations' },
  { id: 'produit', label: '🏠 Produit (type)' },
  { id: 'puissance', label: '⚡ Puissance (Wc)' },
];

function ImportDossiersModal({ onClose, onImport, existingDossiers, STATUTS_ORDERED, POSEURS, REGIES, FOURNISSEURS, produits }) {
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [hasHeaders, setHasHeaders] = useState(true);
  const [dryRun, setDryRun] = useState({});
  const [errorMsg, setErrorMsg] = useState('');

  const parsed = useMemo(() => parseDelimited(rawText), [rawText]);

  const enterMapping = () => {
    setErrorMsg('');
    if (parsed.length === 0) { setErrorMsg('Aucune donnée détectée. Colle ton tableau dans la zone.'); return; }
    const dataRows = hasHeaders ? parsed.slice(1) : parsed;
    const headerRow = hasHeaders ? parsed[0] : parsed[0].map((_, i) => `Colonne ${i + 1}`);
    const initialMapping = {};
    headerRow.forEach((h, i) => {
      initialMapping[i] = hasHeaders ? suggestField(h) : '';
    });
    setHeaders(headerRow);
    setRows(dataRows);
    setMapping(initialMapping);
    setStep(2);
  };

  const buildDossiers = () => {
    const out = [];
    const warnings = [];
    rows.forEach((row, rIdx) => {
      try {
        const d = {};
        Object.entries(mapping).forEach(([colIdx, field]) => {
          if (!field) return;
          const val = (row[parseInt(colIdx)] || '').trim();
          if (!val) return;
          switch (field) {
            case 'montantTotal':
            case 'montantHtCustom':
              d[field] = parseNumber(val); break;
            case 'puissance': {
              // Détecte l'unité par la valeur :
              //   < 100   → kW (ex : 5)        → × 1000 = Wc
              //   < 1500  → format Chelly (Wc/10) ex : 500 → × 10 = 5000 Wc
              //   ≥ 1500  → Wc direct (ex : 6000) — on garde
              const raw = parseNumber(val);
              let wc = raw;
              if (raw > 0 && raw < 100) wc = raw * 1000;
              else if (raw >= 100 && raw < 1500) wc = raw * 10;
              d[field] = parseInt(wc) || 6000;
              break;
            }
            case 'dateInsta':
            case 'dateAccord':
            case 'dateConsuel':
              d[field] = parseDateInput(val); break;
            case 'payeClient':
              d[field] = parseBool(val); break;
            case 'statut': {
              const matched = (STATUTS_ORDERED || []).find(s => s && s.id && (String(s.id).toLowerCase() === val.toLowerCase() || (s.label && String(s.label).toLowerCase().includes(val.toLowerCase())) || val.toLowerCase().includes(String(s.label || '').toLowerCase())));
              d.statut = matched ? matched.id : 'M_ATT_DOSSIER';
              if (!matched && val) warnings.push(`Ligne ${rIdx + 1}: statut "${val}" non reconnu, mis sur "Manque attestation"`);
              break;
            }
            case 'financement': {
              const matched = FINANCEMENTS.find(f => f && f.id && (String(f.id).toLowerCase() === val.toLowerCase() || (f.label && String(f.label).toLowerCase().includes(val.toLowerCase()))));
              d.financement = matched ? matched.id : 'AUTRE';
              if (!matched && val) warnings.push(`Ligne ${rIdx + 1}: financement "${val}" non reconnu, mis sur "AUTRE"`);
              break;
            }
            case 'produit': {
              const matched = (produits || []).find(p => p && p.id && (String(p.id).toLowerCase() === val.toLowerCase() || (p.label && String(p.label).toLowerCase().includes(val.toLowerCase()))));
              d.produit = matched ? matched.id : 'PANNEAU_SOLAIRE';
              if (!matched && val) warnings.push(`Ligne ${rIdx + 1}: produit "${val}" non reconnu, mis sur "Panneaux solaires"`);
              break;
            }
            case 'poseur': d.poseur = val; break;
            case 'regie': d.regie = val; break;
            case 'fournisseur': d.fournisseur = val; break;
            case 'bl': d.bl = val; break;
            case 'factureNo': d.factureNo = val; break;
            case 'facturePdfUrl': d.facturePdfUrl = val; break;
            default: d[field] = val;
          }
        });
        // Plus tolérant : on accepte si AU MOINS un champ identifiant a une valeur
        const hasAnyIdentifier = d.nom || d.prenom || d.id || d.telephone || d.email || d.adresse;
        if (!hasAnyIdentifier) return;

        const nowId = Date.now() + rIdx;
        const dossier = {
          localId: `imp_${nowId}_${Math.random().toString(36).slice(2, 7)}`,
          id: d.id || `IMP-${nowId}`,
          nom: d.nom || '', prenom: d.prenom || '',
          telephone: d.telephone || '', email: d.email || '',
          adresse: d.adresse || '', codePostal: d.codePostal || '', ville: d.ville || '',
          statut: d.statut || 'M_ATT_DOSSIER',
          financement: d.financement || 'AUTRE',
          montantTotal: d.montantTotal || 0,
          montantHtCustom: d.montantHtCustom || '',
          dateInsta: d.dateInsta || '', dateAccord: d.dateAccord || '', dateConsuel: d.dateConsuel || '',
          produits: [{
            type: d.produit || 'PANNEAU_SOLAIRE',
            puissance: d.puissance || 6000,
            description: '', quantite: 1
          }],
          puissance: d.puissance || 6000,
          regie: d.regie || ((REGIES && REGIES[0]) || ''),
          regieHtCustom: '', regiePaye: false, regieDatePaye: '',
          poseurs: d.poseur ? [{ nom: d.poseur, htCustom: '', paye: false, datePaye: '' }] : [],
          fournisseurs: (d.fournisseur || d.bl || d.factureNo || d.facturePdfUrl) ? [{ nom: d.fournisseur || (FOURNISSEURS && FOURNISSEURS[0]) || 'AUTRE', htCustom: '', paye: false, datePaye: '', bl: d.bl || '', factureNo: d.factureNo || '', facturePdfUrl: d.facturePdfUrl || '' }] : [],
          payeClient: !!d.payeClient,
          payeClientDate: '',
          observations: d.observations || '',
          documents: [], historique: [],
          savedAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
        };
        out.push(dossier);
      } catch (e) {
        warnings.push(`Ligne ${rIdx + 1}: erreur — ${e.message}`);
      }
    });
    return { dossiers: out, warnings };
  };

  const enterPreview = () => {
    setErrorMsg('');
    try {
      const result = buildDossiers();
      // Identifie les champs mappés pour aider l'utilisateur
      const mappedFields = Object.values(mapping).filter(Boolean);
      if (mappedFields.length === 0) {
        setErrorMsg('⚠️ Tu n\'as mappé aucune colonne. Choisis au moins un champ (Nom, Prénom, ou Téléphone) dans les dropdowns ci-dessus.');
        return;
      }
      setDryRun(result);
      setStep(3);
    } catch (e) {
      setErrorMsg(`⚠️ Erreur lors de l'analyse : ${e.message}. Réessaie ou contacte le support.`);
    }
  };

  const doImport = () => {
    setErrorMsg('');
    if (!dryRun.dossiers || dryRun.dossiers.length === 0) { setErrorMsg('Aucun dossier à importer.'); return; }
    try {
      onImport(dryRun.dossiers);
    } catch (e) {
      setErrorMsg(`Erreur lors de l'import : ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-pink-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Upload className="w-5 h-5 text-violet-500" /> Importer des dossiers</h2>
            <p className="text-xs text-slate-500 mt-0.5">Étape {step} / 3 — {step === 1 ? 'Coller tes données' : step === 2 ? 'Mapper les colonnes' : 'Vérifier et confirmer'}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" title="Fermer" className="p-2 hover:bg-white rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800 leading-relaxed">
                💡 <strong>Deux façons :</strong><br />
                <strong>A.</strong> Bouton <strong>"📂 Charger un CSV"</strong> ci-dessous (recommandé si tu as déjà un fichier CSV/Excel)<br />
                <strong>B.</strong> Copier-coller : <strong>Ctrl+C</strong> dans Google Sheet/Excel → <strong>Ctrl+V</strong> dans la zone ci-dessous
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-bold cursor-pointer">
                  📂 Charger un CSV
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Lit le fichier en UTF-8 (la plupart des CSV). Si caractères
                      // bizarres → l'utilisateur peut toujours coller manuellement.
                      try {
                        const text = await file.text();
                        setRawText(text);
                      } catch (err) {
                        alert('Erreur lecture fichier : ' + err.message);
                      }
                      // Reset l'input pour permettre de re-charger le même fichier
                      e.target.value = '';
                    }}
                  />
                </label>
                {rawText && (
                  <button onClick={() => setRawText('')} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold">
                    ✕ Vider
                  </button>
                )}
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={hasHeaders} onChange={(e) => setHasHeaders(e.target.checked)} className="w-4 h-4 accent-violet-500" />
                  1ère ligne = en-têtes
                </label>
              </div>
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Colle ici ton tableau OU charge un CSV ci-dessus…" className="w-full h-64 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-400 text-xs font-mono" />
              <div className="text-xs text-slate-500">
                {parsed.length > 0 ? <span className="text-emerald-600 font-semibold">✓ {parsed.length} ligne{parsed.length > 1 ? 's' : ''} détectée{parsed.length > 1 ? 's' : ''} ({parsed[0]?.length || 0} colonne{(parsed[0]?.length || 0) > 1 ? 's' : ''})</span> : 'Aucune donnée détectée pour le moment'}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                💡 Pour chaque colonne de ton tableau, choisis à quel champ elle correspond. Les colonnes inutilisées peuvent rester sur "Ignorer".
              </div>
              {(() => {
                const mappedCount = Object.values(mapping).filter(Boolean).length;
                const hasName = Object.values(mapping).some(f => f === 'nom' || f === 'prenom');
                return (
                  <div className={`p-3 rounded-xl text-xs font-semibold ${mappedCount === 0 ? 'bg-rose-50 border border-rose-200 text-rose-700' : hasName ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                    {mappedCount === 0 && '❌ Aucune colonne mappée — choisis au moins un champ ci-dessous'}
                    {mappedCount > 0 && !hasName && `⚠️ ${mappedCount} colonne(s) mappée(s), mais aucun "Nom" ou "Prénom" — l'import marchera mais les dossiers seront difficiles à identifier`}
                    {mappedCount > 0 && hasName && `✓ ${mappedCount} colonne(s) mappée(s), Nom détecté — prêt pour l'aperçu`}
                  </div>
                );
              })()}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-700 font-semibold">{errorMsg}</div>
              )}
              <div className="text-xs text-slate-500 mb-2">
                <strong>{rows.length}</strong> ligne{rows.length > 1 ? 's' : ''} de données • <strong>{headers.length}</strong> colonne{headers.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center bg-slate-50 rounded-xl p-3">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">Colonne {i + 1} {hasHeaders ? '(en-tête)' : ''}</div>
                      <div className="text-sm font-bold text-slate-800 truncate" title={h}>{h || '(vide)'}</div>
                    </div>
                    <div>
                      <select value={mapping[i] || ''} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                        {IMPORT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      <span className="font-semibold">Ex:</span> {[rows[0]?.[i], rows[1]?.[i]].filter(Boolean).slice(0, 2).join(' • ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && dryRun.dossiers && (
            <div className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-700 font-semibold">{errorMsg}</div>
              )}
              {dryRun.dossiers.length === 0 ? (
                <div className="p-8 bg-rose-50 border-2 border-dashed border-rose-300 rounded-2xl text-center">
                  <div className="text-4xl mb-2">😕</div>
                  <div className="text-sm font-bold text-rose-800 mb-2">Aucun dossier détecté dans tes données</div>
                  <div className="text-xs text-rose-600 leading-relaxed">
                    Vérifie que tes lignes ont bien au moins une valeur dans <strong>Nom</strong>, <strong>Prénom</strong>, <strong>Téléphone</strong>, <strong>Email</strong> ou <strong>Adresse</strong>.<br />
                    Reviens à l'étape précédente pour corriger le mapping.
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-800">
                  ✓ <strong>{dryRun.dossiers.length} dossier{dryRun.dossiers.length > 1 ? 's' : ''} prêt{dryRun.dossiers.length > 1 ? 's' : ''} à importer</strong>
                </div>
              )}
              {dryRun.warnings && dryRun.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 max-h-32 overflow-y-auto">
                  <div className="font-semibold mb-1">⚠️ {dryRun.warnings.length} avertissement{dryRun.warnings.length > 1 ? 's' : ''} :</div>
                  {dryRun.warnings.slice(0, 10).map((w, i) => <div key={i}>• {w}</div>)}
                  {dryRun.warnings.length > 10 && <div className="italic">... et {dryRun.warnings.length - 10} autre{dryRun.warnings.length - 10 > 1 ? 's' : ''}</div>}
                </div>
              )}
              {dryRun.dossiers.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-bold text-slate-600">#</th>
                        <th className="px-2 py-2 text-left font-bold text-slate-600">Nom</th>
                        <th className="px-2 py-2 text-left font-bold text-slate-600">Statut</th>
                        <th className="px-2 py-2 text-left font-bold text-slate-600">Financement</th>
                        <th className="px-2 py-2 text-right font-bold text-slate-600">Montant</th>
                        <th className="px-2 py-2 text-left font-bold text-slate-600">Poseur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.dossiers.slice(0, 50).map((d, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                          <td className="px-2 py-1.5 font-semibold">{d.nom} {d.prenom}</td>
                          <td className="px-2 py-1.5">{STATUTS_ORDERED.find(s => s.id === d.statut)?.label || d.statut}</td>
                          <td className="px-2 py-1.5">{d.financement}</td>
                          <td className="px-2 py-1.5 text-right">{formatEuro(d.montantTotal)}</td>
                          <td className="px-2 py-1.5">{d.poseurs[0]?.nom || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dryRun.dossiers.length > 50 && <div className="p-2 text-center text-xs text-slate-500 bg-slate-50">... et {dryRun.dossiers.length - 50} autre{dryRun.dossiers.length - 50 > 1 ? 's' : ''}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 flex justify-between items-center bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold">Annuler</button>
          <div className="flex gap-2">
            {step > 1 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-sm font-semibold">← Retour</button>}
            {step === 1 && <button onClick={enterMapping} disabled={parsed.length === 0} className="px-5 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold">Suivant →</button>}
            {step === 2 && (() => {
              const mappedCount = Object.values(mapping).filter(Boolean).length;
              return <button onClick={enterPreview} disabled={mappedCount === 0} className="px-5 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold">Aperçu →</button>;
            })()}
            {step === 3 && <button onClick={doImport} disabled={!dryRun.dossiers || dryRun.dossiers.length === 0} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold flex items-center gap-2"><Check className="w-4 h-4" />Importer {dryRun.dossiers?.length || 0} dossier{(dryRun.dossiers?.length || 0) > 1 ? 's' : ''}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== MODAL HISTORIQUE =====================

function HistoriqueModal({ dossier, onClose }) {
  const findStatutInfo = (id) => STATUTS.find(s => s.id === id);

  // Fusionne l'historique des changements de statut avec les tentatives
  // d'appel (CQ + contrôle livraison) → une seule timeline chronologique.
  const allEvents = [
    ...((dossier.historique || []).map(h => ({ ...h, kind: 'hist' }))),
    ...((dossier.tentativesCQ || []).map(t => ({ date: t.datetime, kind: 'tentative_cq' }))),
    ...((dossier.tentativesControleLivraison || []).map(t => ({ date: t.datetime, kind: 'tentative_liv' }))),
  ].filter(e => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `${date} à ${time}`;
    } catch (e) { return iso; }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-500" />
              Historique du dossier
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {dossier.nom} {dossier.prenom} · {allEvents.length} évènement{allEvents.length > 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer" title="Fermer" className="p-2 hover:bg-white rounded-xl"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {allEvents.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun évènement enregistré pour le moment.</p>
              <p className="text-xs mt-1">Les changements de statut et essais d'appel apparaîtront ici à partir de maintenant.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Ligne verticale de la timeline */}
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-amber-300 via-orange-300 to-rose-300"></div>
              <div className="space-y-4">
                {allEvents.map((h, i) => {
                  // Branche selon le type d'évènement
                  if (h.kind === 'tentative_cq' || h.kind === 'tentative_liv') {
                    const isCQ = h.kind === 'tentative_cq';
                    return (
                      <div key={`t-${i}`} className="relative pl-10">
                        <div className={`absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-md text-white ${isCQ ? 'bg-gradient-to-br from-purple-400 to-violet-500' : 'bg-gradient-to-br from-emerald-400 to-teal-500'}`}>
                          📞
                        </div>
                        <div className={`rounded-xl p-3 border ${isCQ ? 'bg-purple-50 border-purple-200' : 'bg-emerald-50 border-emerald-200'}`}>
                          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            📅 {formatDateTime(h.date)}
                          </div>
                          <div className={`text-sm font-bold ${isCQ ? 'text-purple-700' : 'text-emerald-700'}`}>
                            📞 Essai d'appel — client n'a pas répondu
                            <span className="text-xs font-normal text-slate-600 ml-1">
                              ({isCQ ? 'Contrôle qualité' : 'Contrôle livraison'})
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // Notification régie après accord financement (clic Envoyer/WhatsApp)
                  if (h.action === 'notif_regie_accord') {
                    const channelLabel = h.channel === 'whatsapp' ? '📲 WhatsApp' : h.channel === 'email_oauth' ? '📧 Email (Gmail)' : h.channel === 'email_smtp' ? '📧 Email (SMTP)' : '📧 Gmail compose';
                    return (
                      <div key={`n-${i}`} className="relative pl-10">
                        <div className="absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-md text-white bg-gradient-to-br from-emerald-400 to-teal-500">
                          ✅
                        </div>
                        <div className="rounded-xl p-3 border bg-emerald-50 border-emerald-200">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            📅 {formatDateTime(h.date)}
                          </div>
                          <div className="text-sm font-bold text-emerald-700">
                            ✅ Régie prévenue de l'accord
                            <span className="text-xs font-normal text-slate-600 ml-1">
                              à 🤝 <strong>{h.cible_nom}</strong> via {channelLabel}
                            </span>
                          </div>
                          {h.user && <div className="text-[10px] text-slate-500 mt-1">👤 par {h.user}</div>}
                        </div>
                      </div>
                    );
                  }
                  // Relance WhatsApp (ex : facture manquante)
                  if (h.action === 'relance_whatsapp') {
                    const kindEmoji = h.cible_kind === 'poseur' ? '🔧' : h.cible_kind === 'regie' ? '🤝' : h.cible_kind === 'fournisseur' ? '📦' : '👤';
                    const motifLabel = h.motif === 'facture_manquante' ? 'facture manquante' : (h.motif || '');
                    return (
                      <div key={`r-${i}`} className="relative pl-10">
                        <div className="absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-md text-white bg-gradient-to-br from-emerald-400 to-teal-500">
                          📲
                        </div>
                        <div className="rounded-xl p-3 border bg-emerald-50 border-emerald-200">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            📅 {formatDateTime(h.date)}
                          </div>
                          <div className="text-sm font-bold text-emerald-700">
                            📲 Relance WhatsApp initiée
                            <span className="text-xs font-normal text-slate-600 ml-1">
                              à {kindEmoji} <strong>{h.cible_nom}</strong>{motifLabel ? ` (${motifLabel})` : ''}
                            </span>
                          </div>
                          {h.user && <div className="text-[10px] text-slate-500 mt-1">👤 par {h.user}</div>}
                          <div className="text-[9px] text-slate-400 italic mt-1">Le lien WhatsApp a été ouvert — la confirmation d'envoi se fait hors CRM.</div>
                        </div>
                      </div>
                    );
                  }
                  // 📜 Modification d'un ou plusieurs champs du dossier (hors statut)
                  if (h.action === 'modification' && Array.isArray(h.changes) && h.changes.length > 0) {
                    // Libellés humains pour les champs les plus courants (sinon on
                    // affiche le nom technique du champ entre backticks).
                    const FIELD_LABELS = {
                      nom: 'Nom', prenom: 'Prénom', adresse: 'Adresse', codePostal: 'Code postal', ville: 'Ville',
                      telephone: 'Téléphone', email: 'Email', dateSignature: 'Date BC', dateInsta: 'Date pose',
                      financement: 'Financement', payeClient: 'Payé par financeur',
                      dateEnvoiFin: 'Envoi banque', dateRetourFin: 'Retour banque', dateAccord: 'Accord banque',
                      statutFin: 'Statut banque', motifManqueDoc: 'Docs demandés banque',
                      dateNotifRegie: 'Date régie prévenue', dateRecuRegie: 'Date docs reçus régie',
                      dateRenvoiDocs: 'Date renvoi banque',
                      dateControleQualite: 'Date CQ', statutControleQualite: 'Statut CQ', vocalCQUrl: 'Vocal CQ',
                      dateEnvoiPose: 'Date pose', statutPose: 'Statut pose',
                      dateEnvoiMairie: 'Envoi mairie', dateAccordMairie: 'Accord mairie', statutMairie: 'Statut mairie',
                      dateEnvoiConsuel: 'Envoi Consuel', dateAccordConsuel: 'Accord Consuel', statutConsuel: 'Statut Consuel',
                      societe: 'Société', id: 'N° BC', notes: 'Notes',
                      montantPret: 'Montant prêt', reportMois: 'Report mois', tauxDebiteur: 'Taux débiteur',
                      taeg: 'TAEG', nbEcheances: 'Nb échéances', montantEcheance: 'Mensualité', periodicite: 'Périodicité',
                      typeToiture: 'Type toiture', orientationPanneaux: 'Orientation panneaux',
                    };
                    const fmtVal = (v) => {
                      if (v === '' || v == null) return <em className="text-slate-400">vide</em>;
                      if (v === true) return '✓';
                      if (v === false) return '✗';
                      if (Array.isArray(v)) return `${v.length} élément${v.length > 1 ? 's' : ''}`;
                      if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
                      const s = String(v);
                      // Date ISO → format français
                      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                        try { return new Date(s).toLocaleDateString('fr-FR'); } catch (e) {}
                      }
                      return s.length > 60 ? s.slice(0, 60) + '…' : s;
                    };
                    return (
                      <div key={`m-${i}`} className="relative pl-10">
                        <div className="absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-md text-white bg-gradient-to-br from-blue-400 to-indigo-500">
                          ✏️
                        </div>
                        <div className="rounded-xl p-3 border bg-blue-50 border-blue-200">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            📅 {formatDateTime(h.date)}
                          </div>
                          <div className="text-sm font-bold text-blue-700 mb-1.5">
                            ✏️ Modification ({h.changes.length} champ{h.changes.length > 1 ? 's' : ''})
                          </div>
                          <ul className="space-y-1">
                            {h.changes.map((c, j) => {
                              const label = FIELD_LABELS[c.field] || c.field;
                              return (
                                <li key={j} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                                  <strong className="text-slate-700">{label} :</strong>
                                  <span className="text-rose-600 line-through">{fmtVal(c.from)}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-700 font-semibold">{fmtVal(c.to)}</span>
                                </li>
                              );
                            })}
                          </ul>
                          {h.user && <div className="text-[10px] text-slate-500 mt-1.5">👤 par {h.user}</div>}
                        </div>
                      </div>
                    );
                  }
                  // Évènement classique de l'historique (création ou changement de statut)
                  const fromInfo = h.from ? findStatutInfo(h.from) : null;
                  const toInfo = findStatutInfo(h.to);
                  const isCreation = h.action === 'création';
                  return (
                    <div key={`h-${i}`} className="relative pl-10">
                      {/* Pastille de la timeline */}
                      <div className={`absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center text-base shadow-md ${isCreation ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white' : 'bg-white border-2 border-amber-400'}`}>
                        {isCreation ? '✨' : (toInfo?.emoji || '🔄')}
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
                          📅 {formatDateTime(h.date)}
                        </div>
                        {isCreation ? (
                          <div className="text-sm font-bold text-emerald-700">
                            ✨ Dossier créé
                            {toInfo && <span className="text-xs font-normal text-slate-600 ml-1">avec le statut <strong>{toInfo.label}</strong></span>}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <span className="font-semibold text-slate-700">Statut changé :</span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {fromInfo && (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${fromInfo.bg} ${fromInfo.text}`}>
                                  {fromInfo.emoji} {fromInfo.label}
                                </span>
                              )}
                              <span className="text-slate-400">→</span>
                              {toInfo && (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${toInfo.bg} ${toInfo.text}`}>
                                  {toInfo.emoji} {toInfo.label}
                                </span>
                              )}
                            </div>
                            {/* Date métier du jalon (refus, accord, manque docs…)
                                snapshotée au moment du changement de statut. */}
                            {h.bizDate && statutMilestoneLabel(h.from, h.to) && (
                              <div className="mt-1.5 inline-block text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                                {statutMilestoneLabel(h.from, h.to)}{' '}
                                {(() => { try { return new Date(h.bizDate).toLocaleDateString('fr-FR'); } catch (e) { return h.bizDate; } })()}
                              </div>
                            )}
                          </div>
                        )}
                        {h.user && <div className="text-[10px] text-slate-500 mt-1">👤 par {h.user}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 bg-slate-50 text-center">
          <button onClick={onClose} className="px-5 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-sm font-semibold">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ===================== PANNEAU APERÇU RAPIDE (Slide-in droite) =====================

// Construit un lien WhatsApp "click to chat" : ouvre WhatsApp avec le message
// pré-rempli, adressé au numéro donné. Normalise le numéro au format
// international (ex: "06 12 34 56 78" → "33612345678").
const buildWhatsAppLink = (phone, message) => {
  let n = String(phone || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = '33' + n.slice(1); // numéro français
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
};

// Panneau "Documents à générer" — affiche les templates PDF disponibles pour
// la société du dossier (cf. TEMPLATES_CATALOG dans pdfTemplates.js). Le clic
// déclenche la génération + téléchargement directs.
function PdfGeneratorPanel({ dossier }) {
  const [busy, setBusy] = useState(false);
  const templates = TEMPLATES_CATALOG[dossier.societe] || [];
  if (templates.length === 0) return null;

  const generateOne = async (tpl) => {
    try {
      await tpl.generate(dossier);
    } catch (e) {
      console.error('[pdf]', e);
      alert(`Erreur génération PDF "${tpl.label}" : ${e.message}`);
    }
  };

  // Menu d'action : on lit le choix puis on remet le select sur le placeholder
  // (value="" contrôlé) — ce n'est pas un champ, juste un déclencheur.
  const handleSelect = async (e) => {
    const val = e.target.value;
    if (!val || busy) return;
    setBusy(true);
    try {
      if (val === '__all__') {
        for (const tpl of templates) await generateOne(tpl);
      } else {
        const tpl = templates.find(t => t.id === val);
        if (tpl) await generateOne(tpl);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold text-purple-700 uppercase mb-1">📄 Documents à générer</div>
      <div className="relative">
        <select
          value=""
          onChange={handleSelect}
          disabled={busy}
          className="w-full appearance-none px-2.5 py-2 pr-7 rounded-lg text-xs font-bold border-2 bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100 disabled:opacity-60 disabled:cursor-wait cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="">{busy ? '⏳ Génération en cours…' : '📄 Choisir un document à générer…'}</option>
          <option value="__all__">🪄 Générer toute la liste ({templates.length} docs)</option>
          {templates.map(tpl => (
            <option key={tpl.id} value={tpl.id}>{tpl.emoji} {tpl.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-500 text-[9px]">▼</span>
      </div>
    </div>
  );
}

function QuickViewPanel({ dossier, scrollTo, onClose, onEdit, onShowDocs, onShowHist, onUpdate, STATUTS, STATUTS_ORDERED, FINANCEMENTS, POSEURS, REGIES, FOURNISSEURS, tarifsInternes, nomsInternes, setNomsInternes, produits, isAdmin, permissions, poseursContacts, regiesContacts, emailConfig, gmailOAuth, societes = [] }) {
  // Permissions effectives — admin a tout, sinon on lit dans permissions.
  // Fallback safe : si permissions n'est pas passé, isAdmin gate tout (rétrocompat).
  const canSeeMarges = isAdmin || permissions?.voirMarges === true;
  const canSeeBLFactures = isAdmin || permissions?.voirBLFactures === true;
  const canCheckPaiements = isAdmin || permissions?.cocherPaiements === true;
  // Section finance/banque réservée à admin/compta/envoi_finance (modifierTous est un bon proxy).
  const canEditFinance = isAdmin || permissions?.modifierTous === true;
  const d = dossier;
  const statut = STATUTS.find(s => s.id === d.statut);
  const dossierProduits = (d.produits && d.produits.length > 0)
    ? d.produits
    : [{ type: d.produit || 'PANNEAU_SOLAIRE', puissance: d.puissance || 0, description: '', quantite: 1 }];
  const docCount = (d.documents || []).length;
  const histCount = (d.historique || []).length;

  // Refs pour scroller vers une section précise
  const refRegie = useRef(null);
  const refPoseurs = useRef(null);
  const refFournisseurs = useRef(null);
  const refPaiement = useRef(null);
  const refEquipeInterne = useRef(null);
  const refCQ = useRef(null);
  const refFinancement = useRef(null);
  const refPose = useRef(null);
  const refConsuel = useRef(null);
  const refRaccordement = useRef(null);
  const refMairie = useRef(null);

  // Pliage des sections (étapes process + blocs métier). Tout plié par défaut
  // pour éviter d'avoir à scroller dans tout le panneau. Clic sur le titre =
  // ouvre/ferme. Si on arrive via une alerte (scrollTo), l'étape ciblée
  // s'ouvre automatiquement.
  const [foldedSteps, setFoldedSteps] = useState({
    cq: true, mairie: true, fin: true, pose: true, consuel: true, raccordement: true, paiement: true,
    produits: true, regies: true, poseurs: true, fournisseurs: true,
  });
  const toggleStep = (key) => setFoldedSteps(prev => ({ ...prev, [key]: !prev[key] }));
  const openStep = (key) => setFoldedSteps(prev => ({ ...prev, [key]: false }));

  // Formulaire "✗ Refusé" — visible quand l'utilisateur clique le bouton
  const [poseRateeForm, setPoseRateeForm] = useState({ visible: false, motif: 'client_absent', penalite: 500, definitif: false });

  // Scroll vers la section demandée à l'ouverture + déplie l'étape ciblée
  useEffect(() => {
    if (!scrollTo) return;
    // 1) Déplie automatiquement l'étape concernée
    const stepKey = ({
      cq: 'cq', controleQualite: 'cq',
      mairie: 'mairie', envoiMairie: 'mairie',
      financement: 'fin', envoiBanque: 'fin',
      pose: 'pose', envoiPose: 'pose', poseurs: null,
      consuel: 'consuel', envoiConsuel: 'consuel',
      raccordement: 'raccordement', envoiRaccordement: 'raccordement', aEnvoyerRaccordement: 'raccordement',
      paiement: 'paiement', controleLivraison: 'paiement', originaux: 'paiement', tva: 'paiement', recupTva: 'paiement',
    })[scrollTo];
    if (stepKey) setFoldedSteps(prev => ({ ...prev, [stepKey]: false }));
    setTimeout(() => {
      let target = null;
      if (scrollTo === 'regie') target = refRegie.current;
      else if (scrollTo === 'poseurs') target = refPoseurs.current;
      else if (scrollTo === 'fournisseurs') target = refFournisseurs.current;
      else if (scrollTo === 'paiement' || scrollTo === 'controleLivraison' || scrollTo === 'originaux' || scrollTo === 'tva' || scrollTo === 'recupTva') target = refPaiement.current;
      else if (scrollTo === 'equipeInterne') target = refEquipeInterne.current;
      else if (scrollTo === 'cq' || scrollTo === 'controleQualite') target = refCQ.current;
      else if (scrollTo === 'mairie' || scrollTo === 'envoiMairie') target = refMairie.current;
      else if (scrollTo === 'financement' || scrollTo === 'envoiBanque') target = refFinancement.current;
      else if (scrollTo === 'pose' || scrollTo === 'envoiPose') target = refPose.current;
      else if (scrollTo === 'consuel' || scrollTo === 'envoiConsuel') target = refConsuel.current;
      else if (scrollTo === 'raccordement' || scrollTo === 'envoiRaccordement' || scrollTo === 'aEnvoyerRaccordement') target = refRaccordement.current;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Effet flash pour attirer l'œil
        target.classList.add('ring-4', 'ring-violet-400', 'transition-all');
        setTimeout(() => target.classList.remove('ring-4', 'ring-violet-400'), 1800);
      }
    }, 150);
  }, [scrollTo, dossier.localId]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
  };

  const fmtRel = (iso) => {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (days === 0) return `auj. à ${time}`;
      if (days === 1) return `hier à ${time}`;
      if (days < 7) return `il y a ${days}j à ${time}`;
      if (days < 30) return `il y a ${Math.floor(days / 7)}sem à ${time}`;
      return `${formatDate(iso)} à ${time}`;
    } catch (e) { return ''; }
  };

  const lastHist = (d.historique || []).slice(-1)[0];
  const lastModBy = d.modifiedBy && d.modifiedBy !== d.createdBy ? d.modifiedBy : null;

  // Helpers d'édition rapide
  const inputCls = "w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-xs";

  const updateProduit = (idx, updates) => {
    const newList = [...dossierProduits];
    newList[idx] = { ...newList[idx], ...updates };
    onUpdate({ produits: newList });
  };
  const addProduit = () => {
    const newProd = { type: produits[0]?.id || 'PANNEAU_SOLAIRE', puissance: 6000, description: '', quantite: 1 };
    onUpdate({ produits: [...dossierProduits, newProd] });
  };
  const removeProduit = (idx) => {
    onUpdate({ produits: dossierProduits.filter((_, i) => i !== idx) });
  };

  const updatePoseur = (idx, updates) => {
    const list = [...(d.poseurs || [])];
    list[idx] = { ...list[idx], ...updates };
    onUpdate({ poseurs: list });
  };
  const addPoseur = () => {
    onUpdate({ poseurs: [...(d.poseurs || []), { nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] });
  };
  const removePoseur = (idx) => {
    onUpdate({ poseurs: (d.poseurs || []).filter((_, i) => i !== idx) });
  };

  const updateFournisseur = (idx, updates) => {
    const list = [...(d.fournisseurs || [])];
    list[idx] = { ...list[idx], ...updates };
    onUpdate({ fournisseurs: list });
  };
  const addFournisseur = () => {
    onUpdate({ fournisseurs: [...(d.fournisseurs || []), { nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] });
  };
  const removeFournisseur = (idx) => {
    onUpdate({ fournisseurs: (d.fournisseurs || []).filter((_, i) => i !== idx) });
  };

  return (
    <>
      {/* Overlay transparent (capture juste les clics pour fermer) */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panneau coulissant — étroit pour laisser voir la liste */}
      <div
        className="fixed right-0 top-0 bottom-0 w-[92%] sm:w-[420px] bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.15)] z-50 flex flex-col border-l border-slate-200"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER avec sélecteur de statut éditable */}
        <div className={`p-4 border-b border-slate-100 bg-gradient-to-br ${statut?.color || 'from-slate-400 to-slate-500'} text-white relative`}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 hover:bg-white/20 rounded-lg" title="Fermer">
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-3">
            <div className="text-3xl">{statut?.emoji || '📄'}</div>
            <div className="flex-1 min-w-0 pr-6">
              <h2 className="text-base font-bold truncate">{d.nom} {d.prenom}</h2>
              {d.id && <div className="text-[10px] opacity-90 mt-0.5 font-mono">#{d.id}</div>}
            </div>
          </div>
          {/* Sélecteur de statut + verrou anti auto-statut */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase opacity-80">Statut</label>
              <button
                onClick={() => onUpdate({ statutLocked: !d.statutLocked })}
                title={d.statutLocked
                  ? "Statut verrouillé — l'auto-statut n'écrasera plus ton choix. Clique pour déverrouiller."
                  : "Verrouiller le statut — empêche l'auto-statut de l'écraser. Utile si tu choisis un statut manuel hors cycle."}
                aria-label={d.statutLocked ? 'Statut verrouillé' : 'Verrouiller le statut'}
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded transition ${d.statutLocked ? 'bg-amber-300 text-amber-900 hover:bg-amber-200' : 'bg-white/20 text-white/80 hover:bg-white/30'}`}
              >
                {d.statutLocked ? '🔒 Verrouillé' : '🔓 Auto'}
              </button>
            </div>
            <select value={d.statut} onChange={(e) => onUpdate({ statut: e.target.value, statutLocked: true })} className="w-full px-3 py-2 bg-white/20 backdrop-blur border border-white/30 rounded-xl text-white font-bold text-sm appearance-none cursor-pointer">
              {STATUTS_ORDERED.filter(s => !s.legacy || s.id === d.statut).map(s => <option key={s.id} value={s.id} className="text-slate-800">{s.emoji}  {s.label}</option>)}
            </select>
            {/* Barre de progression du parcours */}
            {(() => {
              const idx = STATUT_ETAPE_INDEX[d.statut];
              if (idx === undefined) {
                return <div className="mt-2 text-[10px] font-semibold opacity-80">⚠️ Statut hors parcours</div>;
              }
              const refuse = d.statut === 'B3_REFUS_FINANCEMENT';
              const manque = d.statut === 'B1_MANQUE_DOC';
              const et = PARCOURS_ETAPES[idx];
              return (
                <div className="mt-2.5">
                  <div className="flex items-center gap-0.5">
                    {PARCOURS_ETAPES.map((e, i) => (
                      <div key={i} title={`${e.emoji} ${e.label}`}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < idx ? 'bg-white' :
                          i === idx ? (refuse ? 'bg-red-300' : manque ? 'bg-orange-300' : 'bg-white') :
                          'bg-white/25'
                        }`} />
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold opacity-90">
                    Étape {idx + 1}/{PARCOURS_ETAPES.length} — {et.emoji} {et.label}
                    {refuse && ' · refusé'}
                    {manque && ' · docs manquants'}
                  </div>
                </div>
              );
            })()}
          </div>
          {/* Actions rapides */}
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            <button onClick={onShowDocs} className="flex-1 min-w-[80px] bg-white/20 hover:bg-white/30 text-white px-2 py-1.5 rounded-lg font-semibold text-[10px] flex items-center justify-center gap-1 backdrop-blur">
              <Paperclip className="w-3 h-3" />Docs ({docCount})
            </button>
            <button onClick={onShowHist} className="flex-1 min-w-[80px] bg-white/20 hover:bg-white/30 text-white px-2 py-1.5 rounded-lg font-semibold text-[10px] flex items-center justify-center gap-1 backdrop-blur">
              <Activity className="w-3 h-3" />Hist. ({histCount})
            </button>
            <button onClick={onEdit} className="flex-1 min-w-[80px] bg-white text-slate-800 px-2 py-1.5 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1">
              <Edit3 className="w-3 h-3" />Tout éditer
            </button>
          </div>
          {/* 🏢 Sélecteur société — clic pour assigner sans ouvrir le form complet */}
          {societes.length > 1 && (
            <div className="mt-2 px-2 py-1.5 bg-white/15 border border-white/30 rounded-lg backdrop-blur">
              <div className="text-[9px] font-bold text-white/80 uppercase mb-1">🏢 Société</div>
              <div className="flex gap-1 flex-wrap">
                {societes.map(s => {
                  const isActive = d.societe === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onUpdate({ societe: s.id })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${isActive ? 'bg-white text-slate-800 border-white' : 'bg-white/10 text-white border-white/30 hover:bg-white/20'}`}
                    >
                      {s.logoUrl
                        ? <img src={s.logoUrl} alt={s.label} className="h-4 w-auto object-contain" />
                        : <span>{s.emoji}</span>}
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Bouton archiver / désarchiver */}
          <button
            onClick={() => onUpdate({
              archived: !d.archived,
              archivedAt: !d.archived ? new Date().toISOString() : null,
              autoArchived: false,
              manualArchive: !d.archived ? true : false, // ⚡ flag pour distinguer archivage manuel
            })}
            className={`mt-2 w-full px-3 py-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-2 ${d.archived ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300' : 'bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur'}`}
          >
            {d.archived ? '📤 Désarchiver — remettre dans les dossiers actifs' : '📦 Archiver manuellement'}
          </button>

          {d.archived && d.autoArchived && (
            <div className="mt-2 px-2 py-1.5 bg-emerald-100 border border-emerald-300 rounded-lg text-[10px] text-emerald-800 font-bold flex items-center gap-1">
              ✅ Archivé automatiquement — tous les paiements sont OK
            </div>
          )}

          {d.reprisDuArchive && (
            <div className="mt-2 px-2 py-1.5 bg-orange-100 border border-orange-300 rounded-lg text-[10px] text-orange-800 font-bold flex items-center gap-1">
              ⚠️ Dossier ressorti de l'archive (passé en {STATUTS.find(s => s.id === d.statut)?.label || 'problème'})
            </div>
          )}
        </div>

        {/* CONTENU SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* COORDONNÉES */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">📞 Coordonnées</h3>
            <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5 text-xs">
              {d.telephone && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">📞</span>
                  <a href={`tel:${d.telephone}`} className="font-semibold text-slate-700 hover:text-violet-600 hover:underline">{d.telephone}</a>
                </div>
              )}
              {d.email && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">✉️</span>
                  <a href={`mailto:${d.email}`} className="font-semibold text-slate-700 hover:text-violet-600 hover:underline truncate">{d.email}</a>
                </div>
              )}
              {(d.adresse || d.ville) && (
                <div className="flex items-start gap-2">
                  <span className="text-slate-400">🏠</span>
                  <div className="font-semibold text-slate-700 text-[11px]">
                    {d.adresse && <div>{d.adresse}</div>}
                    {(d.codePostal || d.ville) && <div>{d.codePostal} {d.ville}</div>}
                  </div>
                </div>
              )}
              {!d.telephone && !d.email && !d.adresse && !d.ville && (
                <div className="text-slate-400 italic text-center py-1 text-[11px]">Aucune coordonnée</div>
              )}
            </div>
          </div>

          {/* 📄 Documents à générer : déplacé dans la modale Documents
              (bouton "Docs" / paperclip) — regroupé avec les fichiers. */}

          {/* DATES — éditables */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">📅 Process du dossier</h3>

            {/* ============ ÉTAPE 1 : CONTRÔLE QUALITÉ ============ */}
            <div ref={refCQ} className={`border-2 rounded-xl p-2 mb-2 ${d.statutControleQualite === 'ok' ? 'bg-emerald-50 border-emerald-200' : d.statutControleQualite === 'pas_ok' ? 'bg-rose-50 border-rose-200' : 'bg-purple-50 border-purple-200'}`}>
              <button onClick={() => toggleStep('cq')} className={`w-full text-[10px] font-bold text-purple-700 uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.cq ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-purple-600 text-[9px]">{foldedSteps.cq ? '▶' : '▼'}</span>
                  <span>1️⃣ 📋 Contrôle qualité</span>
                  {foldedSteps.cq && d.dateControleQualite && (
                    <span className="text-purple-500 font-normal normal-case ml-1">— {new Date(d.dateControleQualite).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutControleQualite === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutControleQualite === 'pas_ok' ? 'bg-rose-100 text-rose-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutControleQualite === 'ok' ? '✓ Validé' : d.statutControleQualite === 'pas_ok' ? '✗ Refusé' : '⏳ Attente'}
                </span>
              </button>

              {!foldedSteps.cq && (<>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[10px] font-semibold text-purple-600 uppercase w-16 flex-shrink-0">📞 CQ</span>
                <input type="date" value={d.dateControleQualite || ''} onChange={(e) => onUpdate({ dateControleQualite: e.target.value })} className={inputCls} />
                <button onClick={() => onUpdate({ dateControleQualite: new Date().toISOString().split('T')[0] })} className="px-1.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-[9px] font-bold">Auj.</button>
              </div>

              {/* 3 boutons toggleables — toujours visibles */}
              <div className="grid grid-cols-3 gap-1">
                <button onClick={() => onUpdate({ statutControleQualite: '' })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${!d.statutControleQualite ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Attente</button>
                <button onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  onUpdate({ statutControleQualite: 'ok', dateControleQualite: d.dateControleQualite || today });
                }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutControleQualite === 'ok' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Validé</button>
                <button onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  onUpdate({ statutControleQualite: 'pas_ok', dateControleQualite: d.dateControleQualite || today });
                }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutControleQualite === 'pas_ok' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
              </div>

              {/* 📞 Appel ONOFF — adapté à la plateforme :
                  - Mobile : <a href="tel:"> car iOS/Android savent ouvrir ONOFF
                  - Desktop : bouton Web App seul (évite macOS Continuity qui
                    intercepte tel: et propose iPhone à la place d'ONOFF) */}
              {d.telephone && (
                <div className="mt-1.5">
                  {isMobileDevice() ? (
                    <a
                      href={`tel:${normalizePhoneE164(d.telephone)}`}
                      onClick={() => {
                        recordPendingOnoffCall({ dossierLocalId: d.localId, telephone: d.telephone, type: 'cq' });
                        if (!d.dateControleQualite) onUpdate({ dateControleQualite: new Date().toISOString().split('T')[0] });
                      }}
                      className="w-full px-3 py-2 rounded-lg text-[11px] font-bold border-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white border-purple-700 shadow-sm flex items-center justify-center gap-1.5 no-underline"
                      title={`Appeler ${d.telephone} via ONOFF`}
                    >
                      📞 Appeler avec ONOFF
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await recordPendingOnoffCall({ dossierLocalId: d.localId, telephone: d.telephone, type: 'cq' });
                        if (!d.dateControleQualite) onUpdate({ dateControleQualite: new Date().toISOString().split('T')[0] });
                        try { await navigator.clipboard.writeText(normalizePhoneE164(d.telephone)); } catch (e) {}
                        window.open('https://phone.onoffbusiness.com/', '_blank', 'noopener,noreferrer');
                      }}
                      className="w-full px-3 py-2 rounded-lg text-[11px] font-bold border-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white border-purple-700 shadow-sm flex items-center justify-center gap-1.5"
                      title="Ouvre ONOFF Web App dans un nouvel onglet + copie le numéro dans le presse-papier. Tu n'as plus qu'à coller (Cmd+V) dans le composeur ONOFF."
                    >
                      📞 Appeler avec ONOFF
                      <span className="text-[9px] font-normal opacity-80">(Web App)</span>
                    </button>
                  )}
                </div>
              )}

              {/* 📞 Tentatives d'appel — client ne répond pas, on garde la trace */}
              {!d.statutControleQualite && (
                <div className="mt-1.5 p-1.5 bg-white border border-purple-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-purple-700 uppercase">📞 Essais d'appel ({(d.tentativesCQ || []).length})</span>
                    <button
                      onClick={() => onUpdate({ tentativesCQ: [...(d.tentativesCQ || []), { datetime: new Date().toISOString() }] })}
                      className="text-[9px] font-bold text-white bg-purple-500 hover:bg-purple-600 px-2 py-0.5 rounded"
                      title="Logger un appel sans réponse — le client ne décroche pas"
                    >
                      + Pas répondu
                    </button>
                  </div>
                  {(d.tentativesCQ || []).length > 0 && (
                    <div className="space-y-0.5">
                      {(d.tentativesCQ || []).map((t, i) => {
                        const dt = new Date(t.datetime);
                        const fmt = dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600 px-1 py-0.5 bg-purple-50 rounded">
                            <span className="flex-1">📞 {fmt}</span>
                            <button
                              onClick={() => onUpdate({ tentativesCQ: (d.tentativesCQ || []).filter((_, j) => j !== i) })}
                              className="text-rose-400 hover:text-rose-600 text-[9px] px-1"
                              title="Supprimer cet essai"
                            >✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 💳 Crédits / leasings en cours du client (annoncés pendant l'appel CQ) */}
              <div className="mt-1.5 p-1.5 bg-white border border-purple-200 rounded">
                <label className="block text-[9px] font-bold text-purple-700 uppercase mb-1">💳 Crédits / leasings en cours du client</label>
                {(d.creditsClientCQ || []).map((c, idx) => (
                  <div key={idx} className="flex items-center gap-1 mb-1">
                    <select
                      value={c.type || 'conso'}
                      onChange={(e) => {
                        const next = [...(d.creditsClientCQ || [])];
                        next[idx] = { ...next[idx], type: e.target.value };
                        onUpdate({ creditsClientCQ: next });
                      }}
                      className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-[10px]"
                    >
                      {CREDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="€"
                      value={c.montant || ''}
                      onChange={(e) => {
                        const next = [...(d.creditsClientCQ || [])];
                        next[idx] = { ...next[idx], montant: e.target.value };
                        onUpdate({ creditsClientCQ: next });
                      }}
                      className="flex-shrink-0 w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-[10px]"
                    />
                    <button
                      onClick={() => {
                        const next = (d.creditsClientCQ || []).filter((_, i) => i !== idx);
                        onUpdate({ creditsClientCQ: next });
                      }}
                      className="flex-shrink-0 text-rose-400 hover:text-rose-600 text-[11px] px-1 font-bold"
                      title="Supprimer ce crédit"
                    >✕</button>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1">
                  <button
                    onClick={() => onUpdate({ creditsClientCQ: [...(d.creditsClientCQ || []), { type: 'conso', montant: '' }] })}
                    className="text-[9px] font-bold text-white bg-purple-500 hover:bg-purple-600 px-2 py-0.5 rounded"
                  >+ Ajouter un crédit</button>
                  {(d.creditsClientCQ || []).length > 0 && (
                    <span className="text-[9px] text-purple-700 font-bold">
                      Total : {(d.creditsClientCQ || []).reduce((s, c) => s + (parseFloat(c.montant) || 0), 0).toLocaleString('fr-FR')} €
                    </span>
                  )}
                </div>
              </div>

              {d.statutControleQualite === 'ok' && !d.dateEnvoiFin && (
                <div className="mt-1.5 px-2 py-1 bg-emerald-100 border border-emerald-300 rounded text-[10px] text-emerald-800 font-bold">✅ OK pour envoi banque ↓</div>
              )}
              {d.statutControleQualite === 'pas_ok' && (
                <div className="mt-1.5 px-2 py-1 bg-rose-100 border border-rose-300 rounded text-[10px] text-rose-800 font-bold">✗ Refusé — ne pas envoyer</div>
              )}

              {/* 🎤 Vocal du contrôle qualité — fichier téléversé ou lien externe. */}
              <div className="mt-2 p-1.5 bg-white border border-purple-200 rounded">
                <label className="block text-[9px] font-bold text-purple-700 uppercase mb-1 flex items-center justify-between flex-wrap gap-1">
                  <span className="flex items-center gap-1">
                    🎤 Vocal CQ
                    {d.vocalCQStoragePath && (
                      <span className="text-[8px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded-full">📁 Fichier</span>
                    )}
                    {!d.vocalCQStoragePath && d.onoffCallMeta && (
                      <span className="text-[8px] font-bold uppercase bg-purple-100 text-purple-700 px-1 py-0.5 rounded-full">ONOFF</span>
                    )}
                  </span>
                  {!d.vocalCQStoragePath && d.vocalCQUrl && isSafeMediaUrl(d.vocalCQUrl) && (
                    <a href={d.vocalCQUrl} download className="text-[9px] font-bold text-purple-600 hover:underline">⬇️</a>
                  )}
                </label>

                <VocalCqAudio storagePath={d.vocalCQStoragePath} fallbackUrl={d.vocalCQUrl} className="w-full" />

                {d.vocalCQStoragePath && d.onoffCallMeta && (
                  <div className="text-[9px] text-slate-600 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    {d.onoffCallMeta.callDuration > 0 && <span>⏱ {formatDurationMmSs(d.onoffCallMeta.callDuration)}</span>}
                    {d.onoffCallMeta.callStarted && <span>📅 {new Date(d.onoffCallMeta.callStarted).toLocaleDateString('fr-FR')}</span>}
                  </div>
                )}

                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <UploadVocalCqButton
                    onUploaded={(path) => onUpdate({ vocalCQStoragePath: path, vocalCQUrl: '' })}
                    label={d.vocalCQStoragePath ? '🔄 Remplacer' : '📤 Téléverser'}
                    className="px-2 py-0.5 bg-purple-500 hover:bg-purple-600 text-white rounded text-[9px] font-bold disabled:opacity-60"
                  />
                  {(d.vocalCQStoragePath || d.vocalCQUrl) && (
                    <button
                      onClick={() => {
                        if (window.confirm('Supprimer le vocal ?')) onUpdate({ vocalCQStoragePath: '', vocalCQUrl: '' });
                      }}
                      className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-[9px] font-bold"
                    >🗑️</button>
                  )}
                </div>

                <details className="mt-1">
                  <summary className="text-[9px] text-slate-500 cursor-pointer hover:text-purple-600">🔗 Coller un lien externe</summary>
                  <input
                    type="url"
                    value={d.vocalCQUrl || ''}
                    onChange={(e) => onUpdate({ vocalCQUrl: e.target.value, vocalCQStoragePath: e.target.value ? '' : d.vocalCQStoragePath })}
                    placeholder="https://..."
                    className={inputCls + ' text-[10px] mt-1'}
                  />
                </details>
              </div>
              </>)}
            </div>

            {/* ============ ÉTAPE 1bis : MAIRIE ============ */}
            <div ref={refMairie} className="border-2 rounded-xl p-2 mb-2 bg-indigo-50 border-indigo-200">
              <button onClick={() => toggleStep('mairie')} className={`w-full text-[10px] font-bold uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.mairie ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5 text-indigo-700">
                  <span className="text-indigo-600 text-[9px]">{foldedSteps.mairie ? '▶' : '▼'}</span>
                  <span>🏛️ Mairie</span>
                  {foldedSteps.mairie && d.dateEnvoiMairie && (
                    <span className="text-indigo-500 font-normal normal-case ml-1">— envoi {new Date(d.dateEnvoiMairie).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutMairie === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutMairie === 'refusé' ? 'bg-rose-100 text-rose-700' :
                  d.dateEnvoiMairie ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutMairie === 'accepté' ? '✓ Accepté' : d.statutMairie === 'refusé' ? '✗ Refusé' : d.dateEnvoiMairie ? '📤 Envoyé' : '⏳ Pas envoyé'}
                </span>
              </button>
              {!foldedSteps.mairie && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📤 Envoi</label>
                    <div className="flex gap-1">
                      <input type="date" value={d.dateEnvoiMairie || ''} onChange={(e) => onUpdate({ dateEnvoiMairie: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-indigo-200 rounded text-[10px]" />
                      <button onClick={() => onUpdate({ dateEnvoiMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📨 Récépissé</label>
                    <div className="flex gap-1">
                      <input type="date" value={d.dateRecepisseMairie || ''} onChange={(e) => onUpdate({ dateRecepisseMairie: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-indigo-200 rounded text-[10px]" />
                      <button onClick={() => onUpdate({ dateRecepisseMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Accord</label>
                    <div className="flex gap-1">
                      <input type="date" value={d.dateAccordMairie || ''} onChange={(e) => onUpdate({ dateAccordMairie: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-indigo-200 rounded text-[10px]" />
                      <button onClick={() => onUpdate({ dateAccordMairie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                    </div>
                  </div>
                </div>
                {/* Upload PDF récépissé dans l'aperçu rapide */}
                <div className="px-2 py-1.5 bg-white border border-indigo-200 rounded">
                  <label className="block text-[9px] font-semibold text-indigo-700 uppercase mb-1">📎 Récépissé (PDF)</label>
                  <FactureFileInput
                    fileId={d.recepisseMairieFileId || ''}
                    onChange={(id) => onUpdate({ recepisseMairieFileId: id })}
                    color="indigo"
                    label="récépissé mairie"
                  />
                </div>
                {d.dateEnvoiMairie && (
                  <div className="mt-1.5 grid grid-cols-3 gap-1">
                    <button onClick={() => onUpdate({ statutMairie: '' })} className={`px-1.5 py-1 rounded text-[10px] font-bold border ${!d.statutMairie ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-amber-600 border-amber-200'}`}>⏳ Attente</button>
                    <button onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      onUpdate({ statutMairie: 'accepté', dateAccordMairie: d.dateAccordMairie || today });
                    }} className={`px-1.5 py-1 rounded text-[10px] font-bold border ${d.statutMairie === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-white text-emerald-600 border-emerald-200'}`}>✓ Accepté</button>
                    <button onClick={() => onUpdate({ statutMairie: 'refusé' })} className={`px-1.5 py-1 rounded text-[10px] font-bold border ${d.statutMairie === 'refusé' ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'}`}>✗ Refusé</button>
                  </div>
                )}
                {d.statutMairie === 'refusé' && (
                  <div className="mt-1 px-2 py-1 bg-rose-50 border border-rose-200 rounded text-[10px] text-rose-700 font-semibold">
                    ✗ Refusé — renvoie la déclaration après modif. Reste en alerte 🏛️ jusqu'à acceptation.
                  </div>
                )}
                {(d.envoisMairie || []).length > 0 && (
                  <div className="mt-1.5 px-2 py-1 bg-white border border-indigo-200 rounded text-[10px] text-slate-600">
                    📋 {(d.envoisMairie || []).length} envoi(s) — détail dans le formulaire complet
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ============ ÉTAPE 2 : FINANCEMENT ============ */}
            <div ref={refFinancement} className="border-2 rounded-xl p-2 mb-2 bg-blue-50 border-blue-200">
              <button onClick={() => toggleStep('fin')} className={`w-full text-[10px] font-bold uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.fin ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5 text-blue-700">
                  <span className="text-blue-600 text-[9px]">{foldedSteps.fin ? '▶' : '▼'}</span>
                  <span>2️⃣ 💳 Financement</span>
                  {foldedSteps.fin && d.financement && (
                    <span className="text-blue-500 font-normal normal-case ml-1">— {d.financement}{d.dateEnvoiFin ? ` · envoi ${new Date(d.dateEnvoiFin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : ''}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutFin === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutFin === 'refusé' ? 'bg-rose-100 text-rose-700' :
                  d.statutFin === 'manque_doc' ? 'bg-orange-100 text-orange-700' :
                  d.statutFin === 'envoyé' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutFin === 'accepté' ? '✓ Accepté' :
                   d.statutFin === 'refusé' ? '✗ Refusé' :
                   d.statutFin === 'manque_doc' ? '📄 Manque docs' :
                   d.statutFin === 'envoyé' ? '📤 Envoyé' : '⏳ Pas envoyé'}
                </span>
              </button>

              {!foldedSteps.fin && (<>
              {/* Sélecteur du financeur — éditable directement (choisir COMPTANT pour un client sans banque) */}
              <div className="mb-2">
                <label className="block text-[9px] font-semibold text-blue-600 uppercase mb-1">Financeur</label>
                <select value={d.financement || ''} onChange={(e) => onUpdate({ financement: e.target.value })} className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-blue-700">
                  <option value="">— Choisir un financeur —</option>
                  {FINANCEMENTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {d.envoisHistorique && d.envoisHistorique.length > 0 && (
                <div className="mb-1.5 p-1.5 bg-white border border-rose-200 rounded">
                  <div className="text-[9px] font-bold text-rose-700 uppercase mb-0.5">📜 Refus précédents ({d.envoisHistorique.length})</div>
                  {d.envoisHistorique.map((env, i) => {
                    const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '?';
                    return (
                      <div key={i} className="text-[9px] flex items-baseline gap-1 flex-wrap bg-rose-50 rounded px-1.5 py-0.5">
                        <span className="font-bold text-slate-700">{i + 1}.</span>
                        <span className="font-bold text-rose-700">{env.financeur}</span>
                        <span className="text-slate-500">📤 envoi <strong className="text-slate-700">{fmtD(env.dateEnvoi)}</strong></span>
                        {env.dateRetour && <span className="text-slate-500">→ 📥 refus <strong className="text-slate-700">{fmtD(env.dateRetour)}</strong></span>}
                        <span className="ml-auto text-rose-600 font-bold">✗</span>
                      </div>
                    );
                  })}
                  <div className="mt-1 text-[9px] text-slate-500 italic">
                    Actuel : <strong className="text-blue-700">{d.financement || 'à choisir'}</strong> {d.dateEnvoiFin && `(renvoyé ${new Date(d.dateEnvoiFin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })})`}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📤 Envoi</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateEnvoiFin || ''} onChange={(e) => onUpdate({ dateEnvoiFin: e.target.value, statutFin: e.target.value && !d.statutFin ? 'envoyé' : d.statutFin })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-blue-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateEnvoiFin: new Date().toISOString().split('T')[0], statutFin: d.statutFin || 'envoyé' })} className="flex-shrink-0 px-1.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📥 Retour</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateRetourFin || ''} onChange={(e) => onUpdate({ dateRetourFin: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-blue-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateRetourFin: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Accord</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateAccord || ''} onChange={(e) => onUpdate({ dateAccord: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-blue-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateAccord: new Date().toISOString().split('T')[0], statutFin: 'accepté' })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* Statut banque — toujours visible. Chaque bouton remplit les
                  dates manquantes pour zéro friction :
                  - ⏳ Envoyé : si pas d'envoi → today, reset retour/accord
                  - ✓ Accepté : envoi+retour+accord auto à today si vides
                  - ✗ Refusé : envoi+retour auto à today si vides */}
              <div className="mt-1.5">
                <div className="text-[9px] font-semibold text-slate-500 uppercase mb-1">Statut banque (clique pour changer)</div>
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutFin: 'envoyé', dateEnvoiFin: d.dateEnvoiFin || today, dateRetourFin: '', dateAccord: '' });
                  }} className={`px-1.5 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutFin === 'envoyé' || !d.statutFin ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Envoyé</button>
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutFin: 'manque_doc', dateEnvoiFin: d.dateEnvoiFin || today, dateRetourFin: d.dateRetourFin || today });
                  }} className={`px-1.5 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutFin === 'manque_doc' ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50'}`}>📄 Manque docs</button>
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutFin: 'accepté', dateEnvoiFin: d.dateEnvoiFin || today, dateRetourFin: d.dateRetourFin || today, dateAccord: d.dateAccord || today });
                  }} className={`px-1.5 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutFin === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Accepté</button>
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutFin: 'refusé', dateEnvoiFin: d.dateEnvoiFin || today, dateRetourFin: d.dateRetourFin || today });
                  }} className={`px-1.5 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutFin === 'refusé' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                </div>
                {d.statutFin === 'manque_doc' && (
                  <div className="mt-1.5 p-2 bg-orange-50 border-2 border-orange-300 rounded-lg space-y-2">
                    {/* 1. Demande banque */}
                    <div>
                      <div className="text-[10px] font-bold text-orange-700 mb-0.5">1️⃣ 📄 {d.financement || 'Banque'} demande :</div>
                      <textarea
                        value={d.motifManqueDoc || ''}
                        onChange={(e) => onUpdate({ motifManqueDoc: e.target.value })}
                        placeholder="Ex : Bulletin de paie de mars, RIB, justif domicile…"
                        rows={2}
                        className="w-full px-2 py-1 bg-white border border-orange-200 rounded text-[10px]"
                      />
                    </div>
                    {/* 2. Régie prévenue */}
                    <div>
                      <div className="text-[10px] font-bold text-orange-700 mb-0.5">2️⃣ 🤝 Régie prévenue le</div>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateNotifRegie || ''} onChange={(e) => onUpdate({ dateNotifRegie: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateNotifRegie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                    {/* 3. Reçu de la régie */}
                    <div>
                      <div className="text-[10px] font-bold text-orange-700 mb-0.5">3️⃣ 📥 Docs reçus de la régie le</div>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateRecuRegie || ''} onChange={(e) => onUpdate({ dateRecuRegie: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateRecuRegie: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                    {/* 4. Renvoi banque */}
                    <div>
                      <div className="text-[10px] font-bold text-orange-700 mb-0.5">4️⃣ 📤 Renvoi à {d.financement || 'la banque'} le</div>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateRenvoiDocs || ''} onChange={(e) => onUpdate({ dateRenvoiDocs: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateRenvoiDocs: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                    {d.dateRenvoiDocs && (
                      <button onClick={() => {
                        onUpdate({ statutFin: 'envoyé', dateEnvoiFin: d.dateRenvoiDocs, dateRetourFin: '', dateAccord: '' });
                      }} className="w-full px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold">⏳ Repasser en "Envoyé"</button>
                    )}
                  </div>
                )}
              </div>

              {d.statutFin === 'refusé' && (
                <div className="mt-1.5 p-2 bg-rose-50 border-2 border-rose-300 rounded-lg">
                  <div className="text-[10px] font-bold text-rose-700 mb-1.5">⚠️ Refusé par {d.financement} → renvoyer chez :</div>
                  <select onChange={(e) => {
                    const newFin = e.target.value;
                    if (!newFin) return;
                    const archive = { financeur: d.financement, dateEnvoi: d.dateEnvoiFin, dateRetour: d.dateRetourFin, statut: 'refusé', note: '' };
                    // On envoie explicitement statut: EN_COURS_FINANCEMENT pour
                    // que le dossier sorte de "REFUS DE FINANCEMENT" même si
                    // l'auto-statut a un souci. dateRetourFin/dateAccord reset
                    // (nouvelle banque, nouveau cycle).
                    onUpdate({
                      envoisHistorique: [...(d.envoisHistorique || []), archive],
                      financement: newFin,
                      dateEnvoiFin: new Date().toISOString().split('T')[0],
                      dateRetourFin: '',
                      dateAccord: '',
                      statutFin: 'envoyé',
                      statut: 'B1_EN_COURS_FINANCEMENT',
                    });
                  }} defaultValue="" className="w-full px-2 py-1.5 bg-white border border-rose-300 rounded text-[11px] font-bold text-rose-700">
                    <option value="">— Choisir une autre banque —</option>
                    {FINANCEMENTS.filter(f => f !== d.financement).map(f => <option key={f} value={f}>📤 Renvoyer à {f}</option>)}
                  </select>
                </div>
              )}

              {/* ✅ Accord financement reçu → CTA pour prévenir la régie qui a
                  apporté le dossier afin qu'elle programme la pose.
                  S'affiche tant que la date de pose n'est pas remplie. */}
              {d.statutFin === 'accepté' && !d.dateEnvoiPose && (() => {
                // On masque les régies déjà prévenues (map { [regieNom]: ISO }).
                // Si TOUTES les régies du dossier sont prévenues → on cache la CTA.
                const notified = d.regiesNotifiedAccord || {};
                const regiesDuDossier = (d.regies || []).filter(r => r.nom && !notified[r.nom]);
                if (regiesDuDossier.length === 0) return null;
                // Marque une régie comme prévenue (cache la CTA pour elle) +
                // ajoute une entrée dans l'historique du dossier.
                const markNotified = (regieNom, channel) => {
                  const now = new Date().toISOString();
                  const nextNotified = { ...(d.regiesNotifiedAccord || {}), [regieNom]: now };
                  const histEntry = {
                    date: now,
                    action: 'notif_regie_accord',
                    cible_nom: regieNom,
                    channel, // 'whatsapp' | 'email_oauth' | 'email_smtp' | 'gmail_compose'
                    motif: 'accord_financement',
                  };
                  onUpdate({
                    regiesNotifiedAccord: nextNotified,
                    historique: [...(d.historique || []), histEntry],
                  });
                };
                const adresseLignes = [d.adresse, [d.codePostal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                const message = [
                  `🌞 Bonjour, accord financement reçu pour ${(d.nom || '').toUpperCase()}${d.prenom ? ' ' + d.prenom : ''} (${d.financement || 'banque'}).`,
                  '',
                  d.id ? `Dossier n° ${d.id}` : null,
                  adresseLignes ? `📍 ${adresseLignes}` : null,
                  d.telephone ? `📞 ${d.telephone}` : null,
                  d.puissance ? `☀️ ${d.puissance} Wc` : null,
                  '',
                  'Tu peux programmer la pose, merci !',
                ].filter(v => v != null).join('\n');
                const mailSubject = `Accord financement — ${(d.nom || '').toUpperCase()}${d.prenom ? ' ' + d.prenom : ''} à programmer en pose`;
                // Ouvre directement la compose Gmail web avec destinataire + sujet
                // + corps pré-remplis. Si l'utilisateur est connecté à Gmail,
                // ça ouvre la fenêtre de rédaction tout de suite. Plus fiable
                // que mailto: qui ouvre un client mail aléatoire (Mail.app,
                // Outlook…) selon les réglages du device.
                // Lien Gmail compose. Si l'utilisateur a configuré son email
                // par défaut dans Réglages → on ajoute &authuser=X pour que
                // Gmail ouvre directement avec le bon compte sélectionné
                // (utile quand plusieurs comptes Google sont ouverts).
                const defaultFromEmail = emailConfig?.smtpUser || gmailOAuth?.email || '';
                const gmailCompose = (to) => {
                  const params = new URLSearchParams({
                    view: 'cm', fs: '1',
                    to, su: mailSubject, body: message,
                  });
                  if (defaultFromEmail) params.set('authuser', defaultFromEmail);
                  return `https://mail.google.com/mail/?${params.toString()}`;
                };
                return (
                  <div className="mt-1.5 p-2 bg-emerald-50 border-2 border-emerald-300 rounded-lg">
                    <div className="text-[10px] font-bold text-emerald-700 mb-1.5">✅ Accord reçu → prévenir la régie pour programmer la pose</div>
                    <div className="space-y-1.5">
                      {regiesDuDossier.map((r, idx) => {
                        const contact = (regiesContacts || {})[r.nom];
                        const tel = contact && (typeof contact === 'string' ? contact : contact.tel);
                        const email = contact && typeof contact === 'object' ? contact.email : '';
                        const hasContact = tel || email;
                        return (
                          <div key={idx} className="bg-white border border-emerald-200 rounded p-1.5">
                            <div className="text-[10px] font-bold text-slate-700 mb-1">🤝 {r.nom}</div>
                            {hasContact ? (
                              <div className="grid grid-cols-2 gap-1">
                                {tel ? (
                                  <a
                                    href={buildWhatsAppLink(tel, message)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => markNotified(r.nom, 'whatsapp')}
                                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white rounded text-[10px] font-bold"
                                    title={`WhatsApp ${r.nom} (${tel})`}
                                  >
                                    📲 WhatsApp
                                  </a>
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic px-1 py-1.5">📲 Pas de tél.</span>
                                )}
                                {email ? (
                                  gmailOAuth?.connected ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession();
                                          const headers = { 'Content-Type': 'application/json' };
                                          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                          const res = await fetch('/api/send-email', {
                                            method: 'POST',
                                            headers,
                                            body: JSON.stringify({
                                              provider: 'gmail-oauth',
                                              to: email,
                                              subject: mailSubject,
                                              text: message,
                                              fromName: emailConfig?.fromName || 'CRM Solaire',
                                            }),
                                          });
                                          const payload = await res.json().catch(() => ({}));
                                          if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
                                          markNotified(r.nom, 'email_oauth');
                                          alert(`✅ Email envoyé à ${r.nom} (${email}) depuis ${gmailOAuth.email}`);
                                        } catch (e) {
                                          alert(`❌ Envoi email : ${e.message}`);
                                        }
                                      }}
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                      title={`Envoie l'email automatiquement à ${r.nom} (${email}) depuis ${gmailOAuth.email}`}
                                    >
                                      📧 Envoyer
                                    </button>
                                  ) : emailConfig?.smtpUser && emailConfig?.smtpPass ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession();
                                          const headers = { 'Content-Type': 'application/json' };
                                          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                          const res = await fetch('/api/send-email', {
                                            method: 'POST',
                                            headers,
                                            body: JSON.stringify({
                                              to: email,
                                              subject: mailSubject,
                                              text: message,
                                              smtpUser: emailConfig.smtpUser,
                                              smtpPass: emailConfig.smtpPass,
                                              fromName: emailConfig.fromName || 'CRM Solaire',
                                            }),
                                          });
                                          const payload = await res.json().catch(() => ({}));
                                          if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
                                          markNotified(r.nom, 'email_smtp');
                                          alert(`✅ Email envoyé à ${r.nom} (${email})`);
                                        } catch (e) {
                                          alert(`❌ Envoi email : ${e.message}`);
                                        }
                                      }}
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                      title={`Envoie l'email via SMTP app password depuis ${emailConfig.smtpUser}`}
                                    >
                                      📧 Envoyer
                                    </button>
                                  ) : (
                                    <a
                                      href={gmailCompose(email)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => markNotified(r.nom, 'gmail_compose')}
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                      title={`Ouvre Gmail (configure Réglages → Email d'envoi pour un envoi auto)`}
                                    >
                                      📧 Gmail
                                    </a>
                                  )
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic px-1 py-1.5">📧 Pas d'email</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[9px] text-amber-600 italic">⚠️ Ajoute le tél/email du compte rattaché à {r.nom} dans Réglages → Utilisateurs pour pouvoir prévenir en 1 clic</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {d.dateEnvoiFin && !d.dateRetourFin && d.statutFin === 'envoyé' && (() => {
                const jours = Math.floor((new Date() - new Date(d.dateEnvoiFin)) / 86400000);
                if (jours <= 2) return <div className="mt-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-700">⏳ {jours}j — en attente</div>;
                return <div className="mt-1.5 px-2 py-1 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-700 font-bold">⚠️ {jours}j sans retour — relance !</div>;
              })()}

              {/* 🔄 Bascule banque effectuée → CTA pour prévenir la régie que
                  le dossier a été renvoyé chez un autre financeur après refus.
                  S'affiche quand on a au moins 1 refus archivé ET qu'on est
                  reparti en attente chez un nouveau financeur. */}
              {d.statutFin === 'envoyé' && Array.isArray(d.envoisHistorique) && d.envoisHistorique.some(h => h.statut === 'refusé') && (() => {
                const regiesDuDossier = (d.regies || []).filter(r => r.nom);
                if (regiesDuDossier.length === 0) return null;
                const dernierRefus = [...d.envoisHistorique].reverse().find(h => h.statut === 'refusé');
                const ancien = dernierRefus?.financeur || 'la précédente banque';
                const nouveau = d.financement || 'un nouveau financeur';
                const message = [
                  `🌞 Bonjour, mise à jour pour ${(d.nom || '').toUpperCase()}${d.prenom ? ' ' + d.prenom : ''}.`,
                  '',
                  d.id ? `Dossier n° ${d.id}` : null,
                  '',
                  `❌ Refusé par ${ancien}.`,
                  `📤 Renvoyé chez ${nouveau} — en attente de retour.`,
                  '',
                  'Je vous tiens au courant dès que j\'ai un retour.',
                ].filter(v => v != null).join('\n');
                const mailSubject = `Bascule financement — ${(d.nom || '').toUpperCase()}${d.prenom ? ' ' + d.prenom : ''} envoyé chez ${nouveau}`;
                // defaultFromEmail est défini dans l'autre CTA (accord) — on
                // le redéfinit localement ici pour éviter le ReferenceError
                // quand l'utilisateur n'a pas encore d'accord (donc l'autre
                // CTA ne s'est jamais rendue → la variable n'existe pas).
                const defaultFromEmailB = emailConfig?.smtpUser || gmailOAuth?.email || '';
                const gmailComposeBascule = (to) => {
                  const params = new URLSearchParams({
                    view: 'cm', fs: '1',
                    to, su: mailSubject, body: message,
                  });
                  if (defaultFromEmailB) params.set('authuser', defaultFromEmailB);
                  return `https://mail.google.com/mail/?${params.toString()}`;
                };
                return (
                  <div className="mt-1.5 p-2 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div className="text-[10px] font-bold text-blue-700 mb-1.5">🔄 Bascule banque effectuée → prévenir la régie</div>
                    <div className="space-y-1.5">
                      {regiesDuDossier.map((r, idx) => {
                        const contact = (regiesContacts || {})[r.nom];
                        const tel = contact && (typeof contact === 'string' ? contact : contact.tel);
                        const email = contact && typeof contact === 'object' ? contact.email : '';
                        const hasContact = tel || email;
                        return (
                          <div key={idx} className="bg-white border border-blue-200 rounded p-1.5">
                            <div className="text-[10px] font-bold text-slate-700 mb-1">🤝 {r.nom}</div>
                            {hasContact ? (
                              <div className="grid grid-cols-2 gap-1">
                                {tel ? (
                                  <a
                                    href={buildWhatsAppLink(tel, message)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white rounded text-[10px] font-bold"
                                    title={`WhatsApp ${r.nom} (${tel})`}
                                  >
                                    📲 WhatsApp
                                  </a>
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic px-1 py-1.5">📲 Pas de tél.</span>
                                )}
                                {email ? (
                                  gmailOAuth?.connected ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession();
                                          const headers = { 'Content-Type': 'application/json' };
                                          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                          const res = await fetch('/api/send-email', {
                                            method: 'POST', headers,
                                            body: JSON.stringify({ provider: 'gmail-oauth', to: email, subject: mailSubject, text: message, fromName: emailConfig?.fromName || 'CRM Solaire' }),
                                          });
                                          const p = await res.json().catch(() => ({}));
                                          if (!res.ok) throw new Error(p.error || `Erreur ${res.status}`);
                                          alert(`✅ Email envoyé à ${r.nom} (${email})`);
                                        } catch (e) { alert(`❌ Envoi email : ${e.message}`); }
                                      }}
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                    >
                                      📧 Envoyer
                                    </button>
                                  ) : emailConfig?.smtpUser && emailConfig?.smtpPass ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession();
                                          const headers = { 'Content-Type': 'application/json' };
                                          if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                          const res = await fetch('/api/send-email', {
                                            method: 'POST', headers,
                                            body: JSON.stringify({ to: email, subject: mailSubject, text: message, smtpUser: emailConfig.smtpUser, smtpPass: emailConfig.smtpPass, fromName: emailConfig.fromName || 'CRM Solaire' }),
                                          });
                                          const p = await res.json().catch(() => ({}));
                                          if (!res.ok) throw new Error(p.error || `Erreur ${res.status}`);
                                          alert(`✅ Email envoyé à ${r.nom} (${email})`);
                                        } catch (e) { alert(`❌ Envoi email : ${e.message}`); }
                                      }}
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                    >
                                      📧 Envoyer
                                    </button>
                                  ) : (
                                    <a
                                      href={gmailComposeBascule(email)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                                      title={`Ouvre Gmail (configure Réglages → Email d'envoi pour un envoi auto)`}
                                    >
                                      📧 Gmail
                                    </a>
                                  )
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic px-1 py-1.5">📧 Pas d'email</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[9px] text-amber-600 italic">⚠️ Ajoute le tél/email du compte rattaché à {r.nom} dans Réglages → Utilisateurs pour pouvoir prévenir en 1 clic</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              </>)}
            </div>

            {/* ============ ÉTAPE 2 : POSE ============ */}
            <div ref={refPose} className={`border-2 rounded-xl p-2 mb-2 ${d.statutPose === 'client_refuse' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-200'}`}>
              <button onClick={() => toggleStep('pose')} className={`w-full text-[10px] font-bold text-amber-700 uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.pose ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-600 text-[9px]">{foldedSteps.pose ? '▶' : '▼'}</span>
                  <span>3️⃣ 🔧 Pose</span>
                  {foldedSteps.pose && d.dateInsta && (
                    <span className="text-amber-500 font-normal normal-case ml-1">— {new Date(d.dateInsta).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutPose === 'visite_ok' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutPose === 'client_refuse' ? 'bg-rose-100 text-rose-700' :
                  d.statutPose === 'envoyé' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutPose === 'visite_ok' ? '✓ Posé' : d.statutPose === 'client_refuse' ? '✗ Refus' : d.statutPose === 'envoyé' ? '📅 Planifié' : '⏳ Pas planifié'}
                </span>
              </button>

              {!foldedSteps.pose && (<>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📅 Date pose</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateEnvoiPose || ''} onChange={(e) => onUpdate({ dateEnvoiPose: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateEnvoiPose: new Date().toISOString().split('T')[0], statutPose: d.statutPose || 'envoyé' })} className="flex-shrink-0 px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📞 Visite</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateVisitePose || ''} onChange={(e) => onUpdate({ dateVisitePose: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateVisitePose: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Posé le</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateInsta || ''} onChange={(e) => onUpdate({ dateInsta: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateInsta: new Date().toISOString().split('T')[0], statutPose: 'visite_ok' })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* 3 boutons toggleables — toujours visibles.
                  Si le dossier était passé en ANNULER via un clic ✗ Refuse,
                  on remet statut=A_EN_COURS quand on clique Attente ou Posé
                  pour que l'auto-statut puisse recalculer correctement. */}
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                <button onClick={() => {
                  const reset = (d.statut === 'W2_ANNULER' || d.statut === 'ANNULER') ? { statut: 'A_EN_COURS' } : {};
                  onUpdate({ statutPose: 'envoyé', ...reset });
                }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${!d.statutPose || d.statutPose === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Attente</button>
                <button onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  const reset = (d.statut === 'W2_ANNULER' || d.statut === 'ANNULER') ? { statut: 'A_EN_COURS' } : {};
                  onUpdate({ statutPose: 'visite_ok', dateEnvoiPose: d.dateEnvoiPose || today, dateInsta: d.dateInsta || today, ...reset });
                }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutPose === 'visite_ok' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Posé</button>
                <button onClick={() => setPoseRateeForm({ ...poseRateeForm, visible: !poseRateeForm.visible })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${poseRateeForm.visible ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
              </div>

              {poseRateeForm.visible && (
                <div className="mt-2 p-2 bg-rose-50 border-2 border-rose-300 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">Pose ratée — pénalité régie</div>
                  <div>
                    <label className="block text-[9px] font-semibold text-rose-600 mb-1">Motif</label>
                    <select value={poseRateeForm.motif} onChange={(e) => setPoseRateeForm({ ...poseRateeForm, motif: e.target.value })} className="w-full px-2 py-1 bg-white border border-rose-300 rounded text-[11px] font-bold text-rose-700">
                      <option value="client_absent">Client absent</option>
                      <option value="client_refuse">Client refuse</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-rose-600 mb-1">Pénalité régie (selon distance)</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[500, 750, 1000].map(p => (
                        <button key={p} onClick={() => setPoseRateeForm({ ...poseRateeForm, penalite: p })} className={`px-1 py-1 rounded text-[10px] font-bold border-2 ${poseRateeForm.penalite === p ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>{p} €</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-700 cursor-pointer">
                    <input type="checkbox" checked={poseRateeForm.definitif} onChange={(e) => setPoseRateeForm({ ...poseRateeForm, definitif: e.target.checked })} className="w-3.5 h-3.5 accent-rose-600" />
                    📛 Annulation définitive (le client ne veut plus rien)
                  </label>
                  <div className="flex gap-1">
                    <button onClick={() => setPoseRateeForm({ visible: false, motif: 'client_absent', penalite: 500, definitif: false })} className="flex-1 px-2 py-1.5 bg-white border border-slate-300 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-50">Annuler</button>
                    <button onClick={() => {
                      const regieNom = (d.regies && d.regies[0]?.nom) || d.regie || '';
                      const tentative = {
                        date: d.dateEnvoiPose || new Date().toISOString().split('T')[0],
                        motif: poseRateeForm.motif,
                        penalite: poseRateeForm.penalite,
                        regie: regieNom,
                        definitif: poseRateeForm.definitif,
                        regleAt: null,
                      };
                      if (poseRateeForm.definitif) {
                        // Annulation définitive : statut → ANNULER, on garde la date
                        // pour traçabilité et on marque statutPose='client_refuse'.
                        onUpdate({
                          tentativesPose: [...(d.tentativesPose || []), tentative],
                          statutPose: 'client_refuse',
                          statut: 'W2_ANNULER',
                        });
                      } else {
                        // Pose ratée : on vide les dates pour permettre la reprogrammation
                        onUpdate({
                          tentativesPose: [...(d.tentativesPose || []), tentative],
                          dateEnvoiPose: '',
                          dateVisitePose: '',
                          statutPose: '',
                        });
                      }
                      setPoseRateeForm({ visible: false, motif: 'client_absent', penalite: 500, definitif: false });
                    }} className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold text-white ${poseRateeForm.definitif ? 'bg-red-700 hover:bg-red-800' : 'bg-rose-500 hover:bg-rose-600'}`}>{poseRateeForm.definitif ? '📛 Annuler le dossier' : '📌 Enregistrer & repartir'}</button>
                  </div>
                </div>
              )}

              {/* Historique des tentatives ratées */}
              {(d.tentativesPose || []).length > 0 && (
                <div className="mt-2 p-2 bg-white border border-rose-200 rounded-lg">
                  <div className="text-[9px] font-bold text-rose-700 uppercase mb-1">📜 Tentatives ratées ({(d.tentativesPose || []).length})</div>
                  <div className="space-y-1">
                    {(d.tentativesPose || []).map((t, i) => {
                      const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '?';
                      const motifLabel = t.motif === 'client_absent' ? 'Client absent' : t.motif === 'client_refuse' ? 'Client refuse' : 'Autre';
                      return (
                        <div key={i} className="text-[10px] flex items-center gap-1 flex-wrap bg-rose-50 rounded px-1.5 py-1">
                          <span className="font-bold text-slate-700">{i + 1}.</span>
                          <span className="text-slate-600">{fmtD(t.date)}</span>
                          <span className="text-rose-700 font-semibold">· {motifLabel}</span>
                          {t.regie && <span className="text-slate-500">· {t.regie}</span>}
                          {t.definitif && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-700 text-white">DÉFINITIF</span>}
                          <span className="ml-auto font-bold text-rose-700">{t.penalite} €</span>
                          <button
                            onClick={() => {
                              if (!window.confirm(`Supprimer la pénalité du ${fmtD(t.date)} (${t.penalite} €) ?`)) return;
                              const next = (d.tentativesPose || []).filter((_, idx) => idx !== i);
                              // Si le dossier était annulé à cause d'une tentative DÉFINITIVE
                              // et qu'il ne reste plus de tentative définitive après suppression,
                              // on sort de l'annulation et l'auto-statut reprend la main.
                              const wasAnnule = d.statut === 'W2_ANNULER' || d.statut === 'ANNULER';
                              const hasDefinitifLeft = next.some(tt => tt.definitif);
                              const updates = { tentativesPose: next };
                              if (wasAnnule && !hasDefinitifLeft) {
                                updates.statut = 'A_EN_COURS';
                                updates.statutPose = '';
                              }
                              onUpdate(updates);
                            }}
                            title="Supprimer cette pénalité (erreur ou cadeau à la régie)"
                            className="p-0.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {d.statutPose === 'visite_ok' && d.dateInsta && (
                <div className="mt-1.5 px-2 py-1 bg-emerald-100 border border-emerald-300 rounded text-[10px] text-emerald-800 font-bold">✅ Posé le {new Date(d.dateInsta).toLocaleDateString('fr-FR')} — passe au Consuel ↓</div>
              )}
              </>)}
            </div>

            {/* ============ ÉTAPE 3 : CONSUEL ============ */}
            <div ref={refConsuel} className="bg-cyan-50 border-2 border-cyan-200 rounded-xl p-2 mb-2">
              <button onClick={() => toggleStep('consuel')} className={`w-full text-[10px] font-bold text-cyan-700 uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.consuel ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-cyan-600 text-[9px]">{foldedSteps.consuel ? '▶' : '▼'}</span>
                  <span>4️⃣ ⚡ Consuel</span>
                  {foldedSteps.consuel && d.dateEnvoiConsuel && (
                    <span className="text-cyan-500 font-normal normal-case ml-1">— envoi {new Date(d.dateEnvoiConsuel).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutConsuel === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutConsuel === 'visite' ? 'bg-sky-100 text-sky-700' :
                  d.dateEnvoiConsuel ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutConsuel === 'accepté' ? '✓ Visé' : d.statutConsuel === 'visite' ? '🔍 Visite demandée' : d.dateEnvoiConsuel ? '📤 Envoyé' : '⏳ Pas envoyé'}
                </span>
              </button>

              {!foldedSteps.consuel && (<>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📤 Envoi</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateEnvoiConsuel || ''} onChange={(e) => onUpdate({ dateEnvoiConsuel: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-cyan-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateEnvoiConsuel: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Accord</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateConsuel || ''} onChange={(e) => onUpdate({ dateConsuel: e.target.value, consuel: !!e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-cyan-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateConsuel: new Date().toISOString().split('T')[0], consuel: true })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {/* 3 boutons toggleables — le Consuel répond : visé OU visite demandée */}
              {d.dateEnvoiConsuel && (
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button onClick={() => onUpdate({ statutConsuel: '' })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${!d.statutConsuel || d.statutConsuel === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Attente</button>
                  <button onClick={() => onUpdate({ statutConsuel: 'visite' })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutConsuel === 'visite' ? 'bg-sky-500 text-white border-sky-600 shadow-md' : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'}`}>🔍 Visite</button>
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutConsuel: 'accepté', dateConsuel: d.dateConsuel || today, consuel: true });
                  }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutConsuel === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Visé</button>
                </div>
              )}

              {d.statutConsuel === 'accepté' && !d.dateControleLivraison && (
                <div className="mt-1.5 px-2 py-1 bg-emerald-100 border border-emerald-300 rounded text-[10px] text-emerald-800 font-bold">✅ Consuel visé — passe au contrôle livraison ↓</div>
              )}
              {d.statutConsuel === 'visite' && (
                <div className="mt-1.5 px-2 py-1.5 bg-sky-50 border border-sky-300 rounded text-[10px] text-sky-800">
                  🔍 <span className="font-bold">Visite demandée</span> — programme une date de visite ci-dessous et envoie le poseur vérifier les normes. Le résultat de la visite décide : conforme → accord, ou à corriger → on remet aux normes et contre-visite.
                </div>
              )}

              {/* Alerte Consuel — > 7 jours sans accord */}
              {d.dateEnvoiConsuel && !d.dateConsuel && d.statutConsuel !== 'visite' && (() => {
                const jours = Math.floor((new Date() - new Date(d.dateEnvoiConsuel)) / 86400000);
                if (jours < 7) return <div className="mt-1.5 px-2 py-1 bg-cyan-50 border border-cyan-200 rounded text-[10px] text-cyan-700">⏳ {jours}j — délai normal (sous 7j)</div>;
                if (jours < 14) return <div className="mt-1.5 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-[10px] text-amber-700 font-bold">⚠️ {jours}j sans accord — relance le Consuel</div>;
                return <div className="mt-1.5 px-2 py-1 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-700 font-bold">🔴 {jours}j sans accord — urgent !</div>;
              })()}

              {/* Visites Consuel */}
              <div className="mt-2 p-1.5 bg-white border border-cyan-200 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-cyan-700 uppercase">🔍 Visites ({(d.visitesConsuel || []).length})</span>
                  <button onClick={() => {
                    const isFirst = !d.visitesConsuel || d.visitesConsuel.length === 0;
                    onUpdate({
                      visitesConsuel: [...(d.visitesConsuel || []), { date: '', resultat: '', note: '', type: isFirst ? 'visite' : 'contre_visite' }]
                    });
                  }} className="px-1.5 py-0.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-[9px] font-bold flex items-center gap-1">
                    <Plus className="w-2.5 h-2.5" />
                    {(d.visitesConsuel || []).length === 0 ? 'Ajouter' : '+ Contre-visite'}
                  </button>
                </div>

                {(!d.visitesConsuel || d.visitesConsuel.length === 0) ? (
                  <div className="text-[9px] text-slate-400 italic text-center py-1">Aucune visite — accord direct possible</div>
                ) : (
                  <div className="space-y-1.5">
                    {d.visitesConsuel.map((v, idx) => {
                      const updateV = (updates) => {
                        const list = [...d.visitesConsuel];
                        list[idx] = { ...list[idx], ...updates };
                        onUpdate({ visitesConsuel: list });
                      };
                      // Dernière visite OK → Consuel visé ; sinon → visite demandée.
                      const setResultat = (resultat) => {
                        const list = [...d.visitesConsuel];
                        list[idx] = { ...list[idx], resultat };
                        const last = list[list.length - 1];
                        const patch = { visitesConsuel: list };
                        if (last.resultat === 'ok') {
                          patch.statutConsuel = 'accepté';
                          patch.dateConsuel = d.dateConsuel || last.date || new Date().toISOString().split('T')[0];
                          patch.consuel = true;
                        } else {
                          patch.statutConsuel = 'visite';
                        }
                        onUpdate(patch);
                      };
                      const removeV = () => {
                        onUpdate({ visitesConsuel: d.visitesConsuel.filter((_, i) => i !== idx) });
                      };
                      const bgCls = v.resultat === 'ok' ? 'bg-emerald-50 border-emerald-300' :
                                    v.resultat === 'a_corriger' ? 'bg-rose-50 border-rose-300' :
                                    'bg-cyan-50 border-cyan-200';
                      return (
                        <div key={idx} className={`p-1.5 rounded border ${bgCls}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-slate-700">
                              {idx === 0 ? '🔍 Visite initiale' : `🔄 Contre-visite n°${idx}`}
                            </span>
                            <button onClick={removeV} className="px-1.5 py-0.5 bg-rose-100 hover:bg-rose-500 text-rose-600 hover:text-white rounded text-[9px] font-bold flex items-center gap-0.5" title="Supprimer cette visite">
                              <Trash2 className="w-3 h-3" />
                              <span>Suppr.</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-1 mb-1">
                            <input type="date" value={v.date || ''} onChange={(e) => updateV({ date: e.target.value })} className="flex-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]" />
                            <button onClick={() => updateV({ date: new Date().toISOString().split('T')[0] })} className="px-1 py-0.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-700 rounded text-[9px] font-bold">Auj.</button>
                          </div>
                          <div className="grid grid-cols-2 gap-1 mb-1">
                            <button onClick={() => setResultat('ok')} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${v.resultat === 'ok' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100'}`}>✓ OK</button>
                            <button onClick={() => setResultat('a_corriger')} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${v.resultat === 'a_corriger' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-rose-100'}`}>✗ À corriger</button>
                          </div>
                          <input type="text" value={v.note || ''} onChange={(e) => updateV({ note: e.target.value })} placeholder="Note..." className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]" />
                          {v.resultat === 'a_corriger' && idx === d.visitesConsuel.length - 1 && (
                            <div className="mt-1 p-1.5 bg-amber-50 border border-amber-300 rounded space-y-1">
                              <div className="text-[9px] text-amber-800 font-bold">🔧 À corriger — mise aux normes puis programme la contre-visite.</div>
                              <div>
                                <label className="block text-[8px] font-semibold text-amber-700 mb-0.5">📅 Date de la contre-visite</label>
                                <div className="flex gap-1">
                                  <input type="date" value="" onChange={(e) => {
                                    if (!e.target.value) return;
                                    onUpdate({ visitesConsuel: [...d.visitesConsuel, { date: e.target.value, resultat: '', note: '', type: 'contre_visite' }] });
                                  }} className="flex-1 px-1.5 py-0.5 bg-white border border-amber-200 rounded text-[10px]" />
                                  <button onClick={() => {
                                    onUpdate({ visitesConsuel: [...d.visitesConsuel, { date: '', resultat: '', note: '', type: 'contre_visite' }] });
                                  }} className="px-1 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Pas encore</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </>)}
            </div>

            {/* ============ RACCORDEMENT ENEDIS ============ */}
            <div ref={refRaccordement} className="bg-sky-50 border-2 border-sky-200 rounded-xl p-2 mb-2">
              <button onClick={() => toggleStep('raccordement')} className={`w-full text-[10px] font-bold text-sky-700 uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.raccordement ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-sky-600 text-[9px]">{foldedSteps.raccordement ? '▶' : '▼'}</span>
                  <span>🔌 Raccordement</span>
                  {foldedSteps.raccordement && d.dateEnvoiRaccordement && (
                    <span className="text-sky-500 font-normal normal-case ml-1">— envoi {new Date(d.dateEnvoiRaccordement).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.statutRaccordement === 'accepté' ? 'bg-emerald-100 text-emerald-700' :
                  d.statutRaccordement === 'refusé' ? 'bg-rose-100 text-rose-700' :
                  d.dateEnvoiRaccordement ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.statutRaccordement === 'accepté' ? '✓ Accepté' : d.statutRaccordement === 'refusé' ? '✗ Refusé' : d.dateEnvoiRaccordement ? '📤 Envoyé' : '⏳ Pas envoyé'}
                </span>
              </button>

              {!foldedSteps.raccordement && (<>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📤 Demande envoyée</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateEnvoiRaccordement || ''} onChange={(e) => onUpdate({ dateEnvoiRaccordement: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-sky-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateEnvoiRaccordement: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Effectué</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateAccordRaccordement || ''} onChange={(e) => onUpdate({ dateAccordRaccordement: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-sky-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateAccordRaccordement: new Date().toISOString().split('T')[0], statutRaccordement: 'accepté' })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>

              {d.dateEnvoiRaccordement && (
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button onClick={() => onUpdate({ statutRaccordement: '' })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${!d.statutRaccordement || d.statutRaccordement === 'envoyé' ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}>⏳ Attente</button>
                  <button onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onUpdate({ statutRaccordement: 'accepté', dateAccordRaccordement: d.dateAccordRaccordement || today });
                  }} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutRaccordement === 'accepté' ? 'bg-emerald-500 text-white border-emerald-600 shadow-md' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>✓ Accepté</button>
                  <button onClick={() => onUpdate({ statutRaccordement: 'refusé' })} className={`px-1 py-1.5 rounded text-[10px] font-bold border-2 transition-all ${d.statutRaccordement === 'refusé' ? 'bg-rose-500 text-white border-rose-600 shadow-md' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}>✗ Refusé</button>
                </div>
              )}
              </>)}
            </div>

            {/* ============ ÉTAPE 4 : SUIVI PAIEMENT ============ */}
            <div ref={refPaiement} className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-2">
              <button onClick={() => toggleStep('paiement')} className={`w-full text-[10px] font-bold text-emerald-700 uppercase flex items-center justify-between flex-wrap gap-1 ${foldedSteps.paiement ? '' : 'mb-1.5'} hover:opacity-80`}>
                <span className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-[9px]">{foldedSteps.paiement ? '▶' : '▼'}</span>
                  <span>5️⃣ 💰 Contrôle &amp; paiement</span>
                  {foldedSteps.paiement && d.datePaiementBanque && (
                    <span className="text-emerald-500 font-normal normal-case ml-1">— payé {new Date(d.datePaiementBanque).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  )}
                </span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                  d.payeClient ? 'bg-emerald-100 text-emerald-700' :
                  d.dateControleLivraison ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {d.payeClient ? '✓ Payé' : d.dateControleLivraison ? '🔍 Contrôle OK' : '⏳ Pas payé'}
                </span>
              </button>

              {!foldedSteps.paiement && (<>

              {/* ===== Originaux signés (pré-requis pour contrôle livraison) ===== */}
              {!d.pasOriginauxRequis && (
                <div className="mb-2 p-2 bg-white border border-amber-200 rounded-lg">
                  <div className="text-[10px] font-bold text-amber-700 uppercase mb-1.5 flex items-center justify-between gap-1">
                    <span>📑 Originaux signés (pré-requis)</span>
                    {d.dateRecusOriginauxBanque && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Reçus banque</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📥 Du poseur</label>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateRecusOriginauxPoseur || ''} onChange={(e) => onUpdate({ dateRecusOriginauxPoseur: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateRecusOriginauxPoseur: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">📤 → Banque</label>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateEnvoiOriginauxBanque || ''} onChange={(e) => onUpdate({ dateEnvoiOriginauxBanque: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateEnvoiOriginauxBanque: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">✅ Reçus banque</label>
                      <div className="flex gap-1">
                        <input type="date" value={d.dateRecusOriginauxBanque || ''} onChange={(e) => onUpdate({ dateRecusOriginauxBanque: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                        <button onClick={() => onUpdate({ dateRecusOriginauxBanque: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                      </div>
                    </div>
                  </div>

                  {!d.dateRecusOriginauxBanque && (
                    <div className="mt-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700">⏳ Attente réception banque avant contrôle livraison</div>
                  )}

                  <button onClick={() => onUpdate({ pasOriginauxRequis: true })} className="mt-1.5 w-full text-[9px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 px-2 py-1 rounded">🚫 Pas d'originaux requis pour ce dossier</button>
                </div>
              )}

              {d.pasOriginauxRequis && (
                <div className="mb-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-600">🚫 Pas d'originaux requis</span>
                  <button onClick={() => onUpdate({ pasOriginauxRequis: false })} className="text-[9px] font-semibold text-violet-600 hover:bg-violet-50 px-2 py-1 rounded">↩️ Réactiver</button>
                </div>
              )}

              {(() => {
              const { bloque, manquants } = controleLivraisonBlocage(d);
              const verrou = bloque && !d.dateControleLivraison;
              return (<>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5" title="Toi qui appelles le client">📞 Ctrl liv.</label>
                  <div className="flex gap-1">
                    <input type="date" disabled={verrou} value={d.dateControleLivraison || ''} onChange={(e) => onUpdate({ dateControleLivraison: e.target.value })} className={`flex-1 min-w-0 px-1.5 py-1 bg-white border border-emerald-200 rounded text-[10px]${verrou ? ' opacity-50 cursor-not-allowed bg-slate-100' : ''}`} />
                    <button disabled={verrou} onClick={() => onUpdate({ dateControleLivraison: new Date().toISOString().split('T')[0] })} className={`flex-shrink-0 px-1.5 py-1 rounded text-[9px] font-bold whitespace-nowrap ${verrou ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'}`}>Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5" title="Banque appelle le client">📞 Banque</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.dateAppelBanque || ''} onChange={(e) => onUpdate({ dateAppelBanque: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-emerald-200 rounded text-[10px]" />
                    <button onClick={() => onUpdate({ dateAppelBanque: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">💰 Payé</label>
                  <div className="flex gap-1">
                    <input type="date" value={d.datePaiementBanque || ''} onChange={(e) => onUpdate({ datePaiementBanque: e.target.value })} className="flex-1 min-w-0 px-1.5 py-1 bg-white border border-emerald-200 rounded text-[10px]" />
                    <button onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      onUpdate({ datePaiementBanque: today, payeClient: true, payeClientDate: d.payeClientDate || today });
                    }} className="flex-shrink-0 px-1.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[9px] font-bold whitespace-nowrap">Auj.</button>
                  </div>
                </div>
              </div>
              {verrou && (
                <div className="mt-1.5 px-2 py-1.5 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-800 leading-snug">
                  🔒 <span className="font-bold">Contrôle livraison bloqué</span> — il manque : {manquants.join(' · ')}.
                </div>
              )}
              </>);
              })()}

              {/* 📞 Tentatives d'appel contrôle livraison — client ne répond pas (sous la grille) */}
              {!d.dateControleLivraison && (
                <div className="mt-2 p-1.5 bg-white border border-emerald-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-emerald-700 uppercase">📞 Essais d'appel ({(d.tentativesControleLivraison || []).length})</span>
                      <button
                        onClick={() => onUpdate({ tentativesControleLivraison: [...(d.tentativesControleLivraison || []), { datetime: new Date().toISOString() }] })}
                        className="text-[9px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-2 py-0.5 rounded"
                        title="Logger un appel sans réponse — le client ne décroche pas"
                      >
                        + Pas répondu
                      </button>
                    </div>
                    {(d.tentativesControleLivraison || []).length > 0 && (
                      <div className="space-y-0.5">
                        {(d.tentativesControleLivraison || []).map((t, i) => {
                          const dt = new Date(t.datetime);
                          const fmt = dt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                          return (
                            <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600 px-1 py-0.5 bg-emerald-50 rounded">
                              <span className="flex-1">📞 {fmt}</span>
                              <button
                                onClick={() => onUpdate({ tentativesControleLivraison: (d.tentativesControleLivraison || []).filter((_, j) => j !== i) })}
                                className="text-rose-400 hover:text-rose-600 text-[9px] px-1"
                                title="Supprimer cet essai"
                              >✕</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              {/* Alerte paiement — > 2 jours après contrôle livraison */}
              {d.dateControleLivraison && !d.datePaiementBanque && !d.payeClient && (() => {
                const jours = Math.floor((new Date() - new Date(d.dateControleLivraison)) / 86400000);
                if (jours < 2) return <div className="mt-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-700">⏳ Contrôle fait il y a {jours}j — délai normal (sous 48h)</div>;
                if (jours < 5) return <div className="mt-1.5 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-[10px] text-amber-700 font-bold">⚠️ {jours}j sans paiement — relance la banque</div>;
                return <div className="mt-1.5 px-2 py-1 bg-rose-50 border border-rose-300 rounded text-[10px] text-rose-700 font-bold">🔴 {jours}j sans paiement — urgent !</div>;
              })()}

              {/* Bouton principal "Client a payé" — gros, bien visible */}
              <button onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                if (!d.payeClient) {
                  onUpdate({
                    payeClient: true,
                    payeClientDate: d.payeClientDate || today,
                    datePaiementBanque: d.datePaiementBanque || today,
                    statut: 'W_DOSSIER_PAYER',
                  });
                } else {
                  onUpdate({ payeClient: false, payeClientDate: '' });
                }
              }} className={`mt-2 w-full px-3 py-2 rounded-xl text-xs font-bold ${d.payeClient ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md' : 'bg-orange-100 hover:bg-orange-200 text-orange-700 border-2 border-orange-300'}`}>
                {d.payeClient ? '✓ Client a payé — cliquer pour annuler' : '⏳ Client à recevoir — cliquer pour marquer payé'}
              </button>

              {/* 💰 RÉCUP TVA — visible seulement si client payé */}
              {d.payeClient && (() => {
                const refDate = d.datePaiementBanque || d.payeClientDate;
                if (!refDate) return null;
                const debut = new Date(refDate);
                const limite = new Date(debut);
                limite.setMonth(limite.getMonth() + 6);
                const joursRestants = Math.floor((limite - new Date()) / 86400000);
                const limiteStr = limite.toLocaleDateString('fr-FR');
                let urgenceClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                let urgenceLabel = `${joursRestants}j restants`;
                if (d.tvaStatus === 'recuperee') { urgenceClass = 'bg-emerald-100 border-emerald-300 text-emerald-800'; urgenceLabel = '✅ TVA récupérée'; }
                else if (d.tvaStatus === 'non_concerne') { urgenceClass = 'bg-slate-100 border-slate-300 text-slate-700'; urgenceLabel = 'Non concerné'; }
                else if (d.tvaStatus === 'envoyee') { urgenceClass = 'bg-blue-50 border-blue-200 text-blue-700'; urgenceLabel = `📤 Démarche envoyée — ${joursRestants}j`; }
                else if (joursRestants < 0) { urgenceClass = 'bg-rose-100 border-rose-400 text-rose-800'; urgenceLabel = `🔴 DÉPASSÉ depuis ${Math.abs(joursRestants)}j`; }
                else if (joursRestants <= 7) { urgenceClass = 'bg-rose-50 border-rose-300 text-rose-700'; urgenceLabel = `🔥 Plus que ${joursRestants}j`; }
                else if (joursRestants <= 30) { urgenceClass = 'bg-orange-50 border-orange-300 text-orange-700'; urgenceLabel = `⚠️ Plus que ${joursRestants}j`; }
                return (
                  <div className={`mt-2 p-2 rounded-xl border-2 ${urgenceClass}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase">💰 Récup. TVA client</span>
                      <span className="text-[10px] font-bold">{urgenceLabel}</span>
                    </div>
                    <div className="text-[9px] mb-2 opacity-80">Limite légale : {limiteStr} (6 mois après paiement banque)</div>
                    <div className="grid grid-cols-2 gap-1 mb-1">
                      <button onClick={() => onUpdate({ tvaStatus: d.tvaStatus === 'envoyee' ? '' : 'envoyee', tvaDateDemarche: d.tvaStatus === 'envoyee' ? '' : (d.tvaDateDemarche || new Date().toISOString().split('T')[0]) })} className={`px-2 py-1 rounded text-[10px] font-bold ${d.tvaStatus === 'envoyee' ? 'bg-blue-500 text-white' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'}`}>
                        📤 Envoyée
                      </button>
                      <button onClick={() => onUpdate({ tvaStatus: d.tvaStatus === 'recuperee' ? '' : 'recuperee', tvaDateRecuperee: d.tvaStatus === 'recuperee' ? '' : (d.tvaDateRecuperee || new Date().toISOString().split('T')[0]) })} className={`px-2 py-1 rounded text-[10px] font-bold ${d.tvaStatus === 'recuperee' ? 'bg-emerald-500 text-white' : 'bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50'}`}>
                        ✅ Récupérée
                      </button>
                    </div>
                    <button onClick={() => onUpdate({ tvaStatus: d.tvaStatus === 'non_concerne' ? '' : 'non_concerne' })} className={`w-full px-2 py-1 rounded text-[10px] font-bold ${d.tvaStatus === 'non_concerne' ? 'bg-slate-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                      ❌ Client non concerné
                    </button>
                  </div>
                );
              })()}
              </>)}
            </div>
          </div>

          {/* FINANCEMENT — supprimé, intégré dans la section 1️⃣ Process Financement et section 4️⃣ Paiement */}

          {/* PRODUITS — éditables */}
          <div className="border-2 border-amber-200 bg-amber-50 rounded-xl p-2 mb-2">
            <div className={`flex items-center justify-between ${foldedSteps.produits ? '' : 'mb-1.5'}`}>
              <button onClick={() => toggleStep('produits')} className="flex-1 text-left flex items-center gap-1.5 hover:opacity-80">
                <span className="text-amber-600 text-[9px]">{foldedSteps.produits ? '▶' : '▼'}</span>
                <h3 className="text-[10px] font-bold text-amber-700 uppercase">🏠 Produits ({dossierProduits.length})</h3>
                {foldedSteps.produits && dossierProduits.length > 0 && (() => {
                  const totalWc = dossierProduits.reduce((s, p) => s + (parseInt(p.puissance) || 0), 0);
                  const noms = dossierProduits.slice(0, 2).map(p => {
                    const info = findProduit(produits, p.type);
                    return info?.label || p.type;
                  }).join(', ');
                  const reste = dossierProduits.length > 2 ? ` +${dossierProduits.length - 2}` : '';
                  return (
                    <span className="text-[9px] text-slate-500 font-normal normal-case truncate">— {noms}{reste}{totalWc > 0 ? ` · ${totalWc} Wc` : ''}</span>
                  );
                })()}
              </button>
              <button onClick={() => { openStep('produits'); addProduit(); }} className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Plus className="w-3 h-3" />Ajouter
              </button>
            </div>
            {!foldedSteps.produits && (
            <div className="space-y-1.5">
              {/* 🏠 Type de toiture + orientation des panneaux — info utile
                  pour le poseur (fixations, calepinage). Incluse dans le
                  message chantier envoyé. */}
              <div className="grid grid-cols-2 gap-1.5 p-2 bg-white border border-amber-200 rounded-xl">
                <div>
                  <label className="block text-[9px] font-bold text-amber-700 uppercase mb-1">🏠 Type de toit</label>
                  <select
                    value={d.typeToit || ''}
                    onChange={(e) => onUpdate({ typeToit: e.target.value })}
                    className="w-full px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-amber-800"
                  >
                    <option value="">— Choisir —</option>
                    {TYPES_TOIT.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-amber-700 uppercase mb-1">📐 Orientation panneaux</label>
                  <select
                    value={d.orientationPanneaux || ''}
                    onChange={(e) => onUpdate({ orientationPanneaux: e.target.value })}
                    className="w-full px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-amber-800"
                  >
                    <option value="">— Choisir —</option>
                    {ORIENTATIONS_PANNEAUX.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {dossierProduits.map((p, i) => {
                const prodInfo = findProduit(produits, p.type);
                return (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <select value={p.type} onChange={(e) => updateProduit(i, { type: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-800">
                        {produits.map(prod => <option key={prod.id} value={prod.id}>{prod.emoji} {prod.label}</option>)}
                      </select>
                      <button onClick={() => removeProduit(i)} className="p-1 text-rose-500 hover:bg-rose-100 rounded" title="Retirer">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {prodInfo.autoTarif ? (
                      <select value={p.puissance || 6000} onChange={(e) => updateProduit(i, { puissance: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-white border border-amber-200 rounded-lg text-[11px] font-semibold">
                        {PUISSANCES.map(pw => <option key={pw} value={pw}>{pw} Wc</option>)}
                      </select>
                    ) : (
                      <div className="flex gap-1.5">
                        <input type="number" min="1" value={p.quantite || 1} onChange={(e) => updateProduit(i, { quantite: parseInt(e.target.value) || 1 })} placeholder="Qté" className="w-14 px-2 py-1 bg-white border border-amber-200 rounded-lg text-[11px] font-bold text-center" />
                        <input type="text" value={p.description || ''} onChange={(e) => updateProduit(i, { description: e.target.value })} placeholder="Description" className="flex-1 px-2 py-1 bg-white border border-amber-200 rounded-lg text-[11px]" />
                      </div>
                    )}
                  </div>
                );
              })}
              {dossierProduits.length === 0 && (
                <div className="text-center py-3 text-slate-400 italic text-[11px] bg-slate-50 rounded-xl">Aucun produit. Clique "Ajouter" ci-dessus.</div>
              )}
            </div>
            )}
          </div>

          {/* MONTANTS (admin only) */}
          {isAdmin && (
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">💰 Montants</h3>
              <div className="bg-gradient-to-br from-violet-50 to-pink-50 border border-violet-200 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-600 uppercase w-12 flex-shrink-0">TTC</span>
                  <input type="number" step="0.01" value={d.montantTotal || ''} onChange={(e) => onUpdate({ montantTotal: parseFloat(e.target.value) || 0 })} placeholder="0,00" className={inputCls + ' font-bold text-violet-700'} />
                  <span className="text-xs text-slate-500">€</span>
                </div>
                {d.margeTtc !== undefined && (
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-violet-200">
                    <span className="text-slate-600 font-semibold">Marge TTC</span>
                    <span className={`font-bold ${d.margeTtc >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatEuro(d.margeTtc)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ⚖️ LITIGE — visible uniquement si statut = LITIGE.
              Même mécanique que les pénalités : la régie doit me rembourser. */}
          {d.statut === 'C_LITIGE' && (
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">⚖️ Litige & remboursement</h3>
              <div className="bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-300 rounded-xl p-2.5 space-y-2">
                {/* Accord PDF */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">📎 Accord transactionnel (PDF)</label>
                  <FactureFileInput
                    fileId={d.litigeAccordPdfUrl}
                    onChange={(id) => onUpdate({ litigeAccordPdfUrl: id })}
                    color="purple"
                  />
                </div>
                {/* Régie + montant */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">🤝 Régie qui rembourse</label>
                    <select
                      value={d.litigeRegieNom || ''}
                      onChange={(e) => onUpdate({ litigeRegieNom: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {(d.regies || []).filter(r => r.nom).map((r, i) => (
                        <option key={`d-${i}`} value={r.nom}>{r.nom} (du dossier)</option>
                      ))}
                      {(REGIES || []).filter(r => !(d.regies || []).some(dr => dr.nom === r)).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">💸 Montant</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={d.litigeMontantRembourse || ''}
                        onChange={(e) => onUpdate({ litigeMontantRembourse: e.target.value })}
                        placeholder="0,00"
                        className={inputCls + ' pr-6 font-bold text-rose-700'}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
                    </div>
                  </div>
                </div>
                {/* Toggle remboursé */}
                <label className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border-2 ${d.litigeRegieRembourse ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-rose-200 hover:bg-rose-50'}`}>
                  <input
                    type="checkbox"
                    checked={!!d.litigeRegieRembourse}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const today = new Date().toISOString().split('T')[0];
                      onUpdate({
                        litigeRegieRembourse: checked,
                        litigeDateRembourse: checked && !d.litigeDateRembourse ? today : d.litigeDateRembourse,
                      });
                    }}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span className={`text-[11px] font-bold ${d.litigeRegieRembourse ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {d.litigeRegieRembourse ? '✅ Régie remboursée' : '⏳ En attente du remboursement régie'}
                  </span>
                </label>
                {d.litigeRegieRembourse && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={d.litigeDateRembourse || ''}
                        onChange={(e) => onUpdate({ litigeDateRembourse: e.target.value })}
                        className={inputCls + ' flex-1 min-w-0'}
                      />
                      <button type="button" onClick={() => onUpdate({ litigeDateRembourse: new Date().toISOString().split('T')[0] })} className="flex-shrink-0 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold whitespace-nowrap">Auj.</button>
                    </div>
                    <input
                      type="text"
                      value={d.litigeFactureNo || ''}
                      onChange={(e) => onUpdate({ litigeFactureNo: e.target.value })}
                      placeholder="N° facture régie"
                      className={inputCls}
                    />
                  </div>
                )}
                {/* Note */}
                <textarea
                  value={d.litigeNote || ''}
                  onChange={(e) => onUpdate({ litigeNote: e.target.value })}
                  rows={2}
                  placeholder="Note (motif, contexte)…"
                  className={inputCls + ' resize-none text-xs'}
                />
              </div>
            </div>
          )}

          {/* RÉGIES — multi, éditables (cachées si équipe interne) */}
          {d.typeRegie !== 'interne' && (
          <div ref={refRegie} className="border-2 border-purple-200 bg-purple-50 rounded-xl p-2 mb-2">
            <div className={`flex items-center justify-between ${foldedSteps.regies ? '' : 'mb-1.5'}`}>
              <button onClick={() => toggleStep('regies')} className="flex-1 text-left flex items-center gap-1.5 hover:opacity-80 min-w-0">
                <span className="text-purple-600 text-[9px]">{foldedSteps.regies ? '▶' : '▼'}</span>
                <h3 className="text-[10px] font-bold text-purple-700 uppercase">🤝 Régies ({(d.regies || []).length})</h3>
                {foldedSteps.regies && (d.regies || []).length > 0 && (() => {
                  const regies = d.regies || [];
                  const named = regies.filter(r => r.nom);
                  const noms = named.slice(0, 2).map(r => r.nom).join(', ');
                  const reste = named.length > 2 ? ` +${named.length - 2}` : '';
                  const allPaid = named.length > 0 && named.every(r => r.paye);
                  return (
                    <span className="text-[9px] font-normal normal-case truncate flex items-center gap-1">
                      <span className="text-slate-500">— {noms || 'à compléter'}{reste}</span>
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${allPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{allPaid ? '✓ payé' : '⏳'}</span>
                    </span>
                  );
                })()}
              </button>
              <button onClick={() => { openStep('regies'); onUpdate({ regies: [...(d.regies || []), { nom: '', htCustom: '', paye: false, datePaye: '', bl: '', factureNo: '', facturePdfUrl: '' }] }); }} className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Plus className="w-3 h-3" />Ajouter
              </button>
            </div>
            {!foldedSteps.regies && (
            <div className="space-y-1.5">
              {(d.regies || []).map((r, i) => {
                const updateRegie = (idx, upd) => {
                  const list = [...(d.regies || [])];
                  list[idx] = { ...list[idx], ...upd };
                  onUpdate({ regies: list });
                };
                const rmRegie = (idx) => {
                  onUpdate({ regies: (d.regies || []).filter((_, j) => j !== idx) });
                };
                const ttcRegie = (d.regiesDetail && d.regiesDetail[i]?.ttc) || 0;
                return (
                  <div key={i} className={`rounded-xl border p-2 space-y-1.5 ${r.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-purple-50 border-purple-200'}`}>
                    <div className="flex items-center gap-1">
                      <select value={r.nom || ''} onChange={(e) => updateRegie(i, { nom: e.target.value, htCustom: '' })} className={inputCls + ' flex-1 font-bold text-purple-700'}>
                        <option value="">— Choisir une régie —</option>
                        {REGIES.map(re => <option key={re} value={re}>{re}</option>)}
                      </select>
                      <button onClick={() => rmRegie(i)} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {r.nom && (
                      <>
                        {canSeeMarges && (
                          <>
                            {(() => {
                              const autoHt = d.regiesDetail?.[i]?.autoHt || 0;
                              const usingAuto = !r.htCustom && autoHt > 0;
                              return (
                                <>
                                  <div className="grid grid-cols-[1fr_auto] gap-1 items-end">
                                    <div>
                                      <label className="text-[9px] font-semibold text-purple-600 uppercase mb-0.5 flex items-center justify-between gap-1">
                                        <span>💰 HT (€)</span>
                                        {autoHt > 0 && (
                                          <span className={`text-[9px] font-bold normal-case px-1 py-0.5 rounded ${usingAuto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {usingAuto ? '✓ Auto' : 'Auto'} : {formatEuro(autoHt)}
                                          </span>
                                        )}
                                      </label>
                                      <input type="number" step="0.01" value={r.htCustom || ''} onChange={(e) => updateRegie(i, { htCustom: e.target.value })} placeholder={autoHt > 0 ? `Vide → auto ${autoHt} €` : 'Saisir'} className="w-full px-2 py-1 bg-white border border-purple-200 rounded text-[10px]" />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-semibold text-purple-600 uppercase mb-0.5">TTC (TVA 20 %)</label>
                                      <div className="px-2 py-1 bg-purple-50 border border-purple-200 rounded text-[10px] font-bold text-purple-800 min-w-[80px] text-right">{formatEuro(ttcRegie)}</div>
                                    </div>
                                  </div>
                                  {autoHt === 0 && (
                                    <div className="text-[9px] text-rose-500">⚠️ Aucun tarif défini pour {r.nom} dans Réglages → Régies</div>
                                  )}
                                </>
                              );
                            })()}
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-700 cursor-pointer">
                              <input type="checkbox" checked={!!r.sansTva || r.tauxTva === 0 || r.tauxTva === '0'} onChange={(e) => updateRegie(i, { sansTva: e.target.checked, tauxTva: e.target.checked ? 0 : 20 })} className="w-3.5 h-3.5 accent-purple-600" />
                              Sans TVA <span className="text-purple-500 font-normal">(auto-entrepreneur / société étrangère)</span>
                            </label>
                          </>
                        )}
                        {canSeeBLFactures && (
                          <>
                            <div className="grid grid-cols-2 gap-1">
                              <input type="text" value={r.bl || ''} onChange={(e) => updateRegie(i, { bl: e.target.value })} placeholder="📦 N° BL" className="px-2 py-1 bg-white border border-purple-200 rounded text-[10px]" />
                              <input type="text" value={r.factureNo || ''} onChange={(e) => updateRegie(i, { factureNo: e.target.value })} placeholder="🧾 N° Facture" className="px-2 py-1 bg-white border border-purple-200 rounded text-[10px]" />
                            </div>
                            <FactureFileInput
                              fileId={r.factureFile || ''}
                              onChange={(id) => updateRegie(i, { factureFile: id })}
                              color="purple"
                              autoExtract={true}
                              onExtract={(data) => {
                                // Pré-remplit les champs vides avec ce que l'IA a trouvé
                                const upd = {};
                                if (data.factureNo && !r.factureNo) upd.factureNo = String(data.factureNo);
                                if (data.bl && !r.bl) upd.bl = String(data.bl);
                                if (data.montantHt && data.montantHt > 0 && !r.htCustom) upd.htCustom = String(data.montantHt);
                                if (typeof data.tauxTva === 'number' && data.tauxTva === 0 && !r.sansTva) {
                                  upd.sansTva = true; upd.tauxTva = 0;
                                }
                                if (data.dateFacture && !r.dateFacture) upd.dateFacture = String(data.dateFacture);
                                if (Object.keys(upd).length > 0) updateRegie(i, upd);
                              }}
                              pennylaneInfo={{
                                supplierName: r.nom,
                                factureNo: r.factureNo,
                                dateFacture: r.dateFacture || new Date().toISOString().slice(0, 10),
                                montantHt: parseFloat(r.htCustom) || (d.regiesDetail?.[i]?.autoHt) || 0,
                                montantTtc: d.regiesDetail?.[i]?.ttc || 0,
                                tauxTva: r.sansTva ? 0 : 20,
                                pushedId: r.pennylaneInvoiceId,
                              }}
                              onPennylaneSuccess={(id) => updateRegie(i, { pennylaneInvoiceId: id, pennylanePushedAt: new Date().toISOString() })}
                            />
                          </>
                        )}
                        {canCheckPaiements && (
                          <button onClick={() => updateRegie(i, { paye: !r.paye, datePaye: !r.paye ? new Date().toISOString().split('T')[0] : '' })} className={`w-full px-2 py-1 rounded text-[10px] font-bold ${r.paye ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {r.paye ? `✓ Payée (${formatEuro(ttcRegie)})` : `⏳ Non payée (${formatEuro(ttcRegie)})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
          )}

          {/* ÉQUIPE INTERNE — éditable (admin/compta), cachée si externe avec équipe vide */}
          {(isAdmin || canCheckPaiements) && (d.typeRegie === 'interne' || ROLES_INTERNES.some(r => d[r.key])) && (
            <div ref={refEquipeInterne}>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">👥 Équipe interne (commissions)</h3>
              <div className="space-y-1.5">
                {ROLES_INTERNES.map(role => {
                  const nomKey = role.key;
                  const montantKey = role.key + 'Montant';
                  const payeKey = role.key + 'Paye';
                  const dateKey = role.key + 'DatePaye';
                  const tarifAuto = (tarifsInternes && tarifsInternes[role.key]) || 0;
                  const m = d[montantKey];
                  const montantEffectif = (m !== '' && m !== undefined && m !== null) ? parseFloat(m) : tarifAuto;
                  const listeNoms = (nomsInternes && nomsInternes[role.key]) || [];
                  const valeurActuelle = d[nomKey] || '';
                  const valeurDansListe = !valeurActuelle || listeNoms.includes(valeurActuelle);
                  const showRow = !!d[nomKey] || true; // toujours afficher les rôles pour pouvoir les renseigner
                  if (!showRow) return null;
                  return (
                    <div key={role.key} className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-2 space-y-1">
                      <div className="text-[9px] font-bold text-fuchsia-700 uppercase">{role.emoji} {role.label}</div>
                      {/* Sélecteur de nom */}
                      <select
                        value={valeurDansListe ? valeurActuelle : '__custom__'}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__new__') {
                            onUpdate({ [nomKey]: '__custom__' });
                          } else if (v === '__custom__') {
                            // ne rien faire
                          } else {
                            onUpdate({ [nomKey]: v });
                          }
                        }}
                        className={inputCls + ' font-bold text-fuchsia-700'}
                      >
                        <option value="">— Aucun —</option>
                        {listeNoms.map(n => <option key={n} value={n}>{n}</option>)}
                        {!valeurDansListe && valeurActuelle && (
                          <option value="__custom__">✏️ {valeurActuelle}</option>
                        )}
                        <option value="__new__">➕ Nouveau nom...</option>
                      </select>
                      {(d[nomKey] === '__custom__' || (!valeurDansListe && d[nomKey])) && (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={d[nomKey] === '__custom__' ? '' : d[nomKey]}
                            onChange={(e) => onUpdate({ [nomKey]: e.target.value })}
                            placeholder="Tape le nom"
                            className={inputCls + ' text-xs'}
                            autoFocus
                          />
                          {d[nomKey] && d[nomKey] !== '__custom__' && !listeNoms.find(n => n.toLowerCase() === d[nomKey].toLowerCase()) && setNomsInternes && (
                            <button
                              onClick={() => setNomsInternes({ ...nomsInternes, [role.key]: [...listeNoms, d[nomKey]] })}
                              className="px-1.5 py-1 bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 rounded text-[9px] font-bold whitespace-nowrap"
                              title="Ajouter à la liste"
                            >
                              💾
                            </button>
                          )}
                        </div>
                      )}
                      {/* Champ montant + bouton payé */}
                      {d[nomKey] && d[nomKey] !== '__custom__' && (
                        <>
                          <div>
                            <label className="block text-[9px] font-semibold text-fuchsia-600 uppercase mb-0.5">💰 Montant (€) — défaut {tarifAuto}€</label>
                            <input type="number" step="0.01" value={d[montantKey] || ''} onChange={(e) => onUpdate({ [montantKey]: e.target.value })} placeholder={`Vide = ${tarifAuto}€`} className="w-full px-2 py-1 bg-white border border-fuchsia-200 rounded text-[10px]" />
                          </div>
                          <button onClick={() => onUpdate({ [payeKey]: !d[payeKey], [dateKey]: !d[payeKey] ? new Date().toISOString().split('T')[0] : '' })} className={`w-full px-2 py-1 rounded text-[10px] font-bold ${d[payeKey] ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                            {d[payeKey] ? `✓ Payé (${montantEffectif}€)` : `⏳ À payer (${montantEffectif}€)`}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* POSEURS — éditables */}
          <div ref={refPoseurs} className="border-2 border-emerald-200 bg-emerald-50 rounded-xl p-2 mb-2">
            <div className={`flex items-center justify-between ${foldedSteps.poseurs ? '' : 'mb-1.5'}`}>
              <button onClick={() => toggleStep('poseurs')} className="flex-1 text-left flex items-center gap-1.5 hover:opacity-80 min-w-0">
                <span className="text-emerald-600 text-[9px]">{foldedSteps.poseurs ? '▶' : '▼'}</span>
                <h3 className="text-[10px] font-bold text-emerald-700 uppercase">🔧 Poseurs ({(d.poseurs || []).length})</h3>
                {foldedSteps.poseurs && (d.poseurs || []).length > 0 && (() => {
                  const poseurs = d.poseurs || [];
                  const named = poseurs.filter(p => p.nom);
                  const noms = named.slice(0, 2).map(p => p.nom).join(', ');
                  const reste = named.length > 2 ? ` +${named.length - 2}` : '';
                  const allPaid = named.length > 0 && named.every(p => p.paye);
                  return (
                    <span className="text-[9px] font-normal normal-case truncate flex items-center gap-1">
                      <span className="text-slate-500">— {noms || 'à compléter'}{reste}</span>
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${allPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{allPaid ? '✓ payé' : '⏳'}</span>
                    </span>
                  );
                })()}
              </button>
              <button onClick={() => { openStep('poseurs'); addPoseur(); }} className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Plus className="w-3 h-3" />Ajouter
              </button>
            </div>
            {!foldedSteps.poseurs && (
            <div className="space-y-1.5">
              {/* 🛠️ Instructions partagées pour la pose — incluses dans tous
                  les messages chantier (WhatsApp/email) envoyés aux poseurs. */}
              <div>
                <label className="block text-[9px] font-bold text-emerald-700 uppercase mb-1">
                  🛠️ Instructions pour la pose (optionnel)
                </label>
                <textarea
                  value={d.instructionsPose || ''}
                  onChange={(e) => onUpdate({ instructionsPose: e.target.value })}
                  rows={2}
                  placeholder="Ex : accès par le portail bleu, prévoir échelle 4m, branchement Linky à droite, gravier dans la cour…"
                  className="w-full px-2 py-1 bg-white border border-emerald-200 rounded text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none"
                />
                <div className="text-[9px] text-emerald-600 mt-0.5">💡 Ce texte sera inclus dans le message envoyé à chaque poseur (WhatsApp + email)</div>
              </div>
              {(d.poseurs || []).map((p, i) => {
                // Contact poseur : compatible legacy string (juste tel) ET nouveau format { tel, email }
                const rawContact = p.nom ? (poseursContacts || {})[p.nom] : null;
                const poseurTel = rawContact ? (typeof rawContact === 'string' ? rawContact : (rawContact.tel || '')) : '';
                const poseurEmail = rawContact && typeof rawContact === 'object' ? (rawContact.email || '') : '';
                // Message commun (WhatsApp + email) — descriptif du chantier
                // avec la liste détaillée des produits à installer
                const produitsDuDossier = (d.produits && d.produits.length > 0)
                  ? d.produits.map((prod) => {
                      const info = findProduit(produits, prod.type);
                      const qty = prod.quantite || 1;
                      const qtyPrefix = (!info.autoTarif && qty > 1) ? `${qty}× ` : '';
                      const label = info.autoTarif && prod.puissance
                        ? `${qtyPrefix}${info.emoji} ${info.label} ${prod.puissance} Wc`
                        : `${qtyPrefix}${info.emoji} ${info.label}`;
                      return `   • ${label}${prod.description ? ' — ' + prod.description : ''}`;
                    })
                  : (d.puissance ? [`   • ☀️ Panneaux solaires ${d.puissance} Wc`] : []);
                const toitLabel = TYPES_TOIT.find(t => t.id === d.typeToit)?.label || null;
                const orientLabel = ORIENTATIONS_PANNEAUX.find(o => o.id === d.orientationPanneaux)?.label || null;
                const chantierMessage = [
                  `🔧 Nouveau chantier à poser`,
                  ``,
                  `Client : ${(d.nom || '').toUpperCase()} ${d.prenom || ''}`.trim(),
                  (d.adresse || d.ville) ? `📍 ${[d.adresse, d.codePostal, d.ville].filter(Boolean).join(', ')}` : '',
                  d.telephone ? `📞 Client : ${d.telephone}` : '',
                  d.email ? `📧 Client : ${d.email}` : '',
                  d.dateInsta ? `📅 Pose prévue : ${formatDateForSheet(d.dateInsta)}` : '⚠️ Date de pose à confirmer',
                  produitsDuDossier.length > 0 ? `\n📦 Matériel à installer :\n${produitsDuDossier.join('\n')}` : '',
                  toitLabel ? `🏠 Toit : ${toitLabel}` : '',
                  orientLabel ? `📐 Orientation : ${orientLabel}` : '',
                  d.instructionsPose ? `\n🛠️ Instructions :\n${d.instructionsPose}` : '',
                ].filter(Boolean).join('\n');
                const chantierSubject = `Nouveau chantier à poser — ${(d.nom || '').toUpperCase()}${d.prenom ? ' ' + d.prenom : ''}`;
                const poseurFromEmail = emailConfig?.smtpUser || gmailOAuth?.email || '';
                const poseurGmailCompose = (to) => {
                  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: chantierSubject, body: chantierMessage });
                  if (poseurFromEmail) params.set('authuser', poseurFromEmail);
                  return `https://mail.google.com/mail/?${params.toString()}`;
                };
                return (
                <div key={i} className={`rounded-xl p-2 space-y-1 border ${p.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-1.5">
                    <select value={p.nom || ''} onChange={(e) => updatePoseur(i, { nom: e.target.value })} className="flex-1 min-w-0 px-2 py-1 bg-white border border-amber-200 rounded-lg text-[11px] font-bold text-amber-800">
                      <option value="">— Choisir —</option>
                      {POSEURS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button onClick={() => removePoseur(i)} className="p-1 text-rose-500 hover:bg-rose-100 rounded">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Boutons d'envoi du chantier — WhatsApp + Email */}
                  {p.nom && (poseurTel || poseurEmail) && (
                    <div className="grid grid-cols-2 gap-1">
                      {poseurTel ? (
                        <a
                          href={buildWhatsAppLink(poseurTel, chantierMessage)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#25D366] hover:bg-[#1ebe5a] text-white rounded text-[10px] font-bold"
                          title={`Envoyer le chantier à ${p.nom} sur WhatsApp`}
                        >
                          📲 WhatsApp
                        </a>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic px-1 py-1.5 text-center">📲 Pas de tél.</span>
                      )}
                      {poseurEmail ? (
                        gmailOAuth?.connected ? (
                          <button
                            onClick={async () => {
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const headers = { 'Content-Type': 'application/json' };
                                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                const res = await fetch('/api/send-email', {
                                  method: 'POST', headers,
                                  body: JSON.stringify({ provider: 'gmail-oauth', to: poseurEmail, subject: chantierSubject, text: chantierMessage, fromName: emailConfig?.fromName || 'CRM Solaire' }),
                                });
                                const pl = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(pl.error || `Erreur ${res.status}`);
                                alert(`✅ Email envoyé à ${p.nom} (${poseurEmail})`);
                              } catch (e) { alert(`❌ Envoi email : ${e.message}`); }
                            }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                            title={`Envoyer le chantier à ${p.nom} par email`}
                          >
                            📧 Envoyer
                          </button>
                        ) : emailConfig?.smtpUser && emailConfig?.smtpPass ? (
                          <button
                            onClick={async () => {
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const headers = { 'Content-Type': 'application/json' };
                                if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
                                const res = await fetch('/api/send-email', {
                                  method: 'POST', headers,
                                  body: JSON.stringify({ to: poseurEmail, subject: chantierSubject, text: chantierMessage, smtpUser: emailConfig.smtpUser, smtpPass: emailConfig.smtpPass, fromName: emailConfig.fromName || 'CRM Solaire' }),
                                });
                                const pl = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(pl.error || `Erreur ${res.status}`);
                                alert(`✅ Email envoyé à ${p.nom} (${poseurEmail})`);
                              } catch (e) { alert(`❌ Envoi email : ${e.message}`); }
                            }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                          >
                            📧 Envoyer
                          </button>
                        ) : (
                          <a
                            href={poseurGmailCompose(poseurEmail)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold"
                            title={`Ouvre Gmail (configure Réglages → Email d'envoi pour un envoi auto)`}
                          >
                            📧 Gmail
                          </a>
                        )
                      ) : (
                        <span className="text-[9px] text-slate-400 italic px-1 py-1.5 text-center">📧 Pas d'email</span>
                      )}
                    </div>
                  )}
                  {p.nom && !poseurTel && !poseurEmail && (
                    <div className="text-[9px] text-amber-600 italic px-1">
                      ⚠️ Ajoute le tél/email de {p.nom} dans Réglages → Poseurs pour envoyer le chantier
                    </div>
                  )}
                  {canSeeMarges && (() => {
                    const autoHt = d.poseursDetail?.[i]?.autoHt || 0;
                    const usingAuto = !p.htCustom && autoHt > 0;
                    return (
                      <div>
                        <label className="text-[9px] font-semibold text-amber-600 uppercase mb-0.5 flex items-center justify-between gap-2">
                          <span>💰 HT (€) <span className="text-amber-500 font-normal">— pas de TVA</span></span>
                          {autoHt > 0 && (
                            <span className={`text-[9px] font-bold normal-case px-1.5 py-0.5 rounded ${usingAuto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {usingAuto ? '✓ Auto' : 'Auto'} : {formatEuro(autoHt)}
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={p.htCustom || ''}
                          onChange={(e) => updatePoseur(i, { htCustom: e.target.value })}
                          placeholder={autoHt > 0 ? `Vide → auto ${autoHt} €` : 'Saisir le tarif'}
                          className="w-full px-2 py-1 bg-white border border-amber-200 rounded text-[10px]"
                        />
                        {autoHt === 0 && p.nom && (
                          <div className="text-[9px] text-rose-500 mt-0.5">⚠️ Aucun tarif défini pour {p.nom} dans Réglages → Poseurs</div>
                        )}
                      </div>
                    );
                  })()}
                  {canSeeBLFactures && (
                    <>
                      <div className="grid grid-cols-2 gap-1">
                        <input type="text" value={p.bl || ''} onChange={(e) => updatePoseur(i, { bl: e.target.value })} placeholder="📦 N° BL" className="px-2 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                        <input type="text" value={p.factureNo || ''} onChange={(e) => updatePoseur(i, { factureNo: e.target.value })} placeholder="🧾 N° Facture" className="px-2 py-1 bg-white border border-amber-200 rounded text-[10px]" />
                      </div>
                      <FactureFileInput
                        fileId={p.factureFile || ''}
                        onChange={(id) => updatePoseur(i, { factureFile: id })}
                        color="amber"
                        autoExtract={true}
                        onExtract={(data) => {
                          const upd = {};
                          if (data.factureNo && !p.factureNo) upd.factureNo = String(data.factureNo);
                          if (data.bl && !p.bl) upd.bl = String(data.bl);
                          if (data.montantHt && data.montantHt > 0 && !p.htCustom) upd.htCustom = String(data.montantHt);
                          if (data.dateFacture && !p.dateFacture) upd.dateFacture = String(data.dateFacture);
                          if (Object.keys(upd).length > 0) updatePoseur(i, upd);
                        }}
                        pennylaneInfo={{
                          supplierName: p.nom,
                          factureNo: p.factureNo,
                          dateFacture: p.dateFacture || new Date().toISOString().slice(0, 10),
                          montantHt: parseFloat(p.htCustom) || (d.poseursDetail?.[i]?.autoHt) || 0,
                          montantTtc: d.poseursDetail?.[i]?.ttc || 0,
                          tauxTva: 0, // poseurs : toujours sans TVA
                          pushedId: p.pennylaneInvoiceId,
                        }}
                        onPennylaneSuccess={(id) => updatePoseur(i, { pennylaneInvoiceId: id, pennylanePushedAt: new Date().toISOString() })}
                      />
                    </>
                  )}
                  {canCheckPaiements && p.nom && (
                    <button onClick={() => updatePoseur(i, { paye: !p.paye, datePaye: !p.paye ? new Date().toISOString().split('T')[0] : '' })} className={`w-full px-2 py-1 rounded-lg text-[10px] font-bold ${p.paye ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {p.paye ? '✓ Payé' : '⏳ Non payé'}
                    </button>
                  )}
                </div>
                );
              })}
              {(d.poseurs || []).length === 0 && (
                <div className="text-center py-2 text-slate-400 italic text-[11px] bg-slate-50 rounded-xl">Aucun poseur</div>
              )}
            </div>
            )}
          </div>

          {/* FOURNISSEURS — éditables */}
          <div ref={refFournisseurs} className="border-2 border-orange-200 bg-orange-50 rounded-xl p-2 mb-2">
            <div className={`flex items-center justify-between ${foldedSteps.fournisseurs ? '' : 'mb-1.5'}`}>
              <button onClick={() => toggleStep('fournisseurs')} className="flex-1 text-left flex items-center gap-1.5 hover:opacity-80 min-w-0">
                <span className="text-orange-600 text-[9px]">{foldedSteps.fournisseurs ? '▶' : '▼'}</span>
                <h3 className="text-[10px] font-bold text-orange-700 uppercase">📦 Fournisseurs ({(d.fournisseurs || []).length})</h3>
                {foldedSteps.fournisseurs && (d.fournisseurs || []).length > 0 && (() => {
                  const fournisseurs = d.fournisseurs || [];
                  const named = fournisseurs.filter(f => f.nom);
                  const noms = named.slice(0, 2).map(f => f.nom).join(', ');
                  const reste = named.length > 2 ? ` +${named.length - 2}` : '';
                  const allPaid = named.length > 0 && named.every(f => f.paye);
                  return (
                    <span className="text-[9px] font-normal normal-case truncate flex items-center gap-1">
                      <span className="text-slate-500">— {noms || 'à compléter'}{reste}</span>
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${allPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{allPaid ? '✓ payé' : '⏳'}</span>
                    </span>
                  );
                })()}
              </button>
              <button onClick={() => { openStep('fournisseurs'); addFournisseur(); }} className="text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Plus className="w-3 h-3" />Ajouter
              </button>
            </div>
            {!foldedSteps.fournisseurs && (
            <div className="space-y-1.5">
              {(d.fournisseurs || []).map((f, i) => (
                <div key={i} className={`rounded-xl p-2 space-y-1 border ${f.paye ? 'bg-emerald-50 border-emerald-300' : 'bg-orange-50 border-orange-200'}`}>
                  <div className="flex items-center gap-1.5">
                    <select value={f.nom || ''} onChange={(e) => updateFournisseur(i, { nom: e.target.value })} className="flex-1 min-w-0 px-2 py-1 bg-white border border-orange-200 rounded-lg text-[11px] font-bold text-orange-800">
                      <option value="">— Choisir —</option>
                      {FOURNISSEURS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button onClick={() => removeFournisseur(i)} className="p-1 text-rose-500 hover:bg-rose-100 rounded">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {canSeeMarges && (() => {
                    const detail = d.fournisseursDetail?.[i];
                    const ttcF = detail?.ttc || 0;
                    const autoHt = detail?.autoHt || 0;
                    const tarifWc = detail?.tarifWc || 0;
                    const usingAuto = !f.htCustom && autoHt > 0;
                    return (
                      <>
                        <div className="grid grid-cols-[1fr_auto] gap-1 items-end">
                          <div>
                            <label className="text-[9px] font-semibold text-orange-600 uppercase mb-0.5 flex items-center justify-between gap-1">
                              <span>💰 HT (€)</span>
                              {autoHt > 0 && (
                                <span title={`Tarif : ${tarifWc} €/Wc × ${d.puissance || 0} Wc`} className={`text-[9px] font-bold normal-case px-1 py-0.5 rounded ${usingAuto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {usingAuto ? '✓ Auto' : 'Auto'} : {formatEuro(autoHt)}
                                </span>
                              )}
                            </label>
                            <input type="number" step="0.01" value={f.htCustom || ''} onChange={(e) => updateFournisseur(i, { htCustom: e.target.value })} placeholder={autoHt > 0 ? `Vide → auto ${autoHt.toFixed(2)} €` : 'Coût HT'} className="w-full px-2 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-orange-600 uppercase mb-0.5">TTC (TVA 20 %)</label>
                            <div className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-[10px] font-bold text-orange-800 min-w-[80px] text-right">{formatEuro(ttcF)}</div>
                          </div>
                        </div>
                        {autoHt === 0 && f.nom && (
                          <div className="text-[9px] text-rose-500">⚠️ Pas de tarif €/Wc pour {f.nom} dans Réglages → Fournisseurs</div>
                        )}
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-orange-700 cursor-pointer">
                          <input type="checkbox" checked={!!f.sansTva || f.tauxTva === 0 || f.tauxTva === '0'} onChange={(e) => updateFournisseur(i, { sansTva: e.target.checked, tauxTva: e.target.checked ? 0 : 20 })} className="w-3.5 h-3.5 accent-orange-600" />
                          Sans TVA <span className="text-orange-500 font-normal">(auto-entrepreneur / société étrangère)</span>
                        </label>
                      </>
                    );
                  })()}
                  {canSeeBLFactures && (
                    <>
                      <div className="grid grid-cols-2 gap-1">
                        <input type="text" value={f.bl || ''} onChange={(e) => updateFournisseur(i, { bl: e.target.value })} placeholder="📦 N° BL" className="px-2 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                        <input type="text" value={f.factureNo || ''} onChange={(e) => updateFournisseur(i, { factureNo: e.target.value })} placeholder="🧾 N° Facture" className="px-2 py-1 bg-white border border-orange-200 rounded text-[10px]" />
                      </div>
                      <FactureFileInput
                        fileId={f.factureFile || ''}
                        onChange={(id) => updateFournisseur(i, { factureFile: id })}
                        color="orange"
                        autoExtract={true}
                        onExtract={(data) => {
                          const upd = {};
                          if (data.factureNo && !f.factureNo) upd.factureNo = String(data.factureNo);
                          if (data.bl && !f.bl) upd.bl = String(data.bl);
                          if (data.montantHt && data.montantHt > 0 && !f.htCustom) upd.htCustom = String(data.montantHt);
                          if (typeof data.tauxTva === 'number' && data.tauxTva === 0 && !f.sansTva) {
                            upd.sansTva = true; upd.tauxTva = 0;
                          }
                          if (data.dateFacture && !f.dateFacture) upd.dateFacture = String(data.dateFacture);
                          if (Object.keys(upd).length > 0) updateFournisseur(i, upd);
                        }}
                        pennylaneInfo={{
                          supplierName: f.nom,
                          factureNo: f.factureNo,
                          dateFacture: f.dateFacture || new Date().toISOString().slice(0, 10),
                          montantHt: parseFloat(f.htCustom) || (d.fournisseursDetail?.[i]?.autoHt) || 0,
                          montantTtc: d.fournisseursDetail?.[i]?.ttc || 0,
                          tauxTva: f.sansTva ? 0 : 20,
                          pushedId: f.pennylaneInvoiceId,
                        }}
                        onPennylaneSuccess={(id) => updateFournisseur(i, { pennylaneInvoiceId: id, pennylanePushedAt: new Date().toISOString() })}
                      />
                    </>
                  )}
                  {canCheckPaiements && f.nom && (
                    <button onClick={() => updateFournisseur(i, { paye: !f.paye, datePaye: !f.paye ? new Date().toISOString().split('T')[0] : '' })} className={`w-full px-2 py-1 rounded-lg text-[10px] font-bold ${f.paye ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {f.paye ? '✓ Payé' : '⏳ Non payé'}
                    </button>
                  )}
                </div>
              ))}
              {(d.fournisseurs || []).length === 0 && (
                <div className="text-center py-2 text-slate-400 italic text-[11px] bg-slate-50 rounded-xl">Aucun fournisseur</div>
              )}
            </div>
            )}
          </div>

          {/* OBSERVATIONS — éditable */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">📝 Observations</h3>
            <textarea value={d.observations || ''} onChange={(e) => onUpdate({ observations: e.target.value })} placeholder="Notes, remarques..." rows={3} className="w-full px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>

          {/* ACTIVITÉ */}
          {(d.createdBy || d.modifiedBy || lastHist) && (
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">📜 Activité</h3>
              <div className="space-y-1 text-[10px]">
                {d.createdBy && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 font-semibold">
                    <span>👤</span><span>Créé par <strong>{d.createdBy}</strong></span>
                    {d.createdAt && <span className="text-cyan-500 font-normal">· {fmtRel(d.createdAt)}</span>}
                  </div>
                )}
                {lastModBy && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-semibold">
                    <span>✏️</span><span>Modif par <strong>{lastModBy}</strong></span>
                    {d.modifiedAt && <span className="text-blue-500 font-normal">· {fmtRel(d.modifiedAt)}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* FOOTER — indicateur sauvegarde auto */}
        <div className="border-t border-slate-200 p-2.5 bg-emerald-50 text-center">
          <span className="text-[10px] font-bold text-emerald-700 flex items-center justify-center gap-1">
            <Check className="w-3 h-3" />Toutes les modifications sont sauvegardées automatiquement
          </span>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

// ===================== ASSISTANT IA — façon secrétaire =====================
// Tape un ordre en langage naturel ("Envoie un mail à Marage pour confirmer
// la pose mardi"), Claude identifie le client + rédige le mail, tu valides
// et tu envoies via Gmail OAuth ou SMTP.
function AssistantIaModal({ dossiers, gmailOAuth, emailConfig, currentUser, onClose, onSent }) {
  const [phase, setPhase] = useState('input'); // 'input' | 'draft' | 'sending'
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // draft = { targetLocalId, ambiguous, candidateLocalIds, subject, body, reasoning }
  const [draft, setDraft] = useState(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [chosenLocalId, setChosenLocalId] = useState('');
  const [sending, setSending] = useState(false);

  const targetDossier = useMemo(() => {
    const id = chosenLocalId || draft?.targetLocalId || '';
    return dossiers.find(d => d.localId === id) || null;
  }, [chosenLocalId, draft, dossiers]);

  const askIa = async () => {
    if (!command.trim()) return;
    setLoading(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/ai-email-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          command: command.trim(),
          dossiers: dossiers.map(d => ({
            localId: d.localId, nom: d.nom, prenom: d.prenom, email: d.email,
            telephone: d.telephone, statut: d.statut, dateInsta: d.dateInsta,
            financement: d.financement,
          })),
          senderName: currentUser || '',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      const d = payload.data || {};
      setDraft(d);
      setEditedSubject(d.subject || '');
      setEditedBody(d.body || '');
      setChosenLocalId(d.targetLocalId || '');
      setPhase('draft');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!targetDossier?.email) {
      setError('Le dossier choisi n\'a pas d\'email.');
      return;
    }
    setSending(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      // Tentative OAuth Gmail d'abord, fallback SMTP, sinon erreur.
      const useOAuth = !!gmailOAuth?.connected;
      const useSmtp = !useOAuth && !!(emailConfig?.smtpUser && emailConfig?.smtpPass);
      if (!useOAuth && !useSmtp) {
        throw new Error("Aucun email d'envoi configuré. Va dans Réglages → Email d'envoi pour connecter Gmail ou ajouter SMTP.");
      }
      const bodyReq = useOAuth
        ? { provider: 'gmail-oauth', to: targetDossier.email, subject: editedSubject, text: editedBody, fromName: emailConfig?.fromName || 'CRM Solaire' }
        : { to: targetDossier.email, subject: editedSubject, text: editedBody, smtpUser: emailConfig.smtpUser, smtpPass: emailConfig.smtpPass, fromName: emailConfig?.fromName || 'CRM Solaire' };
      const res = await fetch('/api/send-email', { method: 'POST', headers, body: JSON.stringify(bodyReq) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Erreur ${res.status}`);
      // Log dans l'historique du dossier + ferme la modale.
      if (onSent) onSent(targetDossier.localId, {
        action: 'email_ia',
        to: targetDossier.email,
        subject: editedSubject,
        via: useOAuth ? 'gmail_oauth' : 'smtp',
        command: command.trim(),
      });
      alert(`✅ Email envoyé à ${targetDossier.prenom || ''} ${targetDossier.nom || ''} (${targetDossier.email})`);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const candidates = (draft?.candidateLocalIds || [])
    .map(id => dossiers.find(d => d.localId === id))
    .filter(Boolean);

  // ===== Dictée vocale (Web Speech API) =====
  // Chrome/Edge/Safari supportent. Pas Firefox. On dégrade silencieusement.
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const baseTranscriptRef = useRef('');
  const speechSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startDictation = () => {
    if (!speechSupported) {
      alert("🎤 Dictée vocale non supportée sur ce navigateur. Utilise Chrome, Edge ou Safari.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    baseTranscriptRef.current = command;
    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      const sep = baseTranscriptRef.current && !baseTranscriptRef.current.endsWith(' ') ? ' ' : '';
      const next = baseTranscriptRef.current + sep + finalText + interimText;
      setCommand(next);
      if (finalText) baseTranscriptRef.current = baseTranscriptRef.current + sep + finalText;
    };
    rec.onerror = (e) => {
      console.warn('Speech recognition error', e);
      setIsListening(false);
      if (e.error === 'not-allowed') {
        alert("🎤 Accès micro refusé. Autorise le micro dans les réglages du navigateur.");
      }
    };
    rec.onend = () => { setIsListening(false); };
    try {
      rec.start();
      setIsListening(true);
      recognitionRef.current = rec;
    } catch (e) {
      setIsListening(false);
    }
  };

  const stopDictation = () => {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setIsListening(false);
  };

  // Stop la reconnaissance si on quitte la modale
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch (e) {} }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-500" />
              Assistant IA — comme ta secrétaire
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">Donne un ordre, l'IA identifie le client et rédige le mail. Tu valides avant l'envoi.</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 hover:bg-white/60 rounded-lg" title="Fermer"><X className="w-5 h-5 text-slate-600" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {phase === 'input' && (
            <>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-slate-700">Ton ordre</label>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={isListening ? stopDictation : startDictation}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${isListening ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'}`}
                    title={isListening ? 'Cliquer pour arrêter la dictée' : 'Dicter au lieu de taper'}
                  >
                    {isListening ? '⏹ Arrêter' : '🎤 Dicter'}
                  </button>
                )}
              </div>
              <textarea
                value={command}
                onChange={(e) => { setCommand(e.target.value); baseTranscriptRef.current = e.target.value; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) askIa(); }}
                rows={5}
                placeholder={`Exemples :\n• Envoie un mail à Marage pour confirmer la pose mardi prochain\n• Réponds à Borbeau pour lui demander son RIB\n• Mail à HADDAD pour le remercier après la pose`}
                className={`w-full px-3 py-2 bg-white border-2 rounded-xl text-sm resize-none ${isListening ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100'}`}
                autoFocus
              />
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>{isListening ? '🎤 Écoute en cours…' : '💡 Ctrl/Cmd + Entrée pour envoyer'}</span>
                <span>{command.length} caractères</span>
              </div>
              {error && <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-sm text-rose-700">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold">Annuler</button>
                <button onClick={askIa} disabled={loading || !command.trim()} className="px-5 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                  {loading ? '✨ Génération…' : '🤖 Demander à l\'IA'}
                </button>
              </div>
            </>
          )}

          {phase === 'draft' && draft && (
            <>
              {/* Bandeau client identifié */}
              {draft.ambiguous || !targetDossier ? (
                <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl">
                  <div className="text-sm font-bold text-amber-800 mb-2">⚠️ Plusieurs clients possibles — choisis :</div>
                  <div className="space-y-1">
                    {candidates.length > 0 ? candidates.map(c => (
                      <button key={c.localId} onClick={() => setChosenLocalId(c.localId)} className={`w-full text-left px-3 py-2 rounded-lg border-2 ${chosenLocalId === c.localId ? 'bg-violet-100 border-violet-400' : 'bg-white border-slate-200 hover:border-violet-300'}`}>
                        <span className="font-bold text-slate-800 text-sm">{c.nom} {c.prenom}</span>
                        {c.email && <span className="text-xs text-slate-500 ml-2">✉️ {c.email}</span>}
                      </button>
                    )) : <div className="text-xs text-amber-700 italic">Aucun candidat — change ton ordre pour préciser.</div>}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                  <span className="text-2xl">👤</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-emerald-800">{targetDossier.nom} {targetDossier.prenom}</div>
                    <div className="text-xs text-emerald-700">✉️ {targetDossier.email || <em className="text-rose-600">PAS D'EMAIL</em>}</div>
                  </div>
                  {draft.reasoning && <div className="text-[10px] text-emerald-600 italic max-w-[180px] text-right">{draft.reasoning}</div>}
                </div>
              )}

              {/* Champs éditables */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Sujet</label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 focus:border-violet-400 rounded-lg text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Message</label>
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 bg-white border-2 border-slate-200 focus:border-violet-400 rounded-lg text-sm font-mono whitespace-pre-wrap resize-vertical"
                />
                <div className="text-[10px] text-slate-500 mt-1">Édite à ta sauce avant d'envoyer. Signature à compléter (remplace [Ton nom]).</div>
              </div>

              {error && <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-sm text-rose-700">{error}</div>}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button onClick={() => { setPhase('input'); setDraft(null); }} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold">← Reformuler l'ordre</button>
                <div className="flex gap-2">
                  <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold">Annuler</button>
                  <button onClick={sendEmail} disabled={sending || !targetDossier?.email} className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                    {sending ? '📤 Envoi…' : `📧 Envoyer à ${targetDossier?.nom || ''}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== RECHERCHE GLOBALE Ctrl+K =====================

function GlobalSearchModal({ dossiers, STATUTS, isAdmin, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Recherche fuzzy dans plusieurs champs
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return dossiers.slice(0, 10); // top 10 récents si pas de query

    const scored = dossiers.map(d => {
      let score = 0;
      const matches = [];

      const check = (val, field, weight = 1) => {
        if (!val) return;
        const v = String(val).toLowerCase();
        if (v === q) { score += 100 * weight; matches.push(field); }
        else if (v.startsWith(q)) { score += 50 * weight; matches.push(field); }
        else if (v.includes(q)) { score += 20 * weight; matches.push(field); }
      };

      check(d.nom, 'Nom', 3);
      check(d.prenom, 'Prénom', 3);
      check(d.id, 'Référence', 4);
      check(d.telephone, 'Téléphone', 2);
      check(d.email, 'Email', 2);
      check(d.adresse, 'Adresse', 1);
      check(d.ville, 'Ville', 2);
      check(d.codePostal, 'CP', 1);
      check(d.observations, 'Notes', 1);
      // Recherche dans poseurs/fournisseurs/régie
      check(d.regie, 'Régie', 1);
      (d.poseurs || []).forEach(p => check(p.nom, 'Poseur', 1));
      (d.fournisseurs || []).forEach(f => {
        check(f.nom, 'Fournisseur', 1);
        if (isAdmin) {
          check(f.bl, 'N° BL', 2);
          check(f.factureNo, 'N° Facture', 2);
        }
      });
      if (isAdmin) {
        (d.poseurs || []).forEach(p => {
          check(p.bl, 'N° BL Poseur', 2);
          check(p.factureNo, 'N° Facture Poseur', 2);
        });
      }

      return { dossier: d, score, matches: [...new Set(matches)] };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [query, dossiers, isAdmin]);

  // Reset selectedIdx when results change
  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const r = results[selectedIdx];
      const localId = r.dossier ? r.dossier.localId : r.localId;
      onSelect(localId);
    }
  };

  const formatItem = (item) => {
    const d = item.dossier || item;
    const matches = item.matches || [];
    const statut = STATUTS.find(s => s.id === d.statut);
    return { d, matches, statut };
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center p-4 pt-16" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* SEARCH INPUT */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher par nom, téléphone, ville, n° dossier, n° facture..."
            className="flex-1 text-base font-medium bg-transparent focus:outline-none"
            autoFocus
          />
          <kbd className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">Esc</kbd>
        </div>

        {/* RESULTS */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">Aucun résultat</p>
              <p className="text-xs mt-1">Essaie un autre mot-clé.</p>
            </div>
          ) : (
            <div className="py-2">
              {!query && (
                <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase">📋 Dossiers récents</div>
              )}
              {results.map((item, idx) => {
                const { d, matches, statut } = formatItem(item);
                const isSel = idx === selectedIdx;
                return (
                  <button
                    key={d.localId}
                    onClick={() => onSelect(d.localId)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${isSel ? 'bg-violet-50 border-l-4 border-violet-500' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-base bg-gradient-to-br ${statut?.color || 'from-slate-400 to-slate-500'} text-white shadow-sm`}>
                      {statut?.emoji || '📄'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{d.nom} {d.prenom}</span>
                        {d.id && <span className="text-[10px] font-mono text-slate-400">#{d.id}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-slate-500">
                        {statut && <span>{statut.label}</span>}
                        {d.telephone && <><span>·</span><span>📞 {d.telephone}</span></>}
                        {d.ville && <><span>·</span><span>🏘️ {d.ville}</span></>}
                        {isAdmin && d.montantTotal > 0 && <><span>·</span><span className="font-semibold text-violet-600">{formatEuro(d.montantTotal)}</span></>}
                      </div>
                      {matches.length > 0 && query && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {matches.slice(0, 4).map((m, i) => (
                            <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full">{m}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isSel && <span className="text-[10px] font-bold text-violet-500">↵</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER tips */}
        <div className="border-t border-slate-100 px-4 py-2 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">↑↓</kbd> naviguer</span>
            <span className="flex items-center gap-1"><kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">↵</kbd> ouvrir</span>
            <span className="flex items-center gap-1"><kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">Esc</kbd> fermer</span>
          </div>
          <span className="font-semibold">{results.length} résultat{results.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ===================== VUE CALENDRIER =====================

function CalendrierView({ dossiers, STATUTS, onShowQuick, isAdmin }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [filterType, setFilterType] = useState('pose'); // 'pose' | 'accord' | 'consuel' | 'all'
  const [viewMode, setViewMode] = useState('mois'); // 'mois' | 'carte'

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const goPrev = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const goNext = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  // Construit la grille du mois (avec jours du mois précédent/suivant pour compléter les semaines)
  const grid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Lundi = 0 dans notre logique (au lieu de 0=Dimanche)
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();

    const days = [];
    // Jours du mois précédent
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      days.push({ date: new Date(year, month - 1, day), isCurrentMonth: false });
    }
    // Jours du mois courant
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    // Jours du mois suivant pour compléter (max 42 cases = 6 semaines)
    const totalCells = days.length <= 35 ? 35 : 42;
    let nextDay = 1;
    while (days.length < totalCells) {
      days.push({ date: new Date(year, month + 1, nextDay++), isCurrentMonth: false });
    }
    return days;
  }, [viewDate]);

  // Map des dossiers par date (selon le filtre actif)
  const eventsByDate = useMemo(() => {
    const map = {};
    const addEvent = (dateStr, dossier, type) => {
      if (!dateStr) return;
      const key = dateStr.split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push({ dossier, type });
    };
    dossiers.forEach(d => {
      if (filterType === 'pose' || filterType === 'all') {
        if (d.dateInsta) addEvent(d.dateInsta, d, 'pose');
      }
      if (filterType === 'accord' || filterType === 'all') {
        if (d.dateAccord) addEvent(d.dateAccord, d, 'accord');
      }
      if (filterType === 'consuel' || filterType === 'all') {
        if (d.dateConsuel) addEvent(d.dateConsuel, d, 'consuel');
      }
    });
    return map;
  }, [dossiers, filterType]);

  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const todayKey = dateKey(today);

  // Stats du mois
  const monthStats = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    let count = 0;
    let ca = 0;
    Object.entries(eventsByDate).forEach(([key, events]) => {
      const [y, m] = key.split('-').map(Number);
      if (y === year && m - 1 === month) {
        events.forEach(ev => {
          if (ev.type === 'pose') {
            count++;
            ca += ev.dossier.montantTotal || 0;
          }
        });
      }
    });
    return { count, ca };
  }, [eventsByDate, viewDate]);

  const filterOptions = [
    { id: 'pose', label: 'Poses', emoji: '🔧', color: 'from-orange-500 to-red-500', bg: 'bg-orange-100', text: 'text-orange-700' },
    { id: 'accord', label: 'Accords', emoji: '✅', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    { id: 'consuel', label: 'Consuel', emoji: '⚡', color: 'from-cyan-500 to-blue-500', bg: 'bg-cyan-100', text: 'text-cyan-700' },
    { id: 'all', label: 'Tout', emoji: '📋', color: 'from-violet-500 to-pink-500', bg: 'bg-violet-100', text: 'text-violet-700' },
  ];

  const eventTypeStyle = (type) => {
    if (type === 'pose') return 'bg-orange-100 text-orange-700 border-orange-300';
    if (type === 'accord') return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    if (type === 'consuel') return 'bg-cyan-100 text-cyan-700 border-cyan-300';
    return 'bg-slate-100 text-slate-700 border-slate-300';
  };

  return (
    <div className="space-y-4">
      {/* HEADER avec navigation mois */}
      <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600">◀</button>
            <h2 className="text-xl font-bold text-slate-800 min-w-[200px] text-center">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h2>
            <button onClick={goNext} className="p-2 hover:bg-slate-100 rounded-xl text-slate-600">▶</button>
            <button onClick={goToday} className="ml-2 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg">Aujourd'hui</button>
          </div>
          {filterType === 'pose' && (
            <div className="flex items-center gap-3 text-xs">
              <div className="bg-orange-50 px-3 py-1.5 rounded-lg">
                <span className="font-bold text-orange-700">{monthStats.count}</span>
                <span className="text-slate-600 ml-1">pose{monthStats.count > 1 ? 's' : ''}</span>
              </div>
              {isAdmin && monthStats.ca > 0 && (
                <div className="bg-violet-50 px-3 py-1.5 rounded-lg">
                  <span className="font-bold text-violet-700">{formatEuro(monthStats.ca)}</span>
                  <span className="text-slate-600 ml-1">CA</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filtres + bascule vue */}
        <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {filterOptions.map(f => {
              const sel = filterType === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${sel ? `bg-gradient-to-r ${f.color} text-white shadow-md` : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  <span>{f.emoji}</span><span>{f.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('mois')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${viewMode === 'mois' ? 'bg-white shadow text-violet-700' : 'text-slate-500'}`}
            >
              📅 Mois
            </button>
            <button
              onClick={() => setViewMode('carte')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${viewMode === 'carte' ? 'bg-white shadow text-violet-700' : 'text-slate-500'}`}
            >
              🗺️ Carte
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'carte' ? (
        <CarteView dossiers={dossiers} filterType={filterType} onShowQuick={onShowQuick} />
      ) : (
      <>
      {/* GRILLE CALENDRIER */}
      <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
        {/* Jours de la semaine */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {dayNames.map(d => (
            <div key={d} className="p-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wide">{d}</div>
          ))}
        </div>

        {/* Cases */}
        <div className="grid grid-cols-7 auto-rows-fr">
          {grid.map((cell, idx) => {
            const key = dateKey(cell.date);
            const events = eventsByDate[key] || [];
            const isToday = key === todayKey;
            const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
            return (
              <div
                key={idx}
                className={`min-h-[90px] p-1.5 border-r border-b border-slate-100 ${cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50'} ${isWeekend && cell.isCurrentMonth ? 'bg-slate-50/30' : ''}`}
              >
                <div className={`text-xs font-bold mb-1 flex items-center justify-between ${cell.isCurrentMonth ? (isToday ? 'text-violet-700' : 'text-slate-700') : 'text-slate-300'}`}>
                  <span className={isToday ? 'bg-violet-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]' : ''}>
                    {cell.date.getDate()}
                  </span>
                  {events.length > 0 && (
                    <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1 rounded-full">{events.length}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {events.slice(0, 3).map((ev, i) => {
                    const d = ev.dossier;
                    const statut = STATUTS.find(s => s.id === d.statut);
                    return (
                      <button
                        key={i}
                        onClick={() => onShowQuick && onShowQuick(d.localId)}
                        className={`w-full text-left text-[9px] font-semibold px-1.5 py-0.5 rounded border ${eventTypeStyle(ev.type)} hover:shadow-sm hover:scale-[1.02] transition-all truncate flex items-center gap-1`}
                        title={`${d.nom} ${d.prenom || ''} — ${ev.type}`}
                      >
                        <span>{ev.type === 'pose' ? '🔧' : ev.type === 'accord' ? '✅' : '⚡'}</span>
                        <span className="truncate">{d.nom}</span>
                      </button>
                    );
                  })}
                  {events.length > 3 && (
                    <button
                      onClick={() => onShowQuick && events[3] && onShowQuick(events[3].dossier.localId)}
                      className="w-full text-[9px] text-slate-500 hover:text-violet-600 font-semibold text-center"
                    >
                      +{events.length - 3} autres
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LÉGENDE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex items-center gap-3 flex-wrap text-xs">
        <span className="font-semibold text-slate-600">Légende :</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-orange-100 text-orange-700 border-orange-300">🔧 Pose</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-300">✅ Accord</span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded border bg-cyan-100 text-cyan-700 border-cyan-300">⚡ Consuel</span>
        <span className="text-slate-400 ml-auto">💡 Clique sur un évènement pour ouvrir l'aperçu</span>
      </div>
      </>
      )}
    </div>
  );
}

// ===================== CARTE INTERACTIVE (Leaflet) =====================

// Cache localStorage des géocodages (clé = adresse complète, valeur = {lat, lng}).
// Évite de re-géocoder à chaque visite (Nominatim limite à 1 req/sec).
const loadGeocodeCache = async () => {
  try {
    const r = await window.storage.get('geocode-cache');
    return r?.value ? JSON.parse(r.value) : {};
  } catch (e) { return {}; }
};
const saveGeocodeCache = async (cache) => {
  try { await window.storage.set('geocode-cache', JSON.stringify(cache)); } catch (e) {}
};

function CarteView({ dossiers, filterType, onShowQuick }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [leafletReady, setLeafletReady] = useState(typeof window !== 'undefined' && !!window.L);

  // Dossiers pertinents : ont une adresse + correspondent au filtre.
  const dossiersToPlot = useMemo(() => {
    return dossiers.filter(d => {
      if (!(d.adresse || d.ville)) return false;
      if (filterType === 'pose') return !!d.dateInsta;
      if (filterType === 'accord') return !!d.dateAccord;
      if (filterType === 'consuel') return !!d.dateConsuel;
      return d.dateInsta || d.dateAccord || d.dateConsuel;
    });
  }, [dossiers, filterType]);

  // Attend Leaflet (chargé en defer dans index.html)
  useEffect(() => {
    if (leafletReady) return;
    const id = setInterval(() => {
      if (window.L) { setLeafletReady(true); clearInterval(id); }
    }, 200);
    return () => clearInterval(id);
  }, [leafletReady]);

  // Init carte
  useEffect(() => {
    if (!leafletReady || mapRef.current || !mapDivRef.current) return;
    const L = window.L;
    mapRef.current = L.map(mapDivRef.current).setView([46.6, 2.5], 6); // France centrée
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, [leafletReady]);

  // Ouvre le QuickView depuis un event custom dispatché par le popup
  useEffect(() => {
    const handler = (e) => onShowQuick && onShowQuick(e.detail);
    window.addEventListener('crm:openQuick', handler);
    return () => window.removeEventListener('crm:openQuick', handler);
  }, [onShowQuick]);

  // Plot markers (géocode si besoin)
  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;
    const L = window.L;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    let cancelled = false;
    const bounds = L.latLngBounds([]);
    setProgress({ done: 0, total: dossiersToPlot.length });

    (async () => {
      const cache = await loadGeocodeCache();
      let cacheDirty = false;
      for (let i = 0; i < dossiersToPlot.length; i++) {
        if (cancelled) return;
        const d = dossiersToPlot[i];
        const fullAddress = [d.adresse, d.codePostal, d.ville].filter(Boolean).join(' ').trim();
        const key = fullAddress.toLowerCase();
        let coords = cache[key];
        if (!coords) {
          await new Promise(r => setTimeout(r, 1100)); // throttle Nominatim
          if (cancelled) return;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress + ', France')}&limit=1`, {
              headers: { 'Accept-Language': 'fr' },
            });
            const data = await res.json();
            if (data && data[0]) {
              coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
              cache[key] = coords;
              cacheDirty = true;
            }
          } catch (e) {}
        }
        if (coords && mapRef.current && !cancelled) {
          // Couleur selon date : pose ambre, consuel vert, accord cyan, défaut violet
          const color = d.dateConsuel && filterType !== 'pose' && filterType !== 'accord' ? '#10b981'
                      : d.dateInsta ? '#f59e0b'
                      : d.dateAccord ? '#06b6d4'
                      : '#a855f7';
          const icon = L.divIcon({
            html: `<div style="background:${color};width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            popupAnchor: [0, -11],
          });
          const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(mapRef.current);
          const dateInsta = d.dateInsta ? new Date(d.dateInsta).toLocaleDateString('fr-FR') : null;
          const dateAccord = d.dateAccord ? new Date(d.dateAccord).toLocaleDateString('fr-FR') : null;
          const dateConsuel = d.dateConsuel ? new Date(d.dateConsuel).toLocaleDateString('fr-FR') : null;
          marker.bindPopup(`
            <div style="font-weight:bold;font-size:13px">${(d.nom || '').toUpperCase()} ${d.prenom || ''}</div>
            <div style="font-size:11px;color:#666;margin-bottom:4px">📍 ${fullAddress}</div>
            ${dateInsta ? `<div style="font-size:11px">🔧 Pose : ${dateInsta}</div>` : ''}
            ${dateAccord ? `<div style="font-size:11px">✅ Accord : ${dateAccord}</div>` : ''}
            ${dateConsuel ? `<div style="font-size:11px">⚡ Consuel : ${dateConsuel}</div>` : ''}
            <button onclick="window.dispatchEvent(new CustomEvent('crm:openQuick', { detail: '${d.localId}' }))" style="margin-top:6px;padding:4px 10px;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:11px">Ouvrir le dossier ›</button>
          `);
          markersRef.current.push(marker);
          bounds.extend([coords.lat, coords.lng]);
        }
        if (!cancelled) setProgress({ done: i + 1, total: dossiersToPlot.length });
      }
      if (cacheDirty && !cancelled) await saveGeocodeCache(cache);
      if (!cancelled && bounds.isValid() && markersRef.current.length > 0) {
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    })();

    return () => { cancelled = true; };
  }, [leafletReady, dossiersToPlot, filterType]);

  if (!leafletReady) {
    return (
      <div className="bg-white rounded-3xl shadow-md border border-slate-200 p-12 text-center text-slate-500">
        ⏳ Chargement de la carte…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-md border border-violet-100 overflow-hidden">
      {progress.total > 0 && progress.done < progress.total && (
        <div className="px-4 py-2 bg-amber-50 text-amber-800 text-xs font-semibold border-b border-amber-200">
          ⏳ Géocodage en cours : {progress.done} / {progress.total} adresses (limité par OpenStreetMap à 1/seconde, mis en cache)
        </div>
      )}
      {dossiersToPlot.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <div className="text-4xl mb-2">🗺️</div>
          <p className="text-sm font-semibold">Aucun dossier à afficher</p>
          <p className="text-xs mt-1">Les dossiers doivent avoir une adresse + une date selon le filtre actif.</p>
        </div>
      ) : (
        <div ref={mapDivRef} style={{ height: 600, width: '100%' }} />
      )}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-3 flex-wrap text-xs">
        <span className="font-semibold text-slate-600">Légende :</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow"></span>Pose</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-cyan-500 border-2 border-white shadow"></span>Accord</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow"></span>Consuel</span>
        <span className="text-slate-400 ml-auto">💡 Clique un point pour voir le dossier</span>
      </div>
    </div>
  );
}

// ===================== BARRE D'ALERTES RAPIDES =====================

// Alertes visibles par rôle non-admin. Une entrée = liste blanche des `type`
// de badges affichés. Un rôle absent de cette map voit toutes les alertes
// non adminOnly (comportement par défaut).
const ALERTES_PAR_ROLE = {
  envoi_finance: ['controleQualite', 'aEnvoyerBanque', 'financement', 'manqueDoc', 'originaux'],
  compta: ['facturesManquantes'], // la compta ne suit que les factures manquantes
  // l'administratif suit les démarches : mairie, Consuel, raccordement, récup. TVA
  administratif: ['aEnvoyerMairie', 'aEnvoyerConsuel', 'aEnvoyerRaccordement', 'recup_tva'],
  poseur: [], // le poseur ne voit aucune alerte
  regie: [],  // la régie ne voit aucune alerte
};

function AlertesBar({ rappelsControleQualite, rappelsAEnvoyerBanque, rappelsFinancement, rappelsManqueDoc, rappelsAEnvoyerPose, rappelsPoseurNonAssigne, rappelsPoseNonFinie, rappelsAEnvoyerMairie, rappelsAEnvoyerConsuel, rappelsAEnvoyerRaccordement, rappelsOriginaux, rappelsControleLivraison, rappelsPaiement, rappelsStagnation, rappelsRecupTva, rappelsFacturesManquantes, isAdmin, currentUserRole, onClick }) {
  // Définition des badges
  const badges = [
    {
      type: 'controleQualite',
      label: 'Contrôle qualité',
      emoji: '📋',
      count: rappelsControleQualite.length,
      adminOnly: false,
      color: 'from-purple-500 to-violet-500',
      colorBg: 'bg-purple-50',
      colorBorder: 'border-purple-200',
      colorText: 'text-purple-700',
      tooltip: 'Dossiers à valider/refuser (appel client)',
    },
    {
      type: 'aEnvoyerMairie',
      label: 'Mairie',
      emoji: '🏛️',
      count: (rappelsAEnvoyerMairie || []).length,
      adminOnly: false,
      color: 'from-indigo-500 to-violet-500',
      colorBg: 'bg-indigo-50',
      colorBorder: 'border-indigo-200',
      colorText: 'text-indigo-700',
      tooltip: 'Déclaration mairie à envoyer (ou refusée → à renvoyer)',
    },
    {
      type: 'aEnvoyerBanque',
      label: 'À envoyer banque',
      emoji: '🏦',
      count: rappelsAEnvoyerBanque.length,
      adminOnly: false,
      color: 'from-pink-500 to-rose-500',
      colorBg: 'bg-pink-50',
      colorBorder: 'border-pink-200',
      colorText: 'text-pink-700',
      tooltip: 'CQ validé — dossiers à envoyer en financement',
    },
    {
      type: 'financement',
      label: 'Financement',
      emoji: '💳',
      count: rappelsFinancement.length,
      adminOnly: false,
      color: 'from-blue-500 to-cyan-500',
      colorBg: 'bg-blue-50',
      colorBorder: 'border-blue-200',
      colorText: 'text-blue-700',
      tooltip: 'Banques sans retour +48h',
    },
    {
      type: 'manqueDoc',
      label: 'Manque docs',
      emoji: '📄',
      count: (rappelsManqueDoc || []).length,
      adminOnly: false,
      color: 'from-orange-500 to-amber-500',
      colorBg: 'bg-orange-50',
      colorBorder: 'border-orange-200',
      colorText: 'text-orange-700',
      tooltip: 'Banque demande des docs complémentaires — à récupérer + renvoyer',
    },
    {
      type: 'aEnvoyerPose',
      label: 'À envoyer pose',
      emoji: '📦',
      count: rappelsAEnvoyerPose.length,
      adminOnly: false,
      color: 'from-orange-500 to-amber-500',
      colorBg: 'bg-orange-50',
      colorBorder: 'border-orange-200',
      colorText: 'text-orange-700',
      tooltip: 'Banque accordée — dossiers à envoyer en pose',
    },
    {
      type: 'poseurNonAssigne',
      label: 'Poseur à assigner',
      emoji: '🔧',
      count: rappelsPoseurNonAssigne.length,
      adminOnly: false,
      color: 'from-amber-500 to-yellow-500',
      colorBg: 'bg-amber-50',
      colorBorder: 'border-amber-200',
      colorText: 'text-amber-700',
      tooltip: 'Date de pose remplie mais aucun poseur dans l\'équipe',
    },
    {
      type: 'poseNonFinie',
      label: 'Pose non finie',
      emoji: '⏱️',
      count: rappelsPoseNonFinie.length,
      adminOnly: false,
      color: 'from-orange-500 to-red-500',
      colorBg: 'bg-orange-50',
      colorBorder: 'border-orange-200',
      colorText: 'text-orange-700',
      tooltip: 'Date de pose passée depuis +3j mais pas encore marquée posée',
    },
    {
      type: 'aEnvoyerConsuel',
      label: 'À envoyer Consuel',
      emoji: '📨',
      count: rappelsAEnvoyerConsuel.length,
      adminOnly: false,
      color: 'from-teal-500 to-cyan-500',
      colorBg: 'bg-teal-50',
      colorBorder: 'border-teal-200',
      colorText: 'text-teal-700',
      tooltip: 'Pose terminée — dossiers à envoyer en Consuel',
    },
    {
      type: 'aEnvoyerRaccordement',
      label: 'Raccordement',
      emoji: '🔌',
      count: (rappelsAEnvoyerRaccordement || []).length,
      adminOnly: false,
      color: 'from-sky-500 to-blue-500',
      colorBg: 'bg-sky-50',
      colorBorder: 'border-sky-200',
      colorText: 'text-sky-700',
      tooltip: 'Pose terminée — demande de raccordement Enedis à envoyer',
    },
    {
      type: 'originaux',
      label: 'Originaux',
      emoji: '📑',
      count: rappelsOriginaux.length,
      adminOnly: false,
      color: 'from-amber-500 to-yellow-500',
      colorBg: 'bg-amber-50',
      colorBorder: 'border-amber-200',
      colorText: 'text-amber-700',
      tooltip: 'Originaux signés à gérer (poseur → toi → banque)',
    },
    {
      type: 'controle',
      label: 'Contrôle livraison',
      emoji: '📞',
      count: rappelsControleLivraison.length,
      adminOnly: false,
      color: 'from-purple-500 to-pink-500',
      colorBg: 'bg-purple-50',
      colorBorder: 'border-purple-200',
      colorText: 'text-purple-700',
      tooltip: 'Contrôles livraison à faire (Consuel reçu)',
    },
    {
      type: 'paiement',
      label: 'Paiement',
      emoji: '💰',
      count: rappelsPaiement.length,
      adminOnly: true,
      color: 'from-emerald-500 to-teal-500',
      colorBg: 'bg-emerald-50',
      colorBorder: 'border-emerald-200',
      colorText: 'text-emerald-700',
      tooltip: 'Paiement non reçu +48h après contrôle',
    },
    {
      type: 'recup_tva',
      label: 'Récup. TVA',
      emoji: '💰',
      count: rappelsRecupTva.length,
      adminOnly: false,
      color: 'from-emerald-500 to-teal-500',
      colorBg: 'bg-emerald-50',
      colorBorder: 'border-emerald-200',
      colorText: 'text-emerald-700',
      tooltip: 'Démarches récupération TVA pour le client (délai 6 mois après paiement banque)',
    },
    {
      type: 'stagnation',
      label: 'Stagnation',
      emoji: '⏰',
      count: rappelsStagnation.length,
      adminOnly: false,
      color: 'from-rose-500 to-orange-500',
      colorBg: 'bg-rose-50',
      colorBorder: 'border-rose-200',
      colorText: 'text-rose-700',
      tooltip: 'Dossiers bloqués trop longtemps',
    },
    {
      type: 'facturesManquantes',
      label: 'Factures manquantes',
      emoji: '🧾',
      count: (rappelsFacturesManquantes || []).length,
      adminOnly: false,
      color: 'from-fuchsia-500 to-pink-500',
      colorBg: 'bg-fuchsia-50',
      colorBorder: 'border-fuchsia-200',
      colorText: 'text-fuchsia-700',
      tooltip: 'Pose terminée mais factures poseur/régie/fournisseur pas encore reçues',
    },
  ];

  // Filtrage : admin voit tout ; sinon on retire les adminOnly, puis on
  // applique la liste blanche du rôle si elle existe.
  const whitelist = !isAdmin && currentUserRole ? ALERTES_PAR_ROLE[currentUserRole] : null;
  const visible = badges.filter(b => {
    if (!isAdmin && b.adminOnly) return false;
    if (whitelist) return whitelist.includes(b.type);
    return true;
  });

  // Si le rôle n'a aucune alerte à voir (ex : poseur), on masque toute la barre.
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-slate-500 uppercase mr-1">🔔 Alertes :</span>
      {visible.map(b => {
        const hasAlerts = b.count > 0;
        return (
          <button
            key={b.type}
            onClick={() => hasAlerts && onClick(b.type)}
            disabled={!hasAlerts}
            title={b.tooltip}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-semibold text-xs transition-all ${
              hasAlerts
                ? `${b.colorBg} ${b.colorBorder} ${b.colorText} hover:scale-105 hover:shadow-md cursor-pointer`
                : 'bg-slate-50 border-slate-200 text-slate-400 cursor-default'
            }`}
          >
            <span className="text-base">{b.emoji}</span>
            <span>{b.label}</span>
            {hasAlerts ? (
              <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-br ${b.color} text-white text-xs font-bold flex items-center justify-center shadow-sm animate-pulse`}>
                {b.count}
              </span>
            ) : (
              <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center">0</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ===================== MODAL ALERTES =====================

function AlertesModal({ type, dashboard, STATUTS, poseursContacts, regiesContacts, onLogAction, onClose, onSelect }) {
  const config = {
    controleQualite: {
      title: '📋 Contrôle qualité — dossiers à valider',
      subtitle: 'Appelle le client pour valider ou refuser le dossier',
      items: dashboard.rappelsControleQualite || [],
      gradient: 'from-purple-500 to-violet-500',
      bgHeader: 'from-purple-50 to-violet-50',
      borderColor: 'border-purple-200',
      lineLabel: (d) => {
        if (d.dateControleQualite) return `📞 CQ fait le ${new Date(d.dateControleQualite).toLocaleDateString('fr-FR')} · à statuer`;
        return `Pas encore de contrôle qualité`;
      },
      suffixLabel: 'depuis création',
    },
    aEnvoyerBanque: {
      title: '🏦 Dossiers à envoyer en banque',
      subtitle: 'CQ validé — la secrétaire doit envoyer ces dossiers en financement',
      items: dashboard.rappelsAEnvoyerBanque || [],
      gradient: 'from-pink-500 to-rose-500',
      bgHeader: 'from-pink-50 to-rose-50',
      borderColor: 'border-pink-200',
      lineLabel: (d) => `Validé le ${d.dateControleQualite && new Date(d.dateControleQualite).toLocaleDateString('fr-FR')} → ${d.financement || '(financeur à choisir)'}`,
      suffixLabel: 'depuis validation',
    },
    financement: {
      title: '💳 Financements en attente de retour',
      subtitle: 'Banques sans réponse depuis +48h',
      items: dashboard.rappelsFinancement || [],
      gradient: 'from-blue-500 to-cyan-500',
      bgHeader: 'from-blue-50 to-cyan-50',
      borderColor: 'border-blue-200',
      lineLabel: (d) => `Envoyé à ${d.financement} le ${d.dateEnvoiFin && new Date(d.dateEnvoiFin).toLocaleDateString('fr-FR')}`,
      suffixLabel: 'sans retour',
    },
    manqueDoc: {
      title: '📄 Banque demande des docs complémentaires',
      subtitle: 'La banque a renvoyé le dossier en demandant des pièces — à récupérer côté client puis renvoyer',
      items: dashboard.rappelsManqueDoc || [],
      gradient: 'from-orange-500 to-amber-500',
      bgHeader: 'from-orange-50 to-amber-50',
      borderColor: 'border-orange-200',
      lineLabel: (d) => {
        const banque = d.financement || 'la banque';
        const motif = d.motifManqueDoc ? ` — ${d.motifManqueDoc}` : '';
        return `${banque} demande${motif}`;
      },
      suffixLabel: 'depuis le retour banque',
    },
    aEnvoyerPose: {
      title: '📦 Dossiers à envoyer en pose',
      subtitle: 'Banque a accordé — il faut envoyer le dossier en pose',
      items: dashboard.rappelsAEnvoyerPose || [],
      gradient: 'from-orange-500 to-amber-500',
      bgHeader: 'from-orange-50 to-amber-50',
      borderColor: 'border-orange-200',
      lineLabel: (d) => `Accord ${d.financement} le ${d.dateAccord && new Date(d.dateAccord).toLocaleDateString('fr-FR')}`,
      suffixLabel: 'depuis accord',
    },
    poseurNonAssigne: {
      title: '🔧 Poseur à assigner',
      subtitle: 'Date de pose remplie mais aucun poseur dans l\'équipe — assigne quelqu\'un',
      items: dashboard.rappelsPoseurNonAssigne || [],
      gradient: 'from-amber-500 to-yellow-500',
      bgHeader: 'from-amber-50 to-yellow-50',
      borderColor: 'border-amber-200',
      lineLabel: (d) => {
        if (d.dateInsta) return `🔧 Pose prévue le ${new Date(d.dateInsta).toLocaleDateString('fr-FR')}`;
        if (d.dateVisitePose) return `📞 Visite le ${new Date(d.dateVisitePose).toLocaleDateString('fr-FR')}`;
        if (d.dateEnvoiPose) return `📅 Date pose ${new Date(d.dateEnvoiPose).toLocaleDateString('fr-FR')}`;
        return 'Date de pose remplie';
      },
      suffixLabel: 'depuis date pose',
    },
    poseNonFinie: {
      title: '⏱️ Pose non finie',
      subtitle: 'Date de pose passée depuis +3 jours mais pas encore cochée "posée"',
      items: dashboard.rappelsPoseNonFinie || [],
      gradient: 'from-orange-500 to-red-500',
      bgHeader: 'from-orange-50 to-red-50',
      borderColor: 'border-orange-200',
      lineLabel: (d) => `📅 Date prévue ${d.dateEnvoiPose && new Date(d.dateEnvoiPose).toLocaleDateString('fr-FR')} — pas encore posé`,
      suffixLabel: 'jours de retard',
    },
    aEnvoyerMairie: {
      title: '🏛️ Déclaration mairie à envoyer (ou refusée)',
      subtitle: 'Dossier créé — envoie la déclaration préalable / autorisation d\'urbanisme. Si refusée, renvoie après modif.',
      items: dashboard.rappelsAEnvoyerMairie || [],
      gradient: 'from-indigo-500 to-violet-500',
      bgHeader: 'from-indigo-50 to-violet-50',
      borderColor: 'border-indigo-200',
      lineLabel: (d, r) => r?.refus ? '✗ Refusée — à renvoyer' : 'Pas encore envoyée',
      suffixLabel: 'depuis création',
    },
    aEnvoyerConsuel: {
      title: '📨 Dossiers à envoyer en Consuel',
      subtitle: 'Pose terminée — il faut envoyer la demande de Consuel',
      items: dashboard.rappelsAEnvoyerConsuel || [],
      gradient: 'from-teal-500 to-cyan-500',
      bgHeader: 'from-teal-50 to-cyan-50',
      borderColor: 'border-teal-200',
      lineLabel: (d) => d.dateInsta ? `Posé le ${new Date(d.dateInsta).toLocaleDateString('fr-FR')}` : 'Pose terminée',
      suffixLabel: 'depuis pose',
    },
    aEnvoyerRaccordement: {
      title: '🔌 Demandes de raccordement à envoyer',
      subtitle: 'Pose terminée — il faut envoyer la demande de raccordement Enedis',
      items: dashboard.rappelsAEnvoyerRaccordement || [],
      gradient: 'from-sky-500 to-blue-500',
      bgHeader: 'from-sky-50 to-blue-50',
      borderColor: 'border-sky-200',
      lineLabel: (d) => d.dateInsta ? `Posé le ${new Date(d.dateInsta).toLocaleDateString('fr-FR')}` : 'Pose terminée',
      suffixLabel: 'depuis pose',
    },
    originaux: {
      title: '📑 Originaux signés à gérer',
      subtitle: 'Poseur → toi → banque (avant le contrôle livraison)',
      items: dashboard.rappelsOriginaux || [],
      gradient: 'from-amber-500 to-yellow-500',
      bgHeader: 'from-amber-50 to-yellow-50',
      borderColor: 'border-amber-200',
      lineLabel: (d, r) => {
        if (r?.etape === 'attente_poseur') return '📥 À récupérer du poseur';
        if (r?.etape === 'a_envoyer_banque') return '📤 À envoyer à la banque';
        if (r?.etape === 'attente_banque') return '⏳ Envoyés — attente confirmation banque';
        return 'Originaux à gérer';
      },
      suffixLabel: 'depuis pose',
    },
    controle: {
      title: '📞 Contrôles livraison à faire',
      subtitle: 'Consuel reçu — appelle le client pour vérifier que tout va bien',
      items: dashboard.rappelsControleLivraison || [],
      gradient: 'from-purple-500 to-pink-500',
      bgHeader: 'from-purple-50 to-pink-50',
      borderColor: 'border-purple-200',
      lineLabel: (d) => `Consuel reçu le ${d.dateConsuel && new Date(d.dateConsuel).toLocaleDateString('fr-FR')}`,
      suffixLabel: 'depuis Consuel',
    },
    paiement: {
      title: '💰 Paiements en attente',
      subtitle: 'Banques pas encore payé après contrôle livraison +48h',
      items: dashboard.rappelsPaiement || [],
      gradient: 'from-emerald-500 to-teal-500',
      bgHeader: 'from-emerald-50 to-teal-50',
      borderColor: 'border-emerald-200',
      lineLabel: (d) => `${d.financement} · contrôle le ${d.dateControleLivraison && new Date(d.dateControleLivraison).toLocaleDateString('fr-FR')}`,
      suffixLabel: 'sans paiement',
    },
    stagnation: {
      title: '⏰ Dossiers qui stagnent',
      subtitle: 'Dossiers bloqués trop longtemps dans le même statut',
      items: dashboard.rappelsStagnation || [],
      gradient: 'from-rose-500 to-orange-500',
      bgHeader: 'from-rose-50 to-orange-50',
      borderColor: 'border-rose-200',
      lineLabel: (d, r) => {
        const statut = STATUTS.find(s => s.id === r.statutId);
        return `${statut?.label || d.statut} · seuil ${r.seuil}j`;
      },
      suffixLabel: 'au total',
    },
    facturesManquantes: {
      title: '🧾 Factures manquantes (compta)',
      subtitle: 'Dossiers posés où les factures poseur / régie / fournisseur ne sont pas encore reçues. Clic 📲 = relance WhatsApp directe.',
      items: dashboard.rappelsFacturesManquantes || [],
      gradient: 'from-fuchsia-500 to-pink-500',
      bgHeader: 'from-fuchsia-50 to-pink-50',
      borderColor: 'border-fuchsia-200',
      lineLabel: (d, r) => {
        // Construit pour chaque prestataire manquant : nom + bouton WhatsApp si on a son tél.
        const datePose = d.dateInsta ? new Date(d.dateInsta).toLocaleDateString('fr-FR') : 'récemment';
        const clientLabel = `${d.nom || ''}${d.prenom ? ' ' + d.prenom : ''}`.trim();
        const buildMsg = (kind, nom) => `Bonjour ${nom},\n\nOn n'a pas encore reçu ta facture pour le chantier de ${clientLabel} posé le ${datePose}. Tu peux nous l'envoyer dès que possible ?\n\nMerci !`;
        const getTel = (contacts, nom) => {
          const c = (contacts || {})[nom];
          if (!c) return '';
          return typeof c === 'string' ? c : (c.tel || '');
        };
        const renderChip = (emoji, nom, tel, kind) => {
          if (!tel) return <span key={`${kind}:${nom}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">{emoji} {nom}</span>;
          const link = buildWhatsAppLink(tel, buildMsg(kind, nom));
          return (
            <a
              key={`${kind}:${nom}`}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                // Log dans l'historique du dossier : WhatsApp initié pour ce
                // prestataire. NB : on ne peut pas savoir si tu cliques 'Envoyer'
                // dans WhatsApp — on log seulement l'ouverture du lien.
                if (onLogAction) {
                  onLogAction(d.localId, {
                    action: 'relance_whatsapp',
                    cible_kind: kind,
                    cible_nom: nom,
                    motif: 'facture_manquante',
                    tel,
                  });
                }
              }}
              title={`Relancer ${nom} sur WhatsApp (log dans l'historique du dossier)`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-[10px] font-semibold"
            >
              📲 {emoji} {nom}
            </a>
          );
        };
        const chips = [
          ...(r.poseurs || []).map(nom => renderChip('🔧', nom, getTel(poseursContacts, nom), 'poseur')),
          ...(r.regies || []).map(nom => renderChip('🤝', nom, getTel(regiesContacts, nom), 'regie')),
          ...(r.fournisseurs || []).map(nom => renderChip('📦', nom, '', 'fournisseur')),
        ];
        return <div className="flex items-center gap-1 flex-wrap">{chips}</div>;
      },
      suffixLabel: 'depuis pose',
    },
    recup_tva: {
      title: '💰 Récupération TVA — démarches à faire',
      subtitle: 'Délai légal 6 mois après paiement banque',
      items: dashboard.rappelsRecupTva || [],
      gradient: 'from-emerald-500 to-teal-500',
      bgHeader: 'from-emerald-50 to-teal-50',
      borderColor: 'border-emerald-200',
      lineLabel: (d, r) => {
        if (r.statut === 'envoyee') return `📤 Démarche envoyée — attend retour TVA`;
        const date = r.dateLimite ? new Date(r.dateLimite).toLocaleDateString('fr-FR') : '';
        if (r.joursRestants < 0) return `🔴 DÉPASSÉ depuis ${Math.abs(r.joursRestants)}j (limite ${date})`;
        if (r.joursRestants <= 7) return `🔥 Plus que ${r.joursRestants}j (limite ${date})`;
        if (r.joursRestants <= 30) return `⚠️ Plus que ${r.joursRestants}j (limite ${date})`;
        return `📋 ${r.joursRestants}j restants (limite ${date})`;
      },
      suffixLabel: 'depuis paiement',
      altJours: 'joursDepuisPaiement', // utilise ce champ au lieu de jours
    },
  };

  const cfg = config[type];
  if (!cfg) return null;

  // Tri : pour recup_tva on trie par urgence (jours restants croissants)
  const sortedItems = type === 'recup_tva'
    ? [...cfg.items].sort((a, b) => a.joursRestants - b.joursRestants)
    : [...cfg.items].sort((a, b) => b.jours - a.jours);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center p-4 pt-16" onClick={onClose}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border-2 ${cfg.borderColor}`} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className={`p-5 border-b ${cfg.borderColor} bg-gradient-to-r ${cfg.bgHeader} flex items-start justify-between gap-3`}>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800">{cfg.title}</h2>
            <p className="text-xs text-slate-600 mt-1">{cfg.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold px-3 py-1 rounded-full bg-gradient-to-r ${cfg.gradient} text-white shadow-sm`}>
              {sortedItems.length}
            </span>
            <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg" title="Fermer">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* LISTE */}
        <div className="flex-1 overflow-y-auto">
          {sortedItems.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2">✨</div>
              <p className="text-sm font-bold text-emerald-700">Aucune alerte ici — bravo !</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedItems.map((r, idx) => {
                const d = r.dossier;
                const statut = STATUTS.find(s => s.id === d.statut);
                const levelStyle = r.level === 'expired' ? 'text-rose-700' : r.level === 'critical' ? 'text-rose-600' : r.level === 'high' ? 'text-orange-600' : r.level === 'warn' ? 'text-amber-600' : 'text-emerald-600';
                const joursAffiches = cfg.altJours ? r[cfg.altJours] : r.jours;
                return (
                  <button
                    key={d.localId + idx}
                    onClick={() => onSelect(d.localId)}
                    className="w-full px-4 py-3 hover:bg-slate-50 flex items-center gap-3 text-left transition-colors border-l-4 border-transparent hover:border-violet-400"
                  >
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-base bg-gradient-to-br ${statut?.color || 'from-slate-400 to-slate-500'} text-white shadow-sm`}>
                      {statut?.emoji || '📄'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm truncate">{d.nom} {d.prenom}</span>
                        {d.id && <span className="text-[10px] font-mono text-slate-400">#{d.id}</span>}
                        {d.telephone && <a href={`tel:${d.telephone}`} onClick={(e) => e.stopPropagation()} className="text-[10px] font-semibold text-violet-600 hover:underline">📞 {d.telephone}</a>}
                        {(() => {
                          // Badge "🔁 N essais" pour les alertes où on appelle le client
                          const nEssais = type === 'controleQualite' ? (d.tentativesCQ || []).length
                            : type === 'controle' ? (d.tentativesControleLivraison || []).length
                            : 0;
                          if (nEssais === 0) return null;
                          return (
                            <span title={`Tu as déjà essayé ${nEssais} fois sans réponse`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                              🔁 {nEssais} essai{nEssais > 1 ? 's' : ''}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {cfg.lineLabel(d, r)}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className={`text-lg font-bold ${levelStyle}`}>{joursAffiches}j</div>
                      <div className="text-[9px] text-slate-400">{cfg.suffixLabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
          <span>💡 Clique sur un dossier pour ouvrir l'aperçu</span>
          <span className="font-semibold">{sortedItems.length} alerte{sortedItems.length > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
