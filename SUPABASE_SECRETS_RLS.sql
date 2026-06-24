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
