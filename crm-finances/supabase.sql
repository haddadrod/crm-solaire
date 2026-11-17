-- 💶 CRM Finances — à exécuter UNE fois dans le NOUVEAU projet Supabase
-- (SQL Editor → New query → coller → Run).
-- Crée les tables clients + réglages et les règles d'accès :
-- tout utilisateur connecté de l'équipe voit et modifie tous les clients.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- Client
  nom text not null default '',
  prenom text not null default '',
  telephone text not null default '',
  ville text not null default '',
  date_signature date,
  date_pose date,
  -- en_cours | pose | paye | annule | litige
  statut text not null default 'en_cours',
  -- Recette (ce que le client rapporte)
  financeur text not null default '',
  montant_ttc numeric(12,2) not null default 0,
  taux_tva numeric(4,2) not null default 20,
  encaisse boolean not null default false,
  date_encaissement date,
  -- Matériel vendu : [{ type, description, quantite }]
  produits jsonb not null default '[]'::jsonb,
  -- Dépenses : [{ id, categorie, nom, montant_ht, paye, date_paye, facture }]
  --   categorie = materiel | sous_traitant | regie | commission | autre
  depenses jsonb not null default '[]'::jsonb,
  notes text not null default ''
);

create index if not exists clients_created_at_idx on public.clients (created_at desc);

create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- Listes réutilisables (fournisseurs, poseurs, régies, financeurs…)
create table if not exists public.reglages (
  cle text primary key,
  valeur jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.reglages enable row level security;

drop policy if exists "equipe clients" on public.clients;
create policy "equipe clients" on public.clients
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe reglages" on public.reglages;
create policy "equipe reglages" on public.reglages
  for all to authenticated using (true) with check (true);
