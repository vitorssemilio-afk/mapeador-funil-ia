-- Amplia a ficha do cliente e cria a gestão de consultores.
--
-- consultor_responsavel (texto livre) some, mas não perde o dado — vira
-- consultor_responsavel_texto_legado, mantido só pra referência enquanto o
-- time reatribui cada implementação a um consultor de verdade (não dá pra
-- casar texto livre com um cadastro que ainda não existe).

-- ============================================================
-- 1) Consultores
-- ============================================================
create table if not exists public.consultores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text,
  cargo text,
  avatar_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists consultores_email_idx on public.consultores (lower(email));

alter table public.consultores enable row level security;

create policy "consultores_all_authenticated"
  on public.consultores for all
  to authenticated
  using (true) with check (true);

create trigger consultores_set_updated_at
  before update on public.consultores
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Implementação: consultor responsável (obrigatório a partir de agora,
-- na aplicação — não dá pra forçar not null no banco sem quebrar
-- implementações já existentes) e consultor de apoio (opcional).
-- ============================================================
alter table public.implementacoes_crm rename column consultor_responsavel to consultor_responsavel_texto_legado;
alter table public.implementacoes_crm add column if not exists consultor_responsavel_id uuid references public.consultores(id);
alter table public.implementacoes_crm add column if not exists consultor_apoio_id uuid references public.consultores(id);

create table if not exists public.implementacao_consultor_historico (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  consultor_anterior_id uuid references public.consultores(id),
  consultor_novo_id uuid not null references public.consultores(id),
  alterado_em timestamptz not null default now(),
  alterado_por_email text
);

create index if not exists implementacao_consultor_historico_implementacao_id_idx
  on public.implementacao_consultor_historico(implementacao_id);

alter table public.implementacao_consultor_historico enable row level security;

create policy "implementacao_consultor_historico_all_authenticated"
  on public.implementacao_consultor_historico for all
  to authenticated
  using (true) with check (true);

-- ============================================================
-- 3) Informações do cliente — campos novos na ficha. nome_fantasia começa
-- preenchido com o que já existe (nome_empresa), pra não pedir cadastro
-- duplicado do que já se sabe.
-- ============================================================
alter table public.clientes add column if not exists nome_fantasia text;
alter table public.clientes add column if not exists razao_social text;
alter table public.clientes add column if not exists cnpj text;
alter table public.clientes add column if not exists site text;
alter table public.clientes add column if not exists cidade text;
alter table public.clientes add column if not exists uf text;

update public.clientes set nome_fantasia = nome_empresa where nome_fantasia is null;

-- ============================================================
-- 4) Contatos do cliente (vários, um marcado como principal).
-- ============================================================
create table if not exists public.cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null,
  cargo text,
  email text,
  telefone text,
  whatsapp text,
  papel_projeto text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cliente_contatos_cliente_id_idx on public.cliente_contatos(cliente_id);

alter table public.cliente_contatos enable row level security;

create policy "cliente_contatos_all_authenticated"
  on public.cliente_contatos for all
  to authenticated
  using (true) with check (true);

create trigger cliente_contatos_set_updated_at
  before update on public.cliente_contatos
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5) Ocorrências — registro manual de algo que aconteceu e pode impactar o
-- cronograma (reunião cancelada, acesso pendente, mudança de escopo etc.).
-- "responsável pelo impacto" reaproveita o mesmo vocabulário já usado nas
-- remarcações de Kickoff/Treinamento (cliente/consultor/v4/problema
-- técnico/outro — ver migration 0036).
-- ============================================================
create table if not exists public.cliente_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  categoria text not null check (categoria in (
    'cliente_cancelou_reuniao', 'cliente_nao_compareceu', 'consultor_cancelou', 'reuniao_remarcada',
    'acesso_pendente', 'pendencia_cliente', 'problema_tecnico', 'mudanca_escopo', 'outro'
  )),
  descricao text not null,
  responsavel_impacto text not null check (responsavel_impacto in ('cliente', 'consultor', 'v4', 'problema_tecnico', 'outro')),
  data_ocorrencia timestamptz not null default now(),
  impacta_cronograma boolean not null default false,
  dias_impacto int,
  status text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  resolvida_em timestamptz,
  autor_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cliente_ocorrencias_cliente_id_idx on public.cliente_ocorrencias(cliente_id);

alter table public.cliente_ocorrencias enable row level security;

create policy "cliente_ocorrencias_all_authenticated"
  on public.cliente_ocorrencias for all
  to authenticated
  using (true) with check (true);

create trigger cliente_ocorrencias_set_updated_at
  before update on public.cliente_ocorrencias
  for each row execute function public.set_updated_at();
