# Sync Sheets → CRM Solaire — guide d'installation

Objectif : quand une cellule est modifiée dans un sheet (Yolico ou Elsun),
le dossier correspondant dans le CRM Solaire est mis à jour en quelques
secondes — sans import/annul.

Architecture : Google Apps Script `onEdit` → API `/api/sheet-sync` du CRM
→ merge du dossier matché par `id` + `societe`.

---

## Étape 1 — Générer un secret partagé

Ce secret protège l'API (sinon n'importe qui pourrait pousser des modifs
dans ton CRM via la route publique).

Dans un terminal Mac/Linux :

```bash
openssl rand -hex 32
```

Tu obtiens une chaîne de 64 caractères type
`a1b2c3d4...`. **Copie-la**, on s'en sert deux fois (Vercel + Apps
Script).

---

## Étape 2 — Ajouter la variable côté Vercel

1. Va sur https://vercel.com/haddad770/crm-solaire/settings/environment-variables
2. **Add Environment Variable** :
   - **Key** : `SHEET_SYNC_SECRET`
   - **Value** : le secret généré à l'étape 1
   - **Environments** : coche **Production** (au minimum)
3. Save.
4. **Redeploy** : onglet **Deployments** → `⋯` sur le dernier → **Redeploy**.

> ⚠️ Sans cette variable, la route renvoie `500 SHEET_SYNC_SECRET missing`.

---

## Étape 3 — Installer le script dans chaque sheet

À répéter **2 fois** : une pour le sheet Yolico, une pour le sheet
Elsun.

### 3.1 — Ouvrir l'éditeur Apps Script

Dans le sheet → menu **Extensions** → **Apps Script**.

### 3.2 — Coller le script

- Dans l'éditeur, supprime le code par défaut (`function myFunction() {}`).
- Ouvre le fichier `SHEET_SYNC_SCRIPT.gs` (dans le repo du CRM) → copie tout
  son contenu → colle-le.
- Renomme le projet en haut (cliquer sur "Projet sans titre") → `Sync CRM`.
- **Ctrl/Cmd + S** pour sauver.

### 3.3 — Adapter `FEUILLE_DOSSIERS`

En haut du script, ligne `var FEUILLE_DOSSIERS = 'TABLEAU INSTA';`.
Vérifie que c'est bien le nom **exact** de l'onglet où sont tes dossiers
clients. Si l'onglet s'appelle autrement, mets le bon nom.

### 3.4 — Renseigner les Script Properties

Toujours dans l'éditeur Apps Script :
- Menu de gauche → engrenage ⚙️ **Paramètres du projet**
- Section **Script Properties** → **Add script property** (× 3) :

