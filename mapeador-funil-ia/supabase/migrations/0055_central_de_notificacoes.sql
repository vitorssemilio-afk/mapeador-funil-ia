-- Central de Notificações — fase 1.
--
-- Escopo desta migration: schema (notificacoes + status de leitura por
-- usuário), geração por EVENTO (triggers, disparam na hora que o dado
-- muda) e geração por ROTINA (função agendada via pg_cron, pra tudo que
-- depende da data de hoje, não de uma mudança no banco — contagem
-- regressiva de Trial, dia do ciclo da implementação, atividade atrasada,
-- reunião amanhã/hoje).
--
-- Categoria ATAS fica de fora nesta fase — não existe nenhuma
-- funcionalidade de atas de reunião no produto ainda pra gerar esse tipo
-- de notificação a partir de dado real.
--
-- Também ficam de fora nesta fase (documentado, não esquecido):
--   - Kickoff/Treinamento/Check-in 1/Check-in 2 "ainda não agendado,
--     prazo se aproximando" — a regra de prazo por marco já existe em
--     TypeScript (src/lib/reunioes.ts, alertaReuniaoObrigatoria) mas
--     replicar isso certinho em SQL exigiria portar toda a lógica de
--     dependência entre marcos; fica pra uma fase 2 dedicada.
--   - "Critério de entrega pendente" e "Formulário ainda não respondido
--     dentro do prazo" — não há um prazo/SLA definido pra esses dois no
--     produto hoje, então não dá pra gerar sem inventar um número.
--
-- Segue o mesmo padrão de RLS por vínculo já usado em todo o produto
-- (tenho_acesso_ao_cliente, migration 0051).

-- ============================================================
-- 1) Schema
-- ============================================================
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in (
    'implementacao', 'trial', 'formulario', 'funil', 'reuniao', 'pendencia', 'sistema'
  )),
  tipo text not null,
  titulo text not null,
  descricao text,
  cliente_id uuid references public.clientes(id) on delete cascade,
  implementacao_id uuid references public.implementacoes_crm(id) on delete set null,
  prioridade text not null check (prioridade in ('informativa', 'atencao', 'alta', 'critica')),
  rota text,
  entidade_tipo text,
  entidade_id uuid,
  -- Chave de idempotência: cada regra de geração monta a sua (ex:
  -- 'trial_dias_3:<cliente_id>') garantindo que o mesmo marco nunca gera
  -- duas notificações.
  chave_idempotencia text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists notificacoes_cliente_id_idx on public.notificacoes(cliente_id);
create index if not exists notificacoes_created_at_idx on public.notificacoes(created_at desc);
create index if not exists notificacoes_categoria_idx on public.notificacoes(categoria);

alter table public.notificacoes enable row level security;

-- Só leitura direta (mesma regra de vínculo do resto do produto) — escrita
-- só pelas funções SECURITY DEFINER abaixo, nunca direto da tela.
drop policy if exists "notificacoes_select_por_vinculo" on public.notificacoes;
create policy "notificacoes_select_por_vinculo"
  on public.notificacoes for select
  to authenticated
  using (
    (cliente_id is null and public.sou_administrador())
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  );

-- Status de leitura é POR USUÁRIO — uma notificação vista por um consultor
-- não pode aparecer como lida pra outro que também tenha acesso ao mesmo
-- cliente. Mesmo padrão de "template + status" já usado em
-- atividades_cronograma/atividades_status e criterios_entrega/
-- criterios_entrega_status: a ausência de linha aqui = não lida.
create table if not exists public.notificacoes_status (
  id uuid primary key default gen_random_uuid(),
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lida boolean not null default false,
  lida_em timestamptz,
  arquivada boolean not null default false,
  arquivada_em timestamptz,
  updated_at timestamptz not null default now(),
  unique (notificacao_id, user_id)
);

create index if not exists notificacoes_status_user_id_idx on public.notificacoes_status(user_id);

alter table public.notificacoes_status enable row level security;

drop policy if exists "notificacoes_status_own" on public.notificacoes_status;
create policy "notificacoes_status_own"
  on public.notificacoes_status for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists notificacoes_status_set_updated_at on public.notificacoes_status;
