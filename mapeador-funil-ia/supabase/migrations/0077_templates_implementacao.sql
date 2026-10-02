-- Módulo de Templates de Implementação — núcleo (Fase 1).
--
-- Um template é um MODELO reutilizável de estrutura operacional
-- (checklist, reuniões esperadas, critérios de entrega/adoção) — nunca o
-- funil de vendas do cliente, que continua 100% gerado por IA a partir do
-- formulário. Aplicar um template em uma implementação faz uma CÓPIA das
-- linhas relevantes (nunca um vínculo vivo): se o template mudar depois,
-- implementações que já aplicaram uma versão anterior não mudam
-- silenciosamente — o mesmo princípio já usado pelo
-- implementacao_settings_snapshot (migration 0073).
--
-- Hierarquia de cronograma (seção 6 do pedido): o template pode declarar
-- uma expectativa de ciclos/duração só pra ROTULAR os itens do checklist
-- (texto, não cálculo) — ele NÃO cria uma nova fonte viva de cronograma.
-- A régua de verdade pra calcular dia/ciclo continua sendo exclusivamente
-- configuracoes_implementacao (global) + implementacao_settings_snapshot
-- (por cliente, capturado no Kickoff), exatamente como já funciona hoje.
-- Isso evita a "segunda fonte concorrente" que o próprio pedido pede pra
-- evitar.
--
-- Fora de escopo nesta fase (Fase 2, se for adiante): Campos CRM
-- recomendados, Automações sugeridas, Documentos, configuração de
-- Pós-venda, aplicar template em implementação já existente (com
-- detecção de conflito), sugestão de template por IA, biblioteca
-- compartilhada de componentes entre templates.

-- ============================================================
-- 1) Cabeçalho do template (uma linha por VERSÃO — grupo_id agrupa as
-- versões de "o mesmo template").
-- ============================================================
create table if not exists public.templates_implementacao (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null default gen_random_uuid(),
  versao int not null default 1,
  nome text not null,
  descricao text,
  categoria text,
  tags jsonb not null default '[]'::jsonb,
  observacoes_internas text,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'arquivado')),
  -- Só rótulo/organização do checklist — ver nota de hierarquia acima.
  duracao_total_dias int,
  ciclos jsonb,
  criado_por_email text,
  atualizado_por_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grupo_id, versao)
);

create index if not exists templates_implementacao_grupo_id_idx on public.templates_implementacao(grupo_id);
create index if not exists templates_implementacao_status_idx on public.templates_implementacao(status);

alter table public.templates_implementacao enable row level security;

create policy "templates_implementacao_select_authenticated"
  on public.templates_implementacao for select
  to authenticated
  using (true);

create policy "templates_implementacao_insert_admin"
  on public.templates_implementacao for insert
  to authenticated
  with check (public.sou_administrador());

create policy "templates_implementacao_update_admin"
  on public.templates_implementacao for update
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create policy "templates_implementacao_delete_admin"
  on public.templates_implementacao for delete
  to authenticated
  using (public.sou_administrador());

