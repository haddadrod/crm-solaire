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
