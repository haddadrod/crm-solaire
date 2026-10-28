# 🏛️ DP Mairie

Appli séparée pour faire les **déclarations préalables** (DP) des installations photovoltaïques :
liste de clients, et pour chaque client les plans DP1 → DP8 + le Cerfa 16702*03 rempli.

Indépendante du CRM : sa propre base Supabase, sa propre connexion, son propre site Vercel.
Le code vit dans le dossier `dp-app/` du dépôt `crm-solaire`.

## Mise en route (une seule fois)

### 1. Supabase (la base de données)
1. Sur [supabase.com](https://supabase.com) → **New project** (nom : `dp-mairie`, région : Europe).
2. **SQL Editor → New query** → colle tout le contenu de [`supabase.sql`](supabase.sql) → **Run**.
3. **Authentication → Users → Add user** : ton email + un mot de passe (coche « Auto confirm »).
   Fais pareil pour chaque personne de l'équipe.
4. **Project Settings → API** : garde sous la main **Project URL** et la clé **anon public**.

### 2. Vercel (le site)
1. [vercel.com/new](https://vercel.com/new) → importe le dépôt **crm-solaire**.
2. **Root Directory** → choisis **`dp-app`** (important).
3. **Environment Variables** :
   - `VITE_SUPABASE_URL` = la Project URL
   - `VITE_SUPABASE_ANON_KEY` = la clé anon public
4. **Deploy**. L'appli est en ligne sur l'adresse donnée par Vercel.

### 3. Premier réglage
Connecte-toi → **⚙️ Réglages** → nom de la société, adresse, logo (ils apparaissent en haut des plans).

## Utilisation
- **👥 Clients → ➕ Nouveau client** : nom, adresse (suggestions automatiques), panneaux.
- Sur la fiche : les étapes de la DP à gauche (📍 terrain, ☀️ panneaux, DP1…DP8, 🧾 CERFA, 📄 générer).
- Les photos DP6 / DP7 / DP8 sont **tes photos** (JPG/PNG).
- Le suivi mairie (À faire / Envoyée / Acceptée / Refusée + dates) est en haut de la fiche.
- Tout s'enregistre automatiquement.

## Technique
- React + Vite + Tailwind, Supabase (auth + tables `clients`, `reglages`).
- Cartes, photo aérienne, cadastre : Géoplateforme IGN (gratuit). Adresse : Base Adresse Nationale.
- `api/dp-map.js` : relais de secours vers l'IGN si le navigateur bloque l'accès direct.
- PDF générés dans le navigateur (`pdf-lib`), Cerfa officiel dans `public/cerfa/`.
- Développement : `npm install` puis `npm run dev` (avec un fichier `.env`, voir `.env.example`).
