-- Área administrativa de Configurações — Fase 1 (Implementação + Trial).
-- Retira do código hardcoded as regras de duração/ciclos/prazo de
-- treinamento/dia recomendado do pós-venda e os 3 períodos de Trial Kommo
-- + alertas, deixando-as editáveis por administradores.
--
-- A peça central é o SNAPSHOT: as implementações que JÁ começaram no
-- Kickoff continuam usando exatamente as regras que valiam naquele
-- instante, mesmo que o administrador altere a configuração global depois
-- — nunca um recálculo silencioso de projeto em andamento. Só
-- implementações que ainda não tiveram Kickoff (e novas, dali em diante)
-- enxergam a configuração global vigente.

-- ============================================================
-- 1) Configuração global (uma linha só, igual ao padrão já usado em
-- configuracoes_pipefy) — os valores default abaixo são EXATAMENTE os que
-- hoje estão hardcoded em atividadesCronograma.ts e trialKommo.ts, pra essa
-- migration não mudar nenhum comportamento no momento em que é aplicada.
-- ============================================================
create table if not exists public.configuracoes_implementacao (
  id boolean primary key default true,
  constraint configuracoes_implementacao_singleton check (id),
  duracao_total_dias int not null default 40,
  -- Array de {numero, nome, dia_inicio, dia_fim} — nome é informativo (não
  -- editável nesta fase, pra não quebrar o casamento por nome de texto já
  -- usado em atividades_cronograma.ciclo); só os limites de dia são
  -- configuráveis.
  ciclos jsonb not null default '[
    {"numero": 1, "nome": "Ciclo 1 — Setup e Treinamento", "dia_inicio": 1, "dia_fim": 10},
    {"numero": 2, "nome": "Ciclo 2 — Automações I e Check-in 1", "dia_inicio": 11, "dia_fim": 20},
    {"numero": 3, "nome": "Ciclo 3 — Automações II e Check-in 2", "dia_inicio": 21, "dia_fim": 30},
    {"numero": 4, "nome": "Ciclo 4 — Finalização e Entrega", "dia_inicio": 31, "dia_fim": 40}
  ]'::jsonb,
  prazo_treinamento_dia int not null default 10,
  dia_recomendado_formulario_pos_venda int not null default 8,
  trial_inicial_dias int not null default 14,
  trial_extensao_14_dias int not null default 14,
  trial_extensao_7_dias int not null default 7,
  trial_alertas_dias jsonb not null default '[5, 3, 1, 0]'::jsonb,
  atualizado_por_email text,
  updated_at timestamptz not null default now(),
  check (duracao_total_dias > 0),
  check (prazo_treinamento_dia > 0),
  check (dia_recomendado_formulario_pos_venda > 0),
  check (trial_inicial_dias > 0),
  check (trial_extensao_14_dias > 0),
  check (trial_extensao_7_dias > 0)
);

-- ============================================================
-- Validação dos ciclos — função dedicada (não dá pra expressar "não pode
-- sobrepor e precisa estar em ordem" num CHECK declarativo simples sobre
-- jsonb). Levanta exceção com mensagem clara em vez de falhar silenciosamente.
-- ============================================================
create or replace function public.validar_ciclos_implementacao()
returns trigger
language plpgsql
as $$
declare
  v_ciclo jsonb;
  v_dia_fim_anterior int := 0;
  v_dia_inicio int;
  v_dia_fim int;
