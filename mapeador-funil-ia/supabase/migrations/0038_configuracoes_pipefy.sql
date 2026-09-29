-- Suporte operacional aos links do Pipefy: uma configuração global (não por
-- cliente) com as 4 URLs de solicitação usadas em todo o produto. Cadastra
-- uma vez, reutiliza sempre — sem integração com a API do Pipefy nesta
-- primeira versão, só os links + o registro de quando cada solicitação foi
-- de fato enviada.
create table if not exists public.configuracoes_pipefy (
  id boolean primary key default true check (id),
  url_criacao_conta text,
  url_extensao_14 text,
  url_extensao_7 text,
  url_contratacao_definitiva text,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_pipefy (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_pipefy enable row level security;

create policy "configuracoes_pipefy_all_authenticated"
  on public.configuracoes_pipefy for all
  to authenticated
  using (true) with check (true);

create trigger configuracoes_pipefy_set_updated_at
  before update on public.configuracoes_pipefy
  for each row execute function public.set_updated_at();

-- Novo marco: quando a contratação definitiva do Kommo (pós-trial) foi
-- solicitada via Pipefy — mesma família de conta_kommo_solicitada_em etc.
alter table public.clientes add column if not exists contratacao_kommo_solicitada_em timestamptz;
