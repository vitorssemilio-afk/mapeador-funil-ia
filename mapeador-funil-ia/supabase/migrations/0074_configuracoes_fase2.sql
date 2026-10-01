-- Área de Configurações — Fase 2 (aditiva): Formulários, Alertas,
-- Operação e IA. Reuniões/Categorias de ocorrência/Prioridades ficam como
-- tipos de sistema protegidos nesta fase — sem suporte a tipo
-- personalizado em tempo real (mudança de arquitetura maior, fora do
-- escopo combinado).
--
-- Mesmo padrão da Fase 1: uma linha global por domínio, RLS só permite
-- SELECT a authenticated (escrita só via RPC admin-only), histórico
-- registrado na mesma configuracoes_historico já existente.

-- ============================================================
-- 1) Formulários (seção 5) — prazos de referência, textos e tempo
-- estimado exibidos no formulário público. Os prazos aqui são só
-- referência/exibição: a régua real de alerta (quando considerar
-- atrasado) vive em configuracoes_alertas, pra não duplicar a mesma
-- régua em dois lugares com nomes diferentes.
-- ============================================================
create table if not exists public.configuracoes_formulario (
  id boolean primary key default true,
  constraint configuracoes_formulario_singleton check (id),
  prazo_resposta_vendas_dias int not null default 14,
  prazo_resposta_pos_venda_dias int not null default 14,
  texto_inicial_vendas text not null default 'Preencha as perguntas abaixo sobre o seu processo comercial.',
  texto_inicial_pos_venda text not null default 'Preencha as perguntas abaixo sobre o relacionamento com o cliente depois da venda.',
  mensagem_conclusao_vendas text not null default 'Recebemos suas respostas. Nossa equipe vai analisar as informações e entrar em contato em breve.',
  mensagem_conclusao_pos_venda text not null default 'Recebemos suas respostas. Nossa equipe vai analisar as informações e entrar em contato em breve.',
  tempo_estimado_vendas_minutos int,
  tempo_estimado_pos_venda_minutos int,
  atualizado_por_email text,
  updated_at timestamptz not null default now(),
  check (prazo_resposta_vendas_dias > 0),
  check (prazo_resposta_pos_venda_dias > 0),
  check (tempo_estimado_vendas_minutos is null or tempo_estimado_vendas_minutos > 0),
  check (tempo_estimado_pos_venda_minutos is null or tempo_estimado_pos_venda_minutos > 0)
);

insert into public.configuracoes_formulario (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_formulario enable row level security;

create policy "configuracoes_formulario_select_autenticado"
  on public.configuracoes_formulario for select
  to authenticated
  using (true);

-- Lida pelo formulário público (ainda não autenticado) — só texto de
-- interface, nada sensível. Mesmo raciocínio de public_get_mapeamento.
create policy "configuracoes_formulario_select_publico"
  on public.configuracoes_formulario for select
  to anon
  using (true);

revoke insert, update, delete on public.configuracoes_formulario from authenticated;

-- ============================================================
-- 2) Alertas (seção 6) — marcos de notificação configuráveis. Limite de 6
-- itens por lista, pra não virar spam (seção 6 do pedido).
-- ============================================================
create table if not exists public.configuracoes_alertas (
  id boolean primary key default true,
  constraint configuracoes_alertas_singleton check (id),
  -- Dias desde o Kickoff em que "Implementação entrou no Dia X" dispara.
  -- Calculado sobre a duração GLOBAL configurada (mesma limitação que já
  -- existia antes desta migration: a rotina de notificações ainda não
  -- lê o snapshot por cliente — ver relatório da PR).
  implementacao_alertas_dias jsonb not null default '[30, 35, 40]'::jsonb,
  -- Dias restantes (antes do vencimento) em que o alerta de pendência avisa.
  pendencia_alertas_antes_dias jsonb not null default '[3, 1, 0]'::jsonb,
  -- Dias JÁ vencida pra escalar a prioridade da pendência.
  pendencia_alerta_alta_dias_vencida int not null default 3,
  pendencia_alerta_critica_dias_vencida int not null default 7,
  -- Dias sem resposta pro primeiro/segundo lembrete de formulário.
  formulario_lembrete_1_dias int not null default 3,
  formulario_lembrete_2_dias int not null default 7,
  atualizado_por_email text,
  updated_at timestamptz not null default now(),
  check (jsonb_array_length(implementacao_alertas_dias) between 1 and 6),
  check (jsonb_array_length(pendencia_alertas_antes_dias) between 1 and 6),
  check (pendencia_alerta_alta_dias_vencida > 0),
  check (pendencia_alerta_critica_dias_vencida > pendencia_alerta_alta_dias_vencida),
  check (formulario_lembrete_1_dias > 0),
  check (formulario_lembrete_2_dias > formulario_lembrete_1_dias)
);

