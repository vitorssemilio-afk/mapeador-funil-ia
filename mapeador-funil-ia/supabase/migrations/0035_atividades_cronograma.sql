-- Substitui o checklist fixo por semana por um sistema de atividades com
-- dependência explícita entre marcos. Uma atividade só ganha data planejada
-- depois que a dependência dela de fato acontece — nunca todas de uma vez
-- na contratação. Enquanto a dependência não aconteceu, a atividade fica
-- "Aguardando etapa anterior" (não "Atrasada").
--
-- As tabelas antigas (checklist_grupos_implementacao, checklist_itens_implementacao,
-- implementacao_checklist_marcado) NÃO são apagadas — ficam no banco por
-- segurança/histórico, só deixam de ser lidas pelo produto a partir de agora.
-- Todo o conteúdo real (textos dos itens do POP) e o progresso já marcado
-- são copiados 1:1 pra cá.

create table if not exists public.atividades_cronograma (
  id uuid primary key default gen_random_uuid(),
  chave text unique,
  nome text not null,
  ciclo text not null,
  ordem int not null default 0,
  responsavel_padrao text,
  -- 'marco:<coluna de clientes>' (ex: 'marco:kickoff_realizado_em'),
  -- 'ciclo:<status de implementacoes_crm>' (ex: 'ciclo:preparacao_crm' = "só
  -- libera depois que a implementação sair do status preparacao_crm"), ou
  -- null (sem dependência, sempre disponível).
  depende_de text,
  prazo_dias int,
  requer_evidencia boolean not null default false,
  implementacao_id uuid references public.implementacoes_crm(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atividades_cronograma_implementacao_id_idx
  on public.atividades_cronograma(implementacao_id);

alter table public.atividades_cronograma enable row level security;

create policy "atividades_cronograma_all_authenticated"
  on public.atividades_cronograma for all
  to authenticated
  using (true) with check (true);

create trigger atividades_cronograma_set_updated_at
  before update on public.atividades_cronograma
  for each row execute function public.set_updated_at();

create table if not exists public.atividades_status (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  atividade_id uuid not null references public.atividades_cronograma(id) on delete cascade,
  data_real timestamptz,
  agendado_para date,
  bloqueado_pelo_cliente boolean not null default false,
  evidencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (implementacao_id, atividade_id)
);

create index if not exists atividades_status_implementacao_id_idx
  on public.atividades_status(implementacao_id);

alter table public.atividades_status enable row level security;

create policy "atividades_status_all_authenticated"
  on public.atividades_status for all
  to authenticated
  using (true) with check (true);

create trigger atividades_status_set_updated_at
  before update on public.atividades_status
  for each row execute function public.set_updated_at();

-- ============================================================
-- Copia o conteúdo real do checklist atual pras novas atividades,
-- preservando texto e ordem. Dependência default = o ciclo anterior (mesmo
-- comportamento de bloqueio que já existia) — quem quiser uma atividade
-- específica dependendo de um marco diferente (ex: "conexão de canais"
-- dependendo de "treinamento realizado") pode editar depende_de depois.
-- ============================================================
insert into public.atividades_cronograma (nome, ciclo, ordem, prazo_dias, requer_evidencia, implementacao_id, depende_de)
select
  ci.texto,
  case g.chave
    when 'preparacao_crm' then 'Preparação do CRM'
    when 'crm_em_configuracao_sessao1' then 'CRM em configuração'
    when 'crm_em_configuracao_sessao2' then 'CRM em configuração'
    when 'treinamento_agendado' then 'Treinamento agendado'
    when 'automacoes' then 'Automações'
    when 'entrega' then 'Entrega'
    else g.titulo
  end,
  g.ordem * 100 + ci.ordem,
  ci.dia_semana,
  ci.requer_evidencia,
  ci.implementacao_id,
  case g.chave
    when 'preparacao_crm' then 'marco:kickoff_realizado_em'
    when 'crm_em_configuracao_sessao1' then 'ciclo:preparacao_crm'
    when 'crm_em_configuracao_sessao2' then 'ciclo:preparacao_crm'
    when 'treinamento_agendado' then 'ciclo:crm_em_configuracao'
    when 'automacoes' then 'ciclo:treinamento_agendado'
    when 'entrega' then 'ciclo:automacoes'
    else 'ciclo:entrega'
  end
from public.checklist_itens_implementacao ci
join public.checklist_grupos_implementacao g on g.id = ci.grupo_id;

-- Migra o progresso já marcado (feito/evidência/data), casando pelo
-- texto+ciclo+implementacao_id — não existe outra chave em comum entre as
-- tabelas antigas e as novas.
insert into public.atividades_status (implementacao_id, atividade_id, data_real, evidencia)
select
  m.implementacao_id,
  a.id,
  m.marcado_em,
  m.evidencia
from public.implementacao_checklist_marcado m
join public.checklist_itens_implementacao ci on ci.id = m.item_id
join public.checklist_grupos_implementacao g on g.id = ci.grupo_id
join public.atividades_cronograma a
  on a.nome = ci.texto
  and a.implementacao_id is not distinct from ci.implementacao_id
  and a.ciclo = case g.chave
    when 'preparacao_crm' then 'Preparação do CRM'
    when 'crm_em_configuracao_sessao1' then 'CRM em configuração'
    when 'crm_em_configuracao_sessao2' then 'CRM em configuração'
    when 'treinamento_agendado' then 'Treinamento agendado'
    when 'automacoes' then 'Automações'
    when 'entrega' then 'Entrega'
    else g.titulo
  end
where m.marcado;
