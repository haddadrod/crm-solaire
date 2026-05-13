# CRM Solaire — Documentation fonctionnelle exhaustive

> Document de référence décrivant **précisément tout ce qu'il est possible de faire** dans le CRM Solaire dans son état actuel.
> Toutes les références de code pointent vers les fichiers source (chemin + ligne).
> Cible : panneaux photovoltaïques, suivi B2C (signature → pose → Consuel → paiement → TVA).

---

## Table des matières

1. [Vue d'ensemble & stack technique](#1-vue-densemble--stack-technique)
2. [Authentification & lancement de l'app](#2-authentification--lancement-de-lapp)
3. [Stockage & modèle de données](#3-stockage--modèle-de-données)
4. [Modèle d'un dossier](#4-modèle-dun-dossier)
5. [Permissions & rôles](#5-permissions--rôles)
6. [Onglet « Dossiers » & « Archivés »](#6-onglet-dossiers--archivés)
7. [Formulaire de saisie d'un dossier](#7-formulaire-de-saisie-dun-dossier)
8. [Modale Documents](#8-modale-documents)
9. [Modale Historique](#9-modale-historique)
10. [Panneau Aperçu rapide (QuickView)](#10-panneau-aperçu-rapide-quickview)
11. [Recherche globale Ctrl+K](#11-recherche-globale-ctrlk)
12. [Barre d'alertes & modale](#12-barre-dalertes--modale)
13. [Onglet « Calendrier »](#13-onglet-calendrier)
14. [Onglet « Rapport paiements »](#14-onglet-rapport-paiements)
15. [Onglet « Tableau de bord »](#15-onglet-tableau-de-bord)
16. [Onglet « Réglages »](#16-onglet-réglages)
17. [Import de dossiers](#17-import-de-dossiers)
18. [Dialogue PIN admin](#18-dialogue-pin-admin)
19. [Constantes métier (référence)](#19-constantes-métier-référence)
20. [Calculs automatiques (`enrichDossier`)](#20-calculs-automatiques-enrichdossier)
21. [Architecture des fichiers](#21-architecture-des-fichiers)

---

## 1. Vue d'ensemble & stack technique

CRM mono-page (SPA) pour piloter une activité de vente/pose de panneaux solaires : suivi du dossier client de bout en bout (contrôle qualité → financement → pose → Consuel → paiement client → récupération TVA), gestion des commissions internes et externes (poseurs, régies, fournisseurs, équipe interne), reporting, alertes.

**Stack** :
- **Frontend** : React 18 + Vite ([package.json](package.json))
- **Style** : Tailwind CSS 3.4 + dégradés violet/rose/orange ([tailwind.config.js](tailwind.config.js), [src/index.css](src/index.css))
- **Icônes** : `lucide-react`
- **Backend** : Supabase (Auth + Postgres key/value)
- **Build/Dev** : `npm run dev` (port 3000), `npm run build`, `npm run preview` ([vite.config.js](vite.config.js))

**Particularité d'architecture** : presque toute la logique applicative tient dans un seul fichier [src/components/DossierSaisie.jsx](src/components/DossierSaisie.jsx) (~8 100 lignes, ~40 composants). Ce n'est pas idéal mais c'est l'état du projet.

---

## 2. Authentification & lancement de l'app

### Flux

1. Au chargement, [src/App.jsx:8](src/App.jsx) appelle `setupStorage()` pour installer `window.storage`.
2. [src/App.jsx:16](src/App.jsx) appelle `supabase.auth.getSession()` pour restaurer une éventuelle session.
3. Tant que la session est en cours de vérification → spinner `☀️ Chargement…` ([src/App.jsx:32-40](src/App.jsx)).
4. Si pas d'utilisateur → écran [Login](src/Login.jsx).
5. Sinon → `DossierSaisie` + bandeau utilisateur en haut à droite avec bouton 🚪 déconnexion ([src/App.jsx:50-60](src/App.jsx)).
6. Listener `supabase.auth.onAuthStateChange` ([src/App.jsx:21-24](src/App.jsx)) met l'état à jour en temps réel.

### Login

- Formulaire **email + mot de passe** uniquement, pas d'auto-inscription ([src/Login.jsx:45-83](src/Login.jsx)).
- Appel `supabase.auth.signInWithPassword()` ([src/Login.jsx:15-18](src/Login.jsx)).
- Erreur "Invalid login credentials" traduite en "Email ou mot de passe incorrect" ([src/Login.jsx:20-22](src/Login.jsx)).
- Création des comptes utilisateur : **via UsersManager dans Réglages** (cf. §16) ou manuellement dans Supabase → Authentication → Users.

### Déconnexion

- Bouton 🚪 → `supabase.auth.signOut()` ([src/App.jsx:52-58](src/App.jsx)).

### Variables d'environnement requises

À placer dans un fichier `.env` à la racine ([src/supabase.js:5-12](src/supabase.js)) :

```
VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Sans elles, l'app log une erreur en console et le client Supabase ne fonctionnera pas.

### Prérequis de lancement

1. Compte Supabase + projet créé.
2. Exécuter le script [SUPABASE_SETUP.sql](SUPABASE_SETUP.sql) une fois (crée la table `storage` + RLS).
3. Au moins un utilisateur créé (Supabase → Auth → Users → Add user).
4. `.env` configuré.
5. `npm install && npm run dev`.

---

## 3. Stockage & modèle de données

### Table unique côté Supabase : `storage`

Définie par [SUPABASE_SETUP.sql:13-17](SUPABASE_SETUP.sql) :

| Colonne | Type | Rôle |
|---|---|---|
| `key` | TEXT PRIMARY KEY | identifiant logique |
| `value` | TEXT | JSON sérialisé |
| `updated_at` | TIMESTAMPTZ | maj auto |

**RLS** ([SUPABASE_SETUP.sql:19-46](SUPABASE_SETUP.sql)) : tous les utilisateurs authentifiés peuvent SELECT / INSERT / UPDATE / DELETE. Aucun accès anonyme. Index sur `key`.

### API `window.storage`

Définie dans [src/storage.js](src/storage.js), installée globalement par `setupStorage()` :

- `await window.storage.get(key)` → `{ key, value }` ou `null`
- `await window.storage.set(key, value)` → upsert
- `await window.storage.delete(key)` → suppression
- `await window.storage.list(prefix)` → `{ keys, prefix }`

**localStorage n'est pas utilisé** : tout transite par Supabase, donc les données suivent l'utilisateur sur n'importe quel appareil.

### Clés persistées par l'app

Au chargement (premier `useEffect` de `DossierSaisie`, [src/components/DossierSaisie.jsx:379](src/components/DossierSaisie.jsx)), l'app lit puis hydrate plusieurs clés :

- `dossiers` (liste des dossiers)
- `statutsOrder` (ordre d'affichage des statuts)
- `tarifsPoseurs`, `tarifsRegies` (grilles tarifaires par puissance)
- `tarifsInternes`, `nomsInternes` (équipe interne)
- `listeFournisseurs`
- `produits` (catalogue produits)
- `users` (profils locaux pour le sélecteur d'utilisateur courant)
- `adminPin` (PIN d'accès admin)
- `currentUser` (nom de l'utilisateur courant choisi dans le sélecteur)

Plusieurs `useEffect` ([src/components/DossierSaisie.jsx:554-600](src/components/DossierSaisie.jsx)) re-persistent automatiquement à chaque changement (autosave).

### Stockage des fichiers (documents)

Les fichiers (PDF, photos) sont stockés sous forme de **data URL en base64** dans `window.storage` (clé liée à l'ID du document), avec une **limite de ~3,7 Mo par fichier** ([src/components/DossierSaisie.jsx:63](src/components/DossierSaisie.jsx)).

> Pas de bucket Supabase Storage à proprement parler — c'est la table `storage` qui sert de blobstore via base64. C'est une limitation à connaître pour les gros PDF.

---

## 4. Modèle d'un dossier

Un dossier est un objet JSON dont la structure de base (`emptyForm`) est définie en [src/components/DossierSaisie.jsx:324-373](src/components/DossierSaisie.jsx).

### Identifiant & dates principales
`id`, `dateInsta` (pose), `dateSignature`

### Client
`nom` (obligatoire), `prenom`, `telephone`, `email`, `adresse`, `codePostal`, `ville`

### Vente & financement
`statut`, `financement` (PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE)
`montantTotal` (TTC), `montantHtCustom` (HT custom), `tauxTvaVente` (20/10/5,5 — défaut 20)
`payeClient`, `payeClientDate`

### Produits & puissance
`produits` : tableau `{type, puissance, description, quantite}`
`puissance` : somme calculée des Wc des produits auto-tarif

### Étape 1 — Contrôle qualité (avant envoi banque)
`dateControleQualite`, `statutControleQualite` (`''` | `'ok'` | `'pas_ok'`), `vocalCQUrl` (lien audio)

### Étape 2 — Financement
`dateAccord`, `dateEnvoiFin`, `dateRetourFin`, `statutFin` (`'envoyé'` | `'accepté'` | `'refusé'`)
`envoisHistorique` : tableau des envois banque précédents (utile en cas de refus + renvoi à autre banque)

### Étape 3 — Pose
`dateEnvoiPose`, `dateVisitePose`, `statutPose` (`'envoyé'` | `'visite_ok'` | `'client_refuse'`)

### Originaux signés
`dateRecusOriginauxPoseur`, `dateEnvoiOriginauxBanque`, `dateRecusOriginauxBanque`
`pasOriginauxRequis` (booléen — court-circuit si banque ne les exige pas)

### Étape 4 — Consuel
`dateConsuel` (planifiée), `dateEnvoiConsuel`, `dateAccordConsuel`, `statutConsuel`
`visitesConsuel` : tableau de visites/contre-visites `{date, resultat, note}`

### Étape 5 — Paiement
`dateControleLivraison`, `dateAppelBanque`, `datePaiementBanque`

### Récupération TVA client (délai légal 6 mois)
`tvaStatus` (`''` | `'envoyee'` | `'recuperee'` | `'non_concerne'`)
`tvaDateDemarche`, `tvaDateRecuperee`, `tvaNotes`

### Régies (multi)
`typeRegie` (`'externe'` | `'interne'`)
`regies` : tableau `{nom, htCustom, paye, datePaye, bl, factureNo, facturePdfUrl}` (externe)
Champs legacy (régie unique) : `regie`, `regieHtCustom`, `regiePaye`, `regieDatePaye`

### Poseurs (multi)
`poseurs` : tableau `{nom, htCustom, paye, datePaye, bl, factureNo, facturePdfUrl}`

### Fournisseurs (multi)
`fournisseurs` : tableau `{nom, htCustom, paye, datePaye, bl, factureNo, facturePdfUrl}`

### Équipe interne (commissions, 5 rôles)
Pour chaque rôle (`teleprospecteur`, `confirmateur`, `commercial`, `coordinateurProjet`, `responsableEnvoiPose`) :
- `<role>` : nom de la personne
- `<role>Montant` : montant de commission
- `<role>Paye` : booléen
- `<role>DatePaye` : date

### Métadonnées & suivi
`provenanceLead` (Site web, Facebook, Google Ads, Bouche à oreille, Salon/Foire, Téléprospection, Recommandation client, Référenceur, Autre)
`accordDef`, `consuel` (booléens flag)
`observations` (texte libre)
`historique` : tableau `{date, from, to, action, user}`
`createdBy`, `createdAt`, `modifiedBy`, `modifiedAt`
`documents` : tableau des fichiers attachés
`archived`, `archivedAt`, `autoArchived`, `manualArchive`, `reprisDuArchive`

---

## 5. Permissions & rôles

Définies dans le composant principal [src/components/DossierSaisie.jsx:236-322](src/components/DossierSaisie.jsx).

### Mode admin (PIN)

Si `adminPin` est vide → l'app est en mode admin par défaut. Si un PIN est configuré, l'utilisateur passe en mode équipe et doit fournir le PIN pour repasser admin.

L'admin a **accès total**, y compris :
- voir/modifier marges, BL, factures, prix coût
- supprimer un dossier
- modifier tous les dossiers (même ceux non créés par lui)
- onglets Rapport paiements, Tableau de bord, Réglages
- cocher les paiements
- gérer les utilisateurs

### Rôles d'équipe (non-admin)

Définis comme presets dans [UsersManager](src/components/DossierSaisie.jsx) (lignes ~3872) :

| Rôle | Emoji | Filtre dossiers | Marges | BL/Factures | Créer | Suppr | Rapport pmt | Dashboard | Réglages | Cocher pmt | Voir CA |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Admin** | 👑 | tous | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Compta** | 💰 | tous | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| **Commercial** | 💼 | mes (créés par moi) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Poseur** | 🔧 | chantiers à poser | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Équipe (défaut)** | — | tous | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

Permissions implémentées : `voirTousDossiers`, `voirMarges`, `voirBLFactures`, `creerDossier`, `supprimerDossier`, `modifierTous`, `voirRapportPaiements`, `voirDashboard`, `voirReglages`, `cocherPaiements`, `voirCA`, `filtreDossiers`.

Lorsque l'utilisateur perd accès à un onglet, un `useEffect` ([src/components/DossierSaisie.jsx:599-604](src/components/DossierSaisie.jsx)) le rebascule vers `dossiers`.

---

## 6. Onglet « Dossiers » & « Archivés »

### Barre d'onglets ([src/components/DossierSaisie.jsx:1438-1444](src/components/DossierSaisie.jsx))

| Onglet | Visibilité | Couleurs |
|---|---|---|
| **Dossiers** | Tous | violet → rose, badge nb actifs |
| **Archivés** | Tous | gris, badge nb archivés |
| **Calendrier** | Tous | orange → rouge |
| **Rapport paiements** | `voirRapportPaiements` | emerald → teal, badge montant dû |
| **Tableau de bord** | `voirDashboard` | bleu → cyan, badge 🔔 nombre rappels |
| **Réglages** | `voirReglages` | gris foncé |

### Vue dossiers ([src/components/DossierSaisie.jsx:1492-1624](src/components/DossierSaisie.jsx))

Contenu :
- **Recherche** : champ texte, filtre instantané.
- **Filtre par statut** : repli/déplie ; chaque statut affiche son compteur ; bouton « Tous » ; case à cocher « Afficher les statuts vides ».
- **Tri** : Statut (défaut), Date récente, Montant (décroissant), Marge (décroissant), Nom (A → Z).
- **Mode d'affichage** : Compact (1 ligne) ou Détaillé (carte riche).
- **Bouton + Nouveau dossier** (admin / `creerDossier`).
- **Bouton 📥 Importer** (admin).

### Carte dossier (`DossierCard`, [src/components/DossierSaisie.jsx:1897-2149](src/components/DossierSaisie.jsx))

Affiche :
- Badge statut coloré
- ID + nom/prénom + téléphone + ville
- Montant TTC, puissance, financement
- Liste des poseurs / régies / fournisseurs
- Marge (admin)
- Activité récente (créé par / modifié par)

Actions :
- **📋 Copier l'ID** : copie une ligne TSV de 9 colonnes prête à coller dans Google Sheets (ID, date, nom, prénom, accord/consuel booléens, statut, financement, montant TTC/HT, puissance). Feedback visuel pendant 2 s ([src/components/DossierSaisie.jsx:808-815](src/components/DossierSaisie.jsx)).
- **✏️ Éditer** : ouvre `FormulaireDossier` en mode édition.
- **🗑️ Supprimer** (admin) : confirmation, nettoie aussi les documents associés.
- **📎 Documents** : ouvre `DocumentsModal`.
- **📜 Historique** : ouvre `HistoriqueModal`.
- **👁️ Aperçu rapide** : ouvre `QuickViewPanel` (slide-in à droite).

### Onglet Archivés

Même affichage mais avec `activeTab === 'archives'` ; les archivés sont **exclus des alertes**.

### Archivage automatique ([src/components/DossierSaisie.jsx:1711-1730](src/components/DossierSaisie.jsx))

Un dossier est **archivé automatiquement** quand `payeClient = true` ET poseurs, fournisseurs, régies, équipe interne sont tous payés. Champs posés : `archived=true`, `archivedAt=timestamp`, `autoArchived=true`.

**Désarchivage automatique** ([src/components/DossierSaisie.jsx:407-412](src/components/DossierSaisie.jsx)) si le statut passe à SAV, Litige, NRP CQ Livraison ou Contrôle livraison banque — sauf si `manualArchive=true`. Pose un timestamp `reprisDuArchive`.

### Animations

- Sauvegarde réussie → overlay flottant « 🎉 Dossier enregistré ! » 1,5 s ([src/components/DossierSaisie.jsx:701-703](src/components/DossierSaisie.jsx)).
- Animation `celebrating` pour bonnes nouvelles ([src/components/DossierSaisie.jsx:198](src/components/DossierSaisie.jsx)).

### Raccourcis clavier

- **Ctrl+K** : ouvre la recherche globale ([src/components/DossierSaisie.jsx:1358-1364](src/components/DossierSaisie.jsx)).

---

## 7. Formulaire de saisie d'un dossier

`FormulaireDossier`, [src/components/DossierSaisie.jsx:4409-5557](src/components/DossierSaisie.jsx). Modale plein écran, organisé en **12 sections**.

### Liste des sections

| # | Titre | Couleur | Repliable ? | Visibilité |
|---|---|---|---|---|
| 1 | 👤 Identité & Coordonnées | violet | non | toujours |
| 2 | 🏠 Produits installés | amber | non | toujours |
| 3 | 💰 Prix de vente & Financement | bleu | non | toujours |
| 4 | 🤝 Régie | purple | non | toujours |
| 5 | 🔧 Poseurs | emerald | oui (replié en édition) | toujours |
| 6 | 📦 Fournisseurs | emerald | oui (replié en édition) | toujours |
| 7 | 👥 Équipe interne | purple | oui (replié) | si `typeRegie === 'interne'` |
| 8 | 📍 Provenance du lead | cyan | non | si `typeRegie === 'interne'` |
| 9 | 📅 Process du dossier | bleu | oui (replié en édition) | toujours |
| 10 | 📊 Statut du dossier | rose | oui (replié en édition) | toujours |
| 11 | Marges | dégradé violet | non | admin uniquement |
| 12 | 📝 Observations | slate | oui (replié si vide) | toujours |

### Détail section 1 : Identité & Coordonnées
ID, **nom** (obligatoire, désactive le bouton Créer/Enregistrer si vide), prénom, téléphone, email, adresse, code postal, ville.

### Détail section 2 : Produits installés
Liste éditable. Chaque ligne :
- Type (dropdown sur catalogue `produits`)
- Si `autoTarif` (panneaux solaires) → choix de puissance dans 20 valeurs (2000 à 18000 Wc)
- Sinon → quantité
- Description optionnelle
- Bouton Supprimer

### Détail section 3 : Prix de vente & Financement
- Montant TTC (obligatoire)
- Financement (dropdown sur `FINANCEMENTS`)
- Taux TVA (20 / 10 / 5,5)
- Affichage HT calculé OU HT custom
- TVA affichée
- Toggle **« Payé par le financeur »** (admin) → bascule statut + dates

### Détail section 4 : Régie
- Toggle Externe / Interne
- Si externe : multi-régies, chaque ligne nom + HT custom + bouton À payer / Payé
- Si interne : message informatif (les commissions sont gérées en section Équipe interne)

### Détail section 5 : Poseurs
Multi-lignes. Chaque ligne : nom (dropdown), HT custom, paiement.
**Admin uniquement** : BL, N° facture, lien PDF facture.

### Détail section 6 : Fournisseurs
Identique au schéma poseurs.

### Détail section 7 : Équipe interne
Pour chacun des 5 rôles : sélecteur de nom (depuis `nomsInternes[role]`) + saisie manuelle possible, montant commission (auto ou custom), toggle paiement. Bandeau total commissions / payé / reste.

### Détail section 8 : Provenance du lead
Dropdown `PROVENANCES_LEAD`. Champ « Détail » si l'option choisie est « Autre ».

### Détail section 9 : Process du dossier (5 sous-étapes)

1. **1️⃣ Contrôle qualité** ([src/components/DossierSaisie.jsx:5012-5077](src/components/DossierSaisie.jsx)) : date appel CQ + 3 boutons (En attente / Validé / Refusé) + URL vocal CQ (audio player).
2. **2️⃣ Financement** ([src/components/DossierSaisie.jsx:5080-5171](src/components/DossierSaisie.jsx)) : dates envoi/retour/accord, 3 boutons (Envoyé / Accepté / Refusé), si refusé → bouton « Renvoyer à autre banque » qui archive l'envoi dans `envoisHistorique` et permet de saisir un nouveau financeur ; alerte timing.
3. **3️⃣ Pose** ([src/components/DossierSaisie.jsx:5174-5238](src/components/DossierSaisie.jsx)) : dates envoi/visite/pose + 3 boutons (En attente / Posé / Refus client).
4. **4️⃣ Consuel** ([src/components/DossierSaisie.jsx:5241-5369](src/components/DossierSaisie.jsx)) : dates envoi/accord, ajout dynamique de visites/contre-visites (date + résultat + note), résultat global, alerte > 7 j sans accord.
5. **5️⃣ Paiement** ([src/components/DossierSaisie.jsx:5372-5407](src/components/DossierSaisie.jsx)) : contrôle livraison, appel banque, paiement reçu.

### Détail section 10 : Statut du dossier
- Sélecteur de statut (ordre selon `statutsOrder`)
- Barre d'activité : créé par + modifié par + date dernier changement

### Détail section 11 : Marges (admin)
TTC, HT, TVA — purement calculé.

### Détail section 12 : Observations
Textarea libre.

### Calculs en temps réel (prop `calculs`)

Disponibles : `calculs.puissance`, `calculs.useAutoTarif`, `calculs.tauxTva`, `calculs.poseursDetail[]`, `calculs.poseurHt`, `calculs.poseurTtc`, `calculs.regiesDetail[]`, `calculs.regieHt`, `calculs.regieTtc`, `calculs.fournisseursDetail[]`, `calculs.fournisseurHt`, `calculs.fournisseurTtc`, `calculs.margeTtc`, `calculs.margeHt`, `calculs.tva`.

### Validation

Le seul champ obligatoire bloquant est `nom` (le bouton Créer/Enregistrer est désactivé si vide, [src/components/DossierSaisie.jsx:5549](src/components/DossierSaisie.jsx)).

---

## 8. Modale Documents

`DocumentsModal`, [src/components/DossierSaisie.jsx:2161-2419](src/components/DossierSaisie.jsx).

### Catégories ([src/components/DossierSaisie.jsx:2171-2186](src/components/DossierSaisie.jsx))

4 catégories accessibles selon le rôle :
- **Client** (tous) : contrats, bons de commande, mandats
- **Poseur** (admin) : factures par poseur
- **Régie** (admin) : factures de la régie
- **Fournisseur** (admin) : factures par fournisseur

### Limites & types

- Taille max : **~3,7 Mo / fichier** ([src/components/DossierSaisie.jsx:63](src/components/DossierSaisie.jsx))
- Types : `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, `.gif`

### Upload

- Drag & drop ou clic ([src/components/DossierSaisie.jsx:2609-2650](src/components/DossierSaisie.jsx)) — feedback visuel violet pendant le drag.
- Un seul fichier à la fois.

### Aperçu (`FilePreviewOverlay`, [src/components/DossierSaisie.jsx:2423-2490](src/components/DossierSaisie.jsx))

- **Images** : rendu direct.
- **PDF** : via `PdfViewer` qui charge PDF.js depuis CDN et rend chaque page comme image (scale adaptatif, max 1400 px).
- **Autre** : message « télécharger pour consulter ».

### Actions par document ([src/components/DossierSaisie.jsx:2683-2715](src/components/DossierSaisie.jsx))

- Ouvrir (overlay plein écran)
- Télécharger (génère un blob URL + élément `<a download>`)
- Supprimer (avec confirmation)
- **Métadonnées éditables** (sur expansion) : montant TTC (€) optionnel, date pièce, note libre (N° facture, BC, etc.)

---

## 9. Modale Historique

`HistoriqueModal`, [src/components/DossierSaisie.jsx:6177-6275](src/components/DossierSaisie.jsx).

Affiche en timeline inversée (du plus récent au plus ancien) :
- `date` (ISO) formatée `JJ mois AAAA à HH:MM` en français
- `action` (`'création'` ou `'changement_statut'`)
- `from` / `to` statuts (label + couleur + emoji)
- `user` (nom de l'utilisateur qui a fait l'action)

Pastille de couleur pour chaque événement.

> Seuls les **changements de statut** et la création sont historisés. Les autres modifications de champs ne sont **pas** loggées dans cet historique (mais `modifiedBy` / `modifiedAt` sont mis à jour).

---

## 10. Panneau Aperçu rapide (QuickView)

`QuickViewPanel`, [src/components/DossierSaisie.jsx:6276-7354](src/components/DossierSaisie.jsx). Slide-in droit, 420 px, scrollable, **éditable en lecture/écriture**.

### Sections affichées

1. **En-tête** ([src/components/DossierSaisie.jsx:6392-6445](src/components/DossierSaisie.jsx)) : nom/prénom/ID, gradient du statut, sélecteur de statut (dropdown éditable), 3 boutons (📎 Docs / 📜 Historique / ✏️ Tout éditer), bouton Archiver/Désarchiver.
2. **Coordonnées** : téléphone (lien `tel:`), email (lien `mailto:`), adresse complète.
3. **Process du dossier** — 5 étapes éditables sur place (CQ, Financement, Pose, Consuel, Paiement) — mêmes contrôles que dans le formulaire complet, plus :
   - 📞 **Récup TVA** : statuts `envoyée` / `récupérée` / `non concernée`, calcul automatique des jours restants sur les 6 mois légaux, badge urgence (rouge si dépassé, orange si ≤ 7 j).
4. **Produits** : liste avec ajout / suppression.
5. **Montants** (admin) : TTC + marge.
6. **Régies** (sauf interne) : édition multi-régies.
7. **Équipe interne** (admin si `typeRegie='interne'`) : commissions par rôle.
8. **Poseurs** : multi, prix HT, BL, facture (admin).
9. **Fournisseurs** : idem.

### Mécaniques

- `onUpdate(field, value)` met à jour le dossier en temps réel.
- `scrollTo` (passé par les alertes / le dashboard) scrolle vers la section correspondante avec un flash anneau violet ([src/components/DossierSaisie.jsx:6295-6311](src/components/DossierSaisie.jsx)).
- `onShowDocs`, `onShowHist`, `onEdit` ouvrent les modales liées.

---

## 11. Recherche globale Ctrl+K

`GlobalSearchModal`, [src/components/DossierSaisie.jsx:7355-7522](src/components/DossierSaisie.jsx).

### Champs fouillés (avec scoring pondéré)

| Champ | Poids |
|---|---|
| `id` | 4 |
| `nom`, `prenom` | 3 |
| `telephone`, `email`, `ville` | 2 |
| `adresse`, `codePostal`, `observations`, `regie` | 1 |
| `poseurs[].nom`, `fournisseurs[].nom`, `fournisseurs[].bl`, `fournisseurs[].factureNo` (admin) | 1 |

### Scoring
- Match exact : +100 × poids
- Commence par : +50 × poids
- Contient : +20 × poids

### UX
- Si query vide → 10 dossiers récents.
- Sinon → top 30 triés par score.
- Navigation ↑/↓ + **Entrée** pour ouvrir le QuickView du sélectionné.
- Affichage des **champs matchés en badges violets**.

---

## 12. Barre d'alertes & modale

`AlertesBar`, [src/components/DossierSaisie.jsx:7750-7911](src/components/DossierSaisie.jsx). Barre toujours visible en haut, badges pulsants.

### 10 types d'alertes

| Type | Label | Emoji | Admin only | Condition |
|---|---|---|---|---|
| `controleQualite` | Contrôle qualité | 📋 | non | Dossiers à valider/refuser (appel client) |
| `aEnvoyerBanque` | À envoyer banque | 🏦 | non | CQ validé, en attente d'envoi banque |
| `financement` | Financement | 💳 | non | Banques sans retour depuis +2 j |
| `aEnvoyerPose` | À envoyer pose | 📦 | non | Accord banque obtenu, à transmettre au poseur |
| `aEnvoyerConsuel` | À envoyer Consuel | 📨 | non | Pose terminée, Consuel à initier |
| `originaux` | Originaux | 📑 | non | Originaux signés à gérer (poseur → toi → banque) |
| `controle` | Contrôle livraison | 📞 | non | Consuel reçu, contrôle livraison à faire |
| `paiement` | Paiement | 💰 | **oui** | Paiement non reçu +2 j après contrôle |
| `recup_tva` | Récup TVA | 💰 | non | Démarches TVA (6 mois après paiement) |
| `stagnation` | Stagnation | ⏰ | non | Dossier bloqué : 30 j par défaut, 45 j attente Consuel, 7 j pour Consuel/NRP CQ/Litige |

Clic sur un badge → `AlertesModal` ([src/components/DossierSaisie.jsx:7912-8116](src/components/DossierSaisie.jsx)) qui liste les dossiers concernés, triés par urgence (jours décroissants ou jours restants croissants pour TVA). Chaque ligne ouvre le QuickView du dossier sélectionné.

---

## 13. Onglet « Calendrier »

`CalendrierView`, [src/components/DossierSaisie.jsx:7523-7749](src/components/DossierSaisie.jsx).

- Grille mensuelle classique (Lun-Dim, 6 semaines, cases min-height 90 px).
- 3 types d'événements en fonction de 3 dates clés :
  - 🔧 **Pose** (`dateInsta`) — orange
  - ✅ **Accord** (`dateAccord`) — vert
  - ⚡ **Consuel** (`dateConsuel`) — cyan
- Filtres : Poses / Accords / Consuel / Tout.
- Stats du mois (admin, filtre Poses) : nb de poses + CA.
- Navigation ◀ / ▶ + bouton « Aujourd'hui ».
- Aujourd'hui en violet plein.
- Max 3 événements visibles par case, sinon « +N autres ».
- Clic sur un événement → ouvre le QuickView du dossier.

---

## 14. Onglet « Rapport paiements »

`PaiementsView`, [src/components/DossierSaisie.jsx:2723-2912](src/components/DossierSaisie.jsx). Visible si `voirRapportPaiements`.

### 3 cartes synthétiques en tête

1. **✅ Reçu des financeurs** : total encaissé + à recevoir.
2. **⏳ Reste à payer** : total dû aux prestataires + déjà payé.
3. **💰 Trésorerie nette** : Reçu − Payé.

### Détail par financeur

Tableau ([src/components/DossierSaisie.jsx:2744-2823](src/components/DossierSaisie.jsx)) :
- Attendu / ✓ Reçu / ⏳ À recevoir
- Barre de progression (% reçu)
- Sous-liste expansible des dossiers en attente
- Couleurs : vert si tout payé, ambre si reste

### Détail par prestataire

Tableau ([src/components/DossierSaisie.jsx:2825-2912](src/components/DossierSaisie.jsx)) :
- Trois stats globales en haut : **🔥 À payer maintenant**, **💜 Payé d'avance**, **⏸️ Bloqué par financeur**
- Par prestataire (Fournisseur / Régie / Interne) : Dû, Payé, À payer, Avance, Bloqué
- Détails par dossier avec statut (émoji + fond coloré)

### Section « Prestataires à payer »

`PrestatairesPayerSection`, [src/components/DossierSaisie.jsx:2926-2997](src/components/DossierSaisie.jsx) :
- Liste des paiements attendus (top 30)
- Filtres : tous / externes / internes
- Tri : anciens d'abord / montants
- Affiche jours d'attente, montant, type
- Clic → ouvre le QuickView

---

## 15. Onglet « Tableau de bord »

`DashboardView`, [src/components/DossierSaisie.jsx:2999-3439](src/components/DossierSaisie.jsx). Visible si `voirDashboard`.

### 4 cartes en tête ([src/components/DossierSaisie.jsx:3015-3048](src/components/DossierSaisie.jsx))

- **Ce mois** : nb dossiers + CA
- **Mois précédent** : nb dossiers + CA
- **Marge ce mois** (TTC)
- **Évolution** : % CA / mois précédent

### Listes de rappels ([src/components/DossierSaisie.jsx:3050-3268](src/components/DossierSaisie.jsx))

- 💳 **Financements en attente** (+2 j sans retour, 3 niveaux : critical / high / amber)
- 💰 **Paiements en attente** après contrôle livraison (+2 j)
- 🚛 **Dossiers qui stagnent** (seuils variables selon statut : 7/30/45 j)
- 👥 **Rappels financeurs en retard** (+30 j sans paiement)
- 🔥 **Prestataires à payer** (avec filtres / tri)

### Performances ([src/components/DossierSaisie.jsx:3270-3437](src/components/DossierSaisie.jsx))

- **🔧 Poseurs** : top par CA, coût total, marge %.
- **🤝 Régies** : idem.
- Médailles 🥇🥈🥉 pour le top 3.

### Activité par utilisateur

Pour chaque utilisateur : nb dossiers créés, modifiés, changements de statut, dernière activité, CA apporté, barre de progression % de l'activité totale.

---

## 16. Onglet « Réglages »

`ReglagesView`, [src/components/DossierSaisie.jsx:3440-4407](src/components/DossierSaisie.jsx). Admin uniquement.

### 7 sections gérables

1. **Statuts** ([src/components/DossierSaisie.jsx:3509-3556](src/components/DossierSaisie.jsx)) : réordonnancement via flèches ↑/↓ ; nb dossiers par statut ; bouton « Réinitialiser ».
2. **Utilisateurs** : voir §16.3.
3. **Produits** : voir §16.4.
4. **Poseurs** : voir §16.5 (PrestataireManager).
5. **Fournisseurs** : voir §16.6.
6. **Régies** : voir §16.5 (PrestataireManager).
7. **Équipe interne** : voir §16.7 (CommissionsInternesManager).

Plus la gestion du **PIN admin** : configurer, changer, retirer (cf. §18).

### 16.3 UsersManager ([src/components/DossierSaisie.jsx:3860-4265](src/components/DossierSaisie.jsx))

Permet de **créer des comptes Supabase Auth** depuis l'app :

- **Créer un compte** : email + mot de passe (min 6 caractères, génération auto possible), `display_name`, `emoji`, `role` (admin/commercial/poseur/compta). Auto-confirmation de l'email côté Supabase.
- **Supprimer un compte** : confirmation obligatoire, irréversible.
- **Réinitialiser le mot de passe** : via `window.prompt` (min 6 caractères).

> Toutes ces opérations passent par la fonction serverless [api/users.js](api/users.js). Le front envoie le JWT de la session courante dans `Authorization: Bearer …` ; le serveur le valide via `supabase.auth.getUser()` puis vérifie `user_metadata.role === 'admin'` avant d'appeler l'API admin Supabase avec la `service_role`. La `service_role` n'est **jamais** envoyée au navigateur.
>
> **Bootstrap** : si la table `auth.users` est totalement vide (1ʳᵉ mise en route), la création POST est autorisée sans JWT et le rôle est forcé à `admin`. Sinon, plus aucun admin pourrait être créé.
>
> **Dev local** : `npm run dev` ne sert pas `/api/users` (Vite seul). Utiliser `vercel dev` pour tester la gestion des comptes en local.

**Profils locaux** (différents des comptes Supabase) : utilisés pour le sélecteur « 👤 » en haut de l'app, qui détermine `currentUser` (le nom affiché dans l'historique et l'activité). Champs : emoji + nom + rôle.

### 16.4 ProduitsManager ([src/components/DossierSaisie.jsx:4267-4346](src/components/DossierSaisie.jsx))

- Ajout : nom + emoji (slugification automatique en MAJUSCULE + suffixe si doublon).
- Modification : renommage / emoji in-place.
- Suppression : bloquée si produit utilisé en dossier ou si `autoTarif=true` (panneaux solaires protégés).

Champ `autoTarif` : si `true`, le produit utilise la grille de tarifs par puissance (cf. PrestataireManager).

### 16.5 PrestataireManager (Poseurs & Régies, [src/components/DossierSaisie.jsx:3697-3858](src/components/DossierSaisie.jsx))

- Ajout / renommage / suppression de prestataire (MAJUSCULE forcée).
- Suppression bloquée si utilisé en dossier.
- **Grille 1 — Panneaux solaires** : tarif par puissance (20 colonnes 2000 → 18000 Wc). Cellule vide ⇒ valeur héritée du tarif le plus proche (via `findClosestTarif`, [src/components/DossierSaisie.jsx:95-104](src/components/DossierSaisie.jsx)). Cellule renseignée affichée en gras.
- **Grille 2 — Autres produits** : prix HT unitaire × quantité saisie au dossier.

### 16.6 FournisseursManager ([src/components/DossierSaisie.jsx:4348-4407](src/components/DossierSaisie.jsx))

Ajout / renommage / suppression (avec vérification d'usage), affichage en grille 3 colonnes.

### 16.7 CommissionsInternesManager ([src/components/DossierSaisie.jsx:3585-3695](src/components/DossierSaisie.jsx))

Pour chacun des 5 rôles (téléprospecteur / confirmateur / commercial / coordinateur projet / responsable envoi pose) :
- Tarif par défaut (input numérique)
- Liste de noms assignables (tags ajoutables / supprimables)
- Suppression d'un nom vérifie qu'il n'est pas déjà utilisé en dossier (sinon avertissement)

---

## 17. Import de dossiers

`ImportDossiersModal`, [src/components/DossierSaisie.jsx:5880-6175](src/components/DossierSaisie.jsx). Admin uniquement (bouton 📥 dans l'onglet Dossiers).

### Étape 1 — Coller les données

- Zone textarea : copier-coller depuis Google Sheets / Excel ou contenu CSV/TSV.
- `parseDelimited()` ([src/components/DossierSaisie.jsx:5756](src/components/DossierSaisie.jsx)) détecte automatiquement le délimiteur (tab / virgule / point-virgule) selon ce qui est le plus fréquent en ligne 1. Supporte les guillemets échappés.
- Checkbox « La première ligne contient les noms des colonnes » (sinon les colonnes sont nommées `colonne_1`, etc.).

### Étape 2 — Mapping des colonnes

Liste des **25 champs cibles importables** (`IMPORT_FIELDS`, [src/components/DossierSaisie.jsx:5851-5878](src/components/DossierSaisie.jsx)) :

`id, nom, prenom, telephone, email, adresse, codePostal, ville, statut, financement, montantTotal, montantHtCustom, dateInsta, dateAccord, dateConsuel, regie, poseur, fournisseur, bl, factureNo, facturePdfUrl, payeClient, observations, produit, puissance`.

Pour chaque colonne détectée, `suggestField()` ([src/components/DossierSaisie.jsx:5816-5849](src/components/DossierSaisie.jsx)) propose automatiquement le champ cible par matching fuzzy ("tel" → `telephone`, "montant TTC" → `montantTotal`, etc.).

### Parseurs

- `parseNumber()` ([src/components/DossierSaisie.jsx:5787](src/components/DossierSaisie.jsx)) : retire `€` + espaces, gère la virgule décimale.
- `parseDateInput()` ([src/components/DossierSaisie.jsx:5794](src/components/DossierSaisie.jsx)) : accepte `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`, `AAAA-MM-JJ` → ISO.
- `parseBool()` ([src/components/DossierSaisie.jsx:5811](src/components/DossierSaisie.jsx)) : reconnaît `oui`, `yes`, `1`, `true`, `x`, `payé`, `paye`.

### Étape 3 — Dry-run & confirmation

- `buildDossiers()` ([src/components/DossierSaisie.jsx:5907](src/components/DossierSaisie.jsx)) construit les dossiers et log des warnings pour statuts/financements/produits inconnus.
- Validation : au moins un champ identifiant requis (`nom`, `prenom`, `id`, `telephone`, `email`, `adresse`).
- Aperçu : tableau avec nom / statut / financement / montant / poseur.
- Bouton « Importer N dossiers » déclenche l'insertion. Chaque dossier reçoit un `localId`, statut par défaut `M_ATT_DOSSIER`, financement `AUTRE` si non mappé, puissance par défaut 6000 Wc, timestamps `savedAt` + `importedAt`.

---

## 18. Dialogue PIN admin

`PinDialog`, [src/components/DossierSaisie.jsx:5626-5752](src/components/DossierSaisie.jsx).

### 4 modes

| Mode | Déclenchement | Comportement |
|---|---|---|
| `setup` | Première configuration | Saisie nouveau PIN + confirmation |
| `unlock` | Repasser admin quand PIN existe | Saisie PIN → admin si correct |
| `change` | Changer le PIN | Code actuel → nouveau code + confirmation |
| `remove` | Retirer la protection | Code actuel → admin permanent |

### Étapes internes

- `setup` → étape `new`.
- `unlock` / `remove` → étape `verify`.
- `change` → étape `verify-old` puis `new`.

### Format

PIN numérique 4 à 6 chiffres ([src/components/DossierSaisie.jsx:5641](src/components/DossierSaisie.jsx)). Non récupérable (avertissement explicite à l'utilisateur).

---

## 19. Constantes métier (référence)

Toutes définies en tête de [src/components/DossierSaisie.jsx:4-63](src/components/DossierSaisie.jsx).

### Statuts (18, par défaut)

| Id | Label | Emoji |
|---|---|---|
| `A_EN_COURS` | EN COURS | 🔄 |
| `E_PASSE_COMPTANT` | PASSE COMPTANT | 💵 |
| `H_NRP_CQ_LIVRAISON` | NRP CQ LIVRAISON | 🚚 |
| `G_ATTENTE_ACCORD_DEF` | ATTENTE ACCORD DEF | 📋 |
| `F_ATTENTE_DEBLOCAGE` | ATTENTE DE DEBLOCAGE | ⏳ |
| `F1_CONTROLE_LIV_BANQUE` | CONTROLE DE LIV BANQUE | 🏦 |
| `F2_PREFINANCEMENT` | PRÉFINANCEMENT | 💳 |
| `F1_ACCEPTE` | ACCEPTÉ | 👍 |
| `W_DOSSIER_PAYER` | DOSSIER PAYER | ✅ |
| `D_SAV` | SAV | 🔧 |
| `C_LITIGE` | LITIGE | ⚠️ |
| `W2_ANNULER` | ANNULER | ❌ |
| `W1_DEPOSER` | DEPOSER | 📦 |
| `G1_ATT_NRP_CL` | ATT NRP CL | 📞 |
| `CONFORMITE_CONTRAT` | CONFORMITE CONTRAT | 📝 |
| `Z_DEPLACEMENT` | DEPLACEMENT | 🚗 |
| `F3_MANQUE_RECEP` | MANQUE RECEP | 📭 |

> L'ordre exact est modifiable par l'admin via Réglages → Statuts.

### Poseurs par défaut (17)
IONERGIK 2, IONERGIK, TEK, RV SERVICE, ECO ENERGY, MAFATEC, RBM, RL CONSEILS, MASTEROVIT, SKY, INTERNE, LEH, CAP SOLEIL, INNOVA, DDI, ALLAN, AUTRE.

### Régies par défaut (15)
ELON, DYLAN CARBON, YONI COHEN, ISAAC, ES CAPITAL, DUMONT, OREN, YC CONSEIL, JOHN SULTAN, REGIE YE, MARTIAL, LYA, SAMUEL LEVY, RL ELON, AUTRE.

### Fournisseurs par défaut (13)
IONERGIK, ECO NEGOCE, LEH, SYNEXIUM, CAP SOLEIL, INNOVA, RBM, ORALED, BG MATERIAUX, BROTHER NEGOCE, AXDIS, ERP, AUTRE.

### Financements (7)
PROJEXIO, SOFINCO, DOMOFINANCE, COMPTANT, CETELEM, FINANCO, FRANFINANCE.

### Provenances de lead (9)
Site web, Facebook, Google Ads, Bouche à oreille, Salon / Foire, Téléprospection, Recommandation client, Référenceur, Autre.

### Rôles internes (5, tarif défaut)
- Téléprospecteur 📞 — 50 €
- Confirmateur ✅ — 30 €
- Commercial 💼 — 300 €
- Coordinateur projet 🛠️ — 80 €
- Responsable envoi pose 📦 — 40 €

### Puissances (20)
2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 10000, 11000, 12000, 15000, 18000 Wc.

### Produits par défaut (8)
☀️ Panneaux solaires (autoTarif), 🌡️ Pompe à chaleur, ❄️ Climatisation, 🚿 Ballon thermodynamique, 🔋 Batterie, 🏠 Isolation, 💨 VMC, 🔨 Autre rénovation.

---

## 20. Calculs automatiques (`enrichDossier`)

`enrichDossier`, [src/components/DossierSaisie.jsx:103-187](src/components/DossierSaisie.jsx). Appliqué à chaque dossier au moment de l'affichage / des stats.

- **Montant HT** : dérivé du TTC ou pris depuis `montantHtCustom`.
- **TVA** : `taux` × HT.
- **Puissance totale** : somme des Wc des produits `autoTarif`.
- **Tarifs auto** : pour chaque poseur / régie / produit, recherche dans la grille du tarif le plus proche (cf. `findClosestTarif`).
- **Détails fournisseurs** : HT → TTC (× 1,2), marquage payé / payé d'avance / bloqué.
- **Détails régies** (multi) : HT, TTC, paiement, auto-tarif. Rétrocompat régie unique.
- **Détails poseurs** : HT, TTC, paiement, BL, facture PDF.
- **Marges TTC & HT** : CA − (fournisseurs + régies + poseurs).
- Rétrocompat : fallback sur format legacy (produit unique, régie unique, poseur unique).

---

## 21. Architecture des fichiers

```
.
├── README.md
├── SUPABASE_SETUP.sql        # schéma table storage + RLS
├── index.html                # point d'entrée HTML
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js            # port 3000
└── src/
    ├── App.jsx               # orchestration session + layout
    ├── Login.jsx             # formulaire auth
    ├── main.jsx              # bootstrap React
    ├── supabase.js           # client Supabase
    ├── storage.js            # API window.storage (Supabase key/value)
    ├── index.css             # Tailwind directives
    └── components/
        └── DossierSaisie.jsx # ~8100 lignes — toute l'app métier
```

**Important** : [src/components/DossierSaisie.jsx](src/components/DossierSaisie.jsx) contient une quarantaine de composants React dans un seul fichier (DossierSaisie principal + TabButton, StatCard, StatusBreakdown, DossierCard, DocumentsModal, FilePreviewOverlay, PdfViewer, DropZone, DocumentItem, PaiementsView, PrestatairesPayerSection, DashboardView, PerfList, ReglagesView, CommissionsInternesManager, PrestataireManager, UsersManager, ProduitsManager, FournisseursManager, FormulaireDossier, Section, Field, Toggle, PinDialog, ImportDossiersModal, HistoriqueModal, QuickViewPanel, GlobalSearchModal, CalendrierView, AlertesBar, AlertesModal, helpers).

C'est volontairement laissé en l'état — toute restructuration sort du périmètre de cette documentation.
