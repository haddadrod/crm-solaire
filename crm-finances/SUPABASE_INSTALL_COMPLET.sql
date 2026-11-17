-- 💶 CRM Finances — INSTALLATION COMPLÈTE de la base (nouveau projet Supabase, à lancer UNE fois).
-- Regroupe : SUPABASE_SETUP + SUPABASE_SECRETS_RLS + SUPABASE_STORAGE_SETUP + SUPABASE_GMAIL_ARCHIVE_BUCKET.

-- ================= SUPABASE_SETUP.sql =================
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

-- ================= SUPABASE_SECRETS_RLS.sql =================
-- ===================================================
-- 🔐 Sécurité : exclut les clés `secret-*` de la lecture par les
-- utilisateurs authentifiés. Seul le serveur (clé service_role) pourra
-- les lire / écrire. Utilisé pour stocker les clés API Pennylane saisies
-- depuis le CRM (Réglages → Clés Pennylane).
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase :
--   1. Va dans Supabase → SQL Editor
--   2. New query
--   3. Colle TOUT ce fichier
--   4. Clique « Run » (en bas à droite)
-- ===================================================

-- 1. Drop l'ancienne politique de lecture trop permissive
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent lire" ON storage;

-- 2. Nouvelle politique : authenticated peut lire TOUT SAUF les `secret-*`
CREATE POLICY "Utilisateurs connectés peuvent lire (hors secrets)"
  ON storage FOR SELECT
  TO authenticated
  USING (key NOT LIKE 'secret-%');

-- 3. Idem pour INSERT — interdit aux clients de créer des `secret-*`
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent insérer" ON storage;
CREATE POLICY "Utilisateurs connectés peuvent insérer (hors secrets)"
  ON storage FOR INSERT
  TO authenticated
  WITH CHECK (key NOT LIKE 'secret-%');

-- 4. Idem pour UPDATE — interdit aux clients de modifier des `secret-*`
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent modifier" ON storage;
CREATE POLICY "Utilisateurs connectés peuvent modifier (hors secrets)"
  ON storage FOR UPDATE
  TO authenticated
  USING (key NOT LIKE 'secret-%')
  WITH CHECK (key NOT LIKE 'secret-%');

-- 5. Idem pour DELETE — interdit aux clients de supprimer des `secret-*`
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent supprimer" ON storage;
CREATE POLICY "Utilisateurs connectés peuvent supprimer (hors secrets)"
  ON storage FOR DELETE
  TO authenticated
  USING (key NOT LIKE 'secret-%');

-- ===================================================
-- ✅ Terminé. Désormais :
--    - Les utilisateurs authentifiés (commerciaux, admins, etc.) ne voient
--      JAMAIS les clés `secret-pennylane-yolico`, `secret-pennylane-elsun`…
--    - Seul le serveur via la clé service_role peut les lire/écrire.
--    - Les fonctions /api/pennylane-keys (config) et /api/pennylane-push-facture
--      (push) y ont accès — pas les navigateurs.
-- ===================================================

-- ================= SUPABASE_STORAGE_SETUP.sql =================
-- =====================================================================
-- Setup Supabase Storage pour les documents des dossiers
-- =====================================================================
-- À exécuter UNE FOIS dans le SQL Editor de Supabase (project → SQL Editor).
-- Crée un bucket privé "dossier-documents" et ses politiques RLS.
-- Limite par fichier : 50 Mo (max imposé par Supabase free tier).

-- 1. Création du bucket privé
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dossier-documents',
  'dossier-documents',
  false,
  52428800,  -- 50 Mo
  ARRAY[
    -- Documents
    'application/pdf',
    -- Images
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/gif',
    -- Audio (vocaux du contrôle qualité, enregistrements ONOFF, etc.)
    'audio/mpeg', 'audio/mp3',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/ogg', 'audio/webm',
    'audio/3gpp', 'audio/3gpp2'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Politique : un utilisateur authentifié peut lire tous les fichiers du bucket
--    (cohérent avec la table `storage` actuelle — l'équipe partage les documents)
DROP POLICY IF EXISTS "auth users can read dossier-documents" ON storage.objects;
CREATE POLICY "auth users can read dossier-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'dossier-documents');

-- 3. Politique : un utilisateur authentifié peut uploader dans le bucket
DROP POLICY IF EXISTS "auth users can upload to dossier-documents" ON storage.objects;
CREATE POLICY "auth users can upload to dossier-documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dossier-documents');

-- 4. Politique : un utilisateur authentifié peut supprimer des fichiers du bucket
DROP POLICY IF EXISTS "auth users can delete from dossier-documents" ON storage.objects;
CREATE POLICY "auth users can delete from dossier-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'dossier-documents');

-- 5. (optionnel) Politique pour update — utile si un jour on veut renommer
DROP POLICY IF EXISTS "auth users can update dossier-documents" ON storage.objects;
CREATE POLICY "auth users can update dossier-documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dossier-documents');

-- ================= SUPABASE_GMAIL_ARCHIVE_BUCKET.sql =================
-- ===================================================
-- 📦 Bucket pour archiver les PDFs Gmail (cron pré-analyse).
--
-- Le cron télécharge chaque facture depuis Gmail, l'analyse via Claude,
-- et stocke le PDF brut ici. Quand l'user attache une facture depuis le
-- CRM, on lit depuis ce bucket (instant) au lieu de re-télécharger
-- depuis Gmail à chaque fois.
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase :
--   1. Va dans Supabase → SQL Editor
--   2. New query
--   3. Colle TOUT ce fichier
--   4. Clique « Run »
-- ===================================================

-- 1. Crée le bucket (idempotent — re-run safe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gmail-archive', 'gmail-archive', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy : seul le serveur (service_role) peut lire / écrire / supprimer.
--    Les utilisateurs authentifiés du CRM n'y ont PAS accès direct — ils
--    passent par /api/gmail-oauth?action=fetch-attachment qui sert le PDF
--    après auth Supabase. Ça évite qu'un user puisse lister/scrap tout le
--    bucket via l'API publique.

DROP POLICY IF EXISTS "Gmail archive — service only (read)" ON storage.objects;
CREATE POLICY "Gmail archive — service only (read)"
  ON storage.objects FOR SELECT
  TO service_role
  USING (bucket_id = 'gmail-archive');

DROP POLICY IF EXISTS "Gmail archive — service only (insert)" ON storage.objects;
CREATE POLICY "Gmail archive — service only (insert)"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'gmail-archive');

DROP POLICY IF EXISTS "Gmail archive — service only (update)" ON storage.objects;
CREATE POLICY "Gmail archive — service only (update)"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'gmail-archive')
  WITH CHECK (bucket_id = 'gmail-archive');

DROP POLICY IF EXISTS "Gmail archive — service only (delete)" ON storage.objects;
CREATE POLICY "Gmail archive — service only (delete)"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'gmail-archive');

-- ===================================================
-- ✅ Terminé.
-- Le cron-gmail-prefetch peut maintenant uploader les PDFs.
-- L'attach depuis le CRM les sert via fetch-attachment (qui passe par
-- service_role côté serveur).
-- ===================================================