create trigger notificacoes_status_set_updated_at
  before update on public.notificacoes_status
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Função central de criação (idempotente) — usada pelos triggers de
-- evento. A geração por rotina (seção 4) insere direto em lote, por
-- performance, sem passar por aqui.
-- ============================================================
create or replace function public.criar_notificacao(
  p_categoria text,
  p_tipo text,
  p_titulo text,
  p_descricao text,
  p_cliente_id uuid,
  p_implementacao_id uuid,
  p_prioridade text,
  p_rota text,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_chave_idempotencia text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notificacoes
    (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  values
    (p_categoria, p_tipo, p_titulo, p_descricao, p_cliente_id, p_implementacao_id, p_prioridade, p_rota, p_entidade_tipo, p_entidade_id, p_chave_idempotencia)
  on conflict (chave_idempotencia) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.criar_notificacao(text, text, text, text, uuid, uuid, text, text, text, uuid, text) from public;

-- ============================================================
-- 3) Ação da tela: marcar como lida/não lida/arquivada (upsert direto,
-- permitido pela RLS de notificacoes_status) e "marcar todas como lidas"
-- (função, porque precisa inserir em lote pra tudo que o usuário enxerga).
-- ============================================================
create or replace function public.marcar_todas_notificacoes_como_lidas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notificacoes_status (notificacao_id, user_id, lida, lida_em)
  select n.id, auth.uid(), true, now()
  from public.notificacoes n
  where (
    (n.cliente_id is null and public.sou_administrador())
    or (n.cliente_id is not null and public.tenho_acesso_ao_cliente(n.cliente_id))
  )
  on conflict (notificacao_id, user_id) do update
    set lida = true, lida_em = now(), updated_at = now()
    where public.notificacoes_status.lida = false;
end;
$$;

revoke all on function public.marcar_todas_notificacoes_como_lidas() from public;
grant execute on function public.marcar_todas_notificacoes_como_lidas() to authenticated;

-- ============================================================
-- 4) Geração por EVENTO — dispara na hora que o dado muda.
-- ============================================================

-- Formulários respondidos + transições de status do funil (vendas e
-- pós-venda usam a mesma máquina de status, ver mapeamento_status).
create or replace function public.notificar_evento_mapeamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cliente text;
  v_tipo_label text;
