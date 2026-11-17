-- ===================================================
-- Migration : active la sync temps réel entre appareils
-- ===================================================
-- À exécuter UNE FOIS sur ton Supabase existant :
-- 1. Va sur supabase.com → ton projet → SQL Editor
-- 2. New query → colle ces lignes → Run
--
-- Cela permet à l'app de recevoir en direct les modifs faites par un
-- autre appareil (téléphone, PC...) sur le même compte — plus de
-- 'last writer wins' qui écrase silencieusement des dossiers.
-- ===================================================

ALTER PUBLICATION supabase_realtime ADD TABLE storage;

-- Vérif (optionnel) : tu devrais voir 'storage' dans la liste retournée
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
