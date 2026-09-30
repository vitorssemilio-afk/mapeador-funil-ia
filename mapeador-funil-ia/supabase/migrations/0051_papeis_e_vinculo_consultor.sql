-- Revisão de segurança (fase 2, etapa 1 de várias) — fundamentos de
-- controle de acesso por papel. Esta migration só prepara o terreno: liga
-- consultores a contas de login reais, introduz o conceito de papel
-- (administrador/consultor/consultor_apoio), cria as funções de
-- autorização que serão usadas pra restringir RLS tabela por tabela numa
-- etapa futura, e garante que todo cliente novo já nasça com um consultor
-- responsável (quem criou).
--
-- O ÚNICO comportamento que muda de verdade pra quem já usa o produto hoje
-- é em `consultores`: gerenciar o time (criar/editar/desativar/excluir
-- consultor) passa a exigir papel administrador — hoje qualquer pessoa
-- logada podia fazer isso. Todo o resto desta migration é aditivo (colunas
-- novas, funções novas, triggers de preenchimento automático) e não muda
-- o que ninguém já conseguia ver ou fazer.
--
-- As políticas de RLS de clientes/implementações/mapeamentos/funis/
-- credenciais etc. continuam "using (true) to authenticated" por enquanto
-- — essa troca é a próxima etapa, feita tabela por tabela, com teste antes
-- de cada uma, depois que o time já tiver consultor_responsavel_id
-- preenchido em todo cliente/implementação relevante (senão gente fica
-- sem enxergar cliente que já trabalha).

-- ============================================================
-- 1) Papel e vínculo de login em `consultores`.
-- ============================================================
alter table public.consultores add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.consultores add column if not exists role text not null default 'consultor'
  check (role in ('administrador', 'consultor', 'consultor_apoio'));

create unique index if not exists consultores_user_id_idx on public.consultores (user_id) where user_id is not null;

-- Backfill: liga consultores já cadastrados a contas que já existem hoje.
update public.consultores c
set user_id = u.id
from auth.users u
where lower(c.email) = lower(u.email)
  and c.user_id is null;

-- Garante o administrador inicial (a pessoa que pediu esta revisão de
-- segurança), mesmo que a conta dele ainda não tenha feito o primeiro
-- login no momento em que esta migration rodar.
do $$
declare
  v_user_id uuid;
  v_email text := 'vitor.emilio@v4company.com';
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);

  if exists (select 1 from public.consultores where lower(email) = lower(v_email)) then
    update public.consultores
    set role = 'administrador',
        user_id = coalesce(user_id, v_user_id)
    where lower(email) = lower(v_email);
  else
    insert into public.consultores (nome, email, role, user_id)
    values ('Vitor Emilio', v_email, 'administrador', v_user_id);
  end if;
end $$;

-- Liga automaticamente qualquer consultor (administrador incluso) assim
-- que a conta de login correspondente é criada — cobre tanto o primeiro
-- login do administrador inicial (se ainda não tinha conta no momento da
-- migration) quanto qualquer consultor novo cadastrado antes de logar.
create or replace function public.vincular_consultor_por_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultores
  set user_id = new.id
  where lower(email) = lower(new.email)
    and user_id is null;
  return new;
end;
$$;

drop trigger if exists vincular_consultor_por_email_trigger on auth.users;
create trigger vincular_consultor_por_email_trigger
  after insert on auth.users
  for each row execute function public.vincular_consultor_por_email();

-- ============================================================
-- 2) Funções de autorização — ponto único de verdade, usadas depois nas
-- políticas de RLS (próxima etapa) e já disponíveis pra qualquer RPC que
-- precisar checar permissão manualmente.
-- ============================================================
create or replace function public.meu_consultor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.consultores where user_id = auth.uid();
$$;

create or replace function public.meu_papel()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from public.consultores where user_id = auth.uid()), 'consultor');
$$;

create or replace function public.sou_administrador()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.meu_papel() = 'administrador';
$$;

