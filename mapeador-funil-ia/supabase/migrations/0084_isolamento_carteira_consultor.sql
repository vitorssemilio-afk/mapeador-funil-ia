-- Preparação do CRM Flow para contas individuais por consultor (prompt de
-- isolamento de carteira). A maior parte da infraestrutura de autorização
-- JÁ EXISTE desde as migrations 0051/0053/0054/0062 (meu_consultor_id(),
-- sou_administrador(), tenho_acesso_ao_cliente()/tenho_acesso_a_implementacao(),
-- RLS "por vínculo" em clientes/implementacoes_crm/mapeamentos/funis/
-- reuniões/notificações/relatórios de entrega/atas, Busca Global SECURITY
-- INVOKER, transferência de responsável atômica) — não há o que duplicar
-- aqui. Esta migration fecha as 2 lacunas reais encontradas na auditoria
-- (ver relatório) e adiciona a única peça administrativa que faltava.

-- ============================================================
-- 1) GAP — configuracoes_pipefy: "for all using (true)" desde a migration
-- 0038 (anterior ao conceito de papel/administrador, nunca revisitada).
-- Qualquer autenticado podia alterar as URLs de solicitação do Pipefy.
-- Leitura continua aberta (é configuração operacional útil pra todo
-- consultor ver); escrita passa a exigir administrador.
-- ============================================================
drop policy if exists "configuracoes_pipefy_all_authenticated" on public.configuracoes_pipefy;

create policy "configuracoes_pipefy_select_authenticated"
  on public.configuracoes_pipefy for select
  to authenticated
  using (true);

create policy "configuracoes_pipefy_update_admin"
  on public.configuracoes_pipefy for update
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

-- ============================================================
-- 2) GAP — atividades_cronograma: a policy "por vínculo" da migration 0053
-- corretamente restringe as linhas DERIVADAS de uma implementação
-- (implementacao_id preenchido), mas deixou as linhas de TEMPLATE GLOBAL
-- (implementacao_id is null — a tela "Checklist padrão",
-- ImplementacaoChecklistAdmin.tsx) abertas a qualquer authenticated pra
-- escrever, não só ler. Leitura do template continua aberta a todos (é
-- configuração compartilhada que todo mundo precisa ver); INSERT/UPDATE/
-- DELETE do template passa a exigir administrador. Linhas derivadas
-- continuam exatamente como antes (por vínculo).
-- ============================================================
drop policy if exists "atividades_cronograma_por_vinculo" on public.atividades_cronograma;

create policy "atividades_cronograma_select"
  on public.atividades_cronograma for select
  to authenticated
  using (implementacao_id is null or public.tenho_acesso_a_implementacao(implementacao_id));

create policy "atividades_cronograma_insert"
  on public.atividades_cronograma for insert
  to authenticated
  with check (
    (implementacao_id is null and public.sou_administrador())
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
  );

create policy "atividades_cronograma_update"
  on public.atividades_cronograma for update
  to authenticated
  using (
    (implementacao_id is null and public.sou_administrador())
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
  )
  with check (
    (implementacao_id is null and public.sou_administrador())
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
  );

create policy "atividades_cronograma_delete"
  on public.atividades_cronograma for delete
  to authenticated
  using (
    (implementacao_id is null and public.sou_administrador())
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
  );

-- ============================================================
-- 3) NOVO — vincular um consultor cadastrado a uma conta de login que já
-- existe (seção 49 do pedido). O caminho normal (trigger
-- vincular_consultor_por_email, migration 0051) só liga automaticamente
-- quando a conta é criada DEPOIS do cadastro do consultor — se a pessoa já
-- tinha login antes de virar consultor(a) no sistema (ou o e-mail não bateu
-- por algum motivo pontual), fica sem vínculo pra sempre sem essa válvula
-- manual. Admin-only, nunca sobrescreve um vínculo já existente (nem o
-- deste consultor nem o de outro com a mesma conta).
-- ============================================================
create or replace function public.vincular_consultor_a_conta_existente(p_consultor_id uuid)
returns public.consultores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultor public.consultores;
  v_user_id uuid;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem vincular contas.' using errcode = '42501';
  end if;

  select * into v_consultor from public.consultores where id = p_consultor_id;
  if not found then
    raise exception 'Consultor não encontrado.';
  end if;

  if v_consultor.user_id is not null then
    raise exception 'Este consultor já está vinculado a uma conta.';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(v_consultor.email);
  if v_user_id is null then
    raise exception 'Nenhuma conta de login encontrada com este e-mail ainda. Peça para a pessoa se cadastrar em /login primeiro.';
  end if;

  if exists (select 1 from public.consultores where user_id = v_user_id and id <> p_consultor_id) then
    raise exception 'Essa conta já está vinculada a outro consultor.';
  end if;

  update public.consultores set user_id = v_user_id where id = p_consultor_id
  returning * into v_consultor;

  return v_consultor;
end;
$$;

revoke all on function public.vincular_consultor_a_conta_existente(uuid) from public;
grant execute on function public.vincular_consultor_a_conta_existente(uuid) to authenticated;
