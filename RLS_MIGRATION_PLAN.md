# 🔐 Plan de migration RLS — CRM Solaire

> **À LIRE AVANT TOUTE EXÉCUTION.** Ce document est un plan détaillé, pas une migration prête à coller. Chaque phase est à valider par Rodney + (idéalement) un backup complet de la base avant exécution.

**Date** : 2026-05-20
**Auteur** : Claude (audit nuit + matin)
**Sévérité** : CRITICAL — bloquant avant ouverture du CRM hors équipe restreinte

---

## 📊 État actuel

Cf. [SUPABASE_SETUP.sql](SUPABASE_SETUP.sql) :

```sql
CREATE TABLE storage (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ);
ALTER TABLE storage ENABLE ROW LEVEL SECURITY;

-- 4 policies WIDE-OPEN : tout user "authenticated" voit/écrit TOUT
CREATE POLICY ... FOR SELECT  TO authenticated USING (true);
CREATE POLICY ... FOR INSERT  TO authenticated WITH CHECK (true);
CREATE POLICY ... FOR UPDATE  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ... FOR DELETE  TO authenticated USING (true);
```

**Conséquence** : un poseur, un régie, un commercial — n'importe quel user connecté — peut récupérer toutes les données du CRM via la console DevTools :

```javascript
const { data } = await supabase.from('storage').select('*');
// → renvoie TOUS les dossiers, tarifs, contacts, RIB, SSN, avis d'impôt
```

Combiné avec la table actuelle qui stocke les dossiers en un seul row `dossiers-data` (JSON array de tous les dossiers), la fuite est totale.

---

## 🎯 État cible (par rôle)

| Rôle | Dossiers visibles | Modifs autorisées | Settings |
|---|---|---|---|
| **Admin** | Tous | Tous | Tous |
| **Secrétaire** | Tous | Tous (sauf supprimer dossier) | Lecture seule sauf email-config |
| **Commercial** | Ses dossiers (champ `commercial`) | Son dossier, lecture seule sinon | Lecture seule |
| **Poseur** | Ses dossiers (`poseurs[].nom` = lui) | Date pose, statut pose uniquement | Aucun |
| **Régie** | Ses dossiers (`regies[].nom` = lui ou commercial = lui) | Aucune | Aucun |

Les rôles sont stockés dans `auth.users.user_metadata.role` côté Supabase.

---

## 🚧 Difficulté technique principale

Aujourd'hui, **tous les dossiers tiennent dans un seul row** :

```
key = 'dossiers-data'
value = '[{nom: "DUPONT", ...}, {nom: "MARTIN", ...}, ...]'  (JSON sérialisé)
```

RLS Postgres travaille au niveau ROW, pas au niveau JSON. Donc on ne peut pas filtrer par dossier sans **restructurer**.

**3 options** :

### Option A — Restructuration en table `dossiers` (recommandé)

Une row par dossier, colonnes typées + RLS sur les colonnes `commercial`, `poseur`, `regie`.

✅ Pro : RLS clean, requêtes performantes, scalable
❌ Con : Migration lourde (code front + back + données existantes)

### Option B — Une clé `dossier:<id>` par dossier (compromis)

Garde l'architecture key/value mais une row par dossier. Les conditions RLS peuvent regarder le préfixe de la clé + le contenu JSON via `value::jsonb`.

✅ Pro : Compatible avec le code existant (window.storage)
❌ Con : RLS sur JSON path = lent + complexe à déboguer

### Option C — UI-only + audit logs

On garde la structure mais on cache via le front + audit log toutes les requêtes. C'est ce qu'on a aujourd'hui en pratique. **Inacceptable pour de la donnée RGPD-sensible.**

→ **On part sur Option A**.

---

## 📦 Migration en 3 phases

### Phase 1 — Lockdown minimal (1 jour, urgent)

Objectif : limiter immédiatement les dégâts en attendant Option A. Bloquer les écritures critiques pour les rôles non-admin.

