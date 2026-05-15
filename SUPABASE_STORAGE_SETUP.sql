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
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/gif']
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
