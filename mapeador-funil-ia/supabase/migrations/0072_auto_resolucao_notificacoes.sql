-- Mini auditoria de estabilidade (P2): notificações nunca se auto-resolviam
-- — mesmo depois que a condição que as gerou deixava de existir (formulário
-- respondido, pendência resolvida, Kickoff agendado, reunião obrigatória
-- agendada, extensão solicitada), a notificação continuava "ativa" até
-- alguém marcar como lida/arquivar manualmente. Isso misturava dois
-- conceitos que precisam ser distintos:
--   NOTIFICAÇÃO = registro histórico de que algo aconteceu (nunca apagado).
--   ALERTA ATIVO = condição que ainda exige atenção (resolvida_em is null).
--
-- resolvida_em vive em `notificacoes` (não em notificacoes_status, que é
-- por usuário) porque "a condição deixou de existir" é um fato objetivo,
-- igual pra todo mundo que vê aquela notificação — não depende de quem
-- está olhando. Isso também separa claramente "usuário arquivou
-- manualmente" (arquivada, em notificacoes_status) de "sistema resolveu
-- automaticamente" (resolvida_em, em notificacoes).
alter table public.notificacoes
  add column if not exists resolvida_em timestamptz;

-- ============================================================
-- Função única de resolução, reaproveitada por:
--   1. gerar_notificacoes_periodicas() (rede de segurança diária, via
--      pg_cron já existente — migration 0055).
--   2. Triggers nas tabelas-fonte de cada condição, pra resolução imediata
--      (não esperar até a próxima rodada diária).
-- Cada bloco inverte EXATAMENTE a condição de geração do tipo
-- correspondente (migrations 0057/0058/0065/0066/0070) — nunca compara por
-- texto, sempre por entidade_tipo + entidade_id + categoria/tipo. Só
-- resolve quem ainda está ativo (resolvida_em is null); nunca reabre nem
-- apaga nada.
--
-- Escopo: só os 5 tipos pedidos (formulário, pendência, Kickoff, reunião
-- obrigatória, extensão de Trial). Notificações informativas como
-- "Funil gerado" ou "Reunião remarcada" não têm estado de "ativo/resolvido"
-- — são só registro, e não são tocadas aqui.
-- ============================================================
create or replace function public.resolver_notificacoes_automaticamente()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Formulário respondido (vendas ou pós-venda) — inverte a condição da
  -- migration 0070 (m.status = 'em_preenchimento' and not enviado_pelo_cliente).
  update public.notificacoes n
  set resolvida_em = now()
  where n.resolvida_em is null
    and n.categoria = 'formulario'
    and n.tipo like 'formulario_fora_prazo_%'
    and n.entidade_tipo = 'mapeamento'
    and exists (
      select 1 from public.mapeamentos m
      where m.id = n.entidade_id
        and m.enviado_pelo_cliente = true
    );

  -- Pendência resolvida — inverte a condição da migration 0065
  -- (o.status = 'aberta').
  update public.notificacoes n
  set resolvida_em = now()
  where n.resolvida_em is null
    and n.categoria = 'pendencia'
    and n.entidade_tipo = 'cliente_ocorrencia'
    and exists (
      select 1 from public.cliente_ocorrencias o
      where o.id = n.entidade_id
        and o.status = 'resolvida'
    );

  -- Kickoff agendado ou já realizado — inverte a condição da migration 0066
  -- (c.kickoff_agendado_para is null and c.kickoff_realizado_em is null).
  update public.notificacoes n
  set resolvida_em = now()
  where n.resolvida_em is null
    and n.categoria = 'reuniao'
    and n.tipo = 'kickoff_nao_agendado'
    and n.entidade_tipo = 'cliente'
    and exists (
      select 1 from public.clientes c
      where c.id = n.entidade_id
        and (c.kickoff_agendado_para is not null or c.kickoff_realizado_em is not null)
    );

  -- Reunião obrigatória (treinamento/check-in 1/check-in 2/reunião final)
  -- agendada ou realizada — inverte a condição da migration 0066 (not
  -- exists reuniao com esse tipo e status in agendada/realizada). O tipo da
  -- reunião é extraído do próprio tipo da notificação (ex:
  -- "checkin_1_nao_agendado" -> "checkin_1"), igual à convenção já usada na
  -- geração — não é uma fonte nova, é o mesmo nome só sem o sufixo.
  update public.notificacoes n
  set resolvida_em = now()
  where n.resolvida_em is null
    and n.categoria = 'reuniao'
    and n.tipo like '%\_nao_agendado' escape '\'
    and n.tipo <> 'kickoff_nao_agendado'
    and n.entidade_tipo = 'cliente'
    and exists (
      select 1 from public.reunioes r
      where r.cliente_id = n.entidade_id
        and r.tipo::text = regexp_replace(n.tipo, '_nao_agendado$', '')
        and r.status in ('agendada', 'realizada')
    );

  -- Extensão de Trial solicitada — inverte a condição da migration 0066
  -- (e.solicitada_em is null).
  update public.notificacoes n
  set resolvida_em = now()
  from public.clientes c
  where n.resolvida_em is null
    and n.categoria = 'trial'
    and n.entidade_tipo = 'cliente'
    and c.id = n.entidade_id
    and (
      (n.tipo = 'extensao_14_nao_solicitada' and c.extensao_14_solicitada_em is not null)
      or (n.tipo = 'extensao_7_nao_solicitada' and c.extensao_7_solicitada_em is not null)
    );
