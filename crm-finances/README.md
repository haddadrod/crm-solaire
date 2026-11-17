# 💶 CRM Finances

Nouveau CRM, **séparé du CRM solaire** : pour chaque client, ce qui a été vendu, ce qui a été encaissé,
ce qui a été dépensé (matériel, sous-traitants, régies, commissions, autres frais) et la marge qui reste.

Indépendant : sa propre base Supabase, sa propre connexion, son propre site Vercel.
Le code vit pour l'instant dans le dossier `crm-finances/` du dépôt `crm-solaire`.

## Mise en route (une seule fois)

### 1. Supabase (nouvelle base de données)
1. Sur [supabase.com](https://supabase.com) → **New project** (nom : `crm-finances`, région : Europe).
2. **SQL Editor → New query** → colle tout le contenu de [`supabase.sql`](supabase.sql) → **Run**.
3. **Authentication → Users → Add user** : ton email + un mot de passe (coche « Auto confirm »).
   Fais pareil pour chaque personne de l'équipe.
4. **Project Settings → API** : garde sous la main **Project URL** et la clé **anon public**.

### 2. Vercel (le site)
1. [vercel.com/new](https://vercel.com/new) → importe le dépôt **crm-solaire**.
2. **Root Directory** → choisis **`crm-finances`** (important).
3. **Environment Variables** :
   - `VITE_SUPABASE_URL` = la Project URL
   - `VITE_SUPABASE_ANON_KEY` = la clé anon public
4. **Deploy**.

### 3. Premier réglage
Connecte-toi → **⚙️ Réglages** → ajoute tes fournisseurs, sous-traitants, régies et commerciaux :
ils seront proposés automatiquement dans les fiches clients.

## Utilisation
- **👥 Clients** : totaux en haut (ventes, encaissé, à encaisser, reste à payer, marge) et la liste des clients.
  **➕ Nouveau client** → nom, prénom → la fiche s'ouvre.
- **Fiche client** : coordonnées, vente (montant TTC, TVA, financeur, encaissé ou non), matériel vendu,
  puis les dépenses par catégorie (📦 matériel, 🔧 sous-traitant, 🤝 régie, 💼 commission, 🧾 autres frais),
  chacune avec son montant HT, son n° de facture et son état « payé / à payer ». Le bilan et la marge se
  calculent à droite. Tout s'enregistre automatiquement.
- **📊 Synthèse** : encaissé, payé, reste à payer, trésorerie ; ce qu'on doit à chaque prestataire
  (clic → détail client par client) ; ventes, dépenses et marge mois par mois.
- Les clients au statut **Annulé** ne comptent pas dans les totaux.

## Technique
- React + Vite + Tailwind, Supabase (auth + tables `clients`, `reglages`).
- Calculs financiers dans `src/finance.js`, testés par `src/finance.test.js` (`npm test`).
- Développement : `npm install` puis `npm run dev` (port 3001, avec un fichier `.env`, voir `.env.example`).
