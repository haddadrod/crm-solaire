// 🧾 Fiche client : coordonnées, vente, matériel vendu, dépenses (matériel, sous-traitants,
// régies, commissions, autres frais) et bilan. Enregistrement automatique.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getClient, updateClient, deleteClient, getListes } from './data.js';
import { STATUTS, CATEGORIES, TAUX_TVA, bilan, euros, nouvelleDepense } from './finance.js';
import { Card, Field, inputCls, inputBase, pct } from './ui.jsx';
import { go } from './nav.js';

const toNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Prépare la ligne pour Supabase : nombres propres, dates vides → null.
function pourEnregistrer(c) {
  const { id, created_at, updated_at, created_by, ...reste } = c;
  return {
    ...reste,
    montant_ttc: toNum(c.montant_ttc),
    taux_tva: toNum(c.taux_tva) || 20,
    date_signature: c.date_signature || null,
    date_pose: c.date_pose || null,
    date_encaissement: c.date_encaissement || null,
    produits: (c.produits || []).map(p => ({ ...p, quantite: toNum(p.quantite) || 1 })),
    depenses: (c.depenses || []).map(d => ({ ...d, montant_ht: toNum(d.montant_ht), date_paye: d.date_paye || null })),
  };
}

export default function ClientPage({ id }) {
  const [client, setClient] = useState(null);
  const [listes, setListes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState('ok'); // ok | modifie | enregistre | erreur
  const timer = useRef(null);
  const dernier = useRef(null);

  useEffect(() => {
    Promise.all([getClient(id), getListes()])
      .then(([c, l]) => { if (!c) setErreur('Client introuvable.'); else setClient(c); setListes(l); })
      .catch(e => setErreur(e.message));
  }, [id]);

  const enregistrer = async (c) => {
    try {
      await updateClient(id, pourEnregistrer(c));
      if (dernier.current === c) setEtat('enregistre');
    } catch (e) { setEtat('erreur'); setErreur(e.message); }
  };

  // Enregistre 800 ms après la dernière frappe, et à la sortie de la page.
  const maj = (patch) => {
    const next = { ...(dernier.current || client), ...patch };
    dernier.current = next;
    setClient(next);
    setEtat('modifie');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; enregistrer(next); }, 800);
  };
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); if (dernier.current) updateClient(id, pourEnregistrer(dernier.current)); }
  }, [id]);

  const b = useMemo(() => (client ? bilan(client) : null), [client]);

  if (erreur && !client) return <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4">❌ {erreur}</div>;
  if (!client || !listes) return <div className="text-slate-500 p-4">⏳ Chargement…</div>;

  const set = (k) => (e) => maj({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const depenses = client.depenses || [];
  const majDepense = (did, patch) => maj({ depenses: depenses.map(d => (d.id === did ? { ...d, ...patch } : d)) });
  const ajouterDepense = (cat) => maj({ depenses: [...depenses, nouvelleDepense(cat)] });
  const retirerDepense = (did) => maj({ depenses: depenses.filter(d => d.id !== did) });

  const produits = client.produits || [];
  const majProduit = (i, patch) => maj({ produits: produits.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const supprimer = async () => {
    if (!window.confirm(`Supprimer définitivement ${client.nom} ${client.prenom} ?`)) return;
    clearTimeout(timer.current); timer.current = null; dernier.current = null;
    try { await deleteClient(id); go('/'); } catch (e) { setErreur(e.message); }
  };

  const etatTxt = { ok: '', modifie: '✏️ Modifié…', enregistre: '✅ Enregistré', erreur: `❌ Non enregistré : ${erreur}` }[etat];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => go('/')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200">← Clients</button>
        <h1 className="text-xl font-bold text-slate-800">{client.nom} {client.prenom}</h1>
        <span className={`text-xs ${etat === 'erreur' ? 'text-rose-600' : 'text-slate-500'}`}>{etatTxt}</span>
        <button type="button" onClick={supprimer} className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50">🗑️ Supprimer</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card title="👤 Client">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Nom"><input value={client.nom} onChange={set('nom')} className={inputCls} /></Field>
              <Field label="Prénom"><input value={client.prenom} onChange={set('prenom')} className={inputCls} /></Field>
              <Field label="Téléphone"><input value={client.telephone} onChange={set('telephone')} className={inputCls} /></Field>
              <Field label="Ville"><input value={client.ville} onChange={set('ville')} className={inputCls} /></Field>
              <Field label="Date de signature"><input type="date" value={client.date_signature || ''} onChange={set('date_signature')} className={inputCls} /></Field>
              <Field label="Date de pose"><input type="date" value={client.date_pose || ''} onChange={set('date_pose')} className={inputCls} /></Field>
              <Field label="Statut">
                <select value={client.statut} onChange={set('statut')} className={inputCls}>
                  {STATUTS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="💰 Vente">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Montant TTC (€)"><input inputMode="decimal" value={client.montant_ttc ?? ''} onChange={set('montant_ttc')} className={inputCls} /></Field>
              <Field label="TVA">
                <select value={String(client.taux_tva ?? 20)} onChange={set('taux_tva')} className={inputCls}>
                  {TAUX_TVA.map(t => <option key={t} value={String(t)}>{String(t).replace('.', ',')} %</option>)}
                </select>
              </Field>
              <Field label="Financeur">
                <input list="liste-financeurs" value={client.financeur} onChange={set('financeur')} className={inputCls} />
                <datalist id="liste-financeurs">{listes.financeurs.map(f => <option key={f} value={f} />)}</datalist>
              </Field>
            </div>
            <div className="text-sm text-slate-600 mt-3">HT : <b>{euros(b.ht)}</b> · TVA : {euros(b.tva)}</div>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button type="button" onClick={() => maj({ encaisse: !client.encaisse, date_encaissement: !client.encaisse ? (client.date_encaissement || new Date().toISOString().slice(0, 10)) : client.date_encaissement })}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${client.encaisse ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                {client.encaisse ? '✅ Encaissé' : '⏳ Pas encore encaissé'}
              </button>
              {client.encaisse && (
                <Field label="Date d'encaissement" className="w-44"><input type="date" value={client.date_encaissement || ''} onChange={set('date_encaissement')} className={inputCls} /></Field>
              )}
            </div>
          </Card>

          <Card title="☀️ Matériel vendu au client"
            right={<button type="button" onClick={() => maj({ produits: [...produits, { type: listes.produits[0] || '', description: '', quantite: 1 }] })} className="text-sm font-semibold text-emerald-700 hover:underline">➕ Ajouter</button>}>
            {produits.length === 0 && <div className="text-sm text-slate-400">Aucun produit.</div>}
            <div className="space-y-2">
              {produits.map((p, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <select value={p.type} onChange={e => majProduit(i, { type: e.target.value })} className={`${inputBase} sm:w-52`}>
                    {[...new Set([p.type, ...listes.produits])].filter(Boolean).map(x => <option key={x}>{x}</option>)}
                  </select>
                  <input value={p.description} onChange={e => majProduit(i, { description: e.target.value })} placeholder="Détail (ex. 12 panneaux 500 Wc)" className={`${inputBase} flex-1 min-w-[12rem]`} />
                  <input inputMode="numeric" value={p.quantite} onChange={e => majProduit(i, { quantite: e.target.value })} className={`${inputBase} w-20`} title="Quantité" />
                  <button type="button" onClick={() => maj({ produits: produits.filter((_, j) => j !== i) })} className="text-rose-500 px-2" title="Retirer">✕</button>
                </div>
              ))}
            </div>
          </Card>

          {CATEGORIES.map(cat => {
            const lignes = depenses.filter(d => d.categorie === cat.id);
            const noms = cat.liste ? listes[cat.liste] || [] : [];
            return (
              <Card key={cat.id} title={`${cat.emoji} ${cat.label}`}
                right={<div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{euros(b.parCategorie[cat.id])} HT</span>
                  <button type="button" onClick={() => ajouterDepense(cat.id)} className="text-sm font-semibold text-emerald-700 hover:underline">➕ Ajouter</button>
                </div>}>
                {lignes.length === 0 && <div className="text-sm text-slate-400">Aucune dépense.</div>}
                {noms.length > 0 && <datalist id={`liste-${cat.id}`}>{noms.map(n => <option key={n} value={n} />)}</datalist>}
                <div className="space-y-2">
                  {lignes.map(d => (
                    <div key={d.id} className="flex flex-wrap gap-2 items-center">
                      <input list={`liste-${cat.id}`} value={d.nom} onChange={e => majDepense(d.id, { nom: e.target.value })}
                        placeholder={cat.id === 'autre' ? 'Libellé (déplacement, Consuel…)' : 'Nom'} className={`${inputBase} flex-1 min-w-[10rem]`} />
                      <div className="relative w-32">
                        <input inputMode="decimal" value={d.montant_ht} onChange={e => majDepense(d.id, { montant_ht: e.target.value })} placeholder="Montant" className={`${inputBase} w-full pr-10`} />
                        <span className="absolute right-3 top-2 text-xs text-slate-400">€ HT</span>
                      </div>
                      <input value={d.facture || ''} onChange={e => majDepense(d.id, { facture: e.target.value })} placeholder="N° facture" className={`${inputBase} w-32`} />
                      <button type="button" onClick={() => majDepense(d.id, { paye: !d.paye, date_paye: !d.paye ? (d.date_paye || new Date().toISOString().slice(0, 10)) : d.date_paye })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border ${d.paye ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {d.paye ? '✅ Payé' : '⏳ À payer'}
                      </button>
                      {d.paye && <input type="date" value={d.date_paye || ''} onChange={e => majDepense(d.id, { date_paye: e.target.value })} className={`${inputBase} w-40`} />}
                      <button type="button" onClick={() => retirerDepense(d.id)} className="text-rose-500 px-2" title="Retirer">✕</button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          <Card title="📝 Notes">
            <textarea value={client.notes} onChange={set('notes')} rows={3} className={inputCls} />
          </Card>
        </div>

        <div className="lg:sticky lg:top-4">
          <Card title="📊 Bilan du client">
            <dl className="text-sm space-y-1.5">
              <Ligne label="Vente HT" value={euros(b.ht)} bold />
              {CATEGORIES.map(c => <Ligne key={c.id} label={`− ${c.label}`} value={euros(b.parCategorie[c.id])} muted />)}
              <div className="border-t border-slate-200 my-2" />
              <Ligne label="Total dépenses HT" value={euros(b.depenses)} />
              <Ligne label="  dont payé" value={euros(b.depensesPayees)} muted />
              <Ligne label="  dont reste à payer" value={euros(b.resteAPayer)} tone={b.resteAPayer > 0 ? 'text-rose-700' : ''} />
              <div className="border-t border-slate-200 my-2" />
              <div className={`flex justify-between text-lg font-bold ${b.marge < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                <span>Marge HT</span><span>{euros(b.marge)}</span>
              </div>
              <div className="text-right text-xs text-slate-500">{pct(b.margePct)} de la vente HT</div>
              <div className="pt-2 text-xs text-slate-600">Client : {b.encaisse ? '✅ encaissé' : '⏳ en attente du paiement'} ({euros(b.ttc)} TTC)</div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Ligne({ label, value, bold, muted, tone = '' }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-slate-800' : muted ? 'text-slate-500' : 'text-slate-700'} ${tone}`}>
      <span className="whitespace-pre">{label}</span><span>{value}</span>
    </div>
  );
}