| Property         | Value (sheet Yolico)                  | Value (sheet Elsun)                  |
|------------------|---------------------------------------|--------------------------------------|
| `CRM_URL`        | `https://crm-solaire.vercel.app`      | `https://crm-solaire.vercel.app`     |
| `CRM_SECRET`     | (le secret de l'étape 1, identique)   | (le même secret)                     |
| `SHEET_SOCIETE`  | `yolico`                              | `elsun`                              |

**Save**.

### 3.5 — Autoriser le script et installer le trigger

- Retour dans l'éditeur de code.
- Dans la barre du haut, sélectionne la fonction **`installerDeclencheurs`**
  (dropdown à gauche du bouton "Exécuter").
- Clique **Exécuter**.
- Une fenêtre Google s'ouvre : **Réviser les autorisations** → choisir ton
  compte → "Avancé" → **Accéder à Sync CRM (non sécurisé)** → **Autoriser**.
  (« Non sécurisé » = Google ne connaît pas ton script, c'est normal pour
  un script perso.)
- Re-clique **Exécuter** si nécessaire.
- Dans les **Logs** (menu **Exécution**), tu dois voir :
  `Trigger onEditInstallable installé ✅`

---

## Étape 4 — Tester sur 1 ligne

### 4.1 — Test manuel depuis Apps Script

- Dans l'éditeur, sélectionne la fonction **`testSyncRowManuel`**.
- (Optionnel) Adapte la variable `ROW_A_TESTER = 2;` pour pointer une
  ligne qui correspond à un dossier que tu reconnais.
- Clique **Exécuter**.
- Onglet **Exécutions** (ou **Logs**) → tu dois voir :
  ```
  [sheet-sync] OK row=2 id=68975 code=200 applied=10
  ```

Si tu vois `FAIL code=401` → secret pas le même des deux côtés.
Si tu vois `FAIL code=404` → l'id du sheet n'existe pas dans le CRM
(le 1er import n'a pas créé ce dossier).

### 4.2 — Test en vrai : cocher PAYER

- Ouvre le sheet, trouve un client qui n'est **pas** payé.
- Dans le CRM, va sur ce client (filtre par nom). Note son état actuel
  (par exemple "À recevoir").
- Reviens sur le sheet, coche **PAYER** (colonne R) sur sa ligne.
- Compte jusqu'à 5.
- Recharge le CRM. Le client doit être passé à "Payé".

Si ça marche : refais l'étape 3 pour l'autre sheet, et tu as ta sync
temps réel ✅.

---

## Champs synchronisés (Phase 1)

Le script ne pousse QUE ce qui est mappé. Tout le reste est ignoré.

| Col sheet | Champ CRM            | Note                                           |
|-----------|----------------------|------------------------------------------------|
| B         | `id`                 | Clé de matching, jamais modifiée               |
| C         | `dateInsta`          |                                                |
| D         | (consuel accepté)    | TRUE → `consuel=true`, `statutConsuel='accepté'` |
| E         | `consuel`            | TRUE → envoyé Consuel                          |
| F         | `statut`             | Mappé sur les statuts CRM                      |
| H         | `nom`                |                                                |
| I         | `prenom`             |                                                |
| K         | `financement`        | SOFINCO / PROJEXIO / etc.                      |
| L         | `montantTotal`       | TTC                                            |
| N         | `montantHtCustom`    |                                                |
| O         | `payeClientDate`     |                                                |
| R         | `payeClient`         | La fameuse case "PAYER"                        |
| S         | `puissance` + produit | en Wc, regénère un PANNEAU_SOLAIRE             |

**Volontairement NON synchronisés** depuis le sheet :
- Documents / factures uploadées (gérés exclusivement dans le CRM)
- Tableaux fournisseurs / régies / poseurs (préférable de les gérer dans
  le CRM car ils sont liés à des permissions, factures, Pennylane…)
- Historique, observations, photos chantier
- Statuts pose (`statutPose`) — risque de conflit avec le workflow CRM

Si tu veux étendre, on ajoute des entrées dans `MAPPING` côté script ET
des entrées dans `SYNCABLE_FIELDS` côté API.

---

## Désactiver la sync

Quand tu seras prêt à basculer 100% sur le CRM :

- Côté Apps Script : menu **Déclencheurs** (icône horloge à gauche) →
  supprime le trigger `onEditInstallable` sur chaque sheet.
- Côté Vercel : pas besoin de toucher (la route reste, juste plus
  appelée).
- Tu peux aussi supprimer la variable `SHEET_SYNC_SECRET` côté Vercel
  pour fermer définitivement la route, ce qui retournera 500 à toute
  tentative.

---

## Dépannage rapide

| Symptôme                              | Cause probable                                       | Fix                                                   |
|---------------------------------------|------------------------------------------------------|-------------------------------------------------------|
| Rien ne se passe quand je modifie     | Trigger non installé                                 | Re-lancer `installerDeclencheurs`                     |
| Logs : `Configuration manquante`      | Une des 3 Script Properties est absente              | Vérifier l'étape 3.4                                  |
| API renvoie 401                       | Secret différent côté Vercel et Apps Script          | Recopier exactement, sans espace                      |
| API renvoie 404                       | id du sheet pas trouvé dans le CRM                   | Le dossier n'a pas été importé. Faire un nouvel import |
| Modifs en cascade qui spam            | Formule qui se recalcule                             | Le debounce 2s normalement filtre. Si non, m'écrire.  |
