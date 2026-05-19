# 🌙 Audit de nuit — synthèse pour Rodney

**Date** : 19 mai 2026 (nuit)
**Branche** : `claude/intelligent-keller-39da98`
**Méthode** : 3 audits parallèles (sécurité, qualité code, UX) + implémentation des wins sûrs.

---

## ✅ Ce qui a été fait cette nuit (5 commits poussés sur PR #129)

| Commit | Type | Impact |
|---|---|---|
| `14e8ab5` | 🔐 Sécurité | Signed URLs ONOFF 1 an → 1 h. Messages d'erreur IA masqués (log serveur, message générique côté client) |
| `67a852e` | 🔐 XSS | Guard `vocalCQUrl` : refus des liens `javascript:`, `data:`, `blob:` etc. avant `<audio src>` |
| `f2637bb` | 🐛 UX | Form save : alerte explicite si Nom vide (avant : silencieux) + bordure rouge sur le champ |
| `.env.example` | 📋 Doc | Documentation des variables d'env requises avec checklist sécu |

**Aucun changement destructif. Aucune modification de schéma DB. Aucune dépendance ajoutée.**

---

## 🚨 Audits — findings prioritaires

### 🔐 Sécurité (9 findings)

#### CRITICAL — à traiter avant toute mise en prod ouverte
- **Pas de RLS Supabase** : tout user connecté voit TOUTES les données (déjà connu, dans memory `project_securite_rls.md`). Combiné avec rôles UI-only → un poseur peut via la console récupérer la totalité des dossiers (SSN, RIB, bulletins de paie, avis d'impôt).
  - **Action** : refonte storage en RLS par rôle/assignment. Chantier ~1 semaine. Bloque le partage du CRM hors équipe restreinte de confiance.

#### HIGH (✅ partiellement fait)
- ~~Signed URL ONOFF 1 an~~ → réduit à 1 h ✅
- ~~Messages d'erreur leaky~~ → masqués ✅
- ~~XSS via vocalCQUrl~~ → guarded ✅
- **Pas de rate limiting sur endpoints IA** : un user peut spammer `/api/classify-dossier` avec des PDFs 18 Mo → 1000€+ de frais Anthropic en quelques minutes. **Action** : Redis ou table Supabase avec compteur par user.
- **Pas de validation stricte des inputs serveur** : zod/yup absent. Sensibilité au prompt injection vers Claude. **Action** : ajouter schémas de validation sur tous les `api/*.js`.

#### MEDIUM
- **Webhook ONOFF en plain token** (pas HMAC) : un token capturé en logs reste utilisable indéfiniment. **Action** : HMAC-SHA256 avec timing-safe equal, et faire tourner le token périodiquement.
- **Bootstrap admin contournable** dans `api/users.js` : check `lastSignInAt` peut être contourné via timing. **Action** : flag `bootstrap_completed` dans une config dédiée.
- **Clés `VITE_SUPABASE_*` visibles dans le bundle** : prévu by design (anon key), mais sans RLS c'est critique. Voir RLS ci-dessus.

#### LOW
- Rôles UI-only contournables via DevTools console (cohérent avec RLS manquante).

### 🛠️ Qualité de code (5 findings)

| Issue | Sévérité | Effort | Recommandation |
|---|---|---|---|
| **0 test** sur ~14k lignes | CRITICAL | L | Ajouter 5-10 tests d'intégration RTL (CRUD dossier, scan IA, permissions) avant tout refactor |
| Consommation tokens IA non plafonnée | HIGH | M | Tracking coût par user + dashboard admin. Couplé avec rate limiting ci-dessus |
| Realtime Supabase sans gestion d'erreur | MEDIUM | M | Callback `error` + backoff exponentiel sur `subscribe()` ligne ~1442 |
| Async sans `isMounted` ref | MEDIUM | S | `runExtraction` et `handleUpload` setState après unmount possible |
| JSON.parse "bare" | LOW (faux positif après vérif) | — | Tous les `JSON.parse` settings sont déjà dans des `try/catch`. Audit légèrement optimiste sur ce point |

✅ **Code globalement bien structuré** : useMemo bien utilisé, deps arrays corrects, pas de TODO/FIXME en suspens, naming cohérent.

### 🎨 UX (18 findings)

#### MAJOR (impact quotidien sur les filles)
- **Boutons "Auj." manquants** sur `dateEnvoiPose`, dates de paiement fournisseurs/régies/poseurs. **Action** : ajouter partout où il y a un `<input type="date">`. ~20 min.
- **Pas de toast de succès** après sauvegarde dossier → l'user doute. **Action** : composant Toast simple, 2s, "✓ Dossier enregistré". ~10 min.
- ~~Form silent fail~~ → corrigé cette nuit ✅
- **Pas de recherche globale Ctrl+K cross-tab** : la recherche actuelle filtre seulement la liste dossiers. **Action** : SearchCommandPalette indexant nom/email/n° BC/statut. ~1 h.
- **Export comptable incomplet** : CSV n'inclut pas le détail Poseur/Régie/Fournisseur HT. **Action** : multi-sheet CSV (Dossiers / Paiements / Marges). ~1 h.

#### MINOR (cosmetic)
- Couleurs `amber/orange/yellow` mélangées pour le même concept "attente". Standardiser sur `amber` pour les `attente`.
- 18 emojis différents pour 18 statuts → réduire à 6 paires icône-emoji pour scan-eyes plus rapide.

#### Mobile
- Date inputs `w-full` → tap targets minuscules sur iPhone. Ajouter `min-h-12` pour ≥ 44 px.

#### Accessibilité
- `aria-label` manquants sur boutons-icônes (👁️, 🗑️, ☰). ~20 min pour ajouter sur les principaux.

#### Features manquantes (long terme)
- Onboarding pour nouvelles secrétaires (5 slides overlay).
- Notifications quotidiennes par mail (digest des alertes en cours).
- Lock manuel sur statut auto (l'auto-statut écrase parfois le choix user).

---

## 📋 Backlog priorisé pour demain

### 🥇 Sprint sécu (1-2 semaines, bloquant prod ouverte)
1. **RLS Supabase** sur table `storage` + bucket `dossier-documents` — par rôle et par assignment
2. **Rate limiting** endpoints IA (Anthropic) — Redis ou table avec compteur
3. **Validation stricte des inputs** serveur (zod) sur tous les `api/*.js`
4. **HMAC webhook ONOFF** — remplacer le token plain par signature
5. **Rotation périodique secrets** + procédure documentée

### 🥈 Sprint UX (1-3 jours, quick wins)
1. Toast succès après save (~10 min)
2. Boutons "Auj." manquants partout (~20 min)
3. Aria-labels sur boutons-icônes (~20 min)
4. Couleurs statuts harmonisées (~10 min)
5. Mobile tap targets (~15 min)

### 🥉 Sprint features (~1 semaine)
1. Recherche globale Ctrl+K (~1 h)
2. Export comptable multi-sheet (~1 h)
3. Notifications mail digest quotidien (~2 h, nécessite SMTP/Gmail configuré)
4. Lock statut manuel (~30 min)
5. Onboarding nouvelle secrétaire (~1,5 h)

### 🧪 Sprint qualité (1 semaine)
1. Setup vitest + React Testing Library
2. 5-10 tests d'intégration prioritaires (CRUD, scan IA, permissions)
3. Couverture cible : > 30 % sur DossierSaisie.jsx
4. Préreq avant tout refactor structurel

---

## 💡 Recommandations stratégiques

1. **Ne pas ouvrir le CRM au-delà de l'équipe restreinte de confiance tant que RLS n'est pas en place.** Le risque actuel : un user mécontent peut exfiltrer tous les dossiers via la console navigateur. Plusieurs centaines de dossiers contenant identités + RIB + avis d'impôt → risque RGPD + image énorme.

2. **Plafonner les coûts Anthropic via le dashboard console.anthropic.com** dès demain matin si pas déjà fait. Ça ne remplace pas le rate limiting mais ça évite une facture catastrophique en cas d'abus.

3. **Tester sur iPhone réel** la prochaine fois — plusieurs interactions (tap dates, modales, boutons d'appel ONOFF) ont des tap targets sous le seuil ergonomique.

4. **Faire un point hebdo sécu** : tant que RLS pas en place, vérifier toutes les semaines qui a accès au CRM, qui pose problème, qui désactiver. C'est un patch temporaire.

5. **Garder le mono-fichier `DossierSaisie.jsx` tant qu'il n'y a pas de tests.** Le splitter sans tests = risque énorme de régressions. Sprint qualité d'abord, refactor (optionnel) après.

---

## 🌅 Ce qu'on peut faire demain matin (priorité ergonomie)

Si tu veux du concret avec retour visible immédiat :
- Toast succès après save
- Boutons "Auj." manquants
- Couleurs statuts harmonisées

~45 minutes de travail, fort impact UX pour les filles. Je peux enchaîner direct si tu valides.

---

**PR ouverte avec tous les fixes de cette nuit** : [crm-solaire#129](https://github.com/haddadrod/crm-solaire/pull/129)

À toi de jouer ! ☀️
