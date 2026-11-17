// 👥 Liste des clients : totaux en tête + tableau (vente, dépenses, marge, encaissement).
import React, { useEffect, useMemo, useState } from 'react';
import { listClients, createClient } from './data.js';
import { STATUTS, bilan, totaux, euros } from './finance.js';
import { Stat, StatutBadge, inputCls, fmtDate, pct } from './ui.jsx';
import { go } from './nav.js';

export default function ClientsList() {
  const [clients, setClients] = useState(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [nouveau, setNouveau] = useState(null);

  useEffect(() => {
    listClients().then(setClients).catch(e => setErreur(e.message));
  }, []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (clients || []).filter(c =>
      (!statut || c.statut === statut) &&
      (!q || `${c.nom} ${c.prenom} ${c.ville} ${c.financeur}`.toLowerCase().includes(q)));
  }, [clients, recherche, statut]);

  const t = useMemo(() => totaux(filtres), [filtres]);

  const creer = async (e) => {
    e.preventDefault();
    if (!nouveau.nom.trim()) return;
    try {
      const id = await createClient({
        nom: nouveau.nom.trim().toUpperCase(),
        prenom: nouveau.prenom.trim(),
        date_signature: new Date().toISOString().slice(0, 10),
      });
      go(`/client/${id}`);
    } catch (err) { setErreur(err.message); }
  };

  if (erreur) return <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4">❌ {erreur}</div>;
  if (!clients) return <div className="text-slate-500 p-4">⏳ Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Ventes HT" value={euros(t.ht)} sub={`${t.nb} client${t.nb > 1 ? 's' : ''} (hors annulés)`} />
        <Stat label="Encaissé" value={euros(t.encaisse)} tone="emerald" sub="TTC reçu" />
        <Stat label="À encaisser" value={euros(t.aEncaisser)} tone="sky" sub="TTC attendu" />
        <Stat label="Reste à payer" value={euros(t.resteAPayer)} tone="rose" sub={`sur ${euros(t.depenses)} de dépenses`} />
        <Stat label="Marge HT" value={euros(t.marge)} tone="emerald" sub={`${pct(t.margePct)} des ventes HT`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="🔍 Rechercher (nom, ville, financeur)…"
          className={`${inputCls} max-w-xs`} />
        <select value={statut} onChange={e => setStatut(e.target.value)} className={`${inputCls} max-w-[12rem]`}>
          <option value="">Tous les statuts</option>
          {STATUTS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
        </select>
        <button type="button" onClick={() => setNouveau({ nom: '', prenom: '' })}
          className="ml-auto px-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow">
          ➕ Nouveau client
        </button>
      </div>

      {nouveau && (
        <form onSubmit={creer} className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 flex flex-wrap items-end gap-2">
          <input autoFocus required value={nouveau.nom} onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} placeholder="Nom" className={`${inputCls} max-w-xs`} />
          <input value={nouveau.prenom} onChange={e => setNouveau({ ...nouveau, prenom: e.target.value })} placeholder="Prénom" className={`${inputCls} max-w-xs`} />
          <button type="submit" className="px-4 py-2 rounded-xl font-bold text-white bg-emerald-600">Créer</button>
          <button type="button" onClick={() => setNouveau(null)} className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100">Annuler</button>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Client</th>
              <th className="text-left px-3 py-2">Signature</th>
              <th className="text-left px-3 py-2">Statut</th>
              <th className="text-left px-3 py-2">Financeur</th>
              <th className="text-right px-3 py-2">Vente TTC</th>
              <th className="text-right px-3 py-2">Dépenses HT</th>
              <th className="text-right px-3 py-2">Reste à payer</th>
              <th className="text-right px-3 py-2">Marge HT</th>
              <th className="text-center px-3 py-2">Encaissé</th>
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-8">Aucun client pour l'instant.</td></tr>
            )}
            {filtres.map(c => {
              const b = bilan(c);
              return (
                <tr key={c.id} onClick={() => go(`/client/${c.id}`)} className="border-t border-slate-100 hover:bg-emerald-50/50 cursor-pointer">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800">{c.nom} {c.prenom}</div>
                    {c.ville && <div className="text-xs text-slate-500">{c.ville}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{fmtDate(c.date_signature)}</td>
                  <td className="px-3 py-2"><StatutBadge statut={c.statut} /></td>
                  <td className="px-3 py-2 text-slate-600">{c.financeur || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{euros(b.ttc)}</td>
                  <td className="px-3 py-2 text-right">{euros(b.depenses)}</td>
                  <td className={`px-3 py-2 text-right ${b.resteAPayer > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>{euros(b.resteAPayer)}</td>
                  <td className={`px-3 py-2 text-right font-bold ${b.marge < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {euros(b.marge)} <span className="text-xs font-normal text-slate-500">({pct(b.margePct)})</span>
                  </td>
                  <td className="px-3 py-2 text-center">{b.encaisse ? '✅' : '⏳'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
