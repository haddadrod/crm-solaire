// ⚙️ Réglages : en-tête des plans (nom de la société, adresse, logo).
import React, { useEffect, useState } from 'react';
import { getReglage, setReglage } from './data.js';
import { inputCls, Field, Card, Btn } from './dp/DpEditor.jsx';

export default function Reglages() {
  const [entete, setEntete] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getReglage('entete', {}).then(v => setEntete({ nom: '', lignes: '', logoDataUrl: '', ...v })).catch(e => setMsg(`❌ ${e.message}`));
  }, []);

  const logo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { alert('Choisis un logo PNG ou JPG.'); return; }
    if (file.size > 500 * 1024) { alert('Logo trop lourd (max 500 Ko).'); return; }
    const fr = new FileReader();
    fr.onload = () => setEntete(e => ({ ...e, logoDataUrl: fr.result }));
    fr.readAsDataURL(file);
  };

  const save = async () => {
    try {
      await setReglage('entete', entete);
      setMsg('✅ Réglages enregistrés');
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    }
  };

  if (!entete) return <div className="p-6 text-slate-500">{msg || '⏳ Chargement…'}</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="🏢 En-tête des plans DP" color="indigo">
        <div className="space-y-3">
          <Field label="Nom de la société"><input className={inputCls} value={entete.nom} onChange={e => setEntete({ ...entete, nom: e.target.value })} placeholder="ELS INSTALLATION" /></Field>
          <Field label="Adresse, email, téléphone (une info par ligne)">
            <textarea rows={3} className={inputCls} value={entete.lignes} onChange={e => setEntete({ ...entete, lignes: e.target.value })} />
          </Field>
          <Field label="Logo (PNG ou JPG, max 500 Ko)">
            <div className="flex items-center gap-3">
              {entete.logoDataUrl && <img src={entete.logoDataUrl} alt="logo" className="h-12 max-w-[160px] object-contain border rounded-lg p-1 bg-white" />}
              <input type="file" accept="image/png,image/jpeg" onChange={e => logo(e.target.files?.[0])} className="text-sm" />
              {entete.logoDataUrl && <Btn small color="rose" onClick={() => setEntete({ ...entete, logoDataUrl: '' })}>Retirer</Btn>}
            </div>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Btn onClick={save}>💾 Enregistrer</Btn>
          <span className="text-sm">{msg}</span>
        </div>
      </Card>
      <Card title="👥 Ajouter quelqu'un de l'équipe" color="slate">
        <div className="text-sm text-slate-600">Dans Supabase : <b>Authentication → Users → Add user</b> (email + mot de passe). La personne pourra se connecter tout de suite.</div>
      </Card>
    </div>
  );
}