begin
  if jsonb_array_length(new.ciclos) = 0 then
    raise exception 'A configuração precisa ter pelo menos um ciclo.' using errcode = 'P0001';
  end if;

  for v_ciclo in select * from jsonb_array_elements(new.ciclos)
  loop
    v_dia_inicio := (v_ciclo->>'dia_inicio')::int;
    v_dia_fim := (v_ciclo->>'dia_fim')::int;

    if v_dia_inicio is null or v_dia_fim is null then
      raise exception 'Todo ciclo precisa ter dia_inicio e dia_fim.' using errcode = 'P0001';
    end if;
    if v_dia_inicio <= 0 or v_dia_fim <= 0 then
      raise exception 'Os dias do ciclo precisam ser positivos.' using errcode = 'P0001';
    end if;
    if v_dia_fim < v_dia_inicio then
      raise exception 'O dia final do ciclo "%" não pode ser antes do dia inicial.', v_ciclo->>'nome' using errcode = 'P0001';
    end if;
    if v_dia_inicio <= v_dia_fim_anterior then
      raise exception 'Os ciclos precisam estar em ordem e não podem se sobrepor (ciclo "%" começa no dia %, mas o anterior vai até o dia %).',
        v_ciclo->>'nome', v_dia_inicio, v_dia_fim_anterior using errcode = 'P0001';
    end if;

    v_dia_fim_anterior := v_dia_fim;
  end loop;

  if v_dia_fim_anterior > new.duracao_total_dias then
    raise exception 'O último ciclo (dia %) ultrapassa a duração total configurada (% dias) — ajuste um dos dois.',
      v_dia_fim_anterior, new.duracao_total_dias using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists configuracoes_implementacao_validar_ciclos on public.configuracoes_implementacao;
create trigger configuracoes_implementacao_validar_ciclos
  before insert or update on public.configuracoes_implementacao
  for each row execute function public.validar_ciclos_implementacao();

insert into public.configuracoes_implementacao (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_implementacao enable row level security;

create policy "configuracoes_implementacao_select_autenticado"
  on public.configuracoes_implementacao for select
  to authenticated
  using (true);

-- Nenhum insert/update/delete direto é permitido pra ninguém — toda escrita
-- passa pela RPC atualizar_configuracao_implementacao (security definer),
-- que valida permissão de admin e grava o histórico atomicamente. Isso
-- cumpre "não depender apenas do frontend para bloquear edição" (a RLS
-- nega a escrita direta mesmo que alguém tente contornar a UI).
revoke insert, update, delete on public.configuracoes_implementacao from authenticated;

-- ============================================================
-- 2) Snapshot por cliente — capturado automaticamente no instante em que o
-- Kickoff é oficialmente realizado (clientes.kickoff_realizado_em
-- transiciona de null pra não-null, o mesmo gatilho que a migration 0063
-- já protege). Chave por cliente_id (não por implementação) porque é onde
-- kickoff_realizado_em e conta_kommo_criada_em de fato vivem — os mesmos
-- campos que atividadesCronograma.ts e trialKommo.ts já usam.
-- ============================================================
create table if not exists public.implementacao_settings_snapshot (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  duracao_total_dias int not null,
  ciclos jsonb not null,
  prazo_treinamento_dia int not null,
  dia_recomendado_formulario_pos_venda int not null,
  trial_inicial_dias int not null,
  trial_extensao_14_dias int not null,
  trial_extensao_7_dias int not null,
  trial_alertas_dias jsonb not null,
  capturado_em timestamptz not null default now()
);

alter table public.implementacao_settings_snapshot enable row level security;

create policy "implementacao_settings_snapshot_select_autenticado"
  on public.implementacao_settings_snapshot for select
  to authenticated
  using (true);

-- Mesma lógica: só o trigger (security definer) grava — nunca o cliente
-- diretamente, pra garantir que o snapshot sempre reflita o instante real
-- do Kickoff, não um valor que alguém decidiu escrever por fora.
revoke insert, update, delete on public.implementacao_settings_snapshot from authenticated;

create or replace function public.capturar_snapshot_configuracao_kickoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config record;
begin
  if new.kickoff_realizado_em is null or old.kickoff_realizado_em is not null then
    return new;
  end if;

  select * into v_config from public.configuracoes_implementacao where id = true;

  insert into public.implementacao_settings_snapshot
    (cliente_id, duracao_total_dias, ciclos, prazo_treinamento_dia, dia_recomendado_formulario_pos_venda,
     trial_inicial_dias, trial_extensao_14_dias, trial_extensao_7_dias, trial_alertas_dias)
  values
    (new.id, v_config.duracao_total_dias, v_config.ciclos, v_config.prazo_treinamento_dia,
     v_config.dia_recomendado_formulario_pos_venda, v_config.trial_inicial_dias,
     v_config.trial_extensao_14_dias, v_config.trial_extensao_7_dias, v_config.trial_alertas_dias)
  on conflict (cliente_id) do nothing;

  return new;
