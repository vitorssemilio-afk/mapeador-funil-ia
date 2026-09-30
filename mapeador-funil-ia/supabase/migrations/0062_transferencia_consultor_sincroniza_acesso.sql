-- P0-C4 da auditoria funcional: transferir o consultor responsável de uma
-- implementação (implementacoes_crm.consultor_responsavel_id) não
-- sincronizava clientes.consultor_responsavel_id, e a RLS de `clientes`
-- (migration 0054) dependia SÓ dessa coluna própria, sem considerar o
-- vínculo via implementação (responsável OU apoio) como tenho_acesso_ao_cliente
-- já faz pra todas as outras tabelas. Resultado: o consultor antigo mantinha
-- acesso à ficha do cliente indefinidamente, e o novo podia não conseguir
-- abri-la.
--
-- Duas correções, complementares:
-- 1. A RLS de `clientes` passa a usar tenho_acesso_ao_cliente() pra
--    select/update/delete (onde a linha já existe, então o self-reference é
--    seguro) — igual o resto do produto — mantendo o check direto na coluna
--    só pra INSERT (onde tenho_acesso_ao_cliente não pode ser usado com
--    segurança, ver comentário original em 0054).
-- 2. Uma RPC atômica pra transferir o responsável de uma implementação,
--    que troca o vínculo na implementação, sincroniza clientes.consultor_
--    responsavel_id e grava o histórico numa única transação — nunca fica
--    pela metade (antes eram duas chamadas separadas do frontend).

-- ============================================================
-- 1) RLS de clientes por comando, reaproveitando tenho_acesso_ao_cliente
--    onde é seguro.
-- ============================================================
drop policy if exists "clientes_all_authenticated" on public.clientes;
drop policy if exists "clientes_por_vinculo" on public.clientes;
drop policy if exists "clientes_select_por_vinculo" on public.clientes;
drop policy if exists "clientes_insert_por_vinculo" on public.clientes;
drop policy if exists "clientes_update_por_vinculo" on public.clientes;
drop policy if exists "clientes_delete_por_vinculo" on public.clientes;

create policy "clientes_select_por_vinculo"
  on public.clientes for select
  to authenticated
  using (public.sou_administrador() or public.tenho_acesso_ao_cliente(id));

-- INSERT: a linha ainda não existe no momento do check, então
-- tenho_acesso_ao_cliente (que faz um select na própria tabela) não é
-- seguro aqui — mesma checagem direta de antes. O trigger de atribuição
-- automática (migration 0051) garante consultor_responsavel_id preenchido
-- com quem está criando.
create policy "clientes_insert_por_vinculo"
  on public.clientes for insert
  to authenticated
  with check (public.sou_administrador() or consultor_responsavel_id = public.meu_consultor_id());

create policy "clientes_update_por_vinculo"
  on public.clientes for update
  to authenticated
  using (public.sou_administrador() or public.tenho_acesso_ao_cliente(id))
  with check (public.sou_administrador() or public.tenho_acesso_ao_cliente(id));

create policy "clientes_delete_por_vinculo"
  on public.clientes for delete
  to authenticated
  using (public.sou_administrador() or public.tenho_acesso_ao_cliente(id));

-- ============================================================
-- 2) Transferência atômica de consultor responsável
-- ============================================================
create or replace function public.transferir_consultor_responsavel_implementacao(
  p_implementacao_id uuid,
  p_novo_consultor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consultor_anterior_id uuid;
  v_cliente_id uuid;
  v_email text;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem acesso a esta implementação.';
  end if;

  select consultor_responsavel_id, cliente_id
    into v_consultor_anterior_id, v_cliente_id
    from public.implementacoes_crm
    where id = p_implementacao_id;

  if not found then
    raise exception 'Implementação não encontrada.';
  end if;

  if v_consultor_anterior_id is not distinct from p_novo_consultor_id then
    return;
  end if;

  v_email := auth.jwt() ->> 'email';

  update public.implementacoes_crm
  set consultor_responsavel_id = p_novo_consultor_id
  where id = p_implementacao_id;

  if v_cliente_id is not null then
    update public.clientes
    set consultor_responsavel_id = p_novo_consultor_id
    where id = v_cliente_id;
  end if;

  insert into public.implementacao_consultor_historico
    (implementacao_id, consultor_anterior_id, consultor_novo_id, alterado_por_email)
  values
    (p_implementacao_id, v_consultor_anterior_id, p_novo_consultor_id, v_email);
end;
$$;

revoke all on function public.transferir_consultor_responsavel_implementacao(uuid, uuid) from public;
grant execute on function public.transferir_consultor_responsavel_implementacao(uuid, uuid) to authenticated;
