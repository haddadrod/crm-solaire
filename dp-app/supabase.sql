-- 🏛️ Appli DP Mairie — à exécuter UNE fois dans Supabase (SQL Editor → New query → Run).
-- Crée les tables clients + réglages et les règles d'accès :
-- tout utilisateur connecté de l'équipe voit et modifie tous les clients.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  nom text not null default '',
  prenom text not null default '',
  telephone text not null default '',
  email text not null default '',
  adresse text not null default '',
  code_postal text not null default '',
  ville text not null default '',
  -- Suivi mairie : a_faire | envoye | accepte | refuse
  statut text not null default 'a_faire',
  date_envoi date,
  date_recepisse date,
  date_accord date,
  notes text not null default '',
  -- Tout le travail de la DP (parcelle, panneaux, placement, photos…)
  dp jsonb not null default '{}'::jsonb
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