insert into public.configuracoes_alertas (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_alertas enable row level security;

create policy "configuracoes_alertas_select_autenticado"
  on public.configuracoes_alertas for select
  to authenticated
  using (true);

revoke insert, update, delete on public.configuracoes_alertas from authenticated;

-- ============================================================
-- 3) Operação (seção 10) — nome/branding exibidos na interface. Preparo
-- pra uso por outra operação sem alterar o core — NÃO é multi-tenant
-- completo (uma linha só, vale pra toda a instalação).
-- ============================================================
create table if not exists public.configuracoes_operacao (
  id boolean primary key default true,
  constraint configuracoes_operacao_singleton check (id),
  nome_operacao text not null default 'V4 Company',
  nome_produto text not null default 'CRM Flow',
  razao_social text,
  cnpj text,
  texto_padrao_rodape text,
  atualizado_por_email text,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes_operacao (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_operacao enable row level security;

create policy "configuracoes_operacao_select_autenticado"
  on public.configuracoes_operacao for select
  to authenticated
  using (true);

-- Lida pela tela de login e pelo formulário público (ambos antes de
-- autenticar) — só pra exibir o nome do produto/operação na marca.
create policy "configuracoes_operacao_select_publico"
  on public.configuracoes_operacao for select
  to anon
  using (true);

revoke insert, update, delete on public.configuracoes_operacao from authenticated;

-- ============================================================
-- 4) IA (seção 11) — só parâmetros não sensíveis. A API key nunca passa
-- por aqui (continua em secret da Edge Function). O prompt de verdade
-- continua em código (prompt.ts) — versao_prompt_label é só uma etiqueta
-- informativa pra saber qual revisão está no ar, não controla o
-- comportamento sozinha.
-- ============================================================
create table if not exists public.configuracoes_ia (
  id boolean primary key default true,
  constraint configuracoes_ia_singleton check (id),
  temperatura numeric,
  permitir_perguntas_esclarecimento boolean not null default true,
  versao_prompt_label text,
  atualizado_por_email text,
  updated_at timestamptz not null default now(),
  check (temperatura is null or (temperatura >= 0 and temperatura <= 1))
);

insert into public.configuracoes_ia (id) values (true) on conflict (id) do nothing;

alter table public.configuracoes_ia enable row level security;

create policy "configuracoes_ia_select_autenticado"
  on public.configuracoes_ia for select
  to authenticated
  using (true);

revoke insert, update, delete on public.configuracoes_ia from authenticated;

-- ============================================================
-- 5) RPCs de escrita — mesmo padrão da Fase 1: admin-only (checado no
-- banco), grava configuracoes_historico pra cada campo alterado.
-- ============================================================
create or replace function public.atualizar_configuracao_formulario(p_patch jsonb)
returns public.configuracoes_formulario
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_formulario;
  v_novo public.configuracoes_formulario;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações de formulário.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_formulario where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_formulario
  set
    prazo_resposta_vendas_dias = coalesce((p_patch->>'prazo_resposta_vendas_dias')::int, prazo_resposta_vendas_dias),
    prazo_resposta_pos_venda_dias = coalesce((p_patch->>'prazo_resposta_pos_venda_dias')::int, prazo_resposta_pos_venda_dias),
    texto_inicial_vendas = coalesce(p_patch->>'texto_inicial_vendas', texto_inicial_vendas),
    texto_inicial_pos_venda = coalesce(p_patch->>'texto_inicial_pos_venda', texto_inicial_pos_venda),
    mensagem_conclusao_vendas = coalesce(p_patch->>'mensagem_conclusao_vendas', mensagem_conclusao_vendas),
    mensagem_conclusao_pos_venda = coalesce(p_patch->>'mensagem_conclusao_pos_venda', mensagem_conclusao_pos_venda),
    tempo_estimado_vendas_minutos = case when p_patch ? 'tempo_estimado_vendas_minutos' then (p_patch->>'tempo_estimado_vendas_minutos')::int else tempo_estimado_vendas_minutos end,
    tempo_estimado_pos_venda_minutos = case when p_patch ? 'tempo_estimado_pos_venda_minutos' then (p_patch->>'tempo_estimado_pos_venda_minutos')::int else tempo_estimado_pos_venda_minutos end,
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (v_campo, to_jsonb(v_atual) -> v_campo, to_jsonb(v_novo) -> v_campo, v_email);
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.atualizar_configuracao_formulario(jsonb) from public;
grant execute on function public.atualizar_configuracao_formulario(jsonb) to authenticated;

