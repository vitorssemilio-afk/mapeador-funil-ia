-- Busca Global — Fase 2: mais 4 entidades buscáveis (Atas, Arquivos,
-- Critérios de entrega, Formulários) e colunas extras (cliente_id,
-- consultor_id, data_referencia) em TODAS as funções de busca, pra uma
-- página dedicada de resultados poder filtrar por cliente/consultor/
-- período de verdade (não só por texto) — ver ResultadosBusca.tsx.
--
-- Mudar o retorno de uma função (RETURNS TABLE) exige DROP + CREATE, não
-- dá pra fazer com CREATE OR REPLACE — por isso este arquivo derruba as 8
-- funções de busca da migration 0075 e recria todas (mesma lógica de
-- WHERE/JOIN de cada uma, só com 3 colunas a mais no final), e cria mais
-- 4 do zero. Continuam todas SECURITY INVOKER (a permissão continua vindo
-- de graça da RLS por vínculo de cada tabela, nada muda nesse ponto).

drop function if exists public.busca_global(text, int);
drop function if exists public.busca_clientes(text, int, int);
drop function if exists public.busca_contatos(text, int, int);
drop function if exists public.busca_implementacoes(text, int, int);
drop function if exists public.busca_funis(text, int, int);
drop function if exists public.busca_reunioes(text, int, int);
drop function if exists public.busca_pendencias(text, int, int);
drop function if exists public.busca_ocorrencias(text, int, int);
drop function if exists public.busca_consultores(text, int, int);

-- ============================================================
-- Índices trigram das 4 entidades novas.
-- ============================================================
create index if not exists cliente_arquivos_busca_trgm_idx on public.cliente_arquivos
  using gin (public.buscar_normalizar(coalesce(nome_arquivo,'') || ' ' || coalesce(tipo_mime,'')) gin_trgm_ops);

create index if not exists criterios_entrega_busca_trgm_idx on public.criterios_entrega
  using gin (public.buscar_normalizar(coalesce(nome,'')) gin_trgm_ops);

create index if not exists mapeamentos_busca_trgm_idx on public.mapeamentos
  using gin (public.buscar_normalizar(coalesce(nome_negocio,'')) gin_trgm_ops);

create index if not exists reunioes_ata_busca_trgm_idx on public.reunioes
  using gin (public.buscar_normalizar(coalesce(ata,'') || ' ' || coalesce(resumo,'') || ' ' || coalesce(decisoes,'')) gin_trgm_ops);

-- ============================================================
-- 1) Clientes
-- ============================================================
create or replace function public.busca_clientes(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    ) as relevancia,
    c.id as cliente_id,
    c.consultor_responsavel_id as consultor_id,
    c.kickoff_realizado_em as data_referencia
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
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    ) as relevancia,
    ct.cliente_id as cliente_id,
    c.consultor_responsavel_id as consultor_id,
    ct.created_at as data_referencia
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
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'implementacao'::text as categoria,
    i.id as entidade_id,
    coalesce(c.nome_fantasia, i.nome_cliente) as titulo,
    nullif(concat_ws(' · ',
      case when c.kickoff_realizado_em is not null then 'Dia ' || ((current_date - c.kickoff_realizado_em::date) + 1)::text || '/40' end,
      case when co.nome is not null then 'Consultor: ' || co.nome end
    ), '') as subtitulo,
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
    ) as relevancia,
    i.cliente_id as cliente_id,
    i.consultor_responsavel_id as consultor_id,
    c.kickoff_realizado_em as data_referencia
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
-- 4) Funis
-- ============================================================
create or replace function public.busca_funis(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    ) as relevancia,
    m.cliente_id as cliente_id,
    c.consultor_responsavel_id as consultor_id,
    fg.created_at as data_referencia
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
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    nullif(concat_ws(' · ',
      case when r.data_hora is not null then to_char(r.data_hora, 'DD/MM') || ' ' || to_char(r.data_hora, 'HH24:MI') end,
      case when co.nome is not null then 'Consultor: ' || co.nome end
    ), '') as subtitulo,
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
    ) as relevancia,
    r.cliente_id as cliente_id,
    r.consultor_responsavel_id as consultor_id,
    r.data_hora as data_referencia
  from public.reunioes r
  join public.clientes c on c.id = r.cliente_id
  left join public.consultores co on co.id = r.consultor_responsavel_id
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
-- 6) Pendências
-- ============================================================
create or replace function public.busca_pendencias(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'pendencia'::text as categoria,
    o.id as entidade_id,
    left(o.descricao, 80) as titulo,
    nullif(concat_ws(' · ', coalesce(c.nome_fantasia, c.nome_empresa), case when co.nome is not null then 'Consultor: ' || co.nome end), '') as subtitulo,
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
    ) as relevancia,
    o.cliente_id as cliente_id,
    o.consultor_responsavel_id as consultor_id,
    coalesce(o.prazo::timestamptz, o.created_at) as data_referencia
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
-- 7) Ocorrências
-- ============================================================
create or replace function public.busca_ocorrencias(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    ) as relevancia,
    o.cliente_id as cliente_id,
    o.consultor_responsavel_id as consultor_id,
    o.data_ocorrencia as data_referencia
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
-- 8) Consultores
-- ============================================================
create or replace function public.busca_consultores(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
    ) as relevancia,
    null::uuid as cliente_id,
    co.id as consultor_id,
    null::timestamptz as data_referencia
  from public.consultores co
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(co.nome || ' ' || co.email) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_consultores(text, int, int) from public;
grant execute on function public.busca_consultores(text, int, int) to authenticated;