```sql
-- Drop des 4 policies wide-open
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent lire" ON storage;
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent insérer" ON storage;
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent modifier" ON storage;
DROP POLICY IF EXISTS "Utilisateurs connectés peuvent supprimer" ON storage;

-- Helper pour récupérer le rôle depuis le JWT (user_metadata.role)
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'user'
  );
$$ LANGUAGE SQL STABLE;

-- SELECT : tout user connecté peut lire (à durcir en phase 3)
CREATE POLICY "auth read all"
  ON storage FOR SELECT
  TO authenticated
  USING (true);

-- INSERT : tout user connecté peut insérer
-- (à durcir en phase 2 : restreindre par préfixe de clé)
CREATE POLICY "auth insert all"
  ON storage FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE : tout user connecté peut update
CREATE POLICY "auth update all"
  ON storage FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

-- DELETE : admin uniquement
CREATE POLICY "admin delete only"
  ON storage FOR DELETE
  TO authenticated
  USING (auth.user_role() = 'admin');
```

**Test** : se connecter en tant que poseur, tenter de supprimer une clé → 403. ✅

**Impact code** : aucun (les autres ops restent open).

### Phase 2 — Cloisonnement settings (2-3 jours)

Objectif : séparer ce qui est "settings d'orga" (tarifs, contacts, societes) — réservé admin/secrétaire — de ce qui est "dossier" — accessible aux rôles métier.

Préfixes de clés actuels :
- `dossiers-data` → contenu métier
- `tarifs-poseurs`, `tarifs-regies`, `tarifs-internes`, `tarifs-fournisseurs` → settings tarifs
- `poseurs-contacts`, `regies-contacts` → settings contacts
- `liste-fournisseurs`, `produits`, `societes`, `users-list` → settings orga
- `email-config`, `gmail-oauth` → settings tech
- `file:<id>` → fichiers
- `pending-onoff-calls`, `orphan-onoff-calls` → état serveur
- `dossiers-deleted-tombstones`, `dossiers-backup-dismissed` → état serveur
- `onoff-webhook-token` → secret partagé ONOFF

Plan :

```sql
-- Helper : la clé est-elle un "setting" (admin/secrétaire only en écriture) ?
CREATE OR REPLACE FUNCTION is_settings_key(k TEXT) RETURNS BOOLEAN AS $$
  SELECT k IN (
    'tarifs-poseurs','tarifs-regies','tarifs-internes','tarifs-fournisseurs',
    'poseurs-contacts','regies-contacts','liste-fournisseurs','produits',
    'societes','users-list','email-config','gmail-oauth','onoff-webhook-token',
    'statuts-order','noms-internes'
  );
$$ LANGUAGE SQL IMMUTABLE;

-- Drop les policies de Phase 1
DROP POLICY IF EXISTS "auth update all" ON storage;
DROP POLICY IF EXISTS "auth insert all" ON storage;

-- INSERT : admin/secrétaire peuvent tout ; autres peuvent insérer SAUF settings
CREATE POLICY "settings insert restricted"
  ON storage FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('admin', 'secretaire')
    OR NOT is_settings_key(key)
  );

-- UPDATE : pareil
CREATE POLICY "settings update restricted"
  ON storage FOR UPDATE
  TO authenticated
  USING (
    auth.user_role() IN ('admin', 'secretaire')
    OR NOT is_settings_key(key)
  )
  WITH CHECK (
    auth.user_role() IN ('admin', 'secretaire')
    OR NOT is_settings_key(key)
  );
```

**Test** : poseur tente de modifier `tarifs-poseurs` via console → 403. ✅
**Impact code** : aucun si les rôles sont déjà bien gated en UI (ils le sont actuellement).

### Phase 3 — Cloisonnement dossiers (1-2 semaines, le gros morceau)

Objectif : Option A. Migrer `dossiers-data` (un row JSON array) → table `dossiers` (une row par dossier, colonnes typées).

**Schéma proposé** :