create or replace function public.atualizar_configuracao_alertas(p_patch jsonb)
returns public.configuracoes_alertas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_alertas;
  v_novo public.configuracoes_alertas;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações de alertas.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_alertas where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_alertas
  set
    implementacao_alertas_dias = coalesce(p_patch->'implementacao_alertas_dias', implementacao_alertas_dias),
    pendencia_alertas_antes_dias = coalesce(p_patch->'pendencia_alertas_antes_dias', pendencia_alertas_antes_dias),
    pendencia_alerta_alta_dias_vencida = coalesce((p_patch->>'pendencia_alerta_alta_dias_vencida')::int, pendencia_alerta_alta_dias_vencida),
    pendencia_alerta_critica_dias_vencida = coalesce((p_patch->>'pendencia_alerta_critica_dias_vencida')::int, pendencia_alerta_critica_dias_vencida),
    formulario_lembrete_1_dias = coalesce((p_patch->>'formulario_lembrete_1_dias')::int, formulario_lembrete_1_dias),
    formulario_lembrete_2_dias = coalesce((p_patch->>'formulario_lembrete_2_dias')::int, formulario_lembrete_2_dias),
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (v_campo, to_jsonb(v_atual) -> v_campo, to_jsonb(v_novo) -> v_campo, v_email);
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.atualizar_configuracao_alertas(jsonb) from public;
grant execute on function public.atualizar_configuracao_alertas(jsonb) to authenticated;

create or replace function public.atualizar_configuracao_operacao(p_patch jsonb)
returns public.configuracoes_operacao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_operacao;
  v_novo public.configuracoes_operacao;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações da operação.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_operacao where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_operacao
  set
    nome_operacao = coalesce(p_patch->>'nome_operacao', nome_operacao),
    nome_produto = coalesce(p_patch->>'nome_produto', nome_produto),
    razao_social = case when p_patch ? 'razao_social' then nullif(p_patch->>'razao_social', '') else razao_social end,
    cnpj = case when p_patch ? 'cnpj' then nullif(p_patch->>'cnpj', '') else cnpj end,
    texto_padrao_rodape = case when p_patch ? 'texto_padrao_rodape' then nullif(p_patch->>'texto_padrao_rodape', '') else texto_padrao_rodape end,
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (v_campo, to_jsonb(v_atual) -> v_campo, to_jsonb(v_novo) -> v_campo, v_email);
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.atualizar_configuracao_operacao(jsonb) from public;
grant execute on function public.atualizar_configuracao_operacao(jsonb) to authenticated;

create or replace function public.atualizar_configuracao_ia(p_patch jsonb)
returns public.configuracoes_ia
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_ia;
  v_novo public.configuracoes_ia;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações de IA.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_ia where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_ia
  set
    temperatura = case when p_patch ? 'temperatura' then (p_patch->>'temperatura')::numeric else temperatura end,
    permitir_perguntas_esclarecimento = coalesce((p_patch->>'permitir_perguntas_esclarecimento')::boolean, permitir_perguntas_esclarecimento),
    versao_prompt_label = case when p_patch ? 'versao_prompt_label' then nullif(p_patch->>'versao_prompt_label', '') else versao_prompt_label end,
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (v_campo, to_jsonb(v_atual) -> v_campo, to_jsonb(v_novo) -> v_campo, v_email);
  end loop;

  return v_novo;
end;
$$;

revoke all on function public.atualizar_configuracao_ia(jsonb) from public;
grant execute on function public.atualizar_configuracao_ia(jsonb) to authenticated;

-- ============================================================
-- 6) RPC pública (anon) pra Login.tsx — só nome_operacao/nome_produto,
-- nada mais, mesmo com a policy de SELECT acima já liberando a tabela
-- inteira pra anon (defesa em profundidade: a tela de login só deveria
-- mesmo enxergar isso).
-- ============================================================
create or replace function public.public_get_branding()
returns table (nome_operacao text, nome_produto text)
language sql
security definer
set search_path = public
stable
as $$
  select nome_operacao, nome_produto from public.configuracoes_operacao where id = true;
$$;

revoke all on function public.public_get_branding() from public;
grant execute on function public.public_get_branding() to anon, authenticated;

