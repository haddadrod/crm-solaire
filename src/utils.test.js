import { describe, it, expect } from 'vitest';
import {
  normalizePhoneE164,
  isSafeMediaUrl,
  frDate,
  formatDurationMmSs,
  computeWorkflowStatut,
  applyAutoStatut,
  computeTtcPresta,
  findClosestTarif,
  formatEuro,
  formatDateForSheet,
  normalizeDateToIso,
  formatFileSize,
  parseNumber,
  parseDateInput,
  parseBool,
} from './utils.js';

// ════════════════════════════════════════════════════════════════════════
// 1. normalizePhoneE164 — normalisation téléphone FR vers E.164
// ════════════════════════════════════════════════════════════════════════
describe('normalizePhoneE164', () => {
  it('convertit un numéro FR à 10 chiffres (commençant par 0) en +33', () => {
    expect(normalizePhoneE164('0612345678')).toBe('+33612345678');
  });

  it('ignore les espaces, points et tirets', () => {
    expect(normalizePhoneE164('06 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhoneE164('06.12.34.56.78')).toBe('+33612345678');
    expect(normalizePhoneE164('06-12-34-56-78')).toBe('+33612345678');
  });

  it('garde un E.164 déjà formaté', () => {
    expect(normalizePhoneE164('+33612345678')).toBe('+33612345678');
    expect(normalizePhoneE164('+33 6 12 34 56 78')).toBe('+33612345678');
  });

  it("convertit 00xx en +xx (format international avec 00)", () => {
    expect(normalizePhoneE164('0033612345678')).toBe('+33612345678');
  });

  it('ajoute + sur un 33xxxxxxxxxx', () => {
    expect(normalizePhoneE164('33612345678')).toBe('+33612345678');
  });

  it('renvoie chaîne vide pour entrée vide/null/undefined', () => {
    expect(normalizePhoneE164('')).toBe('');
    expect(normalizePhoneE164(null)).toBe('');
    expect(normalizePhoneE164(undefined)).toBe('');
  });

  it("ne casse pas sur des entrées exotiques (ne lance pas d'erreur)", () => {
    expect(() => normalizePhoneE164('abc')).not.toThrow();
    expect(() => normalizePhoneE164(123456)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. isSafeMediaUrl — guard XSS pour URLs user-supplied
// ════════════════════════════════════════════════════════════════════════
describe('isSafeMediaUrl', () => {
  it('accepte les URLs HTTPS', () => {
    expect(isSafeMediaUrl('https://example.com/audio.mp3')).toBe(true);
    expect(isSafeMediaUrl('https://drive.google.com/file/d/abc/view')).toBe(true);
  });

  it('accepte HTTP (legacy, pas idéal mais toléré)', () => {
    expect(isSafeMediaUrl('http://example.com/audio.mp3')).toBe(true);
  });

  it('refuse les URLs javascript: (vecteur XSS principal)', () => {
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeMediaUrl('JavaScript:alert(1)')).toBe(false);
  });

  it('refuse les URLs data: (vecteur XSS via base64 HTML)', () => {
    expect(isSafeMediaUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('refuse les URLs blob: et vbscript:', () => {
    expect(isSafeMediaUrl('blob:https://example.com/abc')).toBe(false);
    expect(isSafeMediaUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('refuse les entrées vides ou non-string', () => {
    expect(isSafeMediaUrl('')).toBe(false);
    expect(isSafeMediaUrl(null)).toBe(false);
    expect(isSafeMediaUrl(undefined)).toBe(false);
    expect(isSafeMediaUrl(123)).toBe(false);
    expect(isSafeMediaUrl({})).toBe(false);
  });

  it("refuse les URLs malformées (ne lance pas d'erreur)", () => {
    expect(isSafeMediaUrl('not a url')).toBe(false);
    expect(isSafeMediaUrl('://broken')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3. frDate — formatage de date FR avec fallback
// ════════════════════════════════════════════════════════════════════════
describe('frDate', () => {
  it("formate une date ISO en JJ/MM/AAAA français", () => {
    expect(frDate('2026-05-14')).toBe('14/05/2026');
    expect(frDate('2024-01-01')).toBe('01/01/2024');
  });

  it('accepte un objet Date', () => {
    expect(frDate(new Date('2026-05-14T12:00:00Z'))).toBe('14/05/2026');
  });

  it('renvoie chaîne vide pour null/undefined/vide', () => {
    expect(frDate(null)).toBe('');
    expect(frDate(undefined)).toBe('');
    expect(frDate('')).toBe('');
  });

  it("renvoie la string brute si date invalide (ne crash pas)", () => {
    expect(frDate('pas-une-date')).toBe('pas-une-date');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 4. formatDurationMmSs — formatage durée en M:SS
// ════════════════════════════════════════════════════════════════════════
describe('formatDurationMmSs', () => {
  it('formate des secondes en M:SS', () => {
    expect(formatDurationMmSs(0)).toBe('0:00');
    expect(formatDurationMmSs(5)).toBe('0:05');
    expect(formatDurationMmSs(60)).toBe('1:00');
    expect(formatDurationMmSs(145)).toBe('2:25');
    expect(formatDurationMmSs(3600)).toBe('60:00');
  });

  it('padde les secondes à 2 chiffres', () => {
    expect(formatDurationMmSs(61)).toBe('1:01');
    expect(formatDurationMmSs(120)).toBe('2:00');
  });

  it('clamp à 0 pour valeurs négatives ou invalides', () => {
    expect(formatDurationMmSs(-10)).toBe('0:00');
    expect(formatDurationMmSs(null)).toBe('0:00');
    expect(formatDurationMmSs(undefined)).toBe('0:00');
    expect(formatDurationMmSs('abc')).toBe('0:00');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. applyAutoStatut + computeWorkflowStatut — workflow critique métier
// ════════════════════════════════════════════════════════════════════════
describe('computeWorkflowStatut', () => {
  it("retourne B3_REFUS_FINANCEMENT si la banque a refusé", () => {
    expect(computeWorkflowStatut({ statutFin: 'refusé' })).toBe('B3_REFUS_FINANCEMENT');
  });

  it('phase post-pose : pose faite → G_ATTENTE_ACCORD_DEF (en route vers accord déf)', () => {
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14' })).toBe('G_ATTENTE_ACCORD_DEF');
    expect(computeWorkflowStatut({ statutPose: 'visite_ok' })).toBe('G_ATTENTE_ACCORD_DEF');
  });

  it('phase post-pose : accord déf reçu (originaux banque) → F1_CONTROLE_LIV_BANQUE', () => {
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14', dateRecusOriginauxBanque: '2026-05-16' }))
      .toBe('F1_CONTROLE_LIV_BANQUE');
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14', pasOriginauxRequis: true }))
      .toBe('F1_CONTROLE_LIV_BANQUE');
  });

  it('phase post-pose : contrôle livraison fait → F_ATTENTE_DEBLOCAGE', () => {
    expect(computeWorkflowStatut({
      dateInsta: '2026-05-14', dateRecusOriginauxBanque: '2026-05-16', dateControleLivraison: '2026-05-18',
    })).toBe('F_ATTENTE_DEBLOCAGE');
  });

  it('phase post-pose : paiement reçu → W_DOSSIER_PAYER (statut terminal)', () => {
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14', dateControleLivraison: '2026-05-18', payeClient: true }))
      .toBe('W_DOSSIER_PAYER');
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14', datePaiementBanque: '2026-05-20' }))
      .toBe('W_DOSSIER_PAYER');
  });

  it("retourne B4_EN_COURS_POSE quand dateEnvoiPose + poseur assigné", () => {
    expect(computeWorkflowStatut({
      dateEnvoiPose: '2026-05-14',
      poseurs: [{ nom: 'IONERGIK' }],
    })).toBe('B4_EN_COURS_POSE');
  });

  it("retourne B2_A_ENVOYER_POSE quand dateEnvoiPose sans poseur", () => {
    expect(computeWorkflowStatut({ dateEnvoiPose: '2026-05-14', poseurs: [] })).toBe('B2_A_ENVOYER_POSE');
  });

  it("retourne B2_A_ENVOYER_POSE quand accord financement reçu mais pas encore de date pose", () => {
    expect(computeWorkflowStatut({ statutFin: 'accepté' })).toBe('B2_A_ENVOYER_POSE');
  });

  it("retourne B1_EN_COURS_FINANCEMENT quand envoyé banque sans réponse", () => {
    expect(computeWorkflowStatut({ dateEnvoiFin: '2026-05-10' })).toBe('B1_EN_COURS_FINANCEMENT');
  });

  it("retourne B1_MANQUE_DOC quand la banque réclame des docs complémentaires", () => {
    expect(computeWorkflowStatut({ statutFin: 'manque_doc', dateEnvoiFin: '2026-05-10' }))
      .toBe('B1_MANQUE_DOC');
  });

  it("B1_MANQUE_DOC prime sur une date de pose saisie (financement non sécurisé)", () => {
    expect(computeWorkflowStatut({ statutFin: 'manque_doc', dateInsta: '2026-05-20' }))
      .toBe('B1_MANQUE_DOC');
    expect(computeWorkflowStatut({ statutFin: 'manque_doc', statutPose: 'visite_ok' }))
      .toBe('B1_MANQUE_DOC');
  });

  it("repasse en B1_EN_COURS_FINANCEMENT une fois les docs renvoyés (statutFin → envoyé)", () => {
    expect(computeWorkflowStatut({ statutFin: 'envoyé', dateEnvoiFin: '2026-05-15' }))
      .toBe('B1_EN_COURS_FINANCEMENT');
  });

  it("envoyé en banque prime sur une date de pose qui traîne (anti-blocage manque docs)", () => {
    expect(computeWorkflowStatut({ statutFin: 'envoyé', dateEnvoiFin: '2026-05-15', dateInsta: '2026-05-20' }))
      .toBe('B1_EN_COURS_FINANCEMENT');
  });

  it("retourne B_A_ENVOYER_BANQUE quand CQ validé sans envoi banque", () => {
    expect(computeWorkflowStatut({ statutControleQualite: 'ok' })).toBe('B_A_ENVOYER_BANQUE');
  });

  it("retourne A_EN_COURS par défaut sur un dossier vide", () => {
    expect(computeWorkflowStatut({})).toBe('A_EN_COURS');
  });
});

describe('applyAutoStatut', () => {
  it("respecte un statut hors cycle (SAV, LITIGE, ANNULER)", () => {
    const d = { statut: 'D_SAV', statutFin: 'accepté' }; // dossier en SAV
    expect(applyAutoStatut(d).statut).toBe('D_SAV');
  });

  it("recompute le statut si dans le cycle auto", () => {
    const d = { statut: 'A_EN_COURS', statutControleQualite: 'ok' };
    expect(applyAutoStatut(d).statut).toBe('B_A_ENVOYER_BANQUE');
  });

  it("respecte le verrou manuel (statutLocked)", () => {
    const d = { statut: 'A_EN_COURS', statutLocked: true, statutControleQualite: 'ok' };
    expect(applyAutoStatut(d).statut).toBe('A_EN_COURS'); // verrouillé → pas de recompute
  });

  it("ne touche pas au dossier si le statut auto = statut courant", () => {
    const d = { statut: 'A_EN_COURS' };
    const result = applyAutoStatut(d);
    expect(result).toBe(d); // référence identique → pas d'allocation inutile
  });

  it("renvoie un nouvel objet quand le statut change", () => {
    const d = { statut: 'A_EN_COURS', statutControleQualite: 'ok' };
    const result = applyAutoStatut(d);
    expect(result).not.toBe(d); // nouvelle référence (immutabilité)
    expect(result.statut).toBe('B_A_ENVOYER_BANQUE');
    expect(d.statut).toBe('A_EN_COURS'); // l'original n'a pas changé
  });
});

// ════════════════════════════════════════════════════════════════════════
// 6. computeTtcPresta — calcul TTC fournisseurs avec ou sans TVA
// ════════════════════════════════════════════════════════════════════════
describe('computeTtcPresta', () => {
  it('applique 20 % de TVA par défaut', () => {
    expect(computeTtcPresta(1000, false)).toBe(1200);
    expect(computeTtcPresta(100, false)).toBe(120);
    expect(computeTtcPresta(0, false)).toBe(0);
  });

  it('ne facture pas la TVA si sansTva = true (auto-entrepreneur)', () => {
    expect(computeTtcPresta(1000, true)).toBe(1000);
    expect(computeTtcPresta(500, true)).toBe(500);
  });

  it('compat legacy : tauxTva = 0 → traité comme sans TVA', () => {
    expect(computeTtcPresta(1000, false, 0)).toBe(1000);
    expect(computeTtcPresta(1000, false, '0')).toBe(1000);
  });

  it('sansTva prime sur legacyTauxTva', () => {
    expect(computeTtcPresta(1000, true, 20)).toBe(1000);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 7. findClosestTarif — matching tarif par puissance (poseurs/régies)
// ════════════════════════════════════════════════════════════════════════
describe('findClosestTarif', () => {
  const tarifs = { '3000': 800, '6000': 1200, '9000': 1500 };

  it('match exact sur une puissance présente', () => {
    expect(findClosestTarif(tarifs, 3000)).toBe(800);
    expect(findClosestTarif(tarifs, 6000)).toBe(1200);
    expect(findClosestTarif(tarifs, 9000)).toBe(1500);
  });

  it("prend la puissance ≤ inférieure quand pas d'exact match", () => {
    expect(findClosestTarif(tarifs, 4500)).toBe(800); // entre 3000 et 6000 → prend 3000
    expect(findClosestTarif(tarifs, 7500)).toBe(1200); // entre 6000 et 9000 → prend 6000
    expect(findClosestTarif(tarifs, 12000)).toBe(1500); // au-dessus → prend 9000
  });

  it("renvoie 0 si la puissance est sous la grille", () => {
    expect(findClosestTarif(tarifs, 1000)).toBe(0);
    expect(findClosestTarif(tarifs, 2999)).toBe(0);
  });

  it('renvoie 0 si grille vide ou null', () => {
    expect(findClosestTarif({}, 5000)).toBe(0);
    expect(findClosestTarif(null, 5000)).toBe(0);
    expect(findClosestTarif(undefined, 5000)).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 8. formatEuro — format monétaire FR
// ════════════════════════════════════════════════════════════════════════
describe('formatEuro', () => {
  it('formate un nombre en euros français', () => {
    // Note :   est l'espace fine insécable utilisé par Intl en fr-FR.
    expect(formatEuro(1234.56)).toMatch(/1\s?234,56\s?€/);
    expect(formatEuro(0)).toMatch(/0,00\s?€/);
    expect(formatEuro(100)).toMatch(/100,00\s?€/);
  });

  it('renvoie "0,00 €" pour null/undefined/NaN', () => {
    expect(formatEuro(null)).toMatch(/0,00\s?€/);
    expect(formatEuro(undefined)).toMatch(/0,00\s?€/);
    expect(formatEuro(NaN)).toMatch(/0,00\s?€/);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 9. formatDateForSheet — formatage pour exports Excel/CSV
// ════════════════════════════════════════════════════════════════════════
describe('formatDateForSheet', () => {
  it('convertit ISO AAAA-MM-JJ vers JJ/MM/AAAA', () => {
    expect(formatDateForSheet('2026-05-14')).toBe('14/05/2026');
    expect(formatDateForSheet('2024-01-01')).toBe('01/01/2024');
  });

  it('garde un format FR déjà correct', () => {
    expect(formatDateForSheet('14/05/2026')).toBe('14/05/2026');
  });

  it('renvoie chaîne vide pour null/undefined/vide', () => {
    expect(formatDateForSheet(null)).toBe('');
    expect(formatDateForSheet(undefined)).toBe('');
    expect(formatDateForSheet('')).toBe('');
  });

  it("renvoie la string brute si format inconnu", () => {
    expect(formatDateForSheet('pas-une-date')).toBe('pas-une-date');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 10. normalizeDateToIso — sortie IA → ISO stockage
// ════════════════════════════════════════════════════════════════════════
describe('normalizeDateToIso', () => {
  it('garde ISO AAAA-MM-JJ', () => {
    expect(normalizeDateToIso('2026-05-14')).toBe('2026-05-14');
  });

  it('tronque un ISO long à 10 caractères', () => {
    expect(normalizeDateToIso('2026-05-14T12:00:00Z')).toBe('2026-05-14');
  });

  it('convertit JJ/MM/AAAA en ISO', () => {
    expect(normalizeDateToIso('14/05/2026')).toBe('2026-05-14');
  });

  it('renvoie chaîne vide pour vide/null/undefined', () => {
    expect(normalizeDateToIso('')).toBe('');
    expect(normalizeDateToIso(null)).toBe('');
    expect(normalizeDateToIso(undefined)).toBe('');
  });

  it('renvoie la string brute pour un format inconnu', () => {
    expect(normalizeDateToIso('pas-une-date')).toBe('pas-une-date');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 11. formatFileSize — affichage taille fichier
// ════════════════════════════════════════════════════════════════════════
describe('formatFileSize', () => {
  it('formate en octets sous 1 Ko', () => {
    expect(formatFileSize(500)).toBe('500 o');
    expect(formatFileSize(1023)).toBe('1023 o');
  });

  it('formate en Ko entre 1 Ko et 1 Mo', () => {
    expect(formatFileSize(2048)).toBe('2 Ko');
    expect(formatFileSize(500000)).toBe('488 Ko');
  });

  it('formate en Mo au-dessus de 1 Mo', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.00 Mo');
    expect(formatFileSize(3700000)).toMatch(/3\.5[2-3] Mo/);
  });

  it('renvoie "0 o" pour 0/null/undefined', () => {
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(null)).toBe('0 o');
    expect(formatFileSize(undefined)).toBe('0 o');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 12. parseNumber — parsing FR pour les imports CSV
// ════════════════════════════════════════════════════════════════════════
describe('parseNumber', () => {
  it('parse un nombre français avec virgule', () => {
    expect(parseNumber('1234,56')).toBe(1234.56);
    expect(parseNumber('100,00')).toBe(100);
  });

  it('tolère les espaces (séparateur de milliers) et le symbole €', () => {
    expect(parseNumber('1 234,56 €')).toBe(1234.56);
    expect(parseNumber('1 234 €')).toBe(1234);
    expect(parseNumber('€100,50')).toBe(100.5);
  });

  it('parse un nombre avec point décimal', () => {
    expect(parseNumber('1234.56')).toBe(1234.56);
  });

  it('renvoie 0 pour vide/null/undefined/garbage', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber(null)).toBe(0);
    expect(parseNumber(undefined)).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 13. parseDateInput — dates d'import en ISO
// ════════════════════════════════════════════════════════════════════════
describe('parseDateInput', () => {
  it('parse JJ/MM/AAAA en ISO', () => {
    expect(parseDateInput('14/05/2026')).toBe('2026-05-14');
    expect(parseDateInput('1/5/2026')).toBe('2026-05-01');
  });

  it('parse JJ-MM-AAAA et JJ.MM.AAAA', () => {
    expect(parseDateInput('14-05-2026')).toBe('2026-05-14');
    expect(parseDateInput('14.05.2026')).toBe('2026-05-14');
  });

  it('parse les années à 2 chiffres comme 20XX', () => {
    expect(parseDateInput('14/05/26')).toBe('2026-05-14');
  });

  it('parse AAAA-MM-JJ ISO', () => {
    expect(parseDateInput('2026-05-14')).toBe('2026-05-14');
    expect(parseDateInput('2026/5/14')).toBe('2026-05-14');
  });

  it("renvoie chaîne vide pour format inconnu ou vide", () => {
    expect(parseDateInput('')).toBe('');
    expect(parseDateInput(null)).toBe('');
    expect(parseDateInput('pas-une-date')).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 14. parseBool — booléens d'import (FR + EN)
// ════════════════════════════════════════════════════════════════════════
describe('parseBool', () => {
  it('accepte les variantes FR', () => {
    expect(parseBool('oui')).toBe(true);
    expect(parseBool('OUI')).toBe(true);
    expect(parseBool('payé')).toBe(true);
    expect(parseBool('paye')).toBe(true);
  });

  it('accepte les variantes EN', () => {
    expect(parseBool('yes')).toBe(true);
    expect(parseBool('true')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('x')).toBe(true);
  });

  it('refuse tout le reste', () => {
    expect(parseBool('non')).toBe(false);
    expect(parseBool('no')).toBe(false);
    expect(parseBool('0')).toBe(false);
    expect(parseBool('false')).toBe(false);
    expect(parseBool('')).toBe(false);
    expect(parseBool(null)).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});
