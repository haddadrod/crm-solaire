import React, { useState, useEffect } from 'react';
import { supabase } from './supabase.js';
import { setupStorage } from './storage.js';
import Login from './Login.jsx';
import DossierSaisie from './components/DossierSaisie.jsx';

// Initialise window.storage avant le rendu
setupStorage();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Au démarrage, vérifie si l'utilisateur est déjà connecté
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });
    // Écoute les changements d'authentification (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-pink-50 to-orange-50">
        <div className="text-center">
          <div className="text-4xl mb-2">☀️</div>
          <div className="text-sm text-slate-500">Chargement...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div>
      {/* Mini-bandeau utilisateur connecté */}
      <div className="fixed top-2 right-2 z-50 bg-white shadow-md rounded-full px-3 py-1 text-xs flex items-center gap-2 border border-violet-100">
        <span>👤 {user.email}</span>
        <button
          onClick={handleLogout}
          className="text-rose-600 hover:text-rose-800 font-bold"
          title="Se déconnecter"
        >
          🚪
        </button>
      </div>
      <DossierSaisie />
    </div>
  );
}
