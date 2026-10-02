-- Módulo de Templates de Implementação — Fase 2 (aditiva).
--
-- Adiciona as peças de conteúdo que ficaram de fora do núcleo: Campos CRM
-- recomendados, Automações sugeridas e Documentos esperados. E permite
-- aplicar um template numa implementação JÁ EXISTENTE (não só numa nova),
-- com proteção simples contra duplicidade.
--
-- Decisão de arquitetura — Campos CRM e Automações NÃO são clonados por
-- implementação: a seção 13/14 do pedido original é explícita que "campo
-- recomendado" e "automação sugerida" NUNCA devem ser implantados
-- automaticamente, só mostrados pra revisão do consultor. Como não existe
-- nenhuma ação real de "criar campo"/"criar automação" disparada pelo
-- sistema (isso acontece manualmente no Kommo), não há necessidade de uma
-- cópia por implementação — a implementação só referencia o template
-- aplicado (templates_implementacao_id, já gravado na Fase 1) e lê a lista
-- direto de lá. Documentos, por outro lado, têm um estado real por cliente
-- (entregue ou não) — esses SIM são clonados, no mesmo padrão de
-- implementacao_reunioes_esperadas/implementacao_criterios_template.

-- ============================================================
-- 1) Campos CRM recomendados (só no template — nunca aplicado
-- automaticamente em nenhum lugar, ver nota acima).
-- ============================================================
create table if not exists public.template_campos_crm (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in (
    'texto', 'numero', 'selecao', 'multipla_selecao', 'data', 'telefone', 'email', 'checkbox'
  )),
  entidade text not null default 'Lead',
  obrigatorio boolean not null default false,
  descricao text,
  quando_usar text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_campos_crm_template_id_idx on public.template_campos_crm(template_id);

alter table public.template_campos_crm enable row level security;

create policy "template_campos_crm_select_authenticated"
  on public.template_campos_crm for select
  to authenticated
  using (true);

create policy "template_campos_crm_all_admin"
  on public.template_campos_crm for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_campos_crm_set_updated_at
  before update on public.template_campos_crm
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Automações sugeridas (idem — só modelo, nunca implantada sozinha).
-- ============================================================
create table if not exists public.template_automacoes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  nome text not null,
  objetivo text,
  gatilho text,
  condicao text,
  acao text,
  observacoes text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_automacoes_template_id_idx on public.template_automacoes(template_id);

alter table public.template_automacoes enable row level security;

create policy "template_automacoes_select_authenticated"
  on public.template_automacoes for select
  to authenticated
  using (true);