create trigger templates_implementacao_set_updated_at
  before update on public.templates_implementacao
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Checklist do template (atividades). depende_de_atividade_id é só
-- pra AUTORIA do template (validado contra ciclo, nunca propagado pro
-- depende_de de atividades_cronograma — ver seção 8 do relatório final).
-- ============================================================
create table if not exists public.template_atividades (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  titulo text not null,
  descricao text,
  ciclo text,
  dia_recomendado int,
  obrigatorio boolean not null default true,
  responsavel_padrao text,
  categoria text,
  ordem int not null default 0,
  depende_de_atividade_id uuid references public.template_atividades(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (depende_de_atividade_id is null or depende_de_atividade_id <> id)
);

create index if not exists template_atividades_template_id_idx on public.template_atividades(template_id);

alter table public.template_atividades enable row level security;

create policy "template_atividades_select_authenticated"
  on public.template_atividades for select
  to authenticated
  using (true);

create policy "template_atividades_all_admin"
  on public.template_atividades for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_atividades_set_updated_at
  before update on public.template_atividades
  for each row execute function public.set_updated_at();

-- Impede dependência circular (A depende de B depende de A, direto ou
-- através de uma cadeia) — validado no banco, não só no frontend.
create or replace function public.validar_dependencia_template_atividade()
returns trigger
language plpgsql
as $$
declare
  v_atual uuid;
  v_passos int := 0;
begin
  if new.depende_de_atividade_id is null then
    return new;
  end if;

  v_atual := new.depende_de_atividade_id;
  while v_atual is not null loop
    if v_atual = new.id then
      raise exception 'Dependência circular detectada entre atividades do template.' using errcode = 'P0001';
    end if;
    v_passos := v_passos + 1;
    if v_passos > 500 then
      raise exception 'Cadeia de dependências longa demais — verifique se não há um ciclo.' using errcode = 'P0001';
    end if;
    select depende_de_atividade_id into v_atual from public.template_atividades where id = v_atual;
  end loop;

  return new;
end;
$$;

drop trigger if exists template_atividades_validar_dependencia on public.template_atividades;
create trigger template_atividades_validar_dependencia
  before insert or update of depende_de_atividade_id on public.template_atividades
  for each row execute function public.validar_dependencia_template_atividade();

-- ============================================================
-- 3) Reuniões esperadas do template — só a EXPECTATIVA operacional
-- (tipo/ciclo/pauta padrão), nunca uma reunião real agendada.
-- ============================================================
create table if not exists public.template_reunioes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  tipo text not null check (tipo in (
    'kickoff', 'treinamento', 'checkin_1', 'checkin_2', 'tira_duvidas', 'reuniao_final', 'extraordinaria'
  )),
  obrigatoria boolean not null default true,
  ciclo text,
  dia_recomendado int,
  duracao_sugerida_minutos int,
  objetivo text,
  pauta_padrao jsonb not null default '[]'::jsonb,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_reunioes_template_id_idx on public.template_reunioes(template_id);

alter table public.template_reunioes enable row level security;

create policy "template_reunioes_select_authenticated"
  on public.template_reunioes for select
  to authenticated
  using (true);

create policy "template_reunioes_all_admin"
  on public.template_reunioes for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_reunioes_set_updated_at
  before update on public.template_reunioes
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4) Critérios do template — entrega E adoção na mesma tabela
-- (discriminados por `tipo`), mas SEM mexer no catálogo global existente
-- de criterios_entrega (que continua valendo pra toda implementação,
-- com template ou sem). Critério de adoção nunca bloqueia conclusão
-- técnica — só é descritivo/acompanhado (ver seção 12 do pedido).
-- ============================================================
create table if not exists public.template_criterios (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates_implementacao(id) on delete cascade,
  tipo text not null check (tipo in ('entrega', 'adocao')),
  titulo text not null,
  descricao text,
  obrigatorio boolean not null default true,
  evidencia_esperada text,
  categoria text,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_criterios_template_id_idx on public.template_criterios(template_id);

alter table public.template_criterios enable row level security;

create policy "template_criterios_select_authenticated"
  on public.template_criterios for select
  to authenticated
  using (true);

create policy "template_criterios_all_admin"
  on public.template_criterios for all
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create trigger template_criterios_set_updated_at
  before update on public.template_criterios
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5) Extensão do checklist real (atividades_cronograma) — rastreia de
-- onde veio cada atividade aplicada a uma implementação, e carrega os
-- campos do template que a tabela ainda não tinha. Nenhuma coluna nova é
-- obrigatória nem muda o comportamento de nenhuma linha já existente.
-- ============================================================
alter table public.atividades_cronograma
  add column if not exists descricao text,
  add column if not exists categoria text,
  add column if not exists obrigatorio boolean not null default true,
  add column if not exists origem_template_id uuid references public.templates_implementacao(id) on delete set null,
  add column if not exists origem_template_atividade_id uuid references public.template_atividades(id) on delete set null;

