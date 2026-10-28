// 👥 Liste des clients + création d'un nouveau client.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listClients, createClient, STATUTS, statutInfo } from './data.js';
import { defaultDp, inputCls, Field, Btn } from './dp/DpEditor.jsx';
import { fetchJson } from './dp/geo.js';
import { go } from './nav.js';

function avancement(c) {
  let n = 0;
  if (c.lon) n++;
  if (c.parcelle) n++;
  if (Number(c.nombre) > 0) n++;
  return n; // sur 3 (les photos se voient dans la fiche)
}

// Champ adresse avec suggestions de la Base Adresse Nationale.
function AdresseAuto({ value, onChange, onPick }) {
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    if (q.trim().length < 4) { setSugg([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await fetchJson(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
        setSugg(d.features || []);
        setOpen(true);
      } catch (e) { setSugg([]); }
    }, 300);
  };
  return (
    <div className="relative">
      <input className={inputCls} value={value} placeholder="13 rue des Robins, Vergigny"
        onChange={e => { onChange(e.target.value); search(e.target.value); }}
        onFocus={() => sugg.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && sugg.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {sugg.map(f => (
            <button key={f.properties.id} type="button" onMouseDown={() => { onPick(f); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-50">
              📍 {f.properties.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NouveauClient({ onClose }) {
  const [f, setF] = useState({ nom: '', prenom: '', telephone: '', email: '', adresse: '', code_postal: '', ville: '' });
  const [pan, setPan] = useState({ nombre: '', puissanceWc: '', marque: '', modele: '' });
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = (patch) => setF(prev => ({ ...prev, ...patch }));

  const pick = (feat) => {
    const p = feat.properties;
    s({ adresse: p.name, code_postal: p.postcode || '', ville: p.city || '' });
    const [lon, lat] = feat.geometry.coordinates;
    setGeo({ lon, lat });
  };

  const save = async () => {
    if (!f.nom.trim()) { alert('Le nom du client est obligatoire.'); return; }
    setBusy(true);
    try {
      const client = { ...f, nom: f.nom.trim().toUpperCase(), prenom: f.prenom.trim() };
      const dp = defaultDp(client, pan);
      if (geo) {
        dp.lon = geo.lon; dp.lat = geo.lat;
        dp.layout = { ...dp.layout, lon: geo.lon, lat: geo.lat };
      }
      const id = await createClient({ ...client, dp });
      onClose();
      go(`/client/${id}`);
    } catch (e) {
      alert(`❌ Création impossible : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
        <div className="px-5 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-t-2xl">➕ Nouveau client</div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom *"><input className={inputCls} value={f.nom} onChange={e => s({ nom: e.target.value })} autoFocus /></Field>
            <Field label="Prénom"><input className={inputCls} value={f.prenom} onChange={e => s({ prenom: e.target.value })} /></Field>
            <Field label="Téléphone"><input className={inputCls} value={f.telephone} onChange={e => s({ telephone: e.target.value })} /></Field>
            <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={e => s({ email: e.target.value })} /></Field>
          </div>
          <Field label="Adresse du chantier" hint={geo ? '✅ Adresse localisée' : 'Choisis une suggestion pour localiser automatiquement'}>
            <AdresseAuto value={f.adresse} onChange={v => { s({ adresse: v }); setGeo(null); }} onPick={pick} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code postal"><input className={inputCls} value={f.code_postal} onChange={e => s({ code_postal: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Ville"><input className={inputCls} value={f.ville} onChange={e => s({ ville: e.target.value })} /></Field></div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <div className="text-sm font-bold text-amber-800 mb-2">☀️ Panneaux</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Nombre"><input type="number" min="0" className={inputCls} value={pan.nombre} onChange={e => setPan({ ...pan, nombre: e.target.value })} /></Field>
              <Field label="Puissance (Wc)"><input type="number" min="0" className={inputCls} value={pan.puissanceWc} placeholder="500" onChange={e => setPan({ ...pan, puissanceWc: e.target.value })} /></Field>
              <Field label="Marque"><input className={inputCls} value={pan.marque} onChange={e => setPan({ ...pan, marque: e.target.value })} /></Field>
              <Field label="Modèle"><input className={inputCls} value={pan.modele} onChange={e => setPan({ ...pan, modele: e.target.value })} /></Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn color="slate" onClick={onClose}>Annuler</Btn>
            <Btn onClick={save} disabled={busy}>{busy ? '⏳ Création…' : '✅ Créer et faire la DP'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientsList() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    listClients().then(setClients).catch(e => setError(e.message));
  }, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (clients || []).filter(c =>
      (!filtre || c.statut === filtre) &&
      (!t || `${c.nom} ${c.prenom} ${c.ville} ${c.code_postal} ${c.adresse} ${c.telephone}`.toLowerCase().includes(t)));
  }, [clients, q, filtre]);

  const compte = (id) => (clients || []).filter(c => c.statut === id).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUTS.map(s => (
          <button key={s.id} type="button" onClick={() => setFiltre(filtre === s.id ? '' : s.id)}
            className={`rounded-2xl border-2 p-3 text-left bg-white shadow-sm transition-all ${filtre === s.id ? 'ring-2 ring-indigo-400 border-indigo-300' : 'border-transparent hover:border-slate-200'}`}>
            <div className="text-xs font-semibold text-slate-500">{s.emoji} {s.label}</div>
            <div className="text-2xl font-bold text-slate-800">{clients ? compte(s.id) : '…'}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${inputCls} max-w-sm`} placeholder="🔎 Rechercher (nom, ville, téléphone…)" value={q} onChange={e => setQ(e.target.value)} />
        {filtre && <Btn small color="slate" onClick={() => setFiltre('')}>✕ {statutInfo(filtre).label}</Btn>}
        <div className="ml-auto"><Btn onClick={() => setShowNew(true)}>➕ Nouveau client</Btn></div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">❌ {error}{/relation|does not exist/i.test(error) ? ' — as-tu exécuté supabase.sql dans Supabase ?' : ''}</div>}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {clients === null && !error && <div className="p-6 text-center text-slate-500">⏳ Chargement…</div>}
        {clients && visibles.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            {clients.length === 0 ? <>Aucun client pour l'instant. <button type="button" className="text-indigo-600 font-semibold" onClick={() => setShowNew(true)}>➕ Créer le premier</button></> : 'Aucun résultat.'}
          </div>
        )}
        {visibles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-left px-4 py-2">Commune</th>
                  <th className="text-left px-4 py-2">Panneaux</th>
                  <th className="text-left px-4 py-2">Préparation</th>
                  <th className="text-left px-4 py-2">Mairie</th>
                  <th className="text-left px-4 py-2">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(c => {
                  const st = statutInfo(c.statut);
                  const av = avancement(c);
                  return (
                    <tr key={c.id} onClick={() => go(`/client/${c.id}`)} className="border-t border-slate-100 hover:bg-indigo-50/50 cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-slate-800">{c.nom} {c.prenom}</div>
                        <div className="text-xs text-slate-500">{c.telephone}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{c.ville}{c.code_postal ? `, ${c.code_postal}` : ''}</td>
                      <td className="px-4 py-2.5 text-slate-700">{Number(c.nombre) > 0 ? `${c.nombre} × ${c.puissance || '?'} Wc` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(av / 3) * 100}%` }} /></div>
                          <span className="text-xs text-slate-500">{av}/3</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-bold ${st.cls}`}>{st.emoji} {st.label}</span></td>
                      <td className="px-4 py-2.5 text-slate-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showNew && <NouveauClient onClose={() => setShowNew(false)} />}
    </div>
  );
}