end;
$$;

revoke all on function public.resolver_notificacoes_automaticamente() from public;

-- ============================================================
-- Rede de segurança diária: chama a resolução no início da rotina já
-- agendada via pg_cron, antes de gerar notificações novas. Corpo idêntico
-- ao da migration 0070, só com essa chamada adicionada no topo — nenhuma
-- regra de geração foi alterada.
-- ============================================================
create or replace function public.gerar_notificacoes_periodicas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.resolver_notificacoes_automaticamente();

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'trial',
    'trial_termina_em_' || d.dias_restantes || '_dias',
    case when d.dias_restantes = 0 then 'Trial termina hoje' else 'Trial termina em ' || d.dias_restantes || ' dia(s)' end,
    'O Trial Kommo de ' || c.nome_empresa || ' termina em ' || to_char(d.vencimento, 'DD/MM') || '.',
    c.id,
    case when d.dias_restantes <= 1 then 'critica' when d.dias_restantes <= 3 then 'alta' else 'atencao' end,
    '/clientes/' || c.id || '?aba=trial',
    'cliente', c.id,
    'trial_dias_' || d.dias_restantes || ':' || c.id || ':' || d.vencimento
  from public.clientes c
  cross join lateral (
    select
      (c.conta_kommo_criada_em::date
        + 14
        + case when c.extensao_14_aprovada_em is not null then 14 else 0 end
        + case when c.extensao_14_aprovada_em is not null and c.extensao_7_aprovada_em is not null then 7 else 0 end
      ) as vencimento
  ) v
  cross join lateral (
    select (v.vencimento - current_date)::int as dias_restantes, v.vencimento
  ) d
  where c.conta_kommo_criada_em is not null
    and d.dias_restantes in (5, 3, 1, 0)
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'trial', 'trial_encerrado', 'Trial encerrado',
    'O Trial Kommo de ' || c.nome_empresa || ' encerrou.',
    c.id, 'critica', '/clientes/' || c.id || '?aba=trial', 'cliente', c.id,
    'trial_encerrado:' || c.id
  from public.clientes c
  where c.conta_kommo_criada_em is not null
    and c.extensao_14_aprovada_em is not null
    and c.extensao_7_aprovada_em is not null
    and (c.conta_kommo_criada_em::date + 14 + 14 + 7) < current_date
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'trial', 'extensao_' || e.rotulo || '_nao_solicitada',
    'Extensão +' || e.rotulo || ' dias ainda não solicitada',
    'O Trial de ' || c.nome_empresa || ' vence em breve e a extensão de +' || e.rotulo || ' dias ainda não foi solicitada.',
    c.id, 'alta', '/clientes/' || c.id || '?aba=trial', 'cliente', c.id,
    'extensao_' || e.rotulo || '_nao_solicitada:' || c.id || ':' || to_char(current_date, 'IYYY-IW')
  from public.clientes c
  cross join lateral (
    select
      case
        when c.extensao_14_aprovada_em is null then '14'
        when c.extensao_7_aprovada_em is null then '7'
        else null
      end as rotulo,
      case
        when c.extensao_14_aprovada_em is null then c.conta_kommo_criada_em::date + 14
        when c.extensao_7_aprovada_em is null then c.conta_kommo_criada_em::date + 14 + 14
        else null
      end as vencimento_periodo,
      case
        when c.extensao_14_aprovada_em is null then c.extensao_14_solicitada_em
        when c.extensao_7_aprovada_em is null then c.extensao_7_solicitada_em
        else null
      end as solicitada_em
  ) e
  where c.conta_kommo_criada_em is not null
    and e.rotulo is not null
    and e.solicitada_em is null
    and (e.vencimento_periodo - current_date) <= 5
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'implementacao_dia_' || d.dia,
    'Implementação entrou no Dia ' || d.dia || '/40',
    'A implementação de ' || c.nome_empresa || ' está no dia ' || d.dia || ' dos 40 dias contados do Kickoff.',
    c.id, case when d.dia >= 40 then 'critica' when d.dia >= 35 then 'alta' else 'atencao' end,
    '/clientes/' || c.id || '?aba=implementacao', 'cliente', c.id,
    'implementacao_dia_' || d.dia || ':' || c.id
  from public.clientes c
  cross join lateral (
    select ((current_date - c.kickoff_realizado_em::date) + 1)::int as dia
  ) d
  where c.kickoff_realizado_em is not null
    and d.dia in (30, 35, 40)
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'atividade_atrasada', 'Atividade atrasada',
    'A atividade "' || ac.nome || '" de ' || c.nome_empresa || ' está atrasada (agendada para ' || to_char(ast.agendado_para, 'DD/MM') || ').',
    i.cliente_id, i.id, 'atencao', '/implementacoes/' || i.id || '?aba=checklist', 'atividade_status', ast.id,
    'atividade_atrasada:' || ast.id || ':' || to_char(current_date, 'IYYY-IW')
  from public.atividades_status ast
  join public.atividades_cronograma ac on ac.id = ast.atividade_id
  join public.implementacoes_crm i on i.id = ast.implementacao_id
  join public.clientes c on c.id = i.cliente_id
  where ast.data_real is null
    and ast.agendado_para is not null
    and ast.agendado_para < current_date
    and not ast.bloqueado_pelo_cliente
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'reuniao',
    case when r.data_hora::date = current_date then 'reuniao_hoje' else 'reuniao_amanha' end,
    case when r.data_hora::date = current_date then 'Reunião hoje' else 'Reunião amanhã' end,
    'Reunião de ' || r.tipo || ' com ' || c.nome_empresa || ' às ' || to_char(r.data_hora, 'HH24:MI') || '.',
    r.cliente_id, r.implementacao_id,
    case when r.data_hora::date = current_date then 'alta' else 'atencao' end,
    '/clientes/' || r.cliente_id || '?aba=reunioes', 'reuniao', r.id,
    (case when r.data_hora::date = current_date then 'reuniao_hoje:' else 'reuniao_amanha:' end) || r.id || ':' || r.data_hora::date
  from public.reunioes r
  join public.clientes c on c.id = r.cliente_id
  where r.status = 'agendada'
    and r.data_hora is not null
    and r.data_hora::date in (current_date, current_date + 1)
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'reuniao',
    ciclos.tipo_reuniao || '_nao_agendado',
    case ciclos.tipo_reuniao
      when 'treinamento' then 'Treinamento ainda não agendado'
      when 'checkin_1' then 'Check-in 1 ainda não agendado'
      when 'checkin_2' then 'Check-in 2 ainda não agendado'
      else 'Reunião final ainda não agendada'
    end,
    'Faltam ' || (ciclos.ciclo_fim - d.dia) || ' dia(s) no ' || ciclos.ciclo_nome || ' e a reunião de '
      || (case ciclos.tipo_reuniao
            when 'treinamento' then 'treinamento'
            when 'checkin_1' then 'check-in 1'
            when 'checkin_2' then 'check-in 2'
            else 'reunião final'
          end)
      || ' de ' || c.nome_empresa || ' ainda não foi agendada.',
    c.id, 'atencao', '/clientes/' || c.id || '?aba=reunioes', 'cliente', c.id,
    'reuniao_obrigatoria_nao_agendada:' || ciclos.tipo_reuniao || ':' || c.id || ':' || ciclos.ciclo_nome || ':' || to_char(current_date, 'IYYY-IW')
  from public.clientes c
  cross join lateral (
    select ((current_date - c.kickoff_realizado_em::date) + 1)::int as dia
  ) d
  cross join lateral (
    values
      ('treinamento', 1, 10, 'Ciclo 1 — Setup e Treinamento'),
      ('checkin_1', 11, 20, 'Ciclo 2 — Automações I e Check-in 1'),
      ('checkin_2', 21, 30, 'Ciclo 3 — Automações II e Check-in 2'),
      ('reuniao_final', 31, 40, 'Ciclo 4 — Finalização e Entrega')
  ) as ciclos(tipo_reuniao, ciclo_inicio, ciclo_fim, ciclo_nome)
  where c.kickoff_realizado_em is not null
    and d.dia >= ciclos.ciclo_inicio
    and (ciclos.ciclo_fim - d.dia) between 0 and 5
    and not exists (
      select 1 from public.reunioes r
      where r.cliente_id = c.id
        and r.tipo = ciclos.tipo_reuniao
        and r.status in ('agendada', 'realizada')
    )
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'reuniao', 'kickoff_nao_agendado', 'Kickoff ainda não agendado',
    'O funil de ' || c.nome_empresa || ' está pronto há ' || (current_date - c.funil_revisado_em::date) || ' dia(s) e o Kickoff ainda não foi agendado.',
    c.id, 'alta', '/clientes/' || c.id || '?aba=reunioes', 'cliente', c.id,
    'kickoff_nao_agendado:' || c.id || ':' || to_char(current_date, 'IYYY-IW')
  from public.clientes c
  where c.funil_revisado_em is not null
    and c.kickoff_agendado_para is null
    and c.kickoff_realizado_em is null
    and (current_date - c.funil_revisado_em::date) >= 3
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'criterio_entrega_pendente_dia_' || d.dia, 'Critério de entrega pendente',
    'O critério "' || ce.nome || '" de ' || c.nome_empresa || ' ainda está ' ||
      (case cs.status when 'em_validacao' then 'em validação' else 'pendente' end) ||
      ' no Dia ' || d.dia || '/40.',
    i.cliente_id, i.id, case when d.dia >= 40 then 'critica' else 'alta' end,
    '/implementacoes/' || i.id || '?aba=criterios', 'criterio_entrega_status', cs.id,
    'criterio_pendente_dia_' || d.dia || ':' || cs.id
  from public.criterios_entrega_status cs
  join public.criterios_entrega ce on ce.id = cs.criterio_id
  join public.implementacoes_crm i on i.id = cs.implementacao_id
  join public.clientes c on c.id = i.cliente_id
  cross join lateral (
    select ((current_date - c.kickoff_realizado_em::date) + 1)::int as dia
  ) d
  where c.kickoff_realizado_em is not null
    and ce.obrigatorio
    and cs.status in ('pendente', 'em_validacao')
    and d.dia in (35, 40)
  on conflict (chave_idempotencia) do nothing;

  -- P3-B3: escalona por tempo decorrido (atenção/alta/crítica) e repete uma
  -- vez por semana ISO enquanto o cliente não responder — antes disparava
  -- uma única vez (3 dias) e nunca mais, independente de quanto tempo mais
  -- se passasse.
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'formulario', 'formulario_fora_prazo_' || m.tipo, 'Formulário ainda não respondido',
    'O formulário de ' || (case m.tipo when 'pos_venda' then 'pós-venda' else 'vendas' end) || ' de ' ||
      coalesce(c.nome_empresa, 'cliente') || ' foi enviado há ' || d.dias ||
      ' dia(s) e ainda não foi respondido.',
    m.cliente_id,
    case when d.dias >= 14 then 'critica' when d.dias >= 7 then 'alta' else 'atencao' end,
    '/mapeamento/' || m.id, 'mapeamento', m.id,
    'formulario_fora_prazo:' || m.id || ':' || to_char(current_date, 'IYYY-IW')
  from public.mapeamentos m
  left join public.clientes c on c.id = m.cliente_id
  cross join lateral (
    select (current_date - m.created_at::date)::int as dias
  ) d
  where m.status = 'em_preenchimento'
    and not m.enviado_pelo_cliente
    and m.cliente_id is not null
    and d.dias >= 3
  on conflict (chave_idempotencia) do nothing;

  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'pendencia',
    case when d.dias_restantes < 0 then 'pendencia_vencida' else 'pendencia_vencendo_' || d.dias_restantes end,
    case when d.dias_restantes < 0 then 'Pendência vencida' else 'Pendência vence em ' || d.dias_restantes || ' dia(s)' end,
    'A pendência "' || o.descricao || '" de ' || c.nome_empresa ||
      (case when d.dias_restantes < 0 then ' venceu em ' else ' vence em ' end) || to_char(o.prazo, 'DD/MM') || '.',
    o.cliente_id,
    case when d.dias_restantes < 0 then 'critica' when d.dias_restantes <= 1 then 'alta' else 'atencao' end,
    '/clientes/' || o.cliente_id || '?aba=historico', 'cliente_ocorrencia', o.id,
    case
      when d.dias_restantes < 0 then 'pendencia_vencida:' || o.id || ':' || current_date
      else 'pendencia_vencendo:' || o.id || ':' || d.dias_restantes
    end
  from public.cliente_ocorrencias o
  join public.clientes c on c.id = o.cliente_id
  cross join lateral (
    select (o.prazo - current_date)::int as dias_restantes
  ) d
  where o.status = 'aberta'
    and o.prazo is not null
    and (d.dias_restantes in (3, 1, 0) or d.dias_restantes < 0)
  on conflict (chave_idempotencia) do nothing;