create policy "template_automacoes_all_admin"
  on public.template_automacoes for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_automacoes_set_updated_at
  before update on public.template_automacoes
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3) Documentos esperados — esses têm estado real por cliente (entregue
-- ou não), então são clonados por implementação quando o template é
-- aplicado, igual reuniões esperadas e critérios.
-- ============================================================
create table if not exists public.template_documentos (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  nome text not null,
  obrigatorio boolean not null default true,
  fase text,
  descricao text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_documentos_template_id_idx on public.template_documentos(template_id);

alter table public.template_documentos enable row level security;

create policy "template_documentos_select_authenticated"
  on public.template_documentos for select
  to authenticated
  using (true);

create policy "template_documentos_all_admin"
  on public.template_documentos for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_documentos_set_updated_at
  before update on public.template_documentos
  for each row execute function public.set_updated_at();

create table if not exists public.implementacao_documentos_template (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  nome text not null,
  obrigatorio boolean not null default true,
  fase text,
  descricao text,
  entregue boolean not null default false,
  entregue_em timestamptz,
  nao_aplicavel boolean not null default false,
  nao_aplicavel_justificativa text,
  origem_template_id uuid references public.templates_implementacao(id) on delete set null,
  origem_template_documento_id uuid references public.template_documentos(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementacao_documentos_template_implementacao_id_idx
  on public.implementacao_documentos_template(implementacao_id);

alter table public.implementacao_documentos_template enable row level security;

create policy "implementacao_documentos_template_por_vinculo"
  on public.implementacao_documentos_template for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

create trigger implementacao_documentos_template_set_updated_at
  before update on public.implementacao_documentos_template
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4) RPC de aplicação — agora cobre implementação NOVA e JÁ EXISTENTE, e
-- também documentos. Precisa de DROP porque o retorno ganhou colunas
-- novas (contagem de ignorados por duplicidade).
--
-- Proteção contra duplicidade (seção 37 do pedido): antes de clonar cada
-- item, verifica se já existe um equivalente nesta implementação (mesmo
-- nome/título pra atividades/critérios/documentos, mesmo tipo pra
-- reuniões — "não criar 2 Kickoffs") e PULA esse item, contando à parte.
-- Isso é mais simples que o "manter atual / usar template / adicionar
-- ambos" por item sugerido no pedido original — decisão registrada no
-- relatório da PR como simplificação consciente.
-- ============================================================
drop function if exists public.aplicar_template_implementacao(uuid, uuid);

create or replace function public.aplicar_template_implementacao(p_implementacao_id uuid, p_template_id uuid)
returns table (
  atividades_criadas int, atividades_ignoradas int,
  reunioes_criadas int, reunioes_ignoradas int,
  criterios_criados int, criterios_ignorados int,
  documentos_criados int, documentos_ignorados int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.templates_implementacao;
  v_atividades int := 0;
  v_atividades_ign int := 0;
  v_reunioes int := 0;
  v_reunioes_ign int := 0;
  v_criterios int := 0;
  v_criterios_ign int := 0;
  v_documentos int := 0;
  v_documentos_ign int := 0;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.' using errcode = '42501';
  end if;

  select * into v_template from public.templates_implementacao where id = p_template_id;
  if v_template.id is null then
    raise exception 'Template não encontrado.' using errcode = 'P0001';
  end if;
  if v_template.status <> 'ativo' then
    raise exception 'Só é possível aplicar um template com status Ativo.' using errcode = 'P0001';
  end if;

  -- Atividades: pula se já existe uma atividade com o mesmo nome (ignora
  -- maiúsculas/espaços) nesta implementação.
  with inseridas as (
    insert into public.atividades_cronograma
      (nome, descricao, ciclo, ordem, responsavel_padrao, categoria, obrigatorio, implementacao_id,
       origem_template_id, origem_template_atividade_id)
    select
      ta.titulo, ta.descricao, coalesce(ta.ciclo, 'Checklist do template'), ta.ordem, ta.responsavel_padrao,
      ta.categoria, ta.obrigatorio, p_implementacao_id,
      v_template.id, ta.id
    from public.template_atividades ta
    where ta.template_id = p_template_id
      and not exists (
        select 1 from public.atividades_cronograma ac
        where ac.implementacao_id = p_implementacao_id
          and lower(trim(ac.nome)) = lower(trim(ta.titulo))
      )
    returning 1
  )
  select count(*) into v_atividades from inseridas;

  select count(*) into v_atividades_ign
  from public.template_atividades ta
  where ta.template_id = p_template_id
    and exists (
      select 1 from public.atividades_cronograma ac
      where ac.implementacao_id = p_implementacao_id
        and lower(trim(ac.nome)) = lower(trim(ta.titulo))
    );

  -- Reuniões esperadas: pula se já existe uma esperada do mesmo tipo
  -- (evita "2 Kickoffs").
  with inseridas as (
    insert into public.implementacao_reunioes_esperadas
      (implementacao_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo,
       pauta_padrao, origem_template_id, origem_template_reuniao_id, ordem)
    select
      p_implementacao_id, tr.tipo, tr.obrigatoria, tr.ciclo, tr.dia_recomendado, tr.duracao_sugerida_minutos,
      tr.objetivo, tr.pauta_padrao, v_template.id, tr.id, tr.ordem
    from public.template_reunioes tr
    where tr.template_id = p_template_id
      and not exists (
        select 1 from public.implementacao_reunioes_esperadas re
        where re.implementacao_id = p_implementacao_id and re.tipo = tr.tipo
      )
    returning 1
  )
  select count(*) into v_reunioes from inseridas;

  select count(*) into v_reunioes_ign
  from public.template_reunioes tr
  where tr.template_id = p_template_id
    and exists (
      select 1 from public.implementacao_reunioes_esperadas re
      where re.implementacao_id = p_implementacao_id and re.tipo = tr.tipo
    );

  -- Critérios: pula se já existe um critério (mesmo tipo entrega/adoção)
  -- com o mesmo título.
  with inseridas as (
    insert into public.implementacao_criterios_template
      (implementacao_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria,
       origem_template_id, origem_template_criterio_id, ordem)
    select
      p_implementacao_id, tc.tipo, tc.titulo, tc.descricao, tc.obrigatorio, tc.evidencia_esperada, tc.categoria,
      v_template.id, tc.id, tc.ordem
    from public.template_criterios tc
    where tc.template_id = p_template_id
      and not exists (
        select 1 from public.implementacao_criterios_template ic
        where ic.implementacao_id = p_implementacao_id
          and ic.tipo = tc.tipo
          and lower(trim(ic.titulo)) = lower(trim(tc.titulo))
      )
    returning 1
  )
  select count(*) into v_criterios from inseridas;

  select count(*) into v_criterios_ign
  from public.template_criterios tc
  where tc.template_id = p_template_id
    and exists (
      select 1 from public.implementacao_criterios_template ic
      where ic.implementacao_id = p_implementacao_id
        and ic.tipo = tc.tipo
        and lower(trim(ic.titulo)) = lower(trim(tc.titulo))
    );

  -- Documentos: pula se já existe um documento com o mesmo nome.
  with inseridas as (
    insert into public.implementacao_documentos_template
      (implementacao_id, nome, obrigatorio, fase, descricao, origem_template_id, origem_template_documento_id, ordem)
    select
      p_implementacao_id, td.nome, td.obrigatorio, td.fase, td.descricao, v_template.id, td.id, td.ordem
    from public.template_documentos td
    where td.template_id = p_template_id
      and not exists (
        select 1 from public.implementacao_documentos_template idoc
        where idoc.implementacao_id = p_implementacao_id
          and lower(trim(idoc.nome)) = lower(trim(td.nome))
      )
    returning 1
  )
  select count(*) into v_documentos from inseridas;

  select count(*) into v_documentos_ign
  from public.template_documentos td
  where td.template_id = p_template_id
    and exists (
      select 1 from public.implementacao_documentos_template idoc
      where idoc.implementacao_id = p_implementacao_id
        and lower(trim(idoc.nome)) = lower(trim(td.nome))
    );

  update public.implementacoes_crm
  set template_aplicado_id = v_template.id,
      template_aplicado_nome = v_template.nome,
      template_aplicado_versao = v_template.versao,
      template_aplicado_em = now()
  where id = p_implementacao_id;

  perform public.registrar_auditoria(
    'aplicar_template', 'implementacao', p_implementacao_id, null, p_implementacao_id,
    jsonb_build_object(
      'template_id', v_template.id, 'template_nome', v_template.nome, 'template_versao', v_template.versao,
      'atividades_criadas', v_atividades, 'atividades_ignoradas', v_atividades_ign,
      'reunioes_criadas', v_reunioes, 'reunioes_ignoradas', v_reunioes_ign,
      'criterios_criados', v_criterios, 'criterios_ignorados', v_criterios_ign,
      'documentos_criados', v_documentos, 'documentos_ignorados', v_documentos_ign
    )
  );

  return query select
    v_atividades, v_atividades_ign, v_reunioes, v_reunioes_ign, v_criterios, v_criterios_ign,
    v_documentos, v_documentos_ign;
end;
$$;

revoke all on function public.aplicar_template_implementacao(uuid, uuid) from public;
grant execute on function public.aplicar_template_implementacao(uuid, uuid) to authenticated;

-- ============================================================
-- 5) Duplicar/nova versão do template também precisam clonar campos CRM,
-- automações e documentos agora — redefine as 2 funções (mesma lógica de
-- antes + os 3 blocos novos).
-- ============================================================
create or replace function public.duplicar_template_implementacao(p_template_id uuid, p_novo_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.templates_implementacao;
  v_novo_id uuid;
  v_email text;
  v_mapa_atividades jsonb := '{}'::jsonb;
  v_atividade record;
  v_nova_atividade_id uuid;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem duplicar templates.' using errcode = '42501';
  end if;

  select * into v_original from public.templates_implementacao where id = p_template_id;
  if v_original.id is null then
    raise exception 'Template não encontrado.' using errcode = 'P0001';
  end if;

  v_email := auth.jwt() ->> 'email';

  insert into public.templates_implementacao
    (nome, descricao, categoria, tags, observacoes_internas, status, duracao_total_dias, ciclos,
     criado_por_email, atualizado_por_email)
  values
    (coalesce(nullif(trim(p_novo_nome), ''), v_original.nome || ' (cópia)'), v_original.descricao,
     v_original.categoria, v_original.tags, v_original.observacoes_internas, 'rascunho',
     v_original.duracao_total_dias, v_original.ciclos, v_email, v_email)
  returning id into v_novo_id;

  for v_atividade in select * from public.template_atividades where template_id = p_template_id order by ordem loop
    insert into public.template_atividades
      (template_id, titulo, descricao, ciclo, dia_recomendado, obrigatorio, responsavel_padrao, categoria, ordem)
    values
      (v_novo_id, v_atividade.titulo, v_atividade.descricao, v_atividade.ciclo, v_atividade.dia_recomendado,
       v_atividade.obrigatorio, v_atividade.responsavel_padrao, v_atividade.categoria, v_atividade.ordem)
    returning id into v_nova_atividade_id;
    v_mapa_atividades := v_mapa_atividades || jsonb_build_object(v_atividade.id::text, v_nova_atividade_id);
  end loop;

  for v_atividade in select * from public.template_atividades where template_id = p_template_id and depende_de_atividade_id is not null loop
    update public.template_atividades
    set depende_de_atividade_id = (v_mapa_atividades ->> v_atividade.depende_de_atividade_id::text)::uuid
    where id = (v_mapa_atividades ->> v_atividade.id::text)::uuid;
  end loop;

  insert into public.template_reunioes
    (template_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo, pauta_padrao, ordem)
  select v_novo_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo, pauta_padrao, ordem
  from public.template_reunioes
  where template_id = p_template_id;

  insert into public.template_criterios
    (template_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria, ordem)
  select v_novo_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria, ordem
  from public.template_criterios
  where template_id = p_template_id;

  insert into public.template_campos_crm
    (template_id, nome, tipo, entidade, obrigatorio, descricao, quando_usar, ordem)
  select v_novo_id, nome, tipo, entidade, obrigatorio, descricao, quando_usar, ordem
  from public.template_campos_crm
  where template_id = p_template_id;

  insert into public.template_automacoes
    (template_id, nome, objetivo, gatilho, condicao, acao, observacoes, ordem)
  select v_novo_id, nome, objetivo, gatilho, condicao, acao, observacoes, ordem
  from public.template_automacoes
  where template_id = p_template_id;

  insert into public.template_documentos
    (template_id, nome, obrigatorio, fase, descricao, ordem)
  select v_novo_id, nome, obrigatorio, fase, descricao, ordem
  from public.template_documentos
  where template_id = p_template_id;

  perform public.registrar_auditoria('duplicar_template', 'template_implementacao', v_novo_id, null, null,
    jsonb_build_object('template_origem_id', p_template_id));

  return v_novo_id;
end;
$$;

create or replace function public.criar_versao_template_implementacao(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.templates_implementacao;
  v_novo_id uuid;
  v_proxima_versao int;
  v_email text;
  v_mapa_atividades jsonb := '{}'::jsonb;
  v_atividade record;
  v_nova_atividade_id uuid;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem criar uma nova versão.' using errcode = '42501';
  end if;

  select * into v_original from public.templates_implementacao where id = p_template_id;
  if v_original.id is null then
    raise exception 'Template não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(max(versao), 0) + 1 into v_proxima_versao
  from public.templates_implementacao where grupo_id = v_original.grupo_id;

  v_email := auth.jwt() ->> 'email';

  insert into public.templates_implementacao
    (grupo_id, versao, nome, descricao, categoria, tags, observacoes_internas, status, duracao_total_dias, ciclos,
     criado_por_email, atualizado_por_email)
  values
    (v_original.grupo_id, v_proxima_versao, v_original.nome, v_original.descricao, v_original.categoria,
     v_original.tags, v_original.observacoes_internas, 'rascunho', v_original.duracao_total_dias, v_original.ciclos,
     v_email, v_email)
  returning id into v_novo_id;

  for v_atividade in select * from public.template_atividades where template_id = p_template_id order by ordem loop
    insert into public.template_atividades
      (template_id, titulo, descricao, ciclo, dia_recomendado, obrigatorio, responsavel_padrao, categoria, ordem)
    values
      (v_novo_id, v_atividade.titulo, v_atividade.descricao, v_atividade.ciclo, v_atividade.dia_recomendado,
       v_atividade.obrigatorio, v_atividade.responsavel_padrao, v_atividade.categoria, v_atividade.ordem)
    returning id into v_nova_atividade_id;
    v_mapa_atividades := v_mapa_atividades || jsonb_build_object(v_atividade.id::text, v_nova_atividade_id);
  end loop;

  for v_atividade in select * from public.template_atividades where template_id = p_template_id and depende_de_atividade_id is not null loop
    update public.template_atividades
    set depende_de_atividade_id = (v_mapa_atividades ->> v_atividade.depende_de_atividade_id::text)::uuid
    where id = (v_mapa_atividades ->> v_atividade.id::text)::uuid;
  end loop;

  insert into public.template_reunioes
    (template_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo, pauta_padrao, ordem)
  select v_novo_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo, pauta_padrao, ordem
  from public.template_reunioes
  where template_id = p_template_id;

  insert into public.template_criterios
    (template_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria, ordem)
  select v_novo_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria, ordem
  from public.template_criterios
  where template_id = p_template_id;

  insert into public.template_campos_crm
    (template_id, nome, tipo, entidade, obrigatorio, descricao, quando_usar, ordem)
  select v_novo_id, nome, tipo, entidade, obrigatorio, descricao, quando_usar, ordem
  from public.template_campos_crm
  where template_id = p_template_id;

  insert into public.template_automacoes
    (template_id, nome, objetivo, gatilho, condicao, acao, observacoes, ordem)
  select v_novo_id, nome, objetivo, gatilho, condicao, acao, observacoes, ordem
  from public.template_automacoes
  where template_id = p_template_id;

  insert into public.template_documentos
    (template_id, nome, obrigatorio, fase, descricao, ordem)
  select v_novo_id, nome, obrigatorio, fase, descricao, ordem
  from public.template_documentos
  where template_id = p_template_id;

  perform public.registrar_auditoria('criar_versao_template', 'template_implementacao', v_novo_id, null, null,
    jsonb_build_object('template_origem_id', p_template_id, 'versao', v_proxima_versao));

  return v_novo_id;
end;
$$;