-- ============================================================
-- 7) Alertas configuráveis na rotina de notificações — redefine
-- gerar_notificacoes_periodicas (corpo idêntico ao da migration 0072,
-- comparado bloco a bloco) só trocando os números fixos pelos valores de
-- configuracoes_alertas nos 3 blocos afetados: dia do ciclo da
-- implementação, formulário fora do prazo (agora só 2 níveis — atenção/
-- alta, igual ao pedido de "primeiro/segundo lembrete" — a antiga 3ª
-- faixa "crítica aos 14 dias" foi removida) e pendência (agora escalona
-- depois de vencida em vez de virar crítica no primeiro dia de atraso).
-- O bloco de critério de entrega também passa a usar a mesma lista de
-- implementacao_alertas_dias (antes fixo em 35/40) — pequena mudança de
-- comportamento se o admin alterar essa lista, documentada no relatório.
-- ============================================================
create or replace function public.gerar_notificacoes_periodicas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alertas record;
begin
  perform public.resolver_notificacoes_automaticamente();

  select * into v_alertas from public.configuracoes_alertas where id = true;

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

  -- Dia do ciclo da implementação — marcos agora vêm de
  -- configuracoes_alertas.implementacao_alertas_dias (default [30,35,40],
  -- idêntico ao hardcoded anterior).
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'implementacao_dia_' || d.dia,
    'Implementação entrou no Dia ' || d.dia || '/40',
    'A implementação de ' || c.nome_empresa || ' está no dia ' || d.dia || ' dos 40 dias contados do Kickoff.',
    c.id,
    case
      when d.dia >= (select max(x::int) from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) x) then 'critica'
      when d.dia >= (select min(x::int) from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) x where x::int > (select min(y::int) from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) y)) then 'alta'
      else 'atencao'
    end,
    '/clientes/' || c.id || '?aba=implementacao', 'cliente', c.id,
    'implementacao_dia_' || d.dia || ':' || c.id
  from public.clientes c
  cross join lateral (
    select ((current_date - c.kickoff_realizado_em::date) + 1)::int as dia
  ) d
  where c.kickoff_realizado_em is not null
    and d.dia in (select (x::text)::int from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) x)
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

  -- Critério de entrega pendente — agora usa a mesma lista configurável
  -- implementacao_alertas_dias (antes fixo em 35/40). Com os valores
  -- default ([30,35,40]) passa a disparar também no dia 30, além dos
  -- dois que já disparava — mudança de comportamento pequena e
  -- documentada no relatório da PR.
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'criterio_entrega_pendente_dia_' || d.dia, 'Critério de entrega pendente',
    'O critério "' || ce.nome || '" de ' || c.nome_empresa || ' ainda está ' ||
      (case cs.status when 'em_validacao' then 'em validação' else 'pendente' end) ||
      ' no Dia ' || d.dia || '/40.',
    i.cliente_id, i.id,
    case when d.dia >= (select max(x::int) from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) x) then 'critica' else 'alta' end,
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
    and d.dia in (select (x::text)::int from jsonb_array_elements_text(v_alertas.implementacao_alertas_dias) x)
  on conflict (chave_idempotencia) do nothing;

  -- Formulário fora do prazo — agora só 2 níveis (lembrete 1 = atenção,
  -- lembrete 2 = alta), configuráveis via configuracoes_alertas. A 3ª
  -- faixa fixa ("crítica aos 14 dias") que existia antes foi removida —
  -- o pedido original pediu só "primeiro lembrete; segundo lembrete".
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'formulario', 'formulario_fora_prazo_' || m.tipo, 'Formulário ainda não respondido',
    'O formulário de ' || (case m.tipo when 'pos_venda' then 'pós-venda' else 'vendas' end) || ' de ' ||
      coalesce(c.nome_empresa, 'cliente') || ' foi enviado há ' || d.dias ||
      ' dia(s) e ainda não foi respondido.',
    m.cliente_id,
    case when d.dias >= v_alertas.formulario_lembrete_2_dias then 'alta' else 'atencao' end,
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
    and d.dias >= v_alertas.formulario_lembrete_1_dias
  on conflict (chave_idempotencia) do nothing;

  -- Pendência — "no vencimento" (antes, configurável) e escalonamento
  -- gradual DEPOIS de vencida (antes virava crítica já no 1º dia de
  -- atraso; agora só depois de pendencia_alerta_critica_dias_vencida).
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'pendencia',
    case when d.dias_restantes < 0 then 'pendencia_vencida' else 'pendencia_vencendo_' || d.dias_restantes end,
    case when d.dias_restantes < 0 then 'Pendência vencida' else 'Pendência vence em ' || d.dias_restantes || ' dia(s)' end,
    'A pendência "' || o.descricao || '" de ' || c.nome_empresa ||
      (case when d.dias_restantes < 0 then ' venceu em ' else ' vence em ' end) || to_char(o.prazo, 'DD/MM') || '.',
    o.cliente_id,
    case
      when d.dias_restantes < 0 and -d.dias_restantes >= v_alertas.pendencia_alerta_critica_dias_vencida then 'critica'
      when d.dias_restantes < 0 and -d.dias_restantes >= v_alertas.pendencia_alerta_alta_dias_vencida then 'alta'
      else 'atencao'
    end,
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
    and (
      d.dias_restantes in (select (x::text)::int from jsonb_array_elements_text(v_alertas.pendencia_alertas_antes_dias) x)
      or d.dias_restantes < 0
    )
  on conflict (chave_idempotencia) do nothing;
end;
$$;

revoke all on function public.gerar_notificacoes_periodicas() from public;
