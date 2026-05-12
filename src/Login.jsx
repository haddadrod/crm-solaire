import React, { useState } from 'react';
import { supabase } from './supabase.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect'
          : error.message);
      } else if (data.user) {
        onLogin(data.user);
      }
    } catch (e) {
      setError('Erreur de connexion. Vérifie ta connexion internet.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-pink-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full border border-violet-100">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">☀️</div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
            CRM Solaire
          </h1>
          <p className="text-sm text-slate-500 mt-1">Connecte-toi pour accéder à ton CRM</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-violet-400"
              required
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-md disabled:opacity-50"
          >
            {loading ? '⏳ Connexion...' : '🔓 Se connecter'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-400">
          Pas de compte ? Contacte l'administrateur
        </div>
      </div>
    </div>
  );
}