-- true se: administrador, OU responsável/apoio de alguma implementação
-- desse cliente, OU o próprio cliente já tiver esse consultor como
-- responsável (cliente ainda na fase de vendas/mapeamento, sem
-- implementação criada ainda).
create or replace function public.tenho_acesso_ao_cliente(p_cliente_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.sou_administrador()
    or exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id
        and c.consultor_responsavel_id = public.meu_consultor_id()
    )
    or exists (
      select 1 from public.implementacoes_crm i
      where i.cliente_id = p_cliente_id
        and (i.consultor_responsavel_id = public.meu_consultor_id()
             or i.consultor_apoio_id = public.meu_consultor_id())
    );
$$;

create or replace function public.tenho_acesso_a_implementacao(p_implementacao_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.sou_administrador()
    or exists (
      select 1 from public.implementacoes_crm i
      where i.id = p_implementacao_id
        and (i.consultor_responsavel_id = public.meu_consultor_id()
             or i.consultor_apoio_id = public.meu_consultor_id())
    );
$$;

revoke all on function public.meu_papel() from public;
revoke all on function public.sou_administrador() from public;
revoke all on function public.meu_consultor_id() from public;
revoke all on function public.tenho_acesso_ao_cliente(uuid) from public;
revoke all on function public.tenho_acesso_a_implementacao(uuid) from public;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.sou_administrador() to authenticated;
grant execute on function public.meu_consultor_id() to authenticated;
grant execute on function public.tenho_acesso_ao_cliente(uuid) to authenticated;
grant execute on function public.tenho_acesso_a_implementacao(uuid) to authenticated;

-- ============================================================
-- 3) `clientes.consultor_responsavel_id` — quem cria o cliente vira
-- automaticamente o responsável (a não ser que já venha preenchido). A
-- implementação de CRM herda o mesmo responsável do cliente quando criada,
-- se não vier um valor explícito.
-- ============================================================
alter table public.clientes add column if not exists consultor_responsavel_id uuid references public.consultores(id);

create or replace function public.atribuir_consultor_responsavel_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consultor_responsavel_id is null then
    new.consultor_responsavel_id := public.meu_consultor_id();
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_atribuir_consultor_responsavel on public.clientes;
create trigger clientes_atribuir_consultor_responsavel
  before insert on public.clientes
  for each row execute function public.atribuir_consultor_responsavel_cliente();

create or replace function public.atribuir_consultor_responsavel_implementacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consultor_responsavel_id is null and new.cliente_id is not null then
    select consultor_responsavel_id into new.consultor_responsavel_id
    from public.clientes where id = new.cliente_id;
  end if;
  return new;
end;
$$;

drop trigger if exists implementacoes_crm_atribuir_consultor_responsavel on public.implementacoes_crm;
create trigger implementacoes_crm_atribuir_consultor_responsavel
  before insert on public.implementacoes_crm
  for each row execute function public.atribuir_consultor_responsavel_implementacao();

-- Backfill: clientes já existentes sem responsável, mas que já têm alguma
-- implementação com responsável definido, herdam esse responsável agora
-- (não dá pra saber quem "criou" um cliente já existente — não existia
-- esse registro antes desta migration).
update public.clientes c
set consultor_responsavel_id = i.consultor_responsavel_id
from public.implementacoes_crm i
where i.cliente_id = c.id
  and c.consultor_responsavel_id is null
  and i.consultor_responsavel_id is not null;

-- ============================================================
-- 4) Gestão do time (`consultores`) passa a exigir administrador — a
-- única mudança de comportamento real desta migration. Leitura continua
-- aberta pra equipe toda (necessário pra popular os seletores de
-- consultor responsável/apoio nas telas).
-- ============================================================
drop policy if exists "consultores_all_authenticated" on public.consultores;

create policy "consultores_select_authenticated"
  on public.consultores for select
  to authenticated
  using (true);

create policy "consultores_insert_admin"
  on public.consultores for insert
  to authenticated
  with check (public.sou_administrador());

create policy "consultores_update_admin"
  on public.consultores for update
  to authenticated
  using (public.sou_administrador())
  with check (public.sou_administrador());

create policy "consultores_delete_admin"
  on public.consultores for delete
  to authenticated
  using (public.sou_administrador());
