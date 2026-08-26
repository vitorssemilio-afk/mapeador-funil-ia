-- O app deixa de ser "cada usuário só vê o que criou" e passa a ser um
-- workspace de equipe: qualquer conta autenticada enxerga todos os
-- mapeamentos, funis gerados e metadados de geração — não só os próprios.
-- A maior parte do app (implementacoes_crm, checklist, credenciais_crm,
-- credenciais_api_kommo, blocos/perguntas_formulario, checkpoints_adocao)
-- já era assim desde o início (policy "all_authenticated" ou RPCs
-- SECURITY DEFINER sem filtro de dono); só mapeamentos, funis_gerados e
-- geracoes_meta ainda restringiam por auth.uid() = user_id.

drop policy if exists "mapeamentos_select_own" on public.mapeamentos;
drop policy if exists "mapeamentos_insert_own" on public.mapeamentos;
drop policy if exists "mapeamentos_update_own" on public.mapeamentos;
drop policy if exists "mapeamentos_delete_own" on public.mapeamentos;

create policy "mapeamentos_all_authenticated"
  on public.mapeamentos for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "funis_gerados_select_own" on public.funis_gerados;
drop policy if exists "funis_gerados_insert_own" on public.funis_gerados;
drop policy if exists "funis_gerados_update_own" on public.funis_gerados;
drop policy if exists "funis_gerados_delete_own" on public.funis_gerados;

create policy "funis_gerados_all_authenticated"
  on public.funis_gerados for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "geracoes_meta_select_own" on public.geracoes_meta;
drop policy if exists "geracoes_meta_insert_own" on public.geracoes_meta;
drop policy if exists "geracoes_meta_delete_own" on public.geracoes_meta;

create policy "geracoes_meta_all_authenticated"
  on public.geracoes_meta for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- Cadastro aberto (/login, "Cadastre-se") passa a aceitar só e-mails
-- @v4company.com — sem isso, dar acesso total a "qualquer conta nova"
-- (regra acima) significaria dar acesso a qualquer estranho da internet.
-- Enforço via trigger em auth.users (o Supabase Auth grava ali direto,
-- então validar só no client não bastaria pra barrar de verdade).
-- ============================================================
create or replace function public.restringir_dominio_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email !~* '@v4company\.com$' then
    raise exception 'Cadastro permitido apenas para e-mails do domínio @v4company.com';
  end if;
  return new;
end;
$$;

drop trigger if exists restringir_dominio_cadastro_trigger on auth.users;

create trigger restringir_dominio_cadastro_trigger
  before insert on auth.users
  for each row execute function public.restringir_dominio_cadastro();
