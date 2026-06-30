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

### 2026-06-30
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
