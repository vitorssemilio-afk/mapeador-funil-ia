-- P0-C1 da auditoria funcional: uma versão de funil marcada como aprovada
-- em funil_versoes podia continuar sendo editada em funis_gerados (o
-- autosave da tela de Mapeamento faz update direto em `etapas`, sem checar
-- status de aprovação) — quebrando a garantia de que "aprovada nunca é
-- sobrescrita" (documentada em 0045_versionamento_funis.sql, mas nunca
-- imposta a nível de dado, só de metadado).
--
-- Esta migration:
-- 1. Adiciona funil_versoes.versao_origem, pra registrar de qual versão uma
--    nova versão em rascunho foi criada (quando nasce de "criar nova versão
--    para editar" em cima de uma versão aprovada).
-- 2. Adiciona um trigger em funis_gerados que recusa qualquer UPDATE numa
--    linha cuja versão correspondente em funil_versoes já esteja aprovada
--    — nível de dado, não depende de nenhuma tela respeitar isso.
-- 3. Adiciona a function criar_versao_funil_a_partir_de(), que duplica os
--    funis de uma versão (aprovada ou não) para uma nova versão em
--    rascunho, de forma atômica, pra alimentar o botão "Criar nova versão
--    para edição".

alter table public.funil_versoes
  add column if not exists versao_origem integer;

comment on column public.funil_versoes.versao_origem is
  'Versão a partir da qual esta versão foi criada via "Criar nova versão para edição" (null quando a versão nasceu de uma geração/regeneração normal pela IA).';

-- ============================================================
-- Trigger: bloqueia UPDATE em funis_gerados quando a versão já está aprovada
-- ============================================================
-- security definer: a checagem precisa ser confiável independente da RLS
-- que o chamador tenha em funil_versoes — é a trava de imutabilidade em si,
-- não pode depender de visibilidade de linha.
create or replace function public.bloquear_edicao_funil_aprovado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.funil_versoes fv
    where fv.mapeamento_id = old.mapeamento_id
      and fv.versao = old.versao
      and fv.status = 'aprovada'
  ) then
    raise exception 'Esta versão do funil está aprovada e não pode ser editada diretamente. Crie uma nova versão para editar.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists funis_gerados_bloquear_edicao_aprovado on public.funis_gerados;
create trigger funis_gerados_bloquear_edicao_aprovado
  before update on public.funis_gerados
  for each row execute function public.bloquear_edicao_funil_aprovado();

-- ============================================================
-- RPC: cria uma nova versão em rascunho, copiando os funis de uma versão
-- existente (normalmente a versão aprovada que o usuário está vendo).
-- Atômica (uma function plpgsql roda dentro de uma única transação) e usa
-- lock consultivo por mapeamento pra evitar duas chamadas concorrentes
-- calcularem a mesma "próxima versão".
-- ============================================================
create or replace function public.criar_versao_funil_a_partir_de(
  p_mapeamento_id uuid,
  p_versao_origem int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nova_versao int;
  v_email text;
  v_linhas_copiadas int;
begin
  if not public.tenho_acesso_ao_mapeamento(p_mapeamento_id) then
    raise exception 'Sem acesso a este mapeamento.';
  end if;

  -- Lock por mapeamento, liberado automaticamente no fim da transação —
  -- evita duas chamadas simultâneas calcularem a mesma "próxima versão".
  perform pg_advisory_xact_lock(hashtext(p_mapeamento_id::text));

  select coalesce(max(versao), 0) + 1 into v_nova_versao
  from public.funis_gerados
  where mapeamento_id = p_mapeamento_id;

  v_email := auth.jwt() ->> 'email';

  insert into public.funis_gerados (mapeamento_id, user_id, nome_funil, tipo_funil, justificativa, etapas, ordem, versao)
  select mapeamento_id, auth.uid(), nome_funil, tipo_funil, justificativa, etapas, ordem, v_nova_versao
  from public.funis_gerados
  where mapeamento_id = p_mapeamento_id and versao = p_versao_origem;

  get diagnostics v_linhas_copiadas = row_count;
  if v_linhas_copiadas = 0 then
    raise exception 'Versão de origem não encontrada para este mapeamento.';
  end if;

  insert into public.funil_versoes (mapeamento_id, versao, origem, gerado_por_email, status, versao_origem)
  values (p_mapeamento_id, v_nova_versao, 'manual', v_email, 'rascunho', p_versao_origem);

  return v_nova_versao;
end;
$$;

revoke all on function public.criar_versao_funil_a_partir_de(uuid, int) from public;
grant execute on function public.criar_versao_funil_a_partir_de(uuid, int) to authenticated;
