// 📊 Synthèse : encaissements, prestataires à payer, résultats mois par mois.
import React, { useEffect, useMemo, useState } from 'react';
import { listClients } from './data.js';
import { totaux, parPrestataire, parMois, categorieInfo, euros, CATEGORIES } from './finance.js';
import { Card, Stat, inputBase, pct } from './ui.jsx';
import { go } from './nav.js';

const nomMois = (m) => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  const s = new Date(`${m}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function Synthese() {
  const [clients, setClients] = useState(null);
  const [erreur, setErreur] = useState('');
  const [cat, setCat] = useState('');
  const [seulementAPayer, setSeulementAPayer] = useState(true);
  const [ouvert, setOuvert] = useState(null);

  useEffect(() => { listClients().then(setClients).catch(e => setErreur(e.message)); }, []);

  const t = useMemo(() => totaux(clients || []), [clients]);
  const presta = useMemo(() => parPrestataire(clients || []), [clients]);
  const mois = useMemo(() => parMois(clients || []), [clients]);

  if (erreur) return <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4">❌ {erreur}</div>;
  if (!clients) return <div className="text-slate-500 p-4">⏳ Chargement…</div>;

  const prestaFiltres = presta.filter(p => (!cat || p.categorie === cat) && (!seulementAPayer || p.reste > 0));
  const tresorerie = t.encaisse - t.depensesPayees;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="✅ Encaissé des clients" value={euros(t.encaisse)} tone="emerald" sub={`${euros(t.aEncaisser)} encore à recevoir (TTC)`} />
        <Stat label="💸 Déjà payé aux prestataires" value={euros(t.depensesPayees)} sub={`sur ${euros(t.depenses)} HT au total`} />
        <Stat label="⏳ Reste à payer" value={euros(t.resteAPayer)} tone="rose" sub="matériel, sous-traitants, régies…" />
        <Stat label="🏦 Trésorerie nette" value={euros(tresorerie)} tone={tresorerie < 0 ? 'rose' : 'sky'} sub="encaissé − payé" />
      </div>

      <Card title="🧾 Prestataires"
        right={<div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={cat} onChange={e => setCat(e.target.value)} className={`${inputBase} w-48`}>
            <option value="">Toutes catégories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={seulementAPayer} onChange={e => setSeulementAPayer(e.target.checked)} /> Seulement à payer
          </label>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2">Prestataire</th>
                <th className="text-left py-2">Catégorie</th>
                <th className="text-right py-2">Total dû</th>
                <th className="text-right py-2">Payé</th>
                <th className="text-right py-2">Reste à payer</th>
              </tr>
            </thead>
            <tbody>
              {prestaFiltres.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">Rien à afficher.</td></tr>}
              {prestaFiltres.map(p => {
                const key = `${p.categorie}|${p.nom}`;
                const c = categorieInfo(p.categorie);
                return (
                  <React.Fragment key={key}>
                    <tr onClick={() => setOuvert(ouvert === key ? null : key)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <td className="py-2 font-semibold text-slate-800">{ouvert === key ? '▾' : '▸'} {p.nom}</td>
                      <td className="py-2 text-slate-600">{c.emoji} {c.label}</td>
                      <td className="py-2 text-right">{euros(p.du)}</td>
                      <td className="py-2 text-right text-emerald-700">{euros(p.paye)}</td>
                      <td className={`py-2 text-right font-bold ${p.reste > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{euros(p.reste)}</td>
                    </tr>
                    {ouvert === key && p.lignes.map(({ client, depense }) => (
                      <tr key={depense.id} onClick={() => go(`/client/${client.id}`)} className="bg-slate-50 text-xs hover:bg-emerald-50 cursor-pointer">
                        <td className="py-1.5 pl-6 text-slate-700">{client.nom} {client.prenom}</td>
                        <td className="py-1.5 text-slate-500">{depense.facture ? `Facture ${depense.facture}` : ''}</td>
                        <td className="py-1.5 text-right">{euros(depense.montant_ht)}</td>
                        <td colSpan={2} className="py-1.5 text-right">{depense.paye ? `✅ payé${depense.date_paye ? ` le ${new Date(depense.date_paye + 'T00:00:00').toLocaleDateString('fr-FR')}` : ''}` : '⏳ à payer'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="📅 Mois par mois (date de signature)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2">Mois</th>
                <th className="text-right py-2">Clients</th>
                <th className="text-right py-2">Ventes HT</th>
                <th className="text-right py-2">Dépenses HT</th>
                <th className="text-right py-2">Marge HT</th>
                <th className="text-right py-2">Marge %</th>
              </tr>
            </thead>
            <tbody>
              {mois.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">Aucun client.</td></tr>}
              {mois.map(m => (
                <tr key={m.mois} className="border-t border-slate-100">
                  <td className="py-2 font-semibold text-slate-800">{nomMois(m.mois)}</td>
                  <td className="py-2 text-right">{m.nb}</td>
                  <td className="py-2 text-right">{euros(m.ht)}</td>
                  <td className="py-2 text-right">{euros(m.depenses)}</td>
                  <td className={`py-2 text-right font-bold ${m.marge < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{euros(m.marge)}</td>
                  <td className="py-2 text-right text-slate-600">{pct(m.margePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
