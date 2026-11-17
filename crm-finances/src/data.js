// Accès aux données (Supabase) du CRM Finances.
import { supabase } from './supabase.js';
import { LISTES_DEFAUT } from './finance.js';

export async function listClients() {
  const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
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

// Listes de noms (financeurs, fournisseurs, sous-traitants…), complétées par les valeurs par défaut.
export async function getListes() {
  const { data, error } = await supabase.from('reglages').select('valeur').eq('cle', 'listes').maybeSingle();
  if (error) throw error;
  return { ...LISTES_DEFAUT, ...(data?.valeur || {}) };
}

export async function setListes(valeur) {
  const { error } = await supabase.from('reglages').upsert({ cle: 'listes', valeur, updated_at: new Date().toISOString() });
  if (error) throw error;
}