end;
$$;

revoke all on function public.gerar_notificacoes_periodicas() from public;

-- ============================================================
-- Triggers de resolução imediata — não esperam a rotina diária. Cada um só
-- chama a função pra reaproveitar a mesma lógica (nenhuma fonte paralela).
-- ============================================================
create or replace function public.trg_resolver_notificacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.resolver_notificacoes_automaticamente();
  return null;
end;
$$;

drop trigger if exists mapeamentos_resolver_notificacoes on public.mapeamentos;
create trigger mapeamentos_resolver_notificacoes
  after update of enviado_pelo_cliente on public.mapeamentos
  for each row
  when (new.enviado_pelo_cliente = true and old.enviado_pelo_cliente is distinct from true)
  execute function public.trg_resolver_notificacoes();

drop trigger if exists cliente_ocorrencias_resolver_notificacoes on public.cliente_ocorrencias;
create trigger cliente_ocorrencias_resolver_notificacoes
  after update of status on public.cliente_ocorrencias
  for each row
  when (new.status = 'resolvida' and old.status is distinct from 'resolvida')
  execute function public.trg_resolver_notificacoes();

drop trigger if exists clientes_resolver_notificacoes on public.clientes;
create trigger clientes_resolver_notificacoes
  after update of kickoff_agendado_para, kickoff_realizado_em, extensao_14_solicitada_em, extensao_7_solicitada_em
  on public.clientes
  for each row
  when (
    (new.kickoff_agendado_para is not null and old.kickoff_agendado_para is null)
    or (new.kickoff_realizado_em is not null and old.kickoff_realizado_em is null)
    or (new.extensao_14_solicitada_em is not null and old.extensao_14_solicitada_em is null)
    or (new.extensao_7_solicitada_em is not null and old.extensao_7_solicitada_em is null)
  )
  execute function public.trg_resolver_notificacoes();

drop trigger if exists reunioes_resolver_notificacoes on public.reunioes;
create trigger reunioes_resolver_notificacoes
  after insert or update of status on public.reunioes
  for each row
  when (new.status in ('agendada', 'realizada'))
  execute function public.trg_resolver_notificacoes();

revoke all on function public.trg_resolver_notificacoes() from public;
