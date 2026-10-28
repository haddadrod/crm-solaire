// 🏛️ Appli DP Mairie — session + navigation simple (hash) :
//   #/            → liste des clients
//   #/client/<id> → fiche client + DP
//   #/reglages    → en-tête société (nom, adresse, logo)

import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigOk } from './supabase.js';
import Login from './Login.jsx';
import ClientsList from './ClientsList.jsx';
import ClientPage from './ClientPage.jsx';
import Reglages from './Reglages.jsx';
import { go } from './nav.js';

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}


export default function App() {
  const [session, setSession] = useState(undefined);
  const route = useHashRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigOk) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-2xl shadow p-6 text-sm text-slate-700">
          <div className="text-lg font-bold mb-2">⚙️ Configuration manquante</div>
          Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans les variables d'environnement Vercel, puis redéploie.
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-500">⏳ Chargement…</div>;
  if (!session) return <Login />;

  const clientMatch = route.match(/^\/client\/([0-9a-f-]+)/i);

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => go('/')} className="flex items-center gap-2 font-bold text-lg">
            <span className="text-2xl">🏛️</span> DP Mairie
          </button>
          <nav className="ml-4 flex gap-1 text-sm">
            <button type="button" onClick={() => go('/')} className={`px-3 py-1.5 rounded-lg font-semibold ${!clientMatch && route !== '/reglages' ? 'bg-white/25' : 'hover:bg-white/15'}`}>👥 Clients</button>
            <button type="button" onClick={() => go('/reglages')} className={`px-3 py-1.5 rounded-lg font-semibold ${route === '/reglages' ? 'bg-white/25' : 'hover:bg-white/15'}`}>⚙️ Réglages</button>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="hidden sm:inline opacity-90">{session.user.email}</span>
            <button type="button" onClick={() => supabase.auth.signOut()} className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">Déconnexion</button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4">
        {clientMatch ? <ClientPage id={clientMatch[1]} key={clientMatch[1]} />
          : route === '/reglages' ? <Reglages />
          : <ClientsList />}
      </main>
    </div>
  );
}
