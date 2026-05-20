import { describe, it, expect } from 'vitest';
import {
  normalizePhoneE164,
  isSafeMediaUrl,
  frDate,
  formatDurationMmSs,
  computeWorkflowStatut,
  applyAutoStatut,
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

  it('retourne null si la pose est faite (sortie du cycle auto)', () => {
    expect(computeWorkflowStatut({ dateInsta: '2026-05-14' })).toBe(null);
    expect(computeWorkflowStatut({ statutPose: 'visite_ok' })).toBe(null);
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