end;
$$;

drop trigger if exists clientes_capturar_snapshot_configuracao on public.clientes;
create trigger clientes_capturar_snapshot_configuracao
  after update on public.clientes
  for each row execute function public.capturar_snapshot_configuracao_kickoff();

-- Backfill: todo cliente que JÁ tinha Kickoff realizado antes desta
-- migration existir recebe um snapshot agora, usando os valores default
-- acima — que são, por construção, exatamente as regras hardcoded que
-- valiam quando esses Kickoffs de fato aconteceram. Sem isso, esses
-- clientes ficariam sem snapshot e cairiam no fallback da configuração
-- global, que PODE mudar no futuro — violando "preservar as regras
-- conforme o momento em que a implementação começou".
insert into public.implementacao_settings_snapshot
  (cliente_id, duracao_total_dias, ciclos, prazo_treinamento_dia, dia_recomendado_formulario_pos_venda,
   trial_inicial_dias, trial_extensao_14_dias, trial_extensao_7_dias, trial_alertas_dias)
select
  c.id, cfg.duracao_total_dias, cfg.ciclos, cfg.prazo_treinamento_dia, cfg.dia_recomendado_formulario_pos_venda,
  cfg.trial_inicial_dias, cfg.trial_extensao_14_dias, cfg.trial_extensao_7_dias, cfg.trial_alertas_dias
from public.clientes c
cross join (select * from public.configuracoes_implementacao where id = true) cfg
where c.kickoff_realizado_em is not null
on conflict (cliente_id) do nothing;

-- ============================================================
-- 3) Histórico de alterações — auditoria dedicada da área de
-- Configurações (campo, valor anterior, valor novo, quem, quando).
-- ============================================================
create table if not exists public.configuracoes_historico (
  id uuid primary key default gen_random_uuid(),
  campo text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  alterado_por_email text,
  created_at timestamptz not null default now()
);

create index if not exists configuracoes_historico_created_at_idx on public.configuracoes_historico (created_at desc);

alter table public.configuracoes_historico enable row level security;

create policy "configuracoes_historico_select_admin"
  on public.configuracoes_historico for select
  to authenticated
  using (public.sou_administrador());

revoke insert, update, delete on public.configuracoes_historico from authenticated;

-- ============================================================
-- 4) RPC única de escrita — admin-only (checado no banco, não só na UI),
-- valida tipos/positividade de novo (defesa em profundidade além do
-- trigger de ciclos acima) e grava o histórico de cada campo alterado na
-- mesma transação do update. p_patch só precisa trazer os campos que
-- realmente mudaram.
-- ============================================================
create or replace function public.atualizar_configuracao_implementacao(p_patch jsonb)
returns public.configuracoes_implementacao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_implementacao;
  v_novo public.configuracoes_implementacao;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações da implementação.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_implementacao where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_implementacao
  set
    duracao_total_dias = coalesce((p_patch->>'duracao_total_dias')::int, duracao_total_dias),
    ciclos = coalesce(p_patch->'ciclos', ciclos),
    prazo_treinamento_dia = coalesce((p_patch->>'prazo_treinamento_dia')::int, prazo_treinamento_dia),
    dia_recomendado_formulario_pos_venda = coalesce((p_patch->>'dia_recomendado_formulario_pos_venda')::int, dia_recomendado_formulario_pos_venda),
    trial_inicial_dias = coalesce((p_patch->>'trial_inicial_dias')::int, trial_inicial_dias),
    trial_extensao_14_dias = coalesce((p_patch->>'trial_extensao_14_dias')::int, trial_extensao_14_dias),
    trial_extensao_7_dias = coalesce((p_patch->>'trial_extensao_7_dias')::int, trial_extensao_7_dias),
    trial_alertas_dias = coalesce(p_patch->'trial_alertas_dias', trial_alertas_dias),
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (
      v_campo,
      to_jsonb(v_atual) -> v_campo,
      to_jsonb(v_novo) -> v_campo,
      v_email
    );
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.atualizar_configuracao_implementacao(jsonb) from public;
grant execute on function public.atualizar_configuracao_implementacao(jsonb) to authenticated;
