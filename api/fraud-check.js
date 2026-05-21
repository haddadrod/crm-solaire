// Fonction serverless Vercel : analyse anti-fraude APPROFONDIE d'UN seul
// document (un bulletin de paie, un avis d'impôt, un justificatif…).
//
// classify-dossier fait une passe rapide sur tout le dossier ; ici on
// reprend chaque document sensible séparément pour le scruter à fond.
// Un document = un appel = toute l'attention du modèle dessus.
//
// Variables d'environnement (côté Vercel) :
//   - ANTHROPIC_API_KEY
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_KEY

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function getCaller(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch (e) {
    return null;
  }
}

const FRAUD_SCHEMA = {
  type: 'object',
  properties: {
    fraudRisk: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: "Niveau de suspicion : 'low' = rien d'anormal, document cohérent. 'medium' = 1 indice qui mérite vérif humaine. 'high' = ≥2 indices concrets OU 1 indice flagrant.",
    },
    fraudFlags: {
      type: 'array',
      items: { type: 'string' },
      description: "Liste des anomalies CONCRÈTES relevées, en français court et précis. Chaque ligne cite un détail vérifiable. Tableau vide [] si rien à signaler.",
    },
    syntheseHumaine: {
      type: 'string',
      description: "Une phrase de synthèse pour l'utilisateur (ex : 'Bulletin probablement falsifié : structure de cotisations du privé sur un employeur public.'). Vide si fraudRisk=low.",
    },
  },
  required: ['fraudRisk', 'fraudFlags', 'syntheseHumaine'],
  additionalProperties: false,
};

const FRAUD_INSTRUCTIONS = `Tu es un analyste anti-fraude documentaire pour un dossier de financement (crédit pour panneaux solaires, France). Tu reçois UN SEUL document. Scrute-le À FOND — c'est ta seule tâche, prends le temps.

🎯 OBJECTIF : repérer les FAUX et les MODIFICATIONS LOCALES de vrais documents (un montant retouché, une adresse remplacée, une signature copiée-collée). Le fraudeur veut gonfler ses revenus ou cacher sa vraie situation pour obtenir le crédit.

⚠️ HONNÊTETÉ ABSOLUE — un faux positif sur un client honnête est très grave (perte de confiance, vente bloquée à tort). Ne signale QUE des indices concrets et vérifiables. Si le document est normal → fraudRisk='low', fraudFlags=[]. N'invente RIEN pour paraître utile.

CONTRÔLES SELON LE TYPE DE DOCUMENT :

▸ BULLETIN DE PAIE (le plus falsifié) :
  • COHÉRENCE EMPLOYEUR ↔ STRUCTURE DE COTISATIONS — contrôle clé :
    - Employeur public / fonction publique (hôpital, mairie, État, "fonction publique hospitalière/territoriale/d'État") → doit avoir : traitement indiciaire, CNRACL ou pension civile, RAFP, GIPA. Il N'A PAS d'assurance chômage, ni de retraite complémentaire AGIRC-ARRCO "Tranche 1/2".
    - Employeur privé → Sécurité sociale plafonnée/déplafonnée, AGIRC-ARRCO, assurance chômage, mutuelle.
    - 🚩 Si le bulletin se dit "fonction publique" MAIS a une structure de cotisations du PRIVÉ (chômage, AGIRC-ARRCO tranche 1, mutuelle santé privée) → FAUX très probable (modèle du privé avec un nom d'employeur public collé dessus). fraudRisk='high'.
  • MODE DE PAIEMENT — un employeur public ou un grand groupe paie TOUJOURS par virement. "Payé par chèque" / "espèces" sur un bulletin d'hôpital public ou grand employeur → très suspect.
  • RATIO BRUT/NET — les charges salariales françaises = ~22 à 25 % du brut. Si net/brut s'écarte beaucoup de ça → suspect.
  • UN chiffre dans une police différente du reste, mal aligné verticalement, entouré d'une zone plus claire/grise (effacement + retape).
  • Cumuls annuels incohérents avec le brut mensuel × nb de mois.
  • Logo employeur pixelisé alors que le reste est net.
  • Pas de QR code mon-bulletin-de-paie.fr / pole-emploi alors que l'employeur est un grand groupe.
  • SIRET : 14 chiffres, doit respecter la clé de Luhn. N° de sécu : 15 chiffres. Compte-les.

▸ AVIS D'IMPÔT / TAXE FONCIÈRE :
  • Revenu fiscal de référence ou nombre de parts dans une police différente, décalé.
  • Logo DGFiP / Marianne absent ou pixelisé. Référence d'avis à l'espacement bizarre.

▸ JUSTIFICATIF DE DOMICILE (facture EDF, Veolia, Orange…) :
  • Adresse dans une police différente du reste de la facture (typo incohérente).
  • Nom qui ne matche pas, zone autour de l'adresse plus claire/foncée.

▸ RIB :
  • IBAN incohérent (clé de contrôle), BIC qui ne correspond pas à la banque affichée.

▸ TOUS DOCUMENTS :
  • Zone rectangulaire blanche/grise (cache d'effacement), compression JPEG plus forte sur une zone, ombres incohérentes, signature au halo de découpage Photoshop.

Échelle : low = rien d'anormal · medium = 1 indice à vérifier · high = ≥2 indices OU 1 flagrant.
Cite TOUJOURS le détail précis (ex : "Le bulletin indique 'Fonction publique hospitalière' mais comporte une ligne 'Assurance chômage' et 'Retraite compl. Tranche 1', cotisations qui n'existent pas dans le public").`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!ANTHROPIC_API_KEY) {
    return json(res, 503, { error: "Crédits IA non configurés (ANTHROPIC_API_KEY)." });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const { storagePath, category, label } = body;
  if (!storagePath) return json(res, 400, { error: 'storagePath requis.' });

  // 1) Télécharge le document depuis le bucket
  let pdfBase64;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: blob, error: dlErr } = await admin.storage
      .from('dossier-documents')
      .download(storagePath);
    if (dlErr || !blob) {
      return json(res, 502, { error: `Lecture du fichier impossible : ${dlErr?.message || 'inconnu'}` });
    }
    const arrayBuffer = await blob.arrayBuffer();
    pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
  } catch (e) {
    return json(res, 502, { error: `Téléchargement échoué : ${e.message}` });
  }

  // 2) Appel Claude — analyse anti-fraude approfondie, focalisée sur CE document
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const contexte = `Type de document attendu : ${category || 'inconnu'}${label ? ` (« ${label} »)` : ''}.`;
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 6000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: FRAUD_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: `${FRAUD_INSTRUCTIONS}\n\n${contexte}` },
          ],
        },
      ],
    });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || !textBlock.text) throw new Error('Réponse IA vide.');
    const parsed = JSON.parse(textBlock.text);
    return json(res, 200, { data: parsed });
  } catch (e) {
    const msg = e?.message || 'Erreur IA';
    if (e?.status === 429) return json(res, 502, { error: 'Limite IA atteinte, réessaie dans un instant.' });
    if (e?.status === 529 || e?.status === 503 || e?.status === 500 || /overloaded/i.test(msg)) {
      return json(res, 502, { error: 'Service IA momentanément surchargé.' });
    }
    console.error('fraud-check error:', e?.status, msg, e?.stack);
    return json(res, 502, { error: `Échec de l'analyse anti-fraude : ${e?.status ? `HTTP ${e.status} — ` : ''}${String(msg).slice(0, 160)}` });
  }
}