-- ============================================================
-- 9) Atas — conteúdo de reunioes.ata/resumo/decisoes, separado da busca
-- de Reuniões (que olha tipo/título/participantes, não o conteúdo da ata).
-- ============================================================
create or replace function public.busca_atas(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'ata'::text as categoria,
    r.id as entidade_id,
    'Ata — ' || case r.tipo
      when 'kickoff' then 'Kickoff'
      when 'treinamento' then 'Treinamento'
      when 'checkin_1' then 'Check-in 1'
      when 'checkin_2' then 'Check-in 2'
      when 'tira_duvidas' then 'Tira-dúvidas'
      when 'reuniao_final' then 'Reunião final'
      else 'Reunião extraordinária'
    end || ' — ' || coalesce(c.nome_fantasia, c.nome_empresa) as titulo,
    case when r.data_hora is not null then to_char(r.data_hora, 'DD/MM/YYYY') else null end as subtitulo,
    null::text as badge,
    '/clientes/' || r.cliente_id || '?aba=reunioes' as rota,
    similarity(
      public.buscar_normalizar(coalesce(r.ata,'') || ' ' || coalesce(r.resumo,'') || ' ' || coalesce(r.decisoes,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia,
    r.cliente_id as cliente_id,
    r.consultor_responsavel_id as consultor_id,
    r.data_hora as data_referencia
  from public.reunioes r
  join public.clientes c on c.id = r.cliente_id
  where length(trim(p_termo)) > 0
    and (r.ata is not null or r.resumo is not null or r.decisoes is not null)
    and public.buscar_normalizar(
          coalesce(r.ata,'') || ' ' || coalesce(r.resumo,'') || ' ' || coalesce(r.decisoes,'') || ' ' || coalesce(r.titulo,'')
        ) like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, r.data_hora desc nulls last
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_atas(text, int, int) from public;
grant execute on function public.busca_atas(text, int, int) to authenticated;

-- ============================================================
-- 10) Arquivos — só metadado (nome/tipo), nunca o conteúdo do arquivo em
-- si (que fica em Storage, lido só via signed URL quando o usuário abre a
-- aba de Arquivos do cliente).
-- ============================================================
create or replace function public.busca_arquivos(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'arquivo'::text as categoria,
    a.id as entidade_id,
    a.nome_arquivo as titulo,
    coalesce(c.nome_fantasia, c.nome_empresa) as subtitulo,
    nullif(a.tipo_mime, '') as badge,
    '/clientes/' || a.cliente_id || '?aba=arquivos' as rota,
    similarity(
      public.buscar_normalizar(a.nome_arquivo),
      public.buscar_normalizar(p_termo)
    ) as relevancia,
    a.cliente_id as cliente_id,
    c.consultor_responsavel_id as consultor_id,
    a.created_at as data_referencia
  from public.cliente_arquivos a
  join public.clientes c on c.id = a.cliente_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(a.nome_arquivo || ' ' || coalesce(a.tipo_mime,'') || ' ' || coalesce(c.nome_fantasia,''))
        like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, a.created_at desc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_arquivos(text, int, int) from public;
grant execute on function public.busca_arquivos(text, int, int) to authenticated;

-- ============================================================
-- 11) Critérios de entrega — busca no STATUS por implementação
-- (criterios_entrega_status, que já tem RLS por vínculo), não no
-- template (criterios_entrega, que é igual pra todo mundo).
-- ============================================================
create or replace function public.busca_criterios_entrega(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'criterio'::text as categoria,
    cs.id as entidade_id,
    ce.nome as titulo,
    coalesce(c.nome_fantasia, c.nome_empresa, i.nome_cliente) as subtitulo,
    case cs.status
      when 'pendente' then 'Pendente'
      when 'em_validacao' then 'Em validação'
      when 'concluido' then 'Concluído'
      when 'nao_se_aplica' then 'Não se aplica'
      else cs.status
    end as badge,
    '/implementacoes/' || cs.implementacao_id || '?aba=criterios' as rota,
    similarity(
      public.buscar_normalizar(ce.nome || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia,
    i.cliente_id as cliente_id,
    coalesce(cs.responsavel_validacao_id, i.consultor_responsavel_id) as consultor_id,
    coalesce(cs.data_validacao, cs.created_at) as data_referencia
  from public.criterios_entrega_status cs
  join public.criterios_entrega ce on ce.id = cs.criterio_id
  join public.implementacoes_crm i on i.id = cs.implementacao_id
  left join public.clientes c on c.id = i.cliente_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(ce.nome || ' ' || coalesce(c.nome_fantasia,'') || ' ' || i.nome_cliente)
        like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, titulo asc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_criterios_entrega(text, int, int) from public;
grant execute on function public.busca_criterios_entrega(text, int, int) to authenticated;

-- ============================================================
-- 12) Formulários — mapeamentos (vendas/pós-venda), abre a tela de
-- respostas (/mapeamento/:id/respostas).
-- ============================================================
create or replace function public.busca_formularios(p_termo text, p_limite int default 5, p_offset int default 0)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    'formulario'::text as categoria,
    m.id as entidade_id,
    m.nome_negocio || case when m.tipo::text = 'pos_venda' then ' — Pós-venda' else ' — Vendas' end as titulo,
    coalesce(c.nome_fantasia, c.nome_empresa) as subtitulo,
    case m.status::text
      when 'em_preenchimento' then 'Em preenchimento'
      when 'processando_ia' then 'Processando IA'
      when 'concluido' then 'Concluído'
      when 'erro' then 'Erro'
      else m.status::text
    end as badge,
    '/mapeamento/' || m.id || '/respostas' as rota,
    similarity(
      public.buscar_normalizar(m.nome_negocio || ' ' || coalesce(c.nome_fantasia,'')),
      public.buscar_normalizar(p_termo)
    ) as relevancia,
    m.cliente_id as cliente_id,
    c.consultor_responsavel_id as consultor_id,
    m.created_at as data_referencia
  from public.mapeamentos m
  left join public.clientes c on c.id = m.cliente_id
  where length(trim(p_termo)) > 0
    and public.buscar_normalizar(m.nome_negocio || ' ' || coalesce(c.nome_fantasia,'') || ' ' || m.tipo::text)
        like '%' || public.buscar_normalizar(p_termo) || '%'
  order by relevancia desc nulls last, m.created_at desc
  limit greatest(p_limite, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.busca_formularios(text, int, int) from public;
grant execute on function public.busca_formularios(text, int, int) to authenticated;

-- ============================================================
-- 13) busca_global — agora une as 12.
-- ============================================================
create or replace function public.busca_global(p_termo text, p_limite_por_categoria int default 5)
returns table (
  categoria text, entidade_id uuid, titulo text, subtitulo text, badge text, rota text, relevancia real,
  cliente_id uuid, consultor_id uuid, data_referencia timestamptz
)
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
  select * from public.busca_criterios_entrega(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_funis(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_formularios(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_reunioes(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_atas(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_pendencias(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_ocorrencias(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_arquivos(p_termo, p_limite_por_categoria, 0)
  union all
  select * from public.busca_consultores(p_termo, p_limite_por_categoria, 0);
$$;

revoke all on function public.busca_global(text, int) from public;
grant execute on function public.busca_global(text, int) to authenticated;
