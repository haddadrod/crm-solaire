// Fonction serverless Vercel : envoie un email via Gmail SMTP avec les
// credentials de l'utilisateur (saisis dans Réglages CRM).
//
// L'utilisateur configure dans Réglages → Email d'envoi :
//   - son adresse Gmail (smtpUser)
//   - un mot de passe d'application Gmail (smtpPass) — généré dans
//     Google Account → Sécurité → Validation en 2 étapes → Mots de passe
//     d'application. NE PAS utiliser le vrai password Google.
//
// Le front envoie ces credentials dans le body de chaque requête. Cette
// approche évite de stocker les secrets côté Vercel env (l'utilisateur
// est admin du CRM, il choisit). Les credentials sont en Supabase storage
// — accessibles aux users connectés du CRM (assumed friendly).
//
// Variables d'env requises :
//   - SUPABASE_URL          : pour valider le JWT appelant
//   - SUPABASE_SERVICE_KEY  : clé service_role Supabase

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  const caller = await getCaller(req);
  if (!caller) return json(res, 401, { error: 'Connexion requise.' });

  const body = req.body || {};
  const {
    to,
    subject,
    text,
    html,
    smtpUser,
    smtpPass,
    fromName,
    replyTo,
  } = body;

  if (!to) return json(res, 400, { error: 'Destinataire (to) requis.' });
  if (!subject) return json(res, 400, { error: 'Sujet requis.' });
  if (!text && !html) return json(res, 400, { error: 'Corps (text ou html) requis.' });
  if (!smtpUser) return json(res, 400, { error: "Email expéditeur (smtpUser) requis — configure-le dans Réglages → Email d'envoi." });
  if (!smtpPass) return json(res, 400, { error: "Mot de passe d'application Gmail (smtpPass) requis — configure-le dans Réglages → Email d'envoi." });

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const from = fromName ? `"${fromName.replace(/"/g, '\\"')}" <${smtpUser}>` : smtpUser;
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
    });

    return json(res, 200, {
      data: {
        messageId: info.messageId,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
      },
    });
  } catch (e) {
    const msg = e?.message || 'Erreur SMTP';
    // Gmail renvoie 535 si app password invalide / mauvais user
    if (/Invalid login|535-5.7.8/.test(msg)) {
      return json(res, 502, { error: "Authentification Gmail refusée. Vérifie l'email et le mot de passe d'application (pas le vrai password Google)." });
    }
    if (/Application-specific password required/.test(msg)) {
      return json(res, 502, { error: 'Gmail exige un mot de passe d\'application. Génère-le sur Google Account → Sécurité.' });
    }
    console.error('send-email error:', msg);
    return json(res, 502, { error: `Envoi email échoué : ${msg}` });
  }
}