```sql
CREATE TABLE dossiers (
  local_id TEXT PRIMARY KEY,              -- id existant côté front (timestamp)
  nom TEXT NOT NULL,
  prenom TEXT,
  statut TEXT NOT NULL,
  societe TEXT,                            -- 'yolico' | 'elsun'
  -- Assignments (pour RLS)
  commercial TEXT,                         -- nom du commercial assigné
  -- Plus contenu JSON pour le reste (provisoire — à éclater plus tard)
  data JSONB NOT NULL,
  -- Métadonnées
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  modified_by TEXT,
  modified_at TIMESTAMPTZ DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE
);

-- Index sur les champs RLS
CREATE INDEX idx_dossiers_commercial ON dossiers (commercial);
CREATE INDEX idx_dossiers_societe ON dossiers (societe);
CREATE INDEX idx_dossiers_statut ON dossiers (statut);
CREATE INDEX idx_dossiers_archived ON dossiers (archived);
-- Index GIN pour requêtes sur data (poseurs, regies, etc.)
CREATE INDEX idx_dossiers_data_gin ON dossiers USING GIN (data);

ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;

-- Helper : récupère le nom d'utilisateur depuis user_metadata
CREATE OR REPLACE FUNCTION auth.user_name() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'name';
$$ LANGUAGE SQL STABLE;

-- SELECT : admin/secrétaire voient tout
CREATE POLICY "admin/secretaire read all"
  ON dossiers FOR SELECT
  TO authenticated
  USING (auth.user_role() IN ('admin', 'secretaire'));

-- SELECT : commercial voit ses dossiers
CREATE POLICY "commercial read own"
  ON dossiers FOR SELECT
  TO authenticated
  USING (auth.user_role() = 'commercial' AND commercial = auth.user_name());

-- SELECT : poseur voit les dossiers où il est dans poseurs[]
CREATE POLICY "poseur read assigned"
  ON dossiers FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'poseur'
    AND data -> 'poseurs' @> jsonb_build_array(jsonb_build_object('nom', auth.user_name()))
  );

-- SELECT : régie voit les dossiers où elle est dans regies[]
CREATE POLICY "regie read assigned"
  ON dossiers FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'regie'
    AND data -> 'regies' @> jsonb_build_array(jsonb_build_object('nom', auth.user_name()))
  );

-- UPDATE : admin/secretaire tout, commercial son dossier, poseur/régie aucun
CREATE POLICY "update by role"
  ON dossiers FOR UPDATE
  TO authenticated
  USING (
    auth.user_role() IN ('admin', 'secretaire')
    OR (auth.user_role() = 'commercial' AND commercial = auth.user_name())
  );

-- INSERT : admin/secrétaire/commercial peuvent créer
CREATE POLICY "insert by role"
  ON dossiers FOR INSERT
  TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'secretaire', 'commercial'));

-- DELETE : admin uniquement
CREATE POLICY "delete admin only"
  ON dossiers FOR DELETE
  TO authenticated
  USING (auth.user_role() = 'admin');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE dossiers;
```

**Migration des données** :

```sql
-- Récupère le JSON array de l'ancien storage et le splitte en rows
INSERT INTO dossiers (local_id, nom, prenom, statut, societe, commercial, data, created_by, created_at, modified_by, modified_at, archived)
SELECT
  jsonb_extract_path_text(d, 'localId'),
  jsonb_extract_path_text(d, 'nom'),
  jsonb_extract_path_text(d, 'prenom'),
  COALESCE(jsonb_extract_path_text(d, 'statut'), 'A_EN_COURS'),
  jsonb_extract_path_text(d, 'societe'),
  jsonb_extract_path_text(d, 'commercial'),
  d,
  jsonb_extract_path_text(d, 'createdBy'),
  COALESCE((jsonb_extract_path_text(d, 'createdAt'))::timestamptz, NOW()),
  jsonb_extract_path_text(d, 'modifiedBy'),
  COALESCE((jsonb_extract_path_text(d, 'modifiedAt'))::timestamptz, NOW()),
  COALESCE((jsonb_extract_path_text(d, 'archived'))::boolean, false)
FROM (
  SELECT jsonb_array_elements(value::jsonb) AS d
  FROM storage
  WHERE key = 'dossiers-data'
) sub;

-- Vérifier le count
SELECT COUNT(*) FROM dossiers; -- doit matcher JSON_ARRAY_LENGTH côté ancien

-- Garder l'ancien row 'dossiers-data' encore 30 jours en read-only pour rollback
-- (ne pas supprimer tout de suite)
```

