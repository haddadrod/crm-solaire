# CRM Solaire

Mon CRM pour mon activité de panneaux solaires.

## 🚀 Mise en ligne

Ce projet utilise :
- **Vite + React** pour le frontend
- **Supabase** pour la base de données et l'authentification
- **Tailwind CSS** pour le style

## 📦 Installation locale (optionnel)

Si tu veux faire tourner le projet sur ton ordinateur :

```bash
npm install
npm run dev
```

## 🚀 Déploiement sur Vercel

1. Push ce code sur GitHub
2. Connecte Vercel à GitHub
3. Importe le projet
4. Ajoute les variables d'environnement :
   - `VITE_SUPABASE_URL` — URL du projet Supabase (côté front)
   - `VITE_SUPABASE_ANON_KEY` — clé publique anon (côté front)
   - `SUPABASE_URL` — même URL, côté serveur (sans préfixe `VITE_`)
   - `SUPABASE_SERVICE_KEY` — clé **service_role** Supabase (Project Settings → API)
5. Déploie !

> ⚠️ Ne **jamais** préfixer `SUPABASE_SERVICE_KEY` par `VITE_` : ce préfixe inline la valeur dans le bundle public et exposerait la clé à tous les visiteurs. La gestion des comptes passe par la fonction serverless `api/users.js` qui lit ces variables côté serveur uniquement.

## 👥 Gestion des comptes équipe

Une fois la 1ʳᵉ mise en prod, vas dans le CRM → onglet **Paramètres** → **Comptes de connexion au CRM**. Le tout premier compte créé est automatiquement promu admin (bootstrap), ensuite seuls les admins peuvent créer/supprimer/réinitialiser les comptes.

## 🧪 Développement local de l'API

`npm run dev` ne lance que Vite — l'endpoint `/api/users` n'est pas servi. Pour tester la gestion des comptes en local :

```bash
npm i -g vercel
vercel dev
```

`vercel dev` sert à la fois le front Vite et la fonction serverless. Renseigne aussi `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` dans un `.env.local` (jamais commit).

## 🗄️ Configuration Supabase

Voir le fichier `SUPABASE_SETUP.sql` pour les étapes de création de la base de données.
