# 📋 SUIVI — où on en est (multi-ordi / multi-session)

> **À lire en premier depuis N'IMPORTE QUEL ordinateur ou session Claude.**
> Les conversations Claude ne se synchronisent pas entre elles, mais **ce fichier + la branche Git, si.**
> Chaque session met ce fichier à jour à la fin de son travail. Source de vérité = le code sur la branche, pas le chat.

- **Repo** : `haddadrod/crm-solaire`
- **Branche de travail** : `claude/crm-multi-computer-setup-9DqAw`
- **Déploiement** : Vercel (Production = `main`, à jour après chaque merge)
- **Compte Claude** : rodney.haddad@gmail.com

## ▶️ Pour reprendre depuis un autre ordi
1. Ouvre Claude Code (claude.ai/code), même compte, repo `crm-solaire`.
2. Peu importe la conversation : dis « lis SUIVI.md, on continue ».
3. Je lis ce fichier + le code → je reprends exactement ici.

---

## 🗓️ Journal (plus récent en haut)

### 2026-07-02
- ✅ **Équipe interne — AVOIRS / notes de crédit (comme un fournisseur)** : section rose « 🧾 Avoirs / notes de crédit » sur chaque rôle interne (form + QuickView) : + Ajouter un avoir, montant HT / n° / date / PDF (lecture IA). Déduits PARTOUT : marge HT+TTC, bouton payer, total commissions, rapport paiements, export compte prestataires, rappels. Champ `<role>Avoirs` (défauts + normalisation). + le n° facture interne remonte maintenant dans le rapport paiements/export.
- ✅ **Équipe interne — bloc facture EXACTEMENT comme un fournisseur** : HT (€) + TTC côte à côte avec badge « ✓ Auto : X€ », TTC éditable (`<role>TtcCustom`, bouton « ↺ auto ») pour les factures où le TTC ≠ HT × 1,20, case « Sans TVA (auto-entrepreneur / société étrangère) », N° BL + N° Facture, glisser PDF (lecture IA) + recherche Gmail, bouton « Non payé » en bas. Vaut pour les 5 rôles (télépro, confirmateur, commercial, coordinateur, resp. envoi pose). Form + QuickView. Nouveaux champs `<role>TtcCustom` / `<role>Bl` (défauts + normalisation `startEdit`).
- 🟢 **FIX marge — commissions internes déduites** : la marge (HT et TTC) soustrait désormais le coût de l'équipe interne (comme fournisseurs/régies/poseurs). Avant, « rien n'était déduit » → marge fausse. `enrichDossier` + le calcul live du formulaire prennent `tarifsInternes` (param + deps) et respectent le TTC override.

