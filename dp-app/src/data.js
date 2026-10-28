// Accès aux données (Supabase) de l'appli DP.
import { supabase } from './supabase.js';

export const STATUTS = [
  { id: 'a_faire', label: 'À faire', emoji: '🟡', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'envoye', label: 'Envoyée', emoji: '📤', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'accepte', label: 'Acceptée', emoji: '✅', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'refuse', label: 'Refusée', emoji: '❌', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
];
export const statutInfo = (id) => STATUTS.find(s => s.id === id) || STATUTS[0];

// Liste légère : on ne charge pas les photos (colonne dp complète), seulement
// quelques infos utiles pour l'avancement.
export async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id,created_at,updated_at,nom,prenom,telephone,adresse,code_postal,ville,statut,date_envoi,date_accord,lon:dp->>lon,parcelle:dp->parcelle->>numero,nombre:dp->module->>nombre,puissance:dp->module->>puissanceWc')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getClient(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createClient(row) {
  const { data, error } = await supabase.from('clients').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateClient(id, patch) {
  const { error } = await supabase.from('clients').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

export async function getReglage(cle, defaut = {}) {
  const { data, error } = await supabase.from('reglages').select('valeur').eq('cle', cle).maybeSingle();
  if (error) throw error;
  return data?.valeur ?? defaut;
}

export async function setReglage(cle, valeur) {
  const { error } = await supabase.from('reglages').upsert({ cle, valeur, updated_at: new Date().toISOString() });
  if (error) throw error;
}
