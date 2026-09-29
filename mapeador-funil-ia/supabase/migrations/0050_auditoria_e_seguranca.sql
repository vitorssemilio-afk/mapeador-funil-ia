-- Revisão de segurança (fase 1) — auditoria de ações sensíveis, restrição
-- server-side de domínio no cadastro e limites no bucket de anexos.
--
-- Escopo desta migration (o que é seguro fazer agora, sem quebrar nada nem
-- exigir redesenho de permissões):
--   1) Tabela de auditoria + função central de registro.
--   2) Toda leitura/escrita de credencial sensível (CRM e API Kommo) passa a
--      gerar um evento de auditoria — nunca com a senha/token em texto.
--   3) Exclusões de cliente/implementação/funil/credencial passam a gerar
--      evento de auditoria via trigger (cobre exclusão feita direto pela
--      tela, sem precisar reescrever cada tela pra chamar uma RPC nova).
--   4) Aprovação de versão de funil (funil_versoes.status -> 'aprovada')
--      passa a gerar evento de auditoria.
--   5) Bucket de anexos (já privado, com signed URL) ganha limite de
--      tamanho e lista de tipos MIME aceitos — não afeta arquivos já
--      enviados, só passa a valer para novos uploads.
--   6) Cadastro de conta (auth.users) passa a exigir e-mail @v4company.com
--      também no banco, não só na tela de login — hoje isso já é a regra
--      do produto (ver src/pages/Login.tsx), só que só no frontend, então
--      dava pra contornar chamando a API do Supabase Auth direto.
--
-- O que este arquivo NÃO faz (fica para uma fase 2, que precisa de decisão
-- de produto e testes com o time antes de entrar em produção): controle de
-- acesso por papel (administrador/consultor/consultor de apoio) nas
-- políticas de RLS. Hoje toda a equipe autenticada enxerga todos os
-- clientes (mesmo padrão usado desde o início do projeto, em praticamente
-- toda tabela) — mudar isso é uma alteração de regra de negócio, não uma
-- correção pontual de segurança, e o pedido original foi explícito em não
-- fazer isso nesta etapa sem antes preservar funcionalidade.

-- ============================================================
-- 1) Auditoria
-- ============================================================
create table if not exists public.auditoria_eventos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  cliente_id uuid references public.clientes(id) on delete set null,
  implementacao_id uuid references public.implementacoes_crm(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb
);

create index if not exists auditoria_eventos_criado_em_idx on public.auditoria_eventos (criado_em desc);
create index if not exists auditoria_eventos_cliente_id_idx on public.auditoria_eventos (cliente_id);
create index if not exists auditoria_eventos_entidade_idx on public.auditoria_eventos (entidade, entidade_id);

alter table public.auditoria_eventos enable row level security;

-- Só leitura direta pra equipe (mesmo nível de confiança já usado no resto
-- do produto) — escrita SÓ через a função abaixo, nunca por insert direto,
-- pra ninguém conseguir forjar ou apagar seu próprio rastro.
create policy "auditoria_eventos_select_authenticated"
  on public.auditoria_eventos for select
  to authenticated
  using (true);

