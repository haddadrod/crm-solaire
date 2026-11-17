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
