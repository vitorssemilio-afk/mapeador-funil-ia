-- Reforço idempotente do RLS de `consultores` (PROMPT 55.2) — mesma causa
-- raiz do upload de avatar corrigido no PR #122/#123: migrations deste
-- repo são arquivos SQL, e nada garante que todas tenham sido de fato
-- executadas no projeto Supabase de produção. Se "consultores_update_self"
-- (migration 0082) nunca tiver sido aplicada ali, TODO self-update de
-- consultor falha por RLS — inclusive os campos de onboarding — e por
-- isso onboarding_pulado/onboarding_concluido_em nunca persistem,
-- fazendo o onboarding reabrir em todo reload mesmo depois das correções
-- de código dos PRs #119/#121. Esta migration reaplica (drop + create)
-- cada policy e trigger relevante de `consultores`, nenhuma tabela nova.
alter table public.consultores
  add column if not exists onboarding_iniciado_em timestamptz,
  add column if not exists onboarding_concluido_em timestamptz,
  add column if not exists onboarding_pulado boolean not null default false,
  add column if not exists onboarding_etapa int not null default 0,
  add column if not exists primeiros_passos_concluidos text[] not null default '{}';

drop policy if exists "consultores_select_authenticated" on public.consultores;
create policy "consultores_select_authenticated"
  on public.consultores for select
  to authenticated
  using (true);

drop policy if exists "consultores_insert_admin" on public.consultores;
create policy "consultores_insert_admin"
  on public.consultores for insert
  to authenticated
  with check (public.sou_administrador());

drop policy if exists "consultores_update_admin" on public.consultores;
create policy "consultores_update_admin"
  on public.consultores for update
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

drop policy if exists "consultores_delete_admin" on public.consultores;
create policy "consultores_delete_admin"
  on public.consultores for delete
  to authenticated
  using (public.sou_administrador());

-- A policy crítica pra esta correção: sem ela, nenhum consultor
-- não-administrador consegue salvar o próprio progresso de onboarding
-- (nem o próprio avatar).
drop policy if exists "consultores_update_self" on public.consultores;
create policy "consultores_update_self"
  on public.consultores for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.restringir_autoedicao_consultor_a_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.sou_administrador() then
    return new;
  end if;

  if new.nome is distinct from old.nome
     or new.email is distinct from old.email
     or new.telefone is distinct from old.telefone
     or new.cargo is distinct from old.cargo
     or new.ativo is distinct from old.ativo
     or new.user_id is distinct from old.user_id
     or new.role is distinct from old.role then
    raise exception 'Só administradores podem alterar esses campos — um consultor só pode atualizar o próprio avatar/onboarding.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restringir_autoedicao_consultor_a_avatar on public.consultores;
create trigger trg_restringir_autoedicao_consultor_a_avatar
  before update on public.consultores
  for each row
  execute function public.restringir_autoedicao_consultor_a_avatar();
