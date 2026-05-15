// Configuration du client Supabase
// Les clés sont chargées depuis les variables d'environnement (.env)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "⚠️ Variables d'environnement manquantes ! Vérifie que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies dans .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// Storage Bucket : fichiers volumineux (PDF, images jusqu'à 50 Mo)
// ============================================================================
// Les documents joints aux dossiers sont stockés dans le bucket
// "dossier-documents" (cf. SUPABASE_STORAGE_SETUP.sql).
// Ce module expose des helpers simples pour upload / signed URL / delete.

const BUCKET = 'dossier-documents';

/**
 * Upload un fichier dans le bucket. Renvoie { path, error } ; en cas de succès,
 * `path` est le chemin à stocker côté dossier pour retrouver le fichier plus tard.
 *
 * @param {File} file - Fichier à uploader (objet File du navigateur)
 * @param {string} fileId - ID logique du document (sert de nom de fichier dans le bucket)
 */
export async function uploadFileToBucket(file, fileId) {
  if (!file) return { path: null, error: new Error('Aucun fichier fourni') };
  // Extension à partir du nom du fichier (sinon on infère depuis le mime)
  const extFromName = (file.name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  const ext = extFromName
    ? extFromName[0]
    : (file.type === 'application/pdf' ? '.pdf' : '.bin');
  const path = `${fileId}${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { path: null, error };
  return { path, error: null };
}

/**
 * Génère une URL signée temporaire pour ouvrir/télécharger un fichier du bucket.
 * Durée par défaut : 1 h (largement suffisant pour ouvrir un PDF).
 */
export async function getSignedUrl(path, expiresInSec = 3600) {
  if (!path) return { url: null, error: new Error('Aucun chemin fourni') };
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error) return { url: null, error };
  return { url: data?.signedUrl || null, error: null };
}

/**
 * Supprime un fichier du bucket.
 */
export async function deleteFileFromBucket(path) {
  if (!path) return { error: null };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error };
}

/**
 * Télécharge le contenu d'un fichier du bucket sous forme de Blob (pour preview
 * inline dans un <iframe>/<img> sans dépendre de la signed URL).
 */
export async function downloadFileFromBucket(path) {
  if (!path) return { blob: null, error: new Error('Aucun chemin fourni') };
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return { blob: null, error };
  return { blob: data, error: null };
}
