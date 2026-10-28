// 📁 Fiche client : coordonnées + suivi mairie + éditeur de DP.
// Tout s'enregistre automatiquement (1,5 s après la dernière modification).
import React, { useEffect, useRef, useState } from 'react';
import { getClient, updateClient, deleteClient, getReglage, STATUTS } from './data.js';
import DpEditor, { defaultDp, mergeDefaults, inputCls, Field, Btn } from './dp/DpEditor.jsx';
import { go } from './nav.js';

const INFO_KEYS = ['nom', 'prenom', 'telephone', 'email', 'adresse', 'code_postal', 'ville', 'statut', 'date_envoi', 'date_recepisse', 'date_accord', 'notes'];

export default function ClientPage({ id }) {
  const [info, setInfo] = useState(null);
  const [dp, setDp] = useState(null);
  const [entete, setEntete] = useState({});
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await getClient(id);
        if (!c) { setError('Client introuvable.'); return; }
        const i = {};
        INFO_KEYS.forEach(k => { i[k] = c[k] ?? ''; });
        setInfo(i);
        setDp(mergeDefaults(defaultDp(c), c.dp && Object.keys(c.dp).length ? c.dp : null));
        setEntete(await getReglage('entete', {}).catch(() => ({})));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [id]);

  // Sauvegarde automatique
  useEffect(() => {
    if (!info || !dp) return;
    if (!ready.current) { ready.current = true; return; }
    setSaveState('…');
    const t = setTimeout(async () => {
      try {
        const patch = { ...info, dp };
        ['date_envoi', 'date_recepisse', 'date_accord'].forEach(k => { if (!patch[k]) patch[k] = null; });
        await updateClient(id, patch);
        setSaveState('✅ Enregistré');
      } catch (e) {
        setSaveState(`❌ Non enregistré (${e.message})`);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [info, dp, id]);

  // Prévenir avant de quitter si une sauvegarde est en attente
  useEffect(() => {
    const h = (e) => { if (saveState === '…') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveState]);

  if (error) return <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-rose-700">❌ {error} <button type="button" className="ml-2 font-semibold underline" onClick={() => go('/')}>Retour</button></div>;
  if (!info || !dp) return <div className="p-6 text-center text-slate-500">⏳ Chargement du client…</div>;

  const s = (patch) => setInfo(prev => ({ ...prev, ...patch }));
  const today = () => new Date().toISOString().slice(0, 10);

  const supprimer = async () => {
    if (!window.confirm(`Supprimer définitivement ${info.nom} ${info.prenom} et sa DP ?`)) return;
    try {
      await deleteClient(id);
      go('/');
    } catch (e) {
      alert(`❌ ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => go('/')} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-semibold">← Clients</button>
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-800 truncate">{info.nom} {info.prenom}</div>
            <div className="text-xs text-slate-500 truncate">📍 {info.adresse} {info.code_postal} {info.ville}{info.telephone ? ` · 📞 ${info.telephone}` : ''}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {STATUTS.map(st => (
              <button key={st.id} type="button"
                onClick={() => s({ statut: st.id, ...(st.id === 'envoye' && !info.date_envoi ? { date_envoi: today() } : {}), ...(st.id === 'accepte' && !info.date_accord ? { date_accord: today() } : {}) })}
                className={`px-2.5 py-1 rounded-full border text-xs font-bold ${info.statut === st.id ? st.cls + ' ring-2 ring-offset-1 ring-indigo-300' : 'bg-white text-slate-500 border-slate-200'}`}>
                {st.emoji} {st.label}
              </button>
            ))}
            <span className="text-xs text-slate-500 w-28 text-right">{saveState}</span>
          </div>
        </div>
        <button type="button" onClick={() => setShowInfo(v => !v)} className="mt-2 text-xs font-semibold text-indigo-600">
          {showInfo ? '▲ Masquer la fiche client' : '▼ Fiche client & suivi mairie'}
        </button>
        {showInfo && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Nom"><input className={inputCls} value={info.nom} onChange={e => s({ nom: e.target.value })} /></Field>
              <Field label="Prénom"><input className={inputCls} value={info.prenom} onChange={e => s({ prenom: e.target.value })} /></Field>
              <Field label="Téléphone"><input className={inputCls} value={info.telephone} onChange={e => s({ telephone: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} value={info.email} onChange={e => s({ email: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Adresse"><input className={inputCls} value={info.adresse} onChange={e => s({ adresse: e.target.value })} /></Field></div>
              <Field label="Code postal"><input className={inputCls} value={info.code_postal} onChange={e => s({ code_postal: e.target.value })} /></Field>
              <Field label="Ville"><input className={inputCls} value={info.ville} onChange={e => s({ ville: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="📤 Envoyée en mairie le"><input type="date" className={inputCls} value={info.date_envoi || ''} onChange={e => s({ date_envoi: e.target.value })} /></Field>
              <Field label="📨 Récépissé reçu le"><input type="date" className={inputCls} value={info.date_recepisse || ''} onChange={e => s({ date_recepisse: e.target.value })} /></Field>
              <Field label="✅ Accord reçu le"><input type="date" className={inputCls} value={info.date_accord || ''} onChange={e => s({ date_accord: e.target.value })} /></Field>
            </div>
            <Field label="📝 Notes"><textarea rows={2} className={inputCls} value={info.notes} onChange={e => s({ notes: e.target.value })} /></Field>
            <div className="text-[11px] text-slate-500">ℹ️ Modifier l'adresse ici ne déplace pas la DP : l'adresse du terrain se règle dans l'étape 📍 de la DP.</div>
            <div className="flex justify-end"><Btn small color="rose" onClick={supprimer}>🗑️ Supprimer ce client</Btn></div>
          </div>
        )}
      </div>

      <DpEditor client={info} dp={dp} setDp={setDp} entete={entete} />
    </div>
  );
}
