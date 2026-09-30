-- Revisão de segurança (fase 2, etapa 4 — última) — RLS por vínculo nas
-- duas tabelas centrais que faltavam (clientes, implementacoes_crm) e
-- reforço das RPCs de credenciais, que continuavam abertas pra qualquer
-- autenticado independente de vínculo (elas são SECURITY DEFINER, então
-- bypassam a RLS de implementacoes_crm por natureza — a restrição de
-- acesso tem que ser feita dentro da própria função).

-- ============================================================
-- clientes: a linha carrega o próprio vínculo (consultor_responsavel_id),
-- então a checagem é direta na própria coluna — sem passar pela função
-- tenho_acesso_ao_cliente (que faz um select na tabela; não é seguro
-- combinar com WITH CHECK de INSERT, já que a linha ainda não existe no
-- momento da checagem). O trigger de atribuição automática (migration
-- 0051) já garante que consultor_responsavel_id vem preenchido com quem
-- está criando, então o WITH CHECK abaixo passa naturalmente.
-- ============================================================
drop policy if exists "clientes_all_authenticated" on public.clientes;
drop policy if exists "clientes_por_vinculo" on public.clientes;
create policy "clientes_por_vinculo"
  on public.clientes for all
  to authenticated
  using (public.sou_administrador() or consultor_responsavel_id = public.meu_consultor_id())
  with check (public.sou_administrador() or consultor_responsavel_id = public.meu_consultor_id());

-- ============================================================
-- implementacoes_crm: responsável OU apoio da própria implementação, OU
-- responsável do cliente-pai (cobre o caso de alguém ser responsável pelo
-- cliente mas o campo da implementação ainda não ter sido sincronizado).
-- Mesma lógica de tenho_acesso_a_implementacao, mas escrita direto (sem
-- chamar a função, pelo mesmo motivo do INSERT explicado acima).
-- ============================================================
drop policy if exists "implementacoes_crm_all_authenticated" on public.implementacoes_crm;
drop policy if exists "implementacoes_crm_por_vinculo" on public.implementacoes_crm;
create policy "implementacoes_crm_por_vinculo"
  on public.implementacoes_crm for all
  to authenticated
  using (
    public.sou_administrador()
    or consultor_responsavel_id = public.meu_consultor_id()
    or consultor_apoio_id = public.meu_consultor_id()
    or exists (
      select 1 from public.clientes c
      where c.id = implementacoes_crm.cliente_id
        and c.consultor_responsavel_id = public.meu_consultor_id()
    )
  )
  with check (
    public.sou_administrador()
    or consultor_responsavel_id = public.meu_consultor_id()
    or consultor_apoio_id = public.meu_consultor_id()
    or exists (
      select 1 from public.clientes c
      where c.id = implementacoes_crm.cliente_id
        and c.consultor_responsavel_id = public.meu_consultor_id()
    )
  );

