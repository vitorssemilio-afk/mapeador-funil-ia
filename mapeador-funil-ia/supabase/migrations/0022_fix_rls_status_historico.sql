-- A trigger que grava o histórico de status em implementacao_status_historico
-- roda com os privilégios de quem faz o insert/update em implementacoes_crm
-- (o usuário autenticado no app), mas essa tabela só tinha política de RLS
-- pra SELECT — nenhuma pra INSERT. Resultado: toda criação ou mudança de
-- status de implementação falhava com "new row violates row-level security
-- policy for table implementacao_status_historico".
--
-- Corrige tornando a função SECURITY DEFINER, então ela grava o histórico
-- com os privilégios de quem a criou (dono do schema), sem depender de
-- policy de INSERT pro usuário final — mantendo a tabela como um log
-- somente-leitura pra quem usa o app.
create or replace function public.registrar_status_historico_implementacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.implementacao_status_historico (implementacao_id, status_anterior, status_novo)
    values (new.id, null, new.status);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.implementacao_status_historico (implementacao_id, status_anterior, status_novo)
    values (new.id, old.status, new.status);
  end if;

  return new;
end;
$$;
