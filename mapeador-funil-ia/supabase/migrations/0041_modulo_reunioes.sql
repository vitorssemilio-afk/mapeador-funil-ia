-- Módulo completo de reuniões da implementação. Kickoff e Treinamento já
-- existiam como marcos soltos em `clientes` (kickoff_agendado_para/
-- realizado_em, treinamento_agendado_para/realizado_em) — esse dado
-- continua existindo e continua sendo o que ancora o prazo de 40 dias e o
-- gate do treinamento (ver src/lib/cronograma.ts e
-- src/lib/atividadesCronograma.ts), mas passa a ser preenchido
-- automaticamente a partir da reunião correspondente aqui, em vez de
-- editado direto — a tela de "Remarcar" antiga na ficha do cliente dá lugar
-- ao módulo de Reuniões, que faz a mesma coisa (mantém data anterior, pede
-- motivo e responsável) só que pra todos os 7 tipos de reunião, não só
-- Kickoff/Treinamento.

create table if not exists public.reunioes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  implementacao_id uuid references public.implementacoes_crm(id) on delete set null,
  tipo text not null check (tipo in (
    'kickoff', 'treinamento', 'checkin_1', 'checkin_2', 'tira_duvidas', 'reuniao_final', 'extraordinaria'
  )),
  titulo text,
  data_hora timestamptz,
  consultor_responsavel_id uuid references public.consultores(id),
  participantes text,
  link text,
  status text not null default 'nao_agendada' check (status in (
    'nao_agendada', 'agendada', 'realizada', 'remarcada', 'cliente_nao_compareceu',
    'consultor_nao_compareceu', 'cancelada'
  )),
  ata text,
  resumo text,
  decisoes text,
  pendencias_cliente text,
  pendencias_internas text,
  proximos_passos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reunioes_cliente_id_idx on public.reunioes(cliente_id);
create index if not exists reunioes_implementacao_id_idx on public.reunioes(implementacao_id);

alter table public.reunioes enable row level security;

create policy "reunioes_all_authenticated"
  on public.reunioes for all
  to authenticated
  using (true) with check (true);

create trigger reunioes_set_updated_at
  before update on public.reunioes
  for each row execute function public.set_updated_at();

-- Auditoria de remarcação — mesmo racional de marco_remarcacoes (migration
-- 0036), generalizado pros 7 tipos de reunião.
create table if not exists public.reuniao_remarcacoes (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references public.reunioes(id) on delete cascade,
  data_anterior timestamptz,
  data_nova timestamptz not null,
  motivo text not null,
  responsavel_impacto text not null check (responsavel_impacto in ('cliente', 'consultor', 'v4', 'problema_tecnico', 'outro')),
  alterado_por_email text,
  created_at timestamptz not null default now()
);

create index if not exists reuniao_remarcacoes_reuniao_id_idx on public.reuniao_remarcacoes(reuniao_id);

alter table public.reuniao_remarcacoes enable row level security;

create policy "reuniao_remarcacoes_all_authenticated"
  on public.reuniao_remarcacoes for all
  to authenticated
  using (true) with check (true);

-- ============================================================
-- Backfill: cria a reunião de Kickoff/Treinamento de cada cliente que já
-- tinha esses marcos preenchidos, e migra o histórico de remarcação que já
-- existia — nada se perde, o módulo novo já nasce com os dados de sempre.
-- ============================================================
do $$
declare
  c record;
  v_reuniao_id uuid;
begin
  for c in
    select id, kickoff_agendado_para, kickoff_realizado_em, implementacao_concluida_em
    from public.clientes
    where kickoff_agendado_para is not null or kickoff_realizado_em is not null
  loop
    insert into public.reunioes (cliente_id, tipo, titulo, data_hora, status)
    values (
      c.id,
      'kickoff',
      'Kickoff',
      coalesce(c.kickoff_realizado_em, c.kickoff_agendado_para),
      case when c.kickoff_realizado_em is not null then 'realizada' else 'agendada' end
    )
    returning id into v_reuniao_id;

    insert into public.reuniao_remarcacoes (reuniao_id, data_anterior, data_nova, motivo, responsavel_impacto, created_at)
    select v_reuniao_id, r.data_anterior, r.data_nova, r.motivo, r.responsavel_impacto, r.created_at
    from public.marco_remarcacoes r
    where r.cliente_id = c.id and r.campo_marco = 'kickoff_agendado_para';
  end loop;

  for c in
    select id, treinamento_agendado_para, treinamento_realizado_em
    from public.clientes
    where treinamento_agendado_para is not null or treinamento_realizado_em is not null
  loop
    insert into public.reunioes (cliente_id, tipo, titulo, data_hora, status)
    values (
      c.id,
      'treinamento',
      'Treinamento',
      coalesce(c.treinamento_realizado_em, c.treinamento_agendado_para),
      case when c.treinamento_realizado_em is not null then 'realizada' else 'agendada' end
    )
    returning id into v_reuniao_id;

    insert into public.reuniao_remarcacoes (reuniao_id, data_anterior, data_nova, motivo, responsavel_impacto, created_at)
    select v_reuniao_id, r.data_anterior, r.data_nova, r.motivo, r.responsavel_impacto, r.created_at
    from public.marco_remarcacoes r
    where r.cliente_id = c.id and r.campo_marco = 'treinamento_agendado_para';
  end loop;
end $$;
