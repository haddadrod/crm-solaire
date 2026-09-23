# Site vitrine AMIECO

Site statique (HTML + CSS, sans build) pour **AMIECO (Advice, Management, Import & Export) Ltd**,
société mauricienne d'intermédiation commerciale. Indépendant du CRM : rien ici n'est importé par Vite.

```
site-amieco/
├── index.html             # page d'accueil (une page, sections ancrées)
├── mentions-legales.html  # mentions légales
├── styles.css             # feuille de style commune (thème clair + sombre)
└── README.md
```

## Voir le site en local

Ouvrir `index.html` dans un navigateur, ou depuis la racine du dépôt :

```bash
npx serve site-amieco
```

## Mettre en ligne (Vercel)

1. Sur vercel.com : « Add New… » → « Project » → choisir le dépôt `haddadrod/crm-solaire`.
2. **Root Directory** : `site-amieco`. Framework Preset : « Other ». Build Command et Output Directory vides.
3. « Deploy ». Le fichier `vercel.json` du dossier active les URL propres (`/mentions-legales`) et
   quelques en-têtes de sécurité.
4. Settings → Domains : ajouter le nom de domaine et reporter chez le registrar les enregistrements DNS
   affichés par Vercel (un A sur le domaine nu, un CNAME sur `www`). HTTPS est automatique.

Le projet Vercel du site est distinct de celui du CRM : même dépôt, dossier racine différent.

## À compléter avant la mise en ligne

1. **Coordonnées** : dans `index.html`, bloc `CONTACT` en bas du fichier.
   - `email` et `phone` : dès qu'ils sont renseignés, les lignes E-mail / Téléphone apparaissent dans la section Contact.
   - `formEndpoint` : URL d'un service de formulaire (Formspree, Basin, Netlify Forms). Sans endpoint,
     le formulaire ouvre le client mail avec le message pré-rempli vers `email`.
2. **Hébergeur** : section « Hébergement » de `mentions-legales.html`.
3. **Logo** : le site utilise pour l'instant un simple mot-symbole typographique (`.brand-name`).
4. **Textes à valider** : les engagements (« rémunération au résultat », « un seul interlocuteur »,
   horaires 9h–18h) sont des formulations proposées, à ajuster à la pratique réelle de la société.

## Ce qui vient des documents officiels

Raison sociale, BRN `C20170178`, n° de dossier `C170178`, date d'immatriculation (21/01/2020),
siège (5, Bissoondoyal Street, Port-Louis), forme (private / domestic), statut « Live » et
absence de constitution propre (Companies Act 2001) proviennent de l'extrait du Registrar of
Companies du 05/08/2026 et de l'attestation de la directrice. Aucun chiffre d'activité,
client ou témoignage n'a été inventé.
