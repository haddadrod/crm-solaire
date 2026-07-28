// Adaptateur de stockage compatible avec l'API window.storage de Claude
// Utilise Supabase comme backend pour partager les données entre utilisateurs
import { supabase } from './supabase.js';

// Cette fonction sera appelée au démarrage pour initialiser window.storage
export function setupStorage() {
  if (typeof window === 'undefined') return;

  window.storage = {
    /**
     * Récupère une valeur depuis Supabase
     */
    async get(key) {
      try {
        const { data, error } = await supabase
          .from('storage')
          .select('value')
          .eq('key', key)
          .maybeSingle();

        if (error) {
          console.error('storage.get error:', error);
          return null;
        }
        return data ? { key, value: data.value } : null;
      } catch (e) {
        console.error('storage.get exception:', e);
        return null;
      }
    },

    /**
     * Stocke une valeur dans Supabase (upsert).
     * 🩺 Diagnostic : en cas d'échec, window.storage.lastError contient la
     * vraie raison (session expirée, quota, réseau…) pour l'afficher à
     * l'utilisateur au lieu d'un échec muet.
     * 🔄 Auto-réparation : si l'erreur ressemble à une session expirée (JWT),
     * on rafraîchit la session et on réessaie UNE fois — cause la plus
     * fréquente des « ça ne s'enregistre pas » sur un onglet resté ouvert
     * toute la journée.
     */
    async set(key, value) {
      const tenter = () => supabase
        .from('storage')
        .upsert({ key, value, updated_at: new Date().toISOString() });
      try {
        let { error } = await tenter();
        if (error && /jwt|token|expired|401/i.test(`${error.message || ''} ${error.code || ''} ${error.status || ''}`)) {
          try { await supabase.auth.refreshSession(); } catch (e2) {}
          ({ error } = await tenter());
        }
        if (error) {
          console.error('storage.set error:', error);
          window.storage.lastError = { key, message: error.message || String(error), code: error.code || '', at: new Date().toISOString() };
          return null;
        }
        window.storage.lastError = null;
        return { key, value };
      } catch (e) {
        console.error('storage.set exception:', e);
        window.storage.lastError = { key, message: e?.message || String(e), code: 'exception', at: new Date().toISOString() };
        return null;
      }
    },

    /**
     * Supprime une clé
     */
    async delete(key) {
      try {
        const { error } = await supabase.from('storage').delete().eq('key', key);
        if (error) {
          console.error('storage.delete error:', error);
          return null;
        }
        return { key, deleted: true };
      } catch (e) {
        console.error('storage.delete exception:', e);
        return null;
      }
    },

    /**
     * Liste les clés avec un préfixe
     */
    async list(prefix) {
      try {
        let query = supabase.from('storage').select('key');
        if (prefix) query = query.like('key', `${prefix}%`);
        const { data, error } = await query;
        if (error) {
          console.error('storage.list error:', error);
          return null;
        }
        return { keys: (data || []).map((d) => d.key), prefix };
      } catch (e) {
        console.error('storage.list exception:', e);
        return null;
      }
    },
  };
}
