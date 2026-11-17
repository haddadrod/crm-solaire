# 💶 CRM Finances

Copie **vierge** du CRM solaire (même code, **nouvelle base Supabase, aucune donnée**).
But : suivre l'argent — à qui on doit quoi (matériel, poseurs, sous-traitants), récupérer les factures
dans les mails comme avant. Les parties inutiles (financement, mairie, contrôle qualité, Consuel…) seront
**supprimées au fur et à mesure**, à partir des captures d'écran de l'utilisateur.

Le code vit pour l'instant dans le dossier `crm-finances/` du dépôt `crm-solaire`
(il pourra être déplacé dans son propre dépôt GitHub plus tard).

## Mise en route (une seule fois)

### 1. Supabase (nouvelle base)
1. [supabase.com](https://supabase.com) → **New project** (nom `crm-finances`, région Europe).
2. **SQL Editor → New query** → coller tout [`SUPABASE_INSTALL_COMPLET.sql`](SUPABASE_INSTALL_COMPLET.sql) → **Run**.
   (Il regroupe les 4 scripts `SUPABASE_*.sql` : table `storage`, protection des secrets, buckets documents + archive Gmail.)
3. **Authentication → Users → Add user** (cocher « Auto confirm ») pour chaque personne. Mettre `"role": "admin"`
   dans les métadonnées du premier compte (User → Raw user meta data) pour avoir accès à tout.
4. **Project Settings → API** : noter **Project URL**, clé **anon public** et clé **service_role** (secrète).

### 2. Vercel (le site)
1. [vercel.com/new](https://vercel.com/new) → importer le dépôt **crm-solaire** → **Root Directory = `crm-finances`**.
2. Variables d'environnement :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | connexion du site à la base | oui |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | fonctions serveur (`/api`) — clé service_role | oui |
| `CRON_SECRET` | protège la récupération automatique des mails (toutes les 15 min) | oui |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | connexion des boîtes Gmail (redirect = `https://<site>/api/google-oauth-callback`) | pour les mails |
| `ANTHROPIC_API_KEY` | lecture des factures PDF par l'IA | pour les mails |
| `PENNYLANE_API_KEY`, `VOSFACTURES_TOKEN`, `VOSFACTURES_HOST` | compta / facturation | facultatif |

3. **Deploy**.

### 3. Mails
Dans Google Cloud (même projet OAuth que l'ancien CRM, ou un nouveau), ajouter l'URL de redirection du
nouveau site dans les « Authorized redirect URIs ». Puis dans le CRM : **Réglages → boîtes Gmail → Connecter**.

## Développement
```bash
npm install
npm run dev   # http://localhost:3000
```
`.env` : voir `.env.example`. Les fonctions `/api` ne tournent qu'avec `vercel dev`.
