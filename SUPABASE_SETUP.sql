-- ===================================================
-- CRM Solaire — Script de configuration Supabase
-- ===================================================
-- Exécute ce script UNE SEULE FOIS dans Supabase :
-- 1. Va dans Supabase → SQL Editor (icône à gauche)
-- 2. Clique "New query"
-- 3. Colle TOUT ce fichier
-- 4. Clique "Run" (bouton vert en bas à droite)
-- ===================================================

-- Table principale pour stocker toutes les données du CRM
-- Format clé/valeur (key/value) — compatible avec l'adaptateur window.storage
CREATE TABLE IF NOT EXISTS storage (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active la sécurité par ligne (Row Level Security)
-- Cela garantit que seuls les utilisateurs connectés peuvent accéder aux données
ALTER TABLE storage ENABLE ROW LEVEL SECURITY;

-- Politique : tous les utilisateurs connectés peuvent LIRE les données
CREATE POLICY "Utilisateurs connectés peuvent lire"
  ON storage FOR SELECT
  TO authenticated
  USING (true);

-- Politique : tous les utilisateurs connectés peuvent INSÉRER des données
CREATE POLICY "Utilisateurs connectés peuvent insérer"
  ON storage FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Politique : tous les utilisateurs connectés peuvent MODIFIER les données
CREATE POLICY "Utilisateurs connectés peuvent modifier"
  ON storage FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Politique : tous les utilisateurs connectés peuvent SUPPRIMER des données
CREATE POLICY "Utilisateurs connectés peuvent supprimer"
  ON storage FOR DELETE
  TO authenticated
  USING (true);

-- Index pour accélérer les recherches par préfixe
CREATE INDEX IF NOT EXISTS idx_storage_key_prefix ON storage (key text_pattern_ops);

-- ===================================================
-- 🔄 Synchronisation temps réel entre appareils
-- ===================================================
-- Active Realtime sur la table storage : quand un appareil (téléphone, PC...)
-- modifie un dossier, tous les autres appareils connectés reçoivent l'update
-- en direct via WebSocket. Évite le scénario 'last writer wins' qui peut
-- écraser des données entre 2 devices ouverts en même temps.
ALTER PUBLICATION supabase_realtime ADD TABLE storage;

-- ===================================================
-- ✅ Terminé !
-- Maintenant tu peux :
-- 1. Aller dans Authentication → Users → "Add user" pour créer des comptes
-- 2. Te connecter à ton CRM avec ces identifiants
-- ===================================================
