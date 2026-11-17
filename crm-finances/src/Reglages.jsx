// ⚙️ Réglages : listes de noms proposées dans les fiches clients.
import React, { useEffect, useState } from 'react';
import { getListes, setListes } from './data.js';
import { Card, inputCls } from './ui.jsx';

const LISTES = [
  { cle: 'financeurs', titre: '🏦 Financeurs' },
  { cle: 'fournisseurs', titre: '📦 Fournisseurs de matériel' },
  { cle: 'sous_traitants', titre: '🔧 Sous-traitants / poseurs' },
  { cle: 'regies', titre: '🤝 Régies' },
  { cle: 'commerciaux', titre: '💼 Commerciaux / commissions' },
  { cle: 'produits', titre: '☀️ Types de matériel vendu' },
];

export default function Reglages() {
  const [listes, setL] = useState(null);
  const [erreur, setErreur] = useState('');
  const [saisie, setSaisie] = useState({});

  useEffect(() => { getListes().then(setL).catch(e => setErreur(e.message)); }, []);

  const enregistrer = async (next) => {
    setL(next);
    try { await setListes(next); setErreur(''); } catch (e) { setErreur(e.message); }
  };

  if (!listes) return <div className="text-slate-500 p-4">{erreur ? `❌ ${erreur}` : '⏳ Chargement…'}</div>;

  return (
    <div className="space-y-4">
      {erreur && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">❌ {erreur}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {LISTES.map(({ cle, titre }) => {
          const items = listes[cle] || [];
          const ajouter = (e) => {
            e.preventDefault();
            const v = (saisie[cle] || '').trim();
            if (!v || items.some(x => x.toUpperCase() === v.toUpperCase())) return;
            enregistrer({ ...listes, [cle]: [...items, v] });
            setSaisie({ ...saisie, [cle]: '' });
          };
          return (
            <Card key={cle} title={titre}>
              <div className="flex flex-wrap gap-2 mb-3">
                {items.length === 0 && <span className="text-sm text-slate-400">Liste vide.</span>}
                {items.map(x => (
                  <span key={x} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-sm text-slate-700">
                    {x}
                    <button type="button" onClick={() => enregistrer({ ...listes, [cle]: items.filter(y => y !== x) })} className="text-slate-400 hover:text-rose-600" title="Retirer">✕</button>
                  </span>
                ))}
              </div>
              <form onSubmit={ajouter} className="flex gap-2">
                <input value={saisie[cle] || ''} onChange={e => setSaisie({ ...saisie, [cle]: e.target.value })} placeholder="Ajouter un nom…" className={inputCls} />
                <button type="submit" className="px-3 py-2 rounded-xl font-bold text-white bg-emerald-600">➕</button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