### 2026-06-30
- ✅ **Équipe interne — TVA comme les régies** : case « Sans TVA (auto-entrepreneur) » (cochée par défaut) + affichage du TTC (HT + TVA 20 %) + bouton payer sur le TTC. L'IA coche/décoche selon la facture (taux 0 → sans TVA). Champs `<role>SansTva` (défauts + normalisation). Form + QuickView.
- ✅ **Équipe interne — même disposition que les régies** : dans la QuickView, le bouton « payer » passe EN BAS (après société + n° facture + upload facture), identique aux régies/poseurs. Vaut pour tous les rôles internes (télépro, confirmateur, commercial, coordinateur, resp. envoi pose). Le formulaire l'avait déjà.
- ✅ **Activité par utilisateur — vue par statut** : badge du statut ACTUEL du dossier sur chaque ligne + menu déroulant « 🔄 Statut » pour filtrer (ex : les clients créés par Laura qui sont maintenant en financement). Combinable avec le filtre par type.
- ✅ **Activité par utilisateur — filtre par type** (Tout · ✨ Créés · ✏️ Modifs · 🔄 Statuts · 📞 Relances) dans le détail déplié, + on garde TOUTES les créations (avant, noyées/perdues dans les centaines de modifs → on ne voyait pas les clients créés). Clic sur une ligne ouvre le client.
- ✅ **Activité par utilisateur — noms complets + tous les utilisateurs** : affiche désormais l'emoji + le **nom complet** (prénom + nom) au lieu du seul nom d'affichage enregistré dans les actions (ex actions sous « Fitoussi » → « 🚀 Leanah Fitoussi »). + inclut TOUS les utilisateurs enregistrés (même à 0 action). Résout « je ne vois pas Léana » (= Leanah Fitoussi).
- ✅ **Panneaux « Performance des … » repliés par défaut** (poseurs, régies, fournisseurs, commerciaux, banques) → plus besoin de scroller tout en bas / fermer à chaque fois. Clic sur l'en-tête pour déplier.
- ✅ **Bouton « retour » du navigateur** : ouvrir un dossier (QuickView) empile une entrée d'historique → « retour » FERME le dossier au lieu de quitter le CRM.
- ✅ **Tableau de bord nettoyé** : panneau « Prestataires à payer (+30 jours) » RETIRÉ (doublon du Rapport de paiement) + retiré du comptage du badge 🔔.
- ✅ **Activité par utilisateur — accents normalisés** : regroupement des noms sans accent + insensible à la casse (« Léana » = « Leana ») → activité consolidée, plus de personne éclatée/manquante.
- ✅ **Scan dossier — reprise auto sur « Failed to fetch »** : l'appel `/api/classify-dossier` retente 2× (réseau instable / déploiement en cours / cold start) au lieu d'échouer sec. Message clair si ça persiste. — #588
- ✅ **Champ « Téléphone 2 »** dans Identité (form). + fix latent : `mobile` n'était pas recopié par `startEdit` → éditer+sauver un dossier perdait le mobile ; corrigé en même temps. — #587
- ✅ **Équipe interne payée sur facture (comme les régies)** : chaque rôle interne a sur le dossier n° facture + upload PDF + extraction IA du HT (remplit la commission) + bouton payé/non payé. Société (émetteur) par personne définie dans Réglages → Équipe interne (annuaire `internesContacts`). Champs `<role>FactureNo/FactureFile`. Form + QuickView. — #585
- ✅ **Facture régie multi-clients** : case « 📋 Facture groupée (plusieurs clients) » sur la ligne régie (formulaire + QuickView) → exempte ce n° de facture de TOUTES les détections de doublon (Santé des dossiers, alerte inline, sauvegarde, post-IA). Flag `r.factureGroupee`. — #583
- ✅ **Drive Factures — choix de période** (30j / 60j / 6 mois / 1 an) pour la détection ET le téléchargement. Défaut 60 j (routine). Évite de scanner 1 an à chaque fois. — #581
- 🟢 **FIX CRITIQUE — récupération factures réparée** : le cron crashait à CHAQUE run (`toMarkImported is not defined`, variable déclarée dans le try mais utilisée après → ReferenceError → 500). C'était LA cause des factures qui n'augmentaient plus / « jamais enregistrée ». La connexion Gmail n'a jamais été en cause. Déclaration déplacée avant le try. + wrapper global qui remonte le vrai message d'erreur (#578). — #579
- ✅ **Drive Factures — « 👀 Voir les nouvelles » (gratuit)** : mode `countOnly` sur le cron → compte les nouvelles factures Gmail SANS appeler l'IA (0 coût). Flux 2 temps : détecter gratuitement → analyser via Télécharger. Rappel : le cache empêche de re-payer les factures déjà analysées. — #576
- ✅ **Assistant IA — désambiguïsation homonymes** : si plusieurs clients du même nom (ex 2 « Bertrand »), l'assistant fait CHOISIR lequel avant d'ouvrir/déplacer (prompt IA renforcé + garde-fou front). — #574
- ✅ **Drive Factures — « Dernière récupération » toujours affichée** + « X nouvelles en plus » (encart ambre « jamais » si aucune récup enregistrée). — #573
- ✅ **Assistant IA secrétaire — Phase 1 (agit\!)** : l'assistant 🤖 sait maintenant DÉPLACER un dossier (« bascule HADDAD en financement », « passe X en contrôle qualité », « marque payé/annulé ») → identifie le dossier, propose statut actuel→cible, applique APRÈS confirmation. Intention `move_status` + `targetStatutId` côté endpoint. — #571
- ✅ **Alerte séparée « 🔁 Refinancement »** : dossiers en rebascule (CQ validé) sortent de « à envoyer banque » et ont leur propre alerte. — #570
- ✅ **Rebascule : CQ d'abord** — au refus banque, bouton « 🔁 Repasser en contrôle qualité (rebascule) » ; le choix de la nouvelle banque se fait APRÈS validation du CQ. — #567
- ✅ **Refinancement marqué** — après CQ de rebascule validé, l'envoi en banque est étiqueté « 🔁 REFINANCEMENT » (alerte + chip étape Financement). — #568
- ✅ **CQ de rebascule** : refus banque + renvoi vers une autre maison de financement → le dossier repasse par un **contrôle qualité spécifique** (marqué « 🔁 REBASCULE » : bandeau dans la section CQ + préfixe dans l'alerte CQ + texte sur le sélecteur). Champs `cqRebascule/From/To/At`. — #565
- ✅ **Alerte fraude acquittable** : bouton « ✓ J'ai vérifié — c'est bon » sur le document (panneau anti-fraude) → flag `doc.fraudReviewed`, le dossier sort de l'alerte fraude (plus de clignotement), badge vert ✅. Réversible (« Ré-signaler »). — #563
- ✅ **Fix alertes « dossier annulé »** : un dossier `W2_ANNULER` ne génère plus AUCUNE alerte. 9 alertes oubliaient la garde (Prestataires, Financement, Manque docs, Fraude, Litige, SAV, Client à rappeler, Paiement, Récup TVA) → helper `isAnnule()`. Exception voulue : « matériel non rendu ». — #559
- ✅ **Drive Factures — diagnostic « 0 facture »** : le bouton « Télécharger les factures » affiche maintenant le nb de boîtes scannées, le nb de PDF trouvés, et les erreurs de l'API (token Gmail expiré…). Encart ambre si 0 boîte connectée → renvoie vers Réglages → Email d'envoi. — #560
- ✅ **Drive Factures — « 🕐 Dernière récupération : jj/mm/aaaa à HHhMM »** : le cron (toutes les 15 min) + le bouton manuel écrivent `gmail-prefetch-last-run` dans Supabase ; affiché sous les boutons avec nb de boîtes + nouvelles. — #561
- 🔎 **En cours d'investigation** : le total de factures n'augmenterait plus (nouvelles non récupérées). Cause la plus probable = **connexion Gmail d'une boîte expirée** (app Google en mode Test → jeton qui meurt). À confirmer via le nouveau diagnostic, puis reconnecter la boîte dans Réglages → Email d'envoi. ⚠️ Le téléchargement ne scanne QUE les boîtes **partagées** (`gmail-shared-inboxes`), pas les boîtes perso.

### 2026-06-29
- ✅ Erreur 500 Drive Factures corrigée (pagination `ia-list` + maxDuration 60s) — #554
- ✅ Compteur de résultats « 📊 N dossiers » dans la barre de recherche — #555
- ✅ Tri des financeurs en attente du plus vieux au plus récent — #553
- ✅ Badge « ⏱️ Nj » = jours depuis la pose sans paiement (vue financeur) — #551
- ✅ Retrait du doublon « Financeurs en retard » du dashboard — #552
- ✅ Import CSV : champ Mobile, dédup tél/email/nom couple, bouton « Marquer POSÉ » + « Annuler POSÉ », aperçu contact/adresse — #547→#550
- ✅ IA fournisseur : 2e appel correctif si ELSOL/YOLICO renvoyé à tort
- ✅ (autre session) Alerte fraude équipe financement, doublons email/adresse/mobile, TTC dans le Drive, filet correctif CLIENT, HOTFIX scan dossier — #556, #557

## 🔜 À faire / en discussion
- Travail multi-ordinateurs : le code est bien synchronisé via Git. Limite connue : les conversations Claude ne fusionnent pas entre comptes/sessions (ce fichier sert de relais).
- _(ajoute ici les prochaines demandes)_

## ⚠️ Pièges connus
- `window.storage.get()` renvoie `{ key, value }`, **pas** la valeur brute.
- Tous les dossiers sont dans **une seule clé** `dossiers-data` (gros JSON) : sauvegarde = dernier qui écrit gagne. Realtime + backups 10 min atténuent, mais éviter 2 éditions simultanées du même dossier.
- Fichiers documents = base64 dans la table `storage`, limite ~3,7 Mo/fichier.
