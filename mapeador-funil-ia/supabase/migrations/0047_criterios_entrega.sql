-- Separa "Critérios de Sucesso / Qualidade da Entrega" (que hoje é só uma
-- linha solta dentro do checklist do Ciclo 4, "Critérios de entrega
-- conferidos") em duas coisas distintas:
--
-- 1. Critérios de Entrega: "a implementação foi corretamente entregue?" —
--    técnico, objetivo, sob controle da V4. Modelado igual
--    atividades_cronograma/atividades_status: um template global
--    (criterios_entrega) + o status de cada um por implementação
--    (criterios_entrega_status).
-- 2. Indicadores de Adoção: contratação do plano pago, abandono de
--    planilhas, uso de relatórios, Checkpoint 30 dias — isso já existe
--    (checkpoints_adocao) e não é critério de qualidade técnica, só não
--    estava claramente separado. Nenhuma tabela nova precisa disso, só a
--    reorganização na UI.
--
-- Contratação do plano Kommo passa a ter um status comercial próprio,
-- separado dos critérios técnicos.

create table if not exists public.criterios_entrega (
  id uuid primary key default gen_random_uuid(),
  chave text unique,
  nome text not null,
  ordem integer not null,
  -- false = "quando aplicável": não entra na conta de critérios
  -- obrigatórios pra liberar a conclusão técnica da implementação.
  obrigatorio boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.criterios_entrega (chave, nome, ordem, obrigatorio) values
  ('usuarios_cadastrados', 'Usuários cadastrados', 1, true),
  ('usuarios_ativos', 'Usuários ativos', 2, true),
  ('canais_funcionando', 'Canais funcionando', 3, true),
  ('funil_processo_real', 'Funil refletindo o processo real', 4, true),
  ('campos_configurados', 'Campos configurados', 5, true),
  ('motivos_perda_configurados', 'Motivos de perda configurados', 6, true),
  ('bot_funcionando', 'Bot funcionando', 7, true),
  ('automacoes_funcionando', 'Automações funcionando', 8, true),
  ('relatorios_configurados', 'Relatórios configurados', 9, true),
  ('dashboards_configurados', 'Dashboards configurados', 10, false),
  ('importacao_exportacao_testada', 'Importação/exportação testada', 11, true),
  ('playbook_entregue', 'Playbook entregue', 12, true),
  ('equipe_treinada', 'Equipe treinada', 13, true)
on conflict (chave) do nothing;

alter table public.criterios_entrega enable row level security;

create policy "criterios_entrega_all_authenticated"
  on public.criterios_entrega for all
  to authenticated
  using (true) with check (true);

create table if not exists public.criterios_entrega_status (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  criterio_id uuid not null references public.criterios_entrega(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'em_validacao', 'concluido', 'nao_se_aplica')),
  evidencia text,
  observacao text,
  -- Obrigatória quando status = 'nao_se_aplica' (validado em código, não em
  -- constraint — mais fácil de dar uma mensagem clara pro usuário).
  justificativa_nao_aplica text,
  data_validacao timestamptz,
  responsavel_validacao_id uuid references public.consultores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (implementacao_id, criterio_id)
);

create index if not exists criterios_entrega_status_implementacao_id_idx
  on public.criterios_entrega_status (implementacao_id);

alter table public.criterios_entrega_status enable row level security;

create policy "criterios_entrega_status_all_authenticated"
  on public.criterios_entrega_status for all
  to authenticated
  using (true) with check (true);

create trigger criterios_entrega_status_set_updated_at
  before update on public.criterios_entrega_status
  for each row execute function public.set_updated_at();

alter table public.implementacoes_crm
  add column if not exists status_contratacao_kommo text not null default 'em_decisao'
    check (status_contratacao_kommo in ('contratado', 'em_decisao', 'nao_contratado'));