-- ============================================================
-- 6) Reuniões esperadas por implementação (clonadas do template — nunca
-- uma reunião real; a reunião de verdade continua sendo criada só pelo
-- consultor, no módulo de Reuniões já existente).
-- ============================================================
create table if not exists public.implementacao_reunioes_esperadas (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  tipo text not null check (tipo in (
    'kickoff', 'treinamento', 'checkin_1', 'checkin_2', 'tira_duvidas', 'reuniao_final', 'extraordinaria'
  )),
  obrigatoria boolean not null default true,
  ciclo text,
  dia_recomendado int,
  duracao_sugerida_minutos int,
  objetivo text,
  pauta_padrao jsonb not null default '[]'::jsonb,
  nao_aplicavel boolean not null default false,
  nao_aplicavel_justificativa text,
  origem_template_id uuid references public.templates_implementacao(id) on delete set null,
  origem_template_reuniao_id uuid references public.template_reunioes(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementacao_reunioes_esperadas_implementacao_id_idx
  on public.implementacao_reunioes_esperadas(implementacao_id);

alter table public.implementacao_reunioes_esperadas enable row level security;

create policy "implementacao_reunioes_esperadas_por_vinculo"
  on public.implementacao_reunioes_esperadas for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

create trigger implementacao_reunioes_esperadas_set_updated_at
  before update on public.implementacao_reunioes_esperadas
  for each row execute function public.set_updated_at();

-- ============================================================
-- 7) Critérios (entrega/adoção) clonados do template por implementação —
-- tabela separada da já existente criterios_entrega/criterios_entrega_status
-- de propósito, pra não arriscar nada no fluxo já em produção (incluindo
-- o alerta de "criterio_entrega_pendente_dia_X").
-- ============================================================
create table if not exists public.implementacao_criterios_template (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  tipo text not null check (tipo in ('entrega', 'adocao')),
  titulo text not null,
  descricao text,
  obrigatorio boolean not null default true,
  evidencia_esperada text,
  categoria text,
  status text not null default 'pendente' check (status in ('pendente', 'em_validacao', 'concluido', 'nao_se_aplica')),
  justificativa_nao_aplica text,
  origem_template_id uuid references public.templates_implementacao(id) on delete set null,
  origem_template_criterio_id uuid references public.template_criterios(id) on delete set null,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementacao_criterios_template_implementacao_id_idx
  on public.implementacao_criterios_template(implementacao_id);

alter table public.implementacao_criterios_template enable row level security;

create policy "implementacao_criterios_template_por_vinculo"
  on public.implementacao_criterios_template for all
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

create trigger implementacao_criterios_template_set_updated_at
  before update on public.implementacao_criterios_template
  for each row execute function public.set_updated_at();

-- ============================================================
-- 8) Qual template foi aplicado em cada implementação — denormalizado
-- (nome/versão em texto) pra continuar mostrando certo mesmo se o
-- template for arquivado ou apagado depois (seção 29: indicadores).
-- ============================================================
alter table public.implementacoes_crm
  add column if not exists template_aplicado_id uuid references public.templates_implementacao(id) on delete set null,
  add column if not exists template_aplicado_nome text,
  add column if not exists template_aplicado_versao int,
  add column if not exists template_aplicado_em timestamptz;

-- ============================================================
-- 9) RPC de aplicação — clona tudo de uma vez (atômico: tudo ou nada).
-- Só aplica em implementação que AINDA não tem template (Fase 1 cobre só
-- implementação nova; aplicar num projeto já em andamento com detecção
-- de conflito fica pra Fase 2). Template precisa estar 'ativo'.
-- ============================================================
create or replace function public.aplicar_template_implementacao(p_implementacao_id uuid, p_template_id uuid)
returns table (atividades_criadas int, reunioes_criadas int, criterios_criados int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.templates_implementacao;
  v_ja_aplicado uuid;
  v_atividades int := 0;
  v_reunioes int := 0;
  v_criterios int := 0;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.' using errcode = '42501';
  end if;

  select template_aplicado_id into v_ja_aplicado from public.implementacoes_crm where id = p_implementacao_id;
  if v_ja_aplicado is not null then
    raise exception 'Esta implementação já tem um template aplicado.' using errcode = 'P0001';
  end if;

  select * into v_template from public.templates_implementacao where id = p_template_id;
  if v_template.id is null then
    raise exception 'Template não encontrado.' using errcode = 'P0001';
  end if;
  if v_template.status <> 'ativo' then
    raise exception 'Só é possível aplicar um template com status Ativo.' using errcode = 'P0001';
  end if;

  insert into public.atividades_cronograma
    (nome, descricao, ciclo, ordem, responsavel_padrao, categoria, obrigatorio, implementacao_id,
     origem_template_id, origem_template_atividade_id)
  select
    ta.titulo, ta.descricao, coalesce(ta.ciclo, 'Checklist do template'), ta.ordem, ta.responsavel_padrao,
    ta.categoria, ta.obrigatorio, p_implementacao_id,
    v_template.id, ta.id
  from public.template_atividades ta
  where ta.template_id = p_template_id;
  get diagnostics v_atividades = row_count;

  insert into public.implementacao_reunioes_esperadas
    (implementacao_id, tipo, obrigatoria, ciclo, dia_recomendado, duracao_sugerida_minutos, objetivo,
     pauta_padrao, origem_template_id, origem_template_reuniao_id, ordem)
  select
    p_implementacao_id, tr.tipo, tr.obrigatoria, tr.ciclo, tr.dia_recomendado, tr.duracao_sugerida_minutos,
    tr.objetivo, tr.pauta_padrao, v_template.id, tr.id, tr.ordem
  from public.template_reunioes tr
  where tr.template_id = p_template_id;
  get diagnostics v_reunioes = row_count;

  insert into public.implementacao_criterios_template
    (implementacao_id, tipo, titulo, descricao, obrigatorio, evidencia_esperada, categoria,
     origem_template_id, origem_template_criterio_id, ordem)
  select
    p_implementacao_id, tc.tipo, tc.titulo, tc.descricao, tc.obrigatorio, tc.evidencia_esperada, tc.categoria,
    v_template.id, tc.id, tc.ordem
  from public.template_criterios tc
  where tc.template_id = p_template_id;
  get diagnostics v_criterios = row_count;

  update public.implementacoes_crm
  set template_aplicado_id = v_template.id,
      template_aplicado_nome = v_template.nome,
      template_aplicado_versao = v_template.versao,
      template_aplicado_em = now()
  where id = p_implementacao_id;

  perform public.registrar_auditoria(
    'aplicar_template', 'implementacao', p_implementacao_id, null, p_implementacao_id,
    jsonb_build_object('template_id', v_template.id, 'template_nome', v_template.nome, 'template_versao', v_template.versao)
  );

  return query select v_atividades, v_reunioes, v_criterios;
end;
$$;

revoke all on function public.aplicar_template_implementacao(uuid, uuid) from public;
grant execute on function public.aplicar_template_implementacao(uuid, uuid) to authenticated;

-- ============================================================
-- 10) RPCs de ciclo de vida do template — admin-only, registram
-- auditoria (reaproveita auditoria_eventos, migration 0050).
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

  -- Clona atividades preservando a cadeia de dependência (primeiro cria
  -- todas sem depende_de, depois resolve o de-para de ids).
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

  perform public.registrar_auditoria('duplicar_template', 'template_implementacao', v_novo_id, null, null,
    jsonb_build_object('template_origem_id', p_template_id));

  return v_novo_id;
