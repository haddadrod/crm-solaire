# CLAUDE.md

## Contexte projet

Ce dépôt est un **CRM mono-page React + Vite + Supabase** pour piloter une activité de vente et pose de panneaux solaires (B2C). Le suivi va de la signature à la récupération de TVA, en passant par contrôle qualité, financement, pose, Consuel, paiement et commissions internes / externes.

**Stack** : React 18, Vite, Tailwind, Supabase (auth + table key/value), `lucide-react` pour les icônes.

## Avant toute chose : lire la doc fonctionnelle

👉 **[FONCTIONNALITES.md](FONCTIONNALITES.md)** documente précisément **tout ce que fait l'application** dans son état actuel : onglets, modales, permissions, modèle d'un dossier, alertes, import, calculs, constantes métier, etc.

À consulter en début de chaque session avant de répondre à des questions sur le code ou de proposer des modifications. Les références internes sont au format `chemin/fichier.jsx:ligne` pour aller direct.

## Particularité d'architecture

Quasiment toute la logique applicative tient dans **un seul fichier de ~8 100 lignes** : [src/components/DossierSaisie.jsx](src/components/DossierSaisie.jsx). Il contient une quarantaine de composants React. C'est volontairement laissé en l'état — **ne pas restructurer sans demande explicite**.

Le reste de l'arborescence :

```
src/
├── App.jsx          # session Supabase + layout général
├── Login.jsx        # écran de connexion
├── main.jsx         # bootstrap React
├── supabase.js      # client Supabase
├── storage.js       # API window.storage (table key/value)
├── index.css        # directives Tailwind
└── components/
    └── DossierSaisie.jsx
```

## Lancer le projet

```bash
npm install
npm run dev   # http://localhost:3000
```

Variables d'environnement requises dans `.env` :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Au premier setup d'un projet Supabase, exécuter [SUPABASE_SETUP.sql](SUPABASE_SETUP.sql) (crée la table `storage` + politiques RLS).

## Conventions de travail

- Lire [FONCTIONNALITES.md](FONCTIONNALITES.md) avant de toucher au code métier.
- Pour repérer où vit une fonctionnalité, partir de la table des matières du doc fonctionnel — elle pointe vers les lignes précises de `DossierSaisie.jsx`.
- Ne pas mocker Supabase ni introduire de nouvelle persistance sans demander : tout passe par `window.storage` (clé/valeur via Supabase).
- Pas de localStorage côté app.
- Les fichiers documents sont stockés en **base64 (data URL) dans la table `storage`**, avec une limite de ~3,7 Mo par fichier. C'est une contrainte forte à connaître.