begin
  if new.cliente_id is null then
    return new;
  end if;

  select nome_empresa into v_nome_cliente from public.clientes where id = new.cliente_id;
  v_tipo_label := case new.tipo when 'pos_venda' then 'pós-venda' else 'vendas' end;

  if new.enviado_pelo_cliente and not old.enviado_pelo_cliente then
    perform public.criar_notificacao(
      'formulario', 'formulario_respondido_' || new.tipo,
      'Cliente respondeu formulário de ' || v_tipo_label,
      coalesce(v_nome_cliente, 'Cliente') || ' enviou as respostas do formulário de ' || v_tipo_label || '.',
      new.cliente_id, null, 'informativa', '/mapeamento/' || new.id || '/respostas',
      'mapeamento', new.id, 'formulario_respondido:' || new.id
    );
  end if;

  if new.status is distinct from old.status then
    if new.status = 'funil_gerado' then
      perform public.criar_notificacao(
        'funil', 'funil_gerado_ia', 'Funil gerado pela IA',
        'O funil de ' || v_tipo_label || ' de ' || coalesce(v_nome_cliente, 'cliente') || ' foi gerado e está pronto pra revisão.',
        new.cliente_id, null, 'informativa', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'funil_gerado:' || new.id
      );
    elsif new.status = 'em_revisao_interna' and new.tipo = 'pos_venda' then
      perform public.criar_notificacao(
        'funil', 'funil_pos_venda_pronto_validacao', 'Funil de pós-venda pronto para validação',
        'O funil de pós-venda de ' || coalesce(v_nome_cliente, 'cliente') || ' está pronto pra revisão interna.',
        new.cliente_id, null, 'atencao', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'funil_revisao:' || new.id
      );
    elsif new.status = 'em_revisao_interna' then
      perform public.criar_notificacao(
        'funil', 'funil_aguardando_revisao', 'Funil aguardando revisão',
        'O funil de vendas de ' || coalesce(v_nome_cliente, 'cliente') || ' está pronto pra revisão interna.',
        new.cliente_id, null, 'atencao', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'funil_revisao:' || new.id
      );
    elsif new.status = 'pronto_kickoff' then
      perform public.criar_notificacao(
        'funil', 'funil_revisado', 'Funil revisado',
        'O funil de ' || coalesce(v_nome_cliente, 'cliente') || ' foi revisado e está pronto pro Kickoff.',
        new.cliente_id, null, 'atencao', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'funil_revisado:' || new.id
      );
    elsif new.status = 'funil_validado' then
      perform public.criar_notificacao(
        'funil', 'funil_validado', 'Funil validado',
        'O funil de ' || coalesce(v_nome_cliente, 'cliente') || ' foi validado pelo cliente.',
        new.cliente_id, null, 'informativa', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'funil_validado:' || new.id
      );
    elsif new.status = 'erro' then
      perform public.criar_notificacao(
        'sistema', 'falha_geracao_funil', 'Falha na geração do funil',
        'A geração do funil de ' || v_tipo_label || ' de ' || coalesce(v_nome_cliente, 'cliente') || ' falhou. Verifique e tente novamente.',
        new.cliente_id, null, 'critica', '/mapeamento/' || new.id, 'mapeamento', new.id,
        'falha_geracao:' || new.id || ':' || extract(epoch from now())::text
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists mapeamentos_notificar_evento on public.mapeamentos;
create trigger mapeamentos_notificar_evento
  after update on public.mapeamentos
  for each row execute function public.notificar_evento_mapeamento();

-- Nova versão de funil (a primeira versão já é coberta por
-- "funil_gerado_ia" acima, então só notifica a partir da 2ª).
create or replace function public.notificar_nova_versao_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_nome_cliente text;
begin
  if new.versao <= 1 then
    return new;
  end if;

  select cliente_id into v_cliente_id from public.mapeamentos where id = new.mapeamento_id;
  if v_cliente_id is null then
    return new;
  end if;
  select nome_empresa into v_nome_cliente from public.clientes where id = v_cliente_id;

  perform public.criar_notificacao(
    'funil', 'nova_versao_funil', 'Nova versão de funil criada',
    'Uma nova versão (v' || new.versao || ') do funil de ' || coalesce(v_nome_cliente, 'cliente') || ' foi criada.',
    v_cliente_id, null, 'informativa', '/mapeamento/' || new.mapeamento_id, 'funil_versao', new.id,
    'nova_versao_funil:' || new.mapeamento_id || ':' || new.versao
  );

  return new;
end;
$$;

drop trigger if exists funil_versoes_notificar_nova_versao on public.funil_versoes;
create trigger funil_versoes_notificar_nova_versao
  after insert on public.funil_versoes
  for each row execute function public.notificar_nova_versao_funil();

-- Implementação concluída.
create or replace function public.notificar_implementacao_concluida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cliente text;
begin
  if new.status is distinct from old.status and new.status = 'concluida' and new.cliente_id is not null then
    select nome_empresa into v_nome_cliente from public.clientes where id = new.cliente_id;
    perform public.criar_notificacao(
      'implementacao', 'implementacao_concluida', 'Implementação concluída',
      'A implementação de ' || coalesce(v_nome_cliente, 'cliente') || ' foi concluída.',
      new.cliente_id, new.id, 'informativa', '/clientes/' || new.cliente_id || '?aba=implementacao',
      'implementacao', new.id, 'implementacao_concluida:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists implementacoes_crm_notificar_concluida on public.implementacoes_crm;
create trigger implementacoes_crm_notificar_concluida
  after update on public.implementacoes_crm
  for each row execute function public.notificar_implementacao_concluida();

-- Reuniões: remarcada, cliente não compareceu, cancelada.
create or replace function public.notificar_reuniao_remarcada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_nome_cliente text;
  v_tipo text;
begin
  select cliente_id, tipo into v_cliente_id, v_tipo from public.reunioes where id = new.reuniao_id;
  if v_cliente_id is null then
    return new;
  end if;
  select nome_empresa into v_nome_cliente from public.clientes where id = v_cliente_id;

  perform public.criar_notificacao(
    'reuniao', 'reuniao_remarcada', 'Reunião remarcada',
    'A reunião de ' || v_tipo || ' de ' || coalesce(v_nome_cliente, 'cliente') || ' foi remarcada. Motivo: ' || new.motivo,
    v_cliente_id, null, 'atencao', '/clientes/' || v_cliente_id || '?aba=reunioes', 'reuniao', new.reuniao_id,
    'reuniao_remarcada:' || new.id
  );

  return new;
end;
$$;

drop trigger if exists reuniao_remarcacoes_notificar on public.reuniao_remarcacoes;
create trigger reuniao_remarcacoes_notificar
  after insert on public.reuniao_remarcacoes
  for each row execute function public.notificar_reuniao_remarcada();

create or replace function public.notificar_evento_reuniao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cliente text;
begin
  if new.status is distinct from old.status and new.cliente_id is not null then
    select nome_empresa into v_nome_cliente from public.clientes where id = new.cliente_id;

    if new.status = 'cliente_nao_compareceu' then
      perform public.criar_notificacao(
        'reuniao', 'reuniao_cliente_nao_compareceu', 'Cliente não compareceu',
        coalesce(v_nome_cliente, 'Cliente') || ' não compareceu à reunião de ' || new.tipo || '.',
        new.cliente_id, new.implementacao_id, 'alta', '/clientes/' || new.cliente_id || '?aba=reunioes',
        'reuniao', new.id, 'reuniao_nao_compareceu:' || new.id || ':' || coalesce(new.data_hora::text, '')
      );
    elsif new.status = 'cancelada' then
      perform public.criar_notificacao(
        'reuniao', 'reuniao_cancelada', 'Reunião cancelada',
        'A reunião de ' || new.tipo || ' de ' || coalesce(v_nome_cliente, 'cliente') || ' foi cancelada.',
        new.cliente_id, new.implementacao_id, 'alta', '/clientes/' || new.cliente_id || '?aba=reunioes',
        'reuniao', new.id, 'reuniao_cancelada:' || new.id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reunioes_notificar_evento on public.reunioes;
create trigger reunioes_notificar_evento
  after update on public.reunioes
  for each row execute function public.notificar_evento_reuniao();

-- Pendências (cliente_ocorrencias).
create or replace function public.notificar_nova_pendencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome_cliente text;
begin
  select nome_empresa into v_nome_cliente from public.clientes where id = new.cliente_id;
  perform public.criar_notificacao(
    'pendencia', 'nova_pendencia', 'Nova pendência registrada',
    left(new.descricao, 200),
    new.cliente_id, null, 'atencao', '/clientes/' || new.cliente_id || '?aba=historico',
    'cliente_ocorrencia', new.id, 'nova_pendencia:' || new.id
  );
  return new;
end;
$$;

drop trigger if exists cliente_ocorrencias_notificar_nova on public.cliente_ocorrencias;
create trigger cliente_ocorrencias_notificar_nova
  after insert on public.cliente_ocorrencias
  for each row execute function public.notificar_nova_pendencia();

create or replace function public.notificar_pendencia_resolvida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status = 'resolvida' then
    perform public.criar_notificacao(
      'pendencia', 'pendencia_resolvida', 'Pendência resolvida',
      left(new.descricao, 200),
      new.cliente_id, null, 'informativa', '/clientes/' || new.cliente_id || '?aba=historico',
      'cliente_ocorrencia', new.id, 'pendencia_resolvida:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_ocorrencias_notificar_resolvida on public.cliente_ocorrencias;
create trigger cliente_ocorrencias_notificar_resolvida
  after update on public.cliente_ocorrencias
  for each row execute function public.notificar_pendencia_resolvida();

-- Extensão de Trial aprovada.
create or replace function public.notificar_extensao_trial_aprovada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotulo text;
begin
  if new.extensao_14_aprovada_em is not null and old.extensao_14_aprovada_em is null then
    v_rotulo := '+14 dias';
  elsif new.extensao_7_aprovada_em is not null and old.extensao_7_aprovada_em is null then
    v_rotulo := '+7 dias';
  else
    return new;
  end if;

  perform public.criar_notificacao(
    'trial', 'extensao_trial_aprovada', 'Extensão de Trial aprovada',
    'A extensão de ' || v_rotulo || ' do Trial Kommo de ' || new.nome_empresa || ' foi aprovada.',
    new.id, null, 'informativa', '/clientes/' || new.id || '?aba=trial', 'cliente', new.id,
    'extensao_aprovada:' || new.id || ':' || v_rotulo
  );

  return new;
end;
$$;

drop trigger if exists clientes_notificar_extensao_trial on public.clientes;
create trigger clientes_notificar_extensao_trial
  after update on public.clientes
  for each row execute function public.notificar_extensao_trial_aprovada();

-- ============================================================
-- 5) Geração por ROTINA (diária, via pg_cron) — tudo que depende da data
-- de hoje. Insere em lote direto (sem passar por criar_notificacao) por
-- performance; a chave de idempotência garante que rodar isso todo dia não
-- duplica nada, só preenche o que ainda não existe.
-- ============================================================
create or replace function public.gerar_notificacoes_periodicas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trial Kommo: contagem regressiva (5/3/1/0 dias) + encerrado. Espelha
  -- resolverResumoTrialKommo em src/lib/trialKommo.ts — mudou lá, muda
  -- aqui também.
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
    -- Inclui o vencimento na chave (não só o cliente) de propósito: se uma
    -- extensão for aprovada, o vencimento muda, e o marco "faltam N dias"
    -- precisa poder disparar de novo pro NOVO vencimento — sem isso, uma
    -- vez usado o marco "faltam 5 dias" pro trial inicial, ele nunca mais
    -- dispararia pra quando a extensão também chegar a faltar 5 dias.
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

  -- Trial encerrado (venceu e não há próxima extensão pendente de
  -- aprovação — ou seja, já usou as duas ou nunca vai usar mais nenhuma).
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

  -- Extensão ainda não solicitada, faltando pouco pro vencimento do
  -- período atual.
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'trial', 'extensao_' || e.rotulo || '_nao_solicitada',
    'Extensão +' || e.rotulo || ' dias ainda não solicitada',
    'O Trial de ' || c.nome_empresa || ' vence em breve e a extensão de +' || e.rotulo || ' dias ainda não foi solicitada.',
    c.id, 'alta', '/clientes/' || c.id || '?aba=trial', 'cliente', c.id,
    'extensao_' || e.rotulo || '_nao_solicitada:' || c.id
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

  -- Dia do ciclo da implementação (30/35/40), contado do Kickoff — espelha
  -- calcularDiaCiclo em src/lib/atividadesCronograma.ts.
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

  -- Atividade do cronograma atrasada (agendada pra uma data que já passou
  -- e ainda sem data_real, e não bloqueada pelo cliente).
  insert into public.notificacoes (categoria, tipo, titulo, descricao, cliente_id, implementacao_id, prioridade, rota, entidade_tipo, entidade_id, chave_idempotencia)
  select
    'implementacao', 'atividade_atrasada', 'Atividade atrasada',
    'A atividade "' || ac.nome || '" de ' || c.nome_empresa || ' está atrasada (agendada para ' || to_char(ast.agendado_para, 'DD/MM') || ').',
    i.cliente_id, i.id, 'atencao', '/implementacoes/' || i.id || '?aba=checklist', 'atividade_status', ast.id,
    'atividade_atrasada:' || ast.id
  from public.atividades_status ast
  join public.atividades_cronograma ac on ac.id = ast.atividade_id
  join public.implementacoes_crm i on i.id = ast.implementacao_id
  join public.clientes c on c.id = i.cliente_id
  where ast.data_real is null
    and ast.agendado_para is not null
    and ast.agendado_para < current_date
    and not ast.bloqueado_pelo_cliente
  on conflict (chave_idempotencia) do nothing;

  -- Reunião amanhã / hoje.
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
end;
$$;

revoke all on function public.gerar_notificacoes_periodicas() from public;

-- ============================================================
-- 6) Agendamento diário via pg_cron. Se a extensão não estiver disponível
-- no plano/projeto, este bloco levanta um aviso (não erro fatal) e a
-- rotina precisa ser acionada de outra forma (ver relatório da sessão).
-- ============================================================
do $$
begin
  create extension if not exists pg_cron;

  perform cron.schedule(
    'gerar-notificacoes-diarias',
    '0 9 * * *', -- 09:00 UTC todo dia
    $cron$select public.gerar_notificacoes_periodicas();$cron$
  );
exception when others then
  raise warning 'Não foi possível agendar via pg_cron (%). Rode public.gerar_notificacoes_periodicas() manualmente ou agende por fora (ver relatório).', sqlerrm;
end $$;
