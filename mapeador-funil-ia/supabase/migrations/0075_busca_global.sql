-- Busca Global (Command Palette, Ctrl/Cmd+K) — núcleo (Fase 1).
--
-- Decisão de arquitetura central: as 8 funções de busca abaixo são
-- SECURITY INVOKER (o padrão — nenhuma delas declara `security definer`).
-- Isso significa que cada SELECT roda com o papel do próprio usuário
-- chamando a função, então a RLS "por vínculo" já existente em cada
-- tabela (clientes_por_vinculo, implementacoes_crm_por_vinculo,
-- reunioes_por_vinculo, cliente_ocorrencias_por_vinculo,
-- cliente_contatos_por_vinculo, funis_gerados_por_vinculo/
-- funil_versoes_por_vinculo via tenho_acesso_ao_mapeamento) filtra as
-- linhas automaticamente — sem reimplementar a lógica de carteira aqui
-- (que ficaria defasada se a RLS mudasse e esta busca não acompanhasse).
-- Só `consultores` é lido sem filtro de vínculo, porque a própria RLS
-- dessa tabela já é aberta a todo autenticado (consultores_select_authenticated).
--
-- Nunca toca em credenciais_crm / credenciais_api_kommo (só têm RPC
-- SECURITY DEFINER própria, nenhuma dessas é chamada aqui) nem em nenhuma
-- outra tabela de segredo.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent() é tecnicamente STABLE (depende de um dicionário de texto),
-- mas esse dicionário é fixo em produção — por isso é seguro (e é prática
-- comum) embrulhar como IMMUTABLE pra poder indexar a expressão abaixo.
create or replace function public.buscar_normalizar(p_texto text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select lower(unaccent(coalesce(p_texto, '')));
$$;

revoke all on function public.buscar_normalizar(text) from public;
grant execute on function public.buscar_normalizar(text) to authenticated;

-- ============================================================
-- Índices trigram (acelera ILIKE/partial match e similarity()) sobre o
-- texto já normalizado (sem acento, minúsculo) de cada entidade.
-- ============================================================
create index if not exists clientes_busca_trgm_idx on public.clientes
  using gin (public.buscar_normalizar(
    coalesce(nome_fantasia,'') || ' ' || coalesce(nome_empresa,'') || ' ' || coalesce(razao_social,'') || ' ' ||
    coalesce(cnpj,'') || ' ' || coalesce(segmento,'') || ' ' || coalesce(email,'') || ' ' || coalesce(telefone,'')
  ) gin_trgm_ops);

create index if not exists cliente_contatos_busca_trgm_idx on public.cliente_contatos
  using gin (public.buscar_normalizar(
    coalesce(nome,'') || ' ' || coalesce(cargo,'') || ' ' || coalesce(email,'') || ' ' ||
    coalesce(telefone,'') || ' ' || coalesce(whatsapp,'')
  ) gin_trgm_ops);

create index if not exists implementacoes_crm_busca_trgm_idx on public.implementacoes_crm
  using gin (public.buscar_normalizar(coalesce(nome_cliente,'')) gin_trgm_ops);

create index if not exists funis_gerados_busca_trgm_idx on public.funis_gerados
  using gin (public.buscar_normalizar(coalesce(nome_funil,'') || ' ' || coalesce(tipo_funil,'')) gin_trgm_ops);

create index if not exists reunioes_busca_trgm_idx on public.reunioes
  using gin (public.buscar_normalizar(coalesce(titulo,'') || ' ' || coalesce(tipo,'') || ' ' || coalesce(participantes,'')) gin_trgm_ops);

create index if not exists cliente_ocorrencias_busca_trgm_idx on public.cliente_ocorrencias
  using gin (public.buscar_normalizar(coalesce(descricao,'') || ' ' || coalesce(categoria,'')) gin_trgm_ops);

create index if not exists consultores_busca_trgm_idx on public.consultores
  using gin (public.buscar_normalizar(coalesce(nome,'') || ' ' || coalesce(email,'')) gin_trgm_ops);

-- ============================================================
-- 1) Clientes
-- ============================================================
create or replace function public.busca_clientes(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'cliente'::text as categoria,
    c.id as entidade_id,
    coalesce(c.nome_fantasia, c.nome_empresa) as titulo,
    nullif(concat_ws(' · ', c.segmento, case when co.nome is not null then 'Consultor: ' || co.nome end), '') as subtitulo,
    case
      when c.kickoff_realizado_em is null then null
      else 'Dia ' || ((current_date - c.kickoff_realizado_em::date) + 1)::text || '/40 · Ciclo ' ||
           least(4, ((current_date - c.kickoff_realizado_em::date) / 10) + 1)::text
    end as badge,
    '/clientes/' || c.id as rota,
    similarity(
      public.buscar_normalizar(coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'') || ' ' || coalesce(c.razao_social,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.clientes c
  left join public.consultores co on co.id = c.consultor_responsavel_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'') || ' ' || coalesce(c.razao_social,'') || ' ' ||
          coalesce(c.cnpj,'') || ' ' || coalesce(c.segmento,'') || ' ' || coalesce(c.email,'') || ' ' || coalesce(c.telefone,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_clientes(text, int, int) from public;
grant execute on function public.busca_clientes(text, int, int) to authenticated;

-- ============================================================
-- 2) Contatos
-- ============================================================
create or replace function public.busca_contatos(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'contato'::text as categoria,
    ct.id as entidade_id,
    ct.nome as titulo,
    nullif(concat_ws(' · ', ct.cargo, c.nome_fantasia), '') as subtitulo,
    null::text as badge,
    '/clientes/' || ct.cliente_id || '?aba=informacoes' as rota,
    similarity(
      public.buscar_normalizar(ct.nome || ' ' || coalesce(ct.cargo,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.cliente_contatos ct
  join public.clientes c on c.id = ct.cliente_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          ct.nome || ' ' || coalesce(ct.cargo,'') || ' ' || coalesce(ct.email,'') || ' ' ||
          coalesce(ct.telefone,'') || ' ' || coalesce(ct.whatsapp,'') || ' ' || coalesce(c.nome_fantasia,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_contatos(text, int, int) from public;
grant execute on function public.busca_contatos(text, int, int) to authenticated;

-- ============================================================
-- 3) Implementações
-- ============================================================
create or replace function public.busca_implementacoes(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'implementacao'::text as categoria,
    i.id as entidade_id,
    coalesce(c.nome_fantasia, i.nome_cliente) as titulo,
    case
      when c.kickoff_realizado_em is null then null
      else 'Dia ' || ((current_date - c.kickoff_realizado_em::date) + 1)::text || '/40'
    end as subtitulo,
    case i.status
      when 'pre_requisito' then 'Pré-requisito'
      when 'semana_1' then 'Semana 1'
      when 'semana_2' then 'Semana 2'
      when 'semana_3' then 'Semana 3'
      when 'semana_4' then 'Semana 4'
      when 'concluida' then 'Concluída'
      when 'cancelada' then 'Cancelada'
      else i.status
    end as badge,
    '/implementacoes/' || i.id as rota,
    similarity(
      public.buscar_normalizar(i.nome_cliente || ' ' || coalesce(co.nome,'') || ' ' || coalesce(co2.nome,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.implementacoes_crm i
  left join public.clientes c on c.id = i.cliente_id
  left join public.consultores co on co.id = i.consultor_responsavel_id
  left join public.consultores co2 on co2.id = i.consultor_adicional_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          i.nome_cliente || ' ' || coalesce(c.nome_fantasia,'') || ' ' || i.status || ' ' ||
          coalesce(co.nome,'') || ' ' || coalesce(co2.nome,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_implementacoes(text, int, int) from public;
grant execute on function public.busca_implementacoes(text, int, int) to authenticated;

-- ============================================================
-- 4) Funis (junta funis_gerados com a versão/status em funil_versoes)
-- ============================================================
create or replace function public.busca_funis(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'funil'::text as categoria,
    fg.id as entidade_id,
    fg.nome_funil || ' — ' || coalesce(c.nome_fantasia, c.nome_empresa, 'cliente') as titulo,
    'Versão ' || fg.versao as subtitulo,
    case fv.status
      when 'aprovada' then 'Aprovada'
      when 'rascunho' then 'Rascunho'
      else null
    end as badge,
    '/mapeamento/' || fg.mapeamento_id || '/relatorio?versao=' || fg.versao as rota,
    similarity(
      public.buscar_normalizar(fg.nome_funil || ' ' || fg.tipo_funil || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.funis_gerados fg
  join public.mapeamentos m on m.id = fg.mapeamento_id
  left join public.clientes c on c.id = m.cliente_id
  left join public.funil_versoes fv on fv.mapeamento_id = fg.mapeamento_id and fv.versao = fg.versao
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          fg.nome_funil || ' ' || fg.tipo_funil || ' ' || coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'') ||
          ' v' || fg.versao
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_funis(text, int, int) from public;
grant execute on function public.busca_funis(text, int, int) to authenticated;

-- ============================================================
-- 5) Reuniões
-- ============================================================
create or replace function public.busca_reunioes(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'reuniao'::text as categoria,
    r.id as entidade_id,
    coalesce(r.titulo, case r.tipo
      when 'kickoff' then 'Kickoff'
      when 'treinamento' then 'Treinamento'
      when 'checkin_1' then 'Check-in 1'
      when 'checkin_2' then 'Check-in 2'
      when 'tira_duvidas' then 'Tira-dúvidas'
      when 'reuniao_final' then 'Reunião final'
      else 'Reunião extraordinária'
    end) || ' — ' || coalesce(c.nome_fantasia, c.nome_empresa) as titulo,
    case when r.data_hora is not null then to_char(r.data_hora, 'DD/MM') || ' · ' || to_char(r.data_hora, 'HH24:MI') else null end as subtitulo,
    case r.status
      when 'nao_agendada' then 'Não agendada'
      when 'agendada' then 'Agendada'
      when 'realizada' then 'Realizada'
      when 'remarcada' then 'Remarcada'
      when 'cliente_nao_compareceu' then 'Cliente não compareceu'
      when 'consultor_nao_compareceu' then 'Consultor não compareceu'
      when 'cancelada' then 'Cancelada'
      else r.status
    end as badge,
    '/clientes/' || r.cliente_id || '?aba=reunioes' as rota,
    similarity(
      public.buscar_normalizar(coalesce(r.titulo,'') || ' ' || r.tipo || ' ' || coalesce(r.participantes,'') || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.reunioes r
  join public.clientes c on c.id = r.cliente_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          coalesce(r.titulo,'') || ' ' || r.tipo || ' ' || coalesce(r.participantes,'') || ' ' ||
          coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, r.data_hora desc nulls last
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_reunioes(text, int, int) from public;
grant execute on function public.busca_reunioes(text, int, int) to authenticated;

-- ============================================================
-- 6) Pendências — cliente_ocorrencias com categoria "de pendência"
-- (acesso_pendente, pendencia_cliente — ver migration 0040).
-- ============================================================
create or replace function public.busca_pendencias(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'pendencia'::text as categoria,
    o.id as entidade_id,
    left(o.descricao, 80) as titulo,
    coalesce(c.nome_fantasia, c.nome_empresa) as subtitulo,
    case
      when o.status = 'resolvida' then 'Resolvida'
      when o.prazo is not null and o.prazo < current_date then 'Vencida'
      when o.prazo is not null then 'Prazo ' || to_char(o.prazo, 'DD/MM')
      else 'Aberta'
    end as badge,
    '/clientes/' || o.cliente_id || '?aba=historico' as rota,
    similarity(
      public.buscar_normalizar(o.descricao || ' ' || coalesce(co.nome,'') || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.cliente_ocorrencias o
  join public.clientes c on c.id = o.cliente_id
  left join public.consultores co on co.id = o.consultor_responsavel_id
  where o.categoria in ('acesso_pendente', 'pendencia_cliente')
    and length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          o.descricao || ' ' || coalesce(co.nome,'') || ' ' || coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, o.created_at desc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_pendencias(text, int, int) from public;
grant execute on function public.busca_pendencias(text, int, int) to authenticated;

-- ============================================================
-- 7) Ocorrências — as demais categorias de cliente_ocorrencias.
-- ============================================================
create or replace function public.busca_ocorrencias(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'ocorrencia'::text as categoria,
    o.id as entidade_id,
    left(o.descricao, 80) as titulo,
    coalesce(c.nome_fantasia, c.nome_empresa) as subtitulo,
    case o.categoria
      when 'cliente_cancelou_reuniao' then 'Cliente cancelou reunião'
      when 'cliente_nao_compareceu' then 'Cliente não compareceu'
      when 'consultor_cancelou' then 'Consultor cancelou'
      when 'reuniao_remarcada' then 'Reunião remarcada'
      when 'problema_tecnico' then 'Problema técnico'
      when 'mudanca_escopo' then 'Mudança de escopo'
      else 'Outro'
    end as badge,
    '/clientes/' || o.cliente_id || '?aba=historico' as rota,
    similarity(
      public.buscar_normalizar(o.descricao || ' ' || o.categoria || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.cliente_ocorrencias o
  join public.clientes c on c.id = o.cliente_id
  where o.categoria not in ('acesso_pendente', 'pendencia_cliente')
    and length(trim(p_termo)) > 0
    and public.buscar_normalizar(
          o.descricao || ' ' || o.categoria || ' ' || o.responsavel_impacto || ' ' ||
          coalesce(c.nome_fantasia,'') || ' ' || coalesce(c.nome_empresa,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, o.created_at desc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_ocorrencias(text, int, int) from public;
grant execute on function public.busca_ocorrencias(text, int, int) to authenticated;

-- ============================================================
-- 8) Consultores — RLS da própria tabela já é aberta a todo autenticado.
-- ============================================================
create or replace function public.busca_consultores(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select
    'consultor'::text as categoria,
    co.id as entidade_id,
    co.nome as titulo,
    co.email as subtitulo,
    case when not co.ativo then 'Inativo' else null end as badge,
    '/consultores' as rota,
    similarity(
      public.buscar_normalizar(co.nome || ' ' || co.email),
      public.buscar_normalizar(p_termo)
    ) as relevancia
  from public.consultores co
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(co.nome || ' ' || co.email) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_consultores(text, int, int) from public;
grant execute on function public.busca_consultores(text, int, int) to authenticated;

-- ============================================================
-- 9) busca_global — orquestra as 8 acima pra um único resultado agrupado
-- (até p_limite_por_categoria linhas de cada). "Ver todos" de uma
-- categoria específica chama a função daquela categoria direto, com
-- limite maior e offset pra paginar.
-- ============================================================
create or replace function public.busca_global(p_termo text, p_limite_por_categoria int default 5)
returns table (categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real)
language sql
stable
set search_path = public, extensions
as $$
  select * from public.busca_clientes(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_contatos(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_implementacoes(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_funis(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_reunioes(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_pendencias(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_ocorrencias(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_consultores(p_termo, p_limite_por_categoria, 0);
$$;

revoke all on function public.busca_global(text, int) from public;
grant execute on function public.busca_global(text, int) to authenticated;