create or replace function public.registrar_auditoria(
  p_acao text,
  p_entidade text,
  p_entidade_id uuid default null,
  p_cliente_id uuid default null,
  p_implementacao_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.auditoria_eventos
    (user_id, user_email, acao, entidade, entidade_id, cliente_id, implementacao_id, detalhes)
  values
    (auth.uid(), auth.jwt() ->> 'email', p_acao, p_entidade, p_entidade_id, p_cliente_id, p_implementacao_id,
     coalesce(p_detalhes, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_auditoria(text, text, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.registrar_auditoria(text, text, uuid, uuid, uuid, jsonb) to authenticated;

-- ============================================================
-- 2) Credenciais CRM (login/senha que o cliente usa no Kommo) — mesmas
-- assinaturas de antes (ver migration 0006), só passam a auditar. Nunca
-- gravamos a senha em `detalhes`.
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
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  select implementacao_id into v_implementacao_id from public.credenciais_crm where id = p_id;

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
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  select implementacao_id into v_implementacao_id from public.credenciais_crm where id = p_id;
  select cliente_id into v_cliente_id from public.implementacoes_crm where id = v_implementacao_id;
  perform public.registrar_auditoria('visualizar_credencial_crm', 'credencial_crm', p_id, v_cliente_id, v_implementacao_id, '{}'::jsonb);

  return query
  select c.login, pgp_sym_decrypt(c.senha_criptografada, v_chave), c.observacoes
  from public.credenciais_crm c
  where c.id = p_id;
end;
$$;

-- Exclusão de credencial CRM continua sendo feita direto pela tela
-- (delete na tabela) — não dá pra auditar "antes" via RPC sem mudar a tela,
-- então a auditoria dessa ação entra via trigger (ver seção 4 abaixo).

-- ============================================================
-- 3) Credenciais de API Kommo (token usado pela Edge Function) — mesmas
-- assinaturas de antes (ver migration 0012). Nunca gravamos o token.
-- ============================================================
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

-- ============================================================
-- 4) Auditoria de exclusões via trigger — cobre o caminho atual das telas
-- (delete direto na tabela, sem passar por uma RPC dedicada), sem precisar
-- reescrever nenhuma tela nesta etapa.
-- ============================================================
create or replace function public.auditar_exclusao_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- cliente_id fica null aqui de propósito: o registro em `clientes` já não
  -- existe mais quando este AFTER DELETE roda, e auditoria_eventos.cliente_id
  -- tem FK pra clientes(id) — gravar old.id ali violaria a FK e desfaria a
  -- exclusão inteira. O id do cliente excluído fica em entidade_id e em
  -- detalhes, que não têm essa restrição.
  perform public.registrar_auditoria('excluir_cliente', 'cliente', old.id, null, null,
    jsonb_build_object('cliente_id', old.id, 'nome_empresa', old.nome_empresa));
  return old;
end;
$$;

drop trigger if exists clientes_auditar_exclusao on public.clientes;
create trigger clientes_auditar_exclusao
  after delete on public.clientes
  for each row execute function public.auditar_exclusao_cliente();

create or replace function public.auditar_exclusao_implementacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- implementacao_id fica null aqui de propósito, pelo mesmo motivo do
  -- cliente_id em auditar_exclusao_cliente: a linha em `implementacoes_crm`
  -- já não existe mais quando este AFTER DELETE roda, e
  -- auditoria_eventos.implementacao_id tem FK pra implementacoes_crm(id).
  -- cliente_id continua válido (o cliente não foi excluído, só a
  -- implementação) e entra normalmente.
  perform public.registrar_auditoria('excluir_implementacao', 'implementacao', old.id, old.cliente_id, null,
    jsonb_build_object('implementacao_id', old.id, 'nome_cliente', old.nome_cliente));
  return old;
end;
$$;

drop trigger if exists implementacoes_crm_auditar_exclusao on public.implementacoes_crm;
create trigger implementacoes_crm_auditar_exclusao
  after delete on public.implementacoes_crm
  for each row execute function public.auditar_exclusao_implementacao();

create or replace function public.auditar_exclusao_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  select cliente_id into v_cliente_id from public.mapeamentos where id = old.mapeamento_id;
  perform public.registrar_auditoria('excluir_funil', 'funil_gerado', old.id, v_cliente_id, null,
    jsonb_build_object('nome_funil', old.nome_funil, 'tipo_funil', old.tipo_funil, 'versao', old.versao));
  return old;
end;
$$;

drop trigger if exists funis_gerados_auditar_exclusao on public.funis_gerados;
create trigger funis_gerados_auditar_exclusao
  after delete on public.funis_gerados
  for each row execute function public.auditar_exclusao_funil();

create or replace function public.auditar_exclusao_credencial_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  select cliente_id into v_cliente_id from public.implementacoes_crm where id = old.implementacao_id;
  perform public.registrar_auditoria('excluir_credencial_crm', 'credencial_crm', old.id, v_cliente_id, old.implementacao_id,
    jsonb_build_object('login', old.login));
  return old;
end;
$$;

drop trigger if exists credenciais_crm_auditar_exclusao on public.credenciais_crm;
create trigger credenciais_crm_auditar_exclusao
  after delete on public.credenciais_crm
  for each row execute function public.auditar_exclusao_credencial_crm();

create or replace function public.auditar_exclusao_credencial_api_kommo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  select cliente_id into v_cliente_id from public.implementacoes_crm where id = old.implementacao_id;
  perform public.registrar_auditoria('excluir_credencial_api_kommo', 'credencial_api_kommo', old.id, v_cliente_id,
    old.implementacao_id, jsonb_build_object('subdominio', old.subdominio));
  return old;
end;
$$;

drop trigger if exists credenciais_api_kommo_auditar_exclusao on public.credenciais_api_kommo;
create trigger credenciais_api_kommo_auditar_exclusao
  after delete on public.credenciais_api_kommo
  for each row execute function public.auditar_exclusao_credencial_api_kommo();

-- ============================================================
-- 5) Auditoria de aprovação de versão de funil (funil_versoes, ver
-- migration 0045) — cobre tanto o avanço manual de status quanto a
-- confirmação de Kickoff, já que os dois passam por aprovarVersaoAtual()
-- em src/lib/funilVersoes.ts, que faz um update direto na tabela.
-- ============================================================
create or replace function public.auditar_aprovacao_funil_versao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if new.status = 'aprovada' and old.status is distinct from 'aprovada' then
    select cliente_id into v_cliente_id from public.mapeamentos where id = new.mapeamento_id;
    perform public.registrar_auditoria('aprovar_versao_funil', 'funil_versao', new.id, v_cliente_id, null,
      jsonb_build_object('versao', new.versao, 'aprovada_por_email', new.aprovada_por_email));
  end if;
  return new;
end;
$$;

drop trigger if exists funil_versoes_auditar_aprovacao on public.funil_versoes;
create trigger funil_versoes_auditar_aprovacao
  after update on public.funil_versoes
  for each row execute function public.auditar_aprovacao_funil_versao();

-- ============================================================
-- 6) Bucket de anexos (já privado — ver migration 0031): limite de tamanho
-- e tipos MIME aceitos, só valendo pra uploads novos a partir de agora.
-- Não afeta nenhum arquivo já enviado.
-- ============================================================
update storage.buckets
set file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = array[
      'application/pdf',
      'image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv'
    ]
where id = 'cliente-anexos';

-- ============================================================
-- 7) Cadastro de conta restrito a @v4company.com também no banco — hoje
-- essa regra só existe no frontend (src/pages/Login.tsx), então dava pra
-- contornar chamando supabase.auth.signUp direto (a anon key é pública por
-- natureza, qualquer um consegue chamar a API do Supabase Auth sem passar
-- pela tela). Só guarda a CRIAÇÃO de conta nova — não mexe em troca de
-- e-mail de conta já existente, pra não arriscar travar ninguém do time.
-- ============================================================
create or replace function public.restringir_dominio_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email !~* '@v4company\.com$' then
    raise exception 'Cadastro permitido apenas para e-mails do domínio @v4company.com.';
  end if;
  return new;
end;
$$;

drop trigger if exists restringir_dominio_cadastro_trigger on auth.users;
create trigger restringir_dominio_cadastro_trigger
  before insert on auth.users
  for each row execute function public.restringir_dominio_cadastro();