**Impact code front** : 🔴 substantiel
- Remplacer toute la logique `window.storage.get('dossiers-data')` + `setDossiers([...])` par des requêtes Supabase directes
- Adapter le realtime listener pour la nouvelle table
- Adapter les écritures (un row par dossier, pas un seul gros JSON)

→ Estimé : 2-3 jours de dev front + 1 jour de tests.

---

## ⚠️ Risques + plan de rollback

### Risque 1 : Migration data corrompue
- **Mitigation** : Snapshot Supabase complet AVANT exécution (Settings → Database → Backups → Take snapshot)
- **Rollback** : restaurer le snapshot. Garder `dossiers-data` (l'ancien row) en read-only pour vérifier le count des deux côtés post-migration.

### Risque 2 : Code front cassé après split
- **Mitigation** : Implémenter le code front en branche, le tester contre une copie de la base de prod (Supabase clone project), puis déployer
- **Rollback** : revert du commit. Les anciennes lectures depuis `dossiers-data` re-deviennent la source de vérité.

### Risque 3 : Policy trop stricte → blocage user légitime
- **Mitigation** : Lancer Phase 1 en mode "log only" via un trigger qui logge sans bloquer pendant 24h
- **Rollback** : drop les policies Phase 1, restaurer les 4 wide-open du SUPABASE_SETUP.sql

### Risque 4 : auth.user_role() renvoie NULL si user créé sans metadata
- **Mitigation** : Migration des users existants pour ajouter le role dans user_metadata. Default = 'user' (read-only) si NULL.
- **Test** : créer un user de test sans role, vérifier qu'il ne voit rien.

---

## ✅ Critères d'acceptation

Avant de considérer la migration RLS terminée :

- [ ] Phase 1 déployée en prod (DELETE admin-only)
- [ ] Phase 2 déployée en prod (settings restricted)
- [ ] Phase 3 déployée en staging (Supabase clone project)
- [ ] Tests manuels avec chaque rôle (admin, secrétaire, commercial, poseur, régie) → chaque rôle voit ce qu'il doit voir, rien de plus
- [ ] Backup complet pre-Phase-3 vérifié restauré sur un autre projet test
- [ ] Documentation utilisateur mise à jour (qui peut voir quoi)
- [ ] Audit log activé sur les opérations sensibles (DELETE, UPDATE de dossiers d'autres users)

---

## 🚀 Quick-start recommandé pour Rodney

**Cette semaine** :
1. Prendre un **snapshot Supabase** (Database → Backups → Take snapshot)
2. Exécuter **Phase 1** seule (lockdown DELETE) — risque quasi-nul, gain immédiat
3. Vérifier en console que je ne peux plus supprimer en tant que poseur

**Sprint suivant** :
4. Exécuter **Phase 2** (settings restricted) — risque faible, gain moyen
5. Tester en compte secrétaire que les tarifs restent éditables, en poseur que les tarifs sont en lecture seule

**Sprint suivant +1** :
6. Mettre en place un **clone Supabase** (Supabase Dashboard → New Project → Restore from backup)
7. Implémenter **Phase 3** sur le clone, tester à fond
8. Déployer en prod un dimanche soir, downtime ~30 min, avec script de rollback prêt

---

## 📞 Si problème pendant la migration

1. Drop toutes les policies créées : `DROP POLICY <name> ON storage;`
2. Restaurer les policies du SUPABASE_SETUP.sql (wide-open)
3. Le CRM redevient fonctionnel comme avant — pas d'autre changement nécessaire
4. Restaurer le snapshot si data corrompue

Le pire scénario reste un retour à l'état actuel (mauvais sur la sécu, mais fonctionnel).
