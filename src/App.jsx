import React, { useState, useEffect } from 'react';
import { supabase } from './supabase.js';
import { setupStorage } from './storage.js';
import Login from './Login.jsx';
import DossierSaisie from './components/DossierSaisie.jsx';
import ChantierPoseurView from './components/ChantierPoseurView.jsx';

// Initialise window.storage avant le rendu
setupStorage();

// Lien public envoyé au poseur : `?chantier=TOKEN`. Si on a un token dans
// l'URL, on bypasse l'auth et on rend la page chantier (lecture seule + upload
// photos). Le token sert d'authentification.
const chantierToken = (typeof window !== 'undefined')
  ? new URLSearchParams(window.location.search).get('chantier')
  : null;

// Extrait un prénom lisible depuis le user Supabase :
// display_name s'il est propre (sans point/espace) sinon partie avant le 1er point/espace,
// capitalisée. Fallback : partie avant @ de l'email, même règle.
function firstNameOf(user) {
  if (!user) return 'Utilisateur';
  const raw = (user.user_metadata?.display_name || (user.email ? user.email.split('@')[0] : '') || '').trim();
  if (!raw) return 'Utilisateur';
  const first = raw.split(/[.\s_-]+/)[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Au démarrage, vérifie si l'utilisateur est déjà connecté
  useEffect(() => {
    // En mode lien public chantier, on n'a pas besoin de session Supabase.
    if (chantierToken) { setLoading(false); return; }
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

  // Lien public chantier → on rend la vue poseur sans login.
  if (chantierToken) {
    return <ChantierPoseurView token={chantierToken} />;
  }

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

  return <DossierSaisie authUser={user} onLogout={handleLogout} />;
}
