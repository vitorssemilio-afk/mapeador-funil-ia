-- Mapeador de Funil IA — schema inicial
-- Tabelas: mapeamentos, funis_gerados, campos_padrao

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. mapeamentos
-- ============================================================
create type mapeamento_status as enum (
  'em_preenchimento',
  'processando_ia',
  'concluido',
  'erro'
);

create table if not exists public.mapeamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_negocio text not null,
  status mapeamento_status not null default 'em_preenchimento',
  respostas jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mapeamentos_user_id_idx on public.mapeamentos(user_id);

alter table public.mapeamentos enable row level security;

create policy "mapeamentos_select_own"
  on public.mapeamentos for select
  using (auth.uid() = user_id);

create policy "mapeamentos_insert_own"
  on public.mapeamentos for insert
  with check (auth.uid() = user_id);

create policy "mapeamentos_update_own"
  on public.mapeamentos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "mapeamentos_delete_own"
  on public.mapeamentos for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. funis_gerados
-- ============================================================
create table if not exists public.funis_gerados (
  id uuid primary key default gen_random_uuid(),
  mapeamento_id uuid not null references public.mapeamentos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_funil text not null,
  tipo_funil text not null,
  justificativa text,
  etapas jsonb not null default '[]'::jsonb,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists funis_gerados_mapeamento_id_idx on public.funis_gerados(mapeamento_id);
create index if not exists funis_gerados_user_id_idx on public.funis_gerados(user_id);

alter table public.funis_gerados enable row level security;

create policy "funis_gerados_select_own"
  on public.funis_gerados for select
  using (auth.uid() = user_id);

create policy "funis_gerados_insert_own"
  on public.funis_gerados for insert
  with check (auth.uid() = user_id);

create policy "funis_gerados_update_own"
  on public.funis_gerados for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "funis_gerados_delete_own"
  on public.funis_gerados for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. campos_padrao (biblioteca reutilizável, populada manualmente)
-- ============================================================
create table if not exists public.campos_padrao (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('LEAD', 'CONTATO')),
  nome_campo text not null,
  tipo text not null check (tipo in (
    'lista_suspensa', 'texto_curto', 'texto_longo', 'numero', 'data', 'checkbox', 'telefone'
  )),
  opcoes jsonb,
  created_at timestamptz not null default now()
);

alter table public.campos_padrao enable row level security;

-- campos_padrao é uma biblioteca de referência compartilhada:
-- leitura liberada para qualquer usuário autenticado, escrita reservada ao service role.
create policy "campos_padrao_select_authenticated"
  on public.campos_padrao for select
  to authenticated
  using (true);

-- ============================================================
-- updated_at trigger para mapeamentos
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger mapeamentos_set_updated_at
  before update on public.mapeamentos
  for each row
  execute function public.set_updated_at();
