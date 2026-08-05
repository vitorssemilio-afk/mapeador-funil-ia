-- Integração automática com o Kommo: credenciais de API (subdomínio + token
-- de longa duração) por implementação, e o registro do que já foi criado de
-- fato na conta do cliente (pipeline, etapas, campos).
--
-- Diferente de credenciais_crm (login/senha que o CLIENTE usa pra acessar o
-- Kommo pela UI): isso aqui é o token de API que a Edge Function usa pra
-- criar o funil programaticamente. Nunca é exposto ao browser — só a função
-- obter_credencial_api_kommo devolve o token decriptografado, e ela só deve
-- ser chamada server-side pela Edge Function criar-funil-kommo.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'kommo_api_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'kommo_api_key');
  end if;
end $$;

create table if not exists public.credenciais_api_kommo (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null unique references public.implementacoes_crm(id) on delete cascade,
  subdominio text not null,
  token_criptografado bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.credenciais_api_kommo enable row level security;

-- Mesma política de credenciais_crm: sem select/insert/update direto, só
-- pelas funções SECURITY DEFINER abaixo. Delete direto é liberado (não
-- expõe segredo nenhum).
create policy "credenciais_api_kommo_delete_authenticated"
  on public.credenciais_api_kommo for delete
  to authenticated
  using (true);

create trigger credenciais_api_kommo_set_updated_at
  before update on public.credenciais_api_kommo
  for each row execute function public.set_updated_at();

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
begin
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

  return v_id;
end;
$$;

revoke all on function public.salvar_credencial_api_kommo(uuid, text, text) from public;
grant execute on function public.salvar_credencial_api_kommo(uuid, text, text) to authenticated;

-- Pra tela mostrar "já configurado, subdomínio X" sem nunca devolver o token.
create or replace function public.obter_credencial_api_kommo_meta(p_implementacao_id uuid)
returns table (subdominio text, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.subdominio, c.created_at, c.updated_at
  from public.credenciais_api_kommo c
  where c.implementacao_id = p_implementacao_id;
$$;

revoke all on function public.obter_credencial_api_kommo_meta(uuid) from public;
grant execute on function public.obter_credencial_api_kommo_meta(uuid) to authenticated;

-- Devolve o token em texto puro — só deve ser chamada pela Edge Function
-- criar-funil-kommo (server-side), nunca direto do browser.
create or replace function public.obter_credencial_api_kommo(p_implementacao_id uuid)
returns table (subdominio text, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'kommo_api_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  return query
  select c.subdominio, pgp_sym_decrypt(c.token_criptografado, v_chave)
  from public.credenciais_api_kommo c
  where c.implementacao_id = p_implementacao_id;
end;
$$;

revoke all on function public.obter_credencial_api_kommo(uuid) from public;
grant execute on function public.obter_credencial_api_kommo(uuid) to authenticated;

-- ============================================================
-- Registro do que já foi criado de fato no Kommo pra cada funil gerado —
-- evita recriar sem querer e serve pra tela mostrar o status. Uma linha por
-- funil_gerado_id: uma recriação sobrescreve o registro (o que importa é o
-- estado atual na conta do cliente, não o histórico de tentativas).
-- ============================================================
create table if not exists public.funis_kommo_criacoes (
  id uuid primary key default gen_random_uuid(),
  funil_gerado_id uuid not null unique references public.funis_gerados(id) on delete cascade,
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kommo_pipeline_id bigint not null,
  kommo_status_ids jsonb not null default '[]'::jsonb,
  kommo_campos_ids jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funis_kommo_criacoes_implementacao_id_idx on public.funis_kommo_criacoes(implementacao_id);

alter table public.funis_kommo_criacoes enable row level security;

-- Mesmo padrão de implementacoes_crm: acompanhamento compartilhado entre o
-- time, não isolado por usuário.
create policy "funis_kommo_criacoes_all_authenticated"
  on public.funis_kommo_criacoes for all
  to authenticated
  using (true) with check (true);

create trigger funis_kommo_criacoes_set_updated_at
  before update on public.funis_kommo_criacoes
  for each row execute function public.set_updated_at();
