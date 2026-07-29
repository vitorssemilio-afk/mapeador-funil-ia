-- Fase 1 da evolução do prompt (feedback do Dr. Giullianno / V4 Company):
-- metadados de nível-raiz de cada geração — pontos que a IA quer que o
-- consultor valide com o cliente, transições entre funis, e uma estimativa
-- de esforço de implementação. Uma linha por versão gerada, espelhando o
-- versionamento que já existe em funis_gerados (mapeamento_id + versao).

create table if not exists public.geracoes_meta (
  id uuid primary key default gen_random_uuid(),
  mapeamento_id uuid not null references public.mapeamentos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  versao int not null,
  pontos_para_validar jsonb not null default '[]'::jsonb,
  transicoes_entre_funis jsonb not null default '[]'::jsonb,
  nivel_complexidade text check (nivel_complexidade in ('baixa', 'media', 'alta')),
  semanas_estimadas numeric,
  observacao_estimativa text,
  created_at timestamptz not null default now(),
  unique (mapeamento_id, versao)
);

create index if not exists geracoes_meta_mapeamento_id_idx on public.geracoes_meta(mapeamento_id);

alter table public.geracoes_meta enable row level security;

create policy "geracoes_meta_select_own"
  on public.geracoes_meta for select
  using (auth.uid() = user_id);

create policy "geracoes_meta_insert_own"
  on public.geracoes_meta for insert
  with check (auth.uid() = user_id);

create policy "geracoes_meta_delete_own"
  on public.geracoes_meta for delete
  using (auth.uid() = user_id);