-- ============================================================
-- RPCs de credenciais (CRM e API Kommo) — SECURITY DEFINER, então
-- ignoram a RLS de implementacoes_crm por definição. Até aqui, qualquer
-- autenticado podia chamar qualquer uma pra qualquer implementacao_id,
-- mesmo sem vínculo nenhum (a fase 1 só cobriu auditoria, não bloqueio —
-- ver migration 0050). Agora que tenho_acesso_a_implementacao existe,
-- cada função passa a exigir vínculo antes de fazer qualquer coisa.
-- Mantidas as mesmas assinaturas e o mesmo comportamento de auditoria já
-- existente.
-- ============================================================
create or replace function public.salvar_credencial_crm(
  p_implementacao_id uuid,
  p_login text,
  p_senha text,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_id uuid;
  v_cliente_id uuid;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  insert into public.credenciais_crm (implementacao_id, login, senha_criptografada, observacoes)
  values (p_implementacao_id, p_login, pgp_sym_encrypt(p_senha, v_chave), nullif(trim(p_observacoes), ''))
  returning id into v_id;

  select cliente_id into v_cliente_id from public.implementacoes_crm where id = p_implementacao_id;
  perform public.registrar_auditoria('criar_credencial_crm', 'credencial_crm', v_id, v_cliente_id, p_implementacao_id,
    jsonb_build_object('login', p_login));

  return v_id;
end;
$$;

create or replace function public.atualizar_credencial_crm(
  p_id uuid,
  p_login text,
  p_senha text,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_implementacao_id uuid;
  v_cliente_id uuid;
begin
  select implementacao_id into v_implementacao_id from public.credenciais_crm where id = p_id;

  if v_implementacao_id is null or not public.tenho_acesso_a_implementacao(v_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  update public.credenciais_crm
  set login = p_login,
      senha_criptografada = pgp_sym_encrypt(p_senha, v_chave),
      observacoes = nullif(trim(p_observacoes), '')
  where id = p_id;

  select cliente_id into v_cliente_id from public.implementacoes_crm where id = v_implementacao_id;
  perform public.registrar_auditoria('atualizar_credencial_crm', 'credencial_crm', p_id, v_cliente_id, v_implementacao_id,
    jsonb_build_object('login', p_login));
end;
$$;

create or replace function public.revelar_credencial_crm(p_id uuid)
returns table (login text, senha text, observacoes text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_implementacao_id uuid;
  v_cliente_id uuid;
begin
  select implementacao_id into v_implementacao_id from public.credenciais_crm where id = p_id;

  if v_implementacao_id is null or not public.tenho_acesso_a_implementacao(v_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  select cliente_id into v_cliente_id from public.implementacoes_crm where id = v_implementacao_id;
  perform public.registrar_auditoria('visualizar_credencial_crm', 'credencial_crm', p_id, v_cliente_id, v_implementacao_id, '{}'::jsonb);

  return query
  select c.login, pgp_sym_decrypt(c.senha_criptografada, v_chave), c.observacoes
  from public.credenciais_crm c
  where c.id = p_id;
end;
$$;

create or replace function public.listar_credenciais_crm(p_implementacao_id uuid)
returns table (id uuid, login text, observacoes text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  return query
  select c.id, c.login, c.observacoes, c.created_at, c.updated_at
  from public.credenciais_crm c
  where c.implementacao_id = p_implementacao_id
  order by c.created_at asc;
end;
$$;

create or replace function public.salvar_credencial_api_kommo(
  p_implementacao_id uuid,
  p_subdominio text,
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_id uuid;
  v_cliente_id uuid;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'kommo_api_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  insert into public.credenciais_api_kommo (implementacao_id, subdominio, token_criptografado)
  values (p_implementacao_id, trim(p_subdominio), pgp_sym_encrypt(p_token, v_chave))
  on conflict (implementacao_id) do update
    set subdominio = excluded.subdominio,
        token_criptografado = excluded.token_criptografado
  returning id into v_id;

  select cliente_id into v_cliente_id from public.implementacoes_crm where id = p_implementacao_id;
  perform public.registrar_auditoria('salvar_credencial_api_kommo', 'credencial_api_kommo', v_id, v_cliente_id,
    p_implementacao_id, jsonb_build_object('subdominio', trim(p_subdominio)));

  return v_id;
end;
$$;

create or replace function public.obter_credencial_api_kommo_meta(p_implementacao_id uuid)
returns table (subdominio text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  return query
  select c.subdominio, c.created_at, c.updated_at
  from public.credenciais_api_kommo c
  where c.implementacao_id = p_implementacao_id;
end;
$$;

create or replace function public.obter_credencial_api_kommo(p_implementacao_id uuid)
returns table (subdominio text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_cliente_id uuid;
  v_credencial_id uuid;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Sem permissão para esta implementação.';
  end if;

  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'kommo_api_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  select id into v_credencial_id from public.credenciais_api_kommo where implementacao_id = p_implementacao_id;
  select cliente_id into v_cliente_id from public.implementacoes_crm where id = p_implementacao_id;
  perform public.registrar_auditoria('usar_credencial_api_kommo', 'credencial_api_kommo', v_credencial_id, v_cliente_id,
    p_implementacao_id, '{}'::jsonb);

  return query
  select c.subdominio, pgp_sym_decrypt(c.token_criptografado, v_chave)
  from public.credenciais_api_kommo c
  where c.implementacao_id = p_implementacao_id;
end;
$$;
