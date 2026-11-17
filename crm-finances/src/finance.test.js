import { describe, it, expect } from 'vitest';
import { bilan, totaux, parPrestataire, parMois, venteHt } from './finance.js';

const client = (over = {}) => ({
  statut: 'en_cours', montant_ttc: 12000, taux_tva: 20, encaisse: false, date_signature: '2026-10-05',
  depenses: [
    { categorie: 'materiel', nom: 'Fournisseur A', montant_ht: 4000, paye: true },
    { categorie: 'sous_traitant', nom: 'Poseur B', montant_ht: '1 500,50', paye: false },
    { categorie: 'commission', nom: 'Marc', montant_ht: 300, paye: false },
  ],
  ...over,
});

describe('finance', () => {
  it('calcule le HT depuis le TTC', () => {
    expect(venteHt({ montant_ttc: 12000, taux_tva: 20 })).toBe(10000);
    expect(venteHt({ montant_ttc: 10550, taux_tva: 5.5 })).toBe(10000);
  });

  it('fait le bilan d\'un client', () => {
    const b = bilan(client());
    expect(b.ht).toBe(10000);
    expect(b.tva).toBe(2000);
    expect(b.depenses).toBe(5800.5);
    expect(b.depensesPayees).toBe(4000);
    expect(b.resteAPayer).toBe(1800.5);
    expect(b.parCategorie.materiel).toBe(4000);
    expect(b.marge).toBe(4199.5);
    expect(b.margePct).toBe(42);
  });

  it('exclut les annulés des totaux', () => {
    const t = totaux([client({ encaisse: true }), client({ statut: 'annule' })]);
    expect(t.nb).toBe(1);
    expect(t.encaisse).toBe(12000);
    expect(t.aEncaisser).toBe(0);
  });

  it('regroupe par prestataire sans tenir compte de la casse', () => {
    const p = parPrestataire([client(), client({ depenses: [{ categorie: 'sous_traitant', nom: 'poseur b', montant_ht: 500, paye: true }] })]);
    const b = p.find(x => x.nom.toUpperCase() === 'POSEUR B');
    expect(b.du).toBe(2000.5);
    expect(b.paye).toBe(500);
    expect(b.reste).toBe(1500.5);
    expect(b.lignes).toHaveLength(2);
  });

  it('regroupe par mois de signature', () => {
    const m = parMois([client(), client({ date_signature: '2026-11-02' })]);
    expect(m.map(x => x.mois)).toEqual(['2026-11', '2026-10']);
  });
});
