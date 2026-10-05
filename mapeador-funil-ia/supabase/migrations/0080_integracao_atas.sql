-- ============================================================
-- Integração com o App de Atas (MVP) — o Mapeador continua sendo dono de
-- cliente/implementação/reunião/pendência/Timeline/Agenda/notificações; o
-- App de Atas continua sendo dono de gerar/processar a ata. Esta migration
-- só cria o ponto de entrada (tabelas + RPCs) consumido pela Edge Function
-- `webhook-atas`, que é quem de fato recebe o payload externo.
--
-- Princípios seguidos (ver pedido original):
-- - nunca identificar cliente só pelo nome — prioridade é reuniao_id >
--   implementacao_id > cliente_id > vínculo manual;
-- - ata pode ser importada automaticamente; PENDÊNCIA nunca é criada
--   automaticamente, sempre exige confirmação humana;
-- - idempotência por (integration_source, external_minute_id): reenvio da
--   mesma ata nunca duplica; se o conteúdo mudou de verdade, vira uma nova
--   versão (nunca sobrescreve a anterior silenciosamente).
-- ============================================================

-- ============================================================
-- 1) Ata recebida — uma linha por versão. A Edge Function é a única
-- gravando aqui (via service role, que ignora RLS) — nenhuma policy de
-- insert é concedida a `authenticated`, só select/update (vínculo manual,
-- revisão).
-- ============================================================
create table if not exists public.atas_reuniao (
  id uuid primary key default gen_random_uuid(),
  external_minute_id text,
  integration_source text not null default 'app_atas',
  versao int not null,
  -- Vínculo — todos nulos até serem resolvidos (automático ou manual).
  cliente_id uuid references public.clientes(id) on delete set null,
  implementacao_id uuid references public.implementacoes_crm(id) on delete set null,
  reuniao_id uuid references public.reunioes(id) on delete set null,
  tipo_reuniao text,
  titulo text,
  data_reuniao timestamptz,
  status text not null default 'recebida' check (
    status in ('recebida', 'processada', 'requer_revisao', 'vinculada', 'erro_vinculo', 'falhou')
  ),
  vinculo_tipo text check (vinculo_tipo in ('automatico_id', 'automatico_sugerido', 'manual')),
  participantes jsonb not null default '[]'::jsonb,
  resumo text,
  decisoes jsonb not null default '[]'::jsonb,
  conteudo_original text,
  conteudo_hash text,
  gerada_em timestamptz,
  erro_mensagem text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atas_reuniao_reuniao_idx on public.atas_reuniao (reuniao_id);
create index if not exists atas_reuniao_implementacao_idx on public.atas_reuniao (implementacao_id);
create index if not exists atas_reuniao_cliente_idx on public.atas_reuniao (cliente_id);
create index if not exists atas_reuniao_external_idx on public.atas_reuniao (integration_source, external_minute_id, versao desc);
create index if not exists atas_reuniao_status_idx on public.atas_reuniao (status) where status in ('requer_revisao', 'erro_vinculo', 'falhou');

-- Versionamento automático — nunca sobrescreve: um reenvio com conteúdo
-- igual é tratado como "already_processed" pela Edge Function (nem chega a
-- inserir); um reenvio com conteúdo DIFERENTE pro mesmo external_minute_id
-- vira uma nova linha/versão aqui.
create or replace function public.definir_versao_ata_reuniao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.versao is null then
    if new.external_minute_id is null then
      new.versao := 1;
    else
      select coalesce(max(versao), 0) + 1 into new.versao
      from public.atas_reuniao
      where integration_source = new.integration_source
        and external_minute_id = new.external_minute_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_definir_versao_ata_reuniao
  before insert on public.atas_reuniao
  for each row execute function public.definir_versao_ata_reuniao();

create trigger trg_atas_reuniao_updated_at
  before update on public.atas_reuniao
  for each row execute function public.set_updated_at();

alter table public.atas_reuniao enable row level security;

-- Visível pra quem tem acesso ao cliente/implementação já vinculados; uma
-- ata ainda sem NENHUM vínculo (requer_revisao "cega") só aparece pra
-- administrador, pra não espalhar conteúdo de reunião sem dono definido.
create policy "atas_reuniao_select"
  on public.atas_reuniao for select
  to authenticated
  using (
    public.sou_administrador()
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  );

-- Só o vínculo manual passa por aqui como UPDATE direto da tela (campos de
-- conteúdo nunca são editados pela UI — só pelas RPCs abaixo, que validam
-- a coerência do vínculo antes de gravar).
create policy "atas_reuniao_update"
  on public.atas_reuniao for update
  to authenticated
  using (
    public.sou_administrador()
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  )
  with check (
    public.sou_administrador()
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  );

-- ============================================================
-- 2) Ações identificadas na ata — cada uma com ciclo de vida próprio
-- (pendente_revisao → convertida_pendencia | descartada), pra não revisar a
-- mesma sugestão duas vezes.
-- ============================================================
create table if not exists public.ata_acoes_identificadas (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references public.atas_reuniao(id) on delete cascade,
  titulo text not null,
  descricao text,
  responsavel_nome text,
  responsavel_tipo text check (responsavel_tipo in ('cliente', 'interna')),
  prazo_sugerido date,
  status text not null default 'pendente_revisao' check (
    status in ('pendente_revisao', 'convertida_pendencia', 'descartada')
  ),
  motivo_descarte text,
  pendencia_id uuid references public.cliente_ocorrencias(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ata_acoes_identificadas_ata_idx on public.ata_acoes_identificadas (ata_id, ordem);

create trigger trg_ata_acoes_identificadas_updated_at
  before update on public.ata_acoes_identificadas
  for each row execute function public.set_updated_at();

alter table public.ata_acoes_identificadas enable row level security;

create policy "ata_acoes_identificadas_select"
  on public.ata_acoes_identificadas for select
  to authenticated
  using (
    exists (
      select 1 from public.atas_reuniao a
      where a.id = ata_id
        and (
          public.sou_administrador()
          or (a.implementacao_id is not null and public.tenho_acesso_a_implementacao(a.implementacao_id))
          or (a.cliente_id is not null and public.tenho_acesso_ao_cliente(a.cliente_id))
        )
    )
  );

-- Update direto só pra marcar "descartada" com motivo — a conversão em
-- pendência (status convertida_pendencia + pendencia_id) é feita via RPC,
-- pra garantir que a pendência de fato existe antes de marcar o vínculo.
create policy "ata_acoes_identificadas_update"
  on public.ata_acoes_identificadas for update
  to authenticated
  using (
    exists (
      select 1 from public.atas_reuniao a
      where a.id = ata_id
        and (
          public.sou_administrador()
          or (a.implementacao_id is not null and public.tenho_acesso_a_implementacao(a.implementacao_id))
          or (a.cliente_id is not null and public.tenho_acesso_ao_cliente(a.cliente_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.atas_reuniao a
      where a.id = ata_id
        and (
          public.sou_administrador()
          or (a.implementacao_id is not null and public.tenho_acesso_a_implementacao(a.implementacao_id))
          or (a.cliente_id is not null and public.tenho_acesso_ao_cliente(a.cliente_id))
        )
    )
  );

-- ============================================================
-- 3) Log de integração (seções 8/35/44) — toda tentativa (sucesso, erro,
-- duplicada) fica registrada aqui; só a Edge Function escreve (service
-- role), só administrador lê.
-- ============================================================
create table if not exists public.atas_integracao_log (
  id uuid primary key default gen_random_uuid(),
  external_minute_id text,
  integration_source text not null default 'app_atas',
  ata_id uuid references public.atas_reuniao(id) on delete set null,
  evento text not null,
  sucesso boolean not null,
  mensagem_erro text,
  detalhes jsonb not null default '{}'::jsonb,
  tentativa int not null default 1,
  criado_em timestamptz not null default now()
);

create index if not exists atas_integracao_log_criado_em_idx on public.atas_integracao_log (criado_em desc);

alter table public.atas_integracao_log enable row level security;

create policy "atas_integracao_log_select"
  on public.atas_integracao_log for select
  to authenticated
  using (public.sou_administrador());

-- ============================================================
-- 4) Vínculo pendência → ata (seção 23) — nunca o contrário: a pendência
-- aponta pra ação de origem, cliente_ocorrencias continua sendo a única
-- fonte oficial de pendência (seção 17 — "não criar nova categoria só para
-- atas").
-- ============================================================
alter table public.cliente_ocorrencias
  add column if not exists ata_id uuid references public.atas_reuniao(id) on delete set null,
  add column if not exists ata_acao_id uuid references public.ata_acoes_identificadas(id) on delete set null;

-- ============================================================
-- 5) Vínculo manual (seções 10/11/30) — usado tanto pra ata sem reuniao_id
-- quanto pra corrigir uma sugestão automática errada. Sempre valida que a
-- reunião é compatível com o cliente/implementação informados.
-- ============================================================
create or replace function public.vincular_ata_manualmente(
  p_ata_id uuid,
  p_cliente_id uuid,
  p_implementacao_id uuid,
  p_reuniao_id uuid
)
returns public.atas_reuniao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reuniao public.reunioes;
  v_ata public.atas_reuniao;
begin
  if p_reuniao_id is not null then
    select * into v_reuniao from public.reunioes where id = p_reuniao_id;
    if v_reuniao is null then
      raise exception 'Reunião não encontrada.' using errcode = 'P0001';
    end if;
    if p_cliente_id is not null and v_reuniao.cliente_id is distinct from p_cliente_id then
      raise exception 'Esta reunião não pertence ao cliente informado.' using errcode = 'P0001';
    end if;
    if p_implementacao_id is not null and v_reuniao.implementacao_id is distinct from p_implementacao_id then
      raise exception 'Esta reunião não pertence à implementação informada.' using errcode = 'P0001';
    end if;
    if not public.tenho_acesso_ao_cliente(v_reuniao.cliente_id) then
      raise exception 'Sem acesso a esta reunião.' using errcode = '42501';
    end if;
  elsif p_implementacao_id is not null then
    if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
      raise exception 'Sem acesso a esta implementação.' using errcode = '42501';
    end if;
  elsif p_cliente_id is not null then
    if not public.tenho_acesso_ao_cliente(p_cliente_id) then
      raise exception 'Sem acesso a este cliente.' using errcode = '42501';
    end if;
  else
    raise exception 'Informe ao menos cliente, implementação ou reunião.' using errcode = 'P0001';
  end if;

  update public.atas_reuniao
  set
    cliente_id = coalesce(p_cliente_id, (select cliente_id from public.reunioes where id = p_reuniao_id), cliente_id),
    implementacao_id = coalesce(p_implementacao_id, (select implementacao_id from public.reunioes where id = p_reuniao_id), implementacao_id),
    reuniao_id = coalesce(p_reuniao_id, reuniao_id),
    status = 'vinculada',
    vinculo_tipo = 'manual',
    erro_mensagem = null,
    processado_em = now()
  where id = p_ata_id
  returning * into v_ata;

  if v_ata.id is null then
    raise exception 'Ata não encontrada.' using errcode = 'P0001';
  end if;

  perform public.registrar_auditoria(
    'ata_vinculada_manualmente',
    'ata_integracao',
    v_ata.id,
    v_ata.cliente_id,
    v_ata.implementacao_id,
    jsonb_build_object('reuniao_id', v_ata.reuniao_id)
  );

  return v_ata;
end;
$$;

revoke all on function public.vincular_ata_manualmente(uuid, uuid, uuid, uuid) from public;
grant execute on function public.vincular_ata_manualmente(uuid, uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 6) Importação manual (seção 37) — fallback pra quando o webhook falhar
-- ou a reunião tiver acontecido fora do fluxo automático. Mesma tabela,
-- origem marcada como 'manual' pra deixar claro de onde veio (seção 32).
-- ============================================================
create or replace function public.importar_ata_manual(
  p_cliente_id uuid,
  p_implementacao_id uuid,
  p_reuniao_id uuid,
  p_titulo text,
  p_conteudo_original text,
  p_resumo text
)
returns public.atas_reuniao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reuniao public.reunioes;
  v_ata public.atas_reuniao;
begin
  if p_reuniao_id is not null then
    select * into v_reuniao from public.reunioes where id = p_reuniao_id;
    if v_reuniao is null then
      raise exception 'Reunião não encontrada.' using errcode = 'P0001';
    end if;
    if not public.tenho_acesso_ao_cliente(v_reuniao.cliente_id) then
      raise exception 'Sem acesso a esta reunião.' using errcode = '42501';
    end if;
  elsif p_implementacao_id is not null then
    if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
      raise exception 'Sem acesso a esta implementação.' using errcode = '42501';
    end if;
  elsif p_cliente_id is not null then
    if not public.tenho_acesso_ao_cliente(p_cliente_id) then
      raise exception 'Sem acesso a este cliente.' using errcode = '42501';
    end if;
  else
    raise exception 'Informe ao menos cliente, implementação ou reunião.' using errcode = 'P0001';
  end if;

  insert into public.atas_reuniao (
    integration_source, cliente_id, implementacao_id, reuniao_id, tipo_reuniao,
    titulo, data_reuniao, resumo, conteudo_original, status, vinculo_tipo,
    gerada_em, processado_em
  ) values (
    'manual',
    coalesce(p_cliente_id, v_reuniao.cliente_id),
    coalesce(p_implementacao_id, v_reuniao.implementacao_id),
    p_reuniao_id,
    v_reuniao.tipo,
    p_titulo,
    v_reuniao.data_hora,
    p_resumo,
    p_conteudo_original,
    case when p_reuniao_id is not null then 'vinculada' else 'requer_revisao' end,
    case when p_reuniao_id is not null then 'manual' else null end,
    now(),
    now()
  )
  returning * into v_ata;

  perform public.registrar_auditoria(
    'ata_importada_manualmente',
    'ata_integracao',
    v_ata.id,
    v_ata.cliente_id,
    v_ata.implementacao_id,
    '{}'::jsonb
  );

  return v_ata;
end;
$$;

revoke all on function public.importar_ata_manual(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.importar_ata_manual(uuid, uuid, uuid, text, text, text) to authenticated;

-- ============================================================
-- 7) Descartar ação sugerida (seção 21) — não vira pendência, não aparece
-- mais como pendente de revisão.
-- ============================================================
create or replace function public.descartar_acao_ata(p_acao_id uuid, p_motivo text)
returns public.ata_acoes_identificadas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acao public.ata_acoes_identificadas;
  v_ata public.atas_reuniao;
begin
  select * into v_acao from public.ata_acoes_identificadas where id = p_acao_id;
  if v_acao.id is null then
    raise exception 'Ação não encontrada.' using errcode = 'P0001';
  end if;

  select * into v_ata from public.atas_reuniao where id = v_acao.ata_id;
  if not (
    public.sou_administrador()
    or (v_ata.implementacao_id is not null and public.tenho_acesso_a_implementacao(v_ata.implementacao_id))
    or (v_ata.cliente_id is not null and public.tenho_acesso_ao_cliente(v_ata.cliente_id))
  ) then
    raise exception 'Sem acesso a esta ata.' using errcode = '42501';
  end if;

  update public.ata_acoes_identificadas
  set status = 'descartada', motivo_descarte = p_motivo
  where id = p_acao_id
  returning * into v_acao;

  return v_acao;
end;
$$;

revoke all on function public.descartar_acao_ata(uuid, text) from public;
grant execute on function public.descartar_acao_ata(uuid, text) to authenticated;

-- ============================================================
-- 8) Auto-resolução da notificação "ações aguardando revisão" (seção 27) —
-- chamada pela UI depois que a última ação pendente da ata é revisada
-- (convertida ou descartada). Mesmo padrão de resolvida_em já usado desde
-- a migration 0072 (nunca reabre, só marca resolvida quando a condição
-- deixa de existir).
-- ============================================================
create or replace function public.resolver_notificacao_ata_revisao(p_ata_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.ata_acoes_identificadas
    where ata_id = p_ata_id and status = 'pendente_revisao'
  ) then
    return;
  end if;

  update public.notificacoes
  set resolvida_em = now()
  where chave_idempotencia = 'ata_revisao_' || p_ata_id::text
    and resolvida_em is null;
end;
$$;

revoke all on function public.resolver_notificacao_ata_revisao(uuid) from public;
grant execute on function public.resolver_notificacao_ata_revisao(uuid) to authenticated;