end;
$$;

revoke all on function public.duplicar_template_implementacao(uuid, text) from public;
grant execute on function public.duplicar_template_implementacao(uuid, text) to authenticated;

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

  perform public.registrar_auditoria('criar_versao_template', 'template_implementacao', v_novo_id, null, null,
    jsonb_build_object('template_origem_id', p_template_id, 'versao', v_proxima_versao));

  return v_novo_id;
end;
$$;

revoke all on function public.criar_versao_template_implementacao(uuid) from public;
grant execute on function public.criar_versao_template_implementacao(uuid) to authenticated;

-- Trocar status (ativar/arquivar/voltar a rascunho) — admin-only, com
-- auditoria. Edição direta de campos simples continua pela RLS normal de
-- update (admin-only), essa RPC é só pra registrar a transição de status
-- no histórico com o nome certo da ação.
create or replace function public.alterar_status_template_implementacao(p_template_id uuid, p_novo_status text)
returns public.templates_implementacao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.templates_implementacao;
  v_novo public.templates_implementacao;
  v_email text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar o status de um template.' using errcode = '42501';
  end if;
  if p_novo_status not in ('rascunho', 'ativo', 'arquivado') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;

  select * into v_atual from public.templates_implementacao where id = p_template_id;
  if v_atual.id is null then
    raise exception 'Template não encontrado.' using errcode = 'P0001';
  end if;

  v_email := auth.jwt() ->> 'email';

  update public.templates_implementacao
  set status = p_novo_status, atualizado_por_email = v_email
  where id = p_template_id
  returning * into v_novo;

  perform public.registrar_auditoria(
    p_novo_status || '_template', 'template_implementacao', p_template_id, null, null,
    jsonb_build_object('status_anterior', v_atual.status, 'status_novo', p_novo_status)
  );

  return v_novo;
end;
$$;

revoke all on function public.alterar_status_template_implementacao(uuid, text) from public;
grant execute on function public.alterar_status_template_implementacao(uuid, text) to authenticated;
