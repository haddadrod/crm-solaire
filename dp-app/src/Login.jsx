import React, { useState } from 'react';
import { supabase } from './supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : err.message);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-100 via-violet-100 to-fuchsia-100">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl">🏛️</div>
          <div className="text-xl font-bold text-slate-800 mt-1">DP Mairie</div>
          <div className="text-sm text-slate-500">Déclarations préalables photovoltaïques</div>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">Email</span>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.com"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1">Mot de passe</span>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </label>
        {error && <div className="text-sm text-rose-600">❌ {error}</div>}
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow disabled:opacity-60">
          {busy ? '⏳ Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
