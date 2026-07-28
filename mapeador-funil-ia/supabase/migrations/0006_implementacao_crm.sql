-- Módulo de Implementação de CRM: acompanhamento do POP de 4 semanas de
-- cada cliente (sempre vinculado a um mapeamento já existente), incluindo
-- checklists editáveis, dados de acesso e credenciais do cliente no Kommo.

create table if not exists public.implementacoes_crm (
  id uuid primary key default gen_random_uuid(),
  mapeamento_id uuid not null references public.mapeamentos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_cliente text not null,
  consultor_responsavel text,
  stakeholder_decisor text,
  status text not null default 'pre_requisito' check (status in (
    'pre_requisito', 'semana_1', 'semana_2', 'semana_3', 'semana_4', 'concluida', 'cancelada'
  )),
  conta_criada_via_v4 boolean not null default false,
  email_conta_kommo text,
  whatsapp_corporativo_confirmado boolean not null default false,
  acesso_facebook_confirmado boolean not null default false,
  plano_contratado text,
  periodo_contratado text,
  data_decisao_plano date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementacoes_crm_mapeamento_id_idx on public.implementacoes_crm(mapeamento_id);

alter table public.implementacoes_crm enable row level security;

-- Acompanhamento compartilhado entre todo o time de implantação (não é
-- dado isolado por usuário, o objetivo é centralizar).
create policy "implementacoes_crm_all_authenticated"
  on public.implementacoes_crm for all
  to authenticated
  using (true) with check (true);

create trigger implementacoes_crm_set_updated_at
  before update on public.implementacoes_crm
  for each row execute function public.set_updated_at();

-- ============================================================
-- Checklists editáveis (pré-requisito, semana 1-4, critérios de sucesso)
-- ============================================================
create table if not exists public.checklist_grupos_implementacao (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  titulo text not null,
  ordem int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_itens_implementacao (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.checklist_grupos_implementacao(id) on delete cascade,
  texto text not null,
  ordem int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checklist_itens_implementacao_grupo_id_idx on public.checklist_itens_implementacao(grupo_id);

alter table public.checklist_grupos_implementacao enable row level security;
alter table public.checklist_itens_implementacao enable row level security;

create policy "checklist_grupos_implementacao_all_authenticated"
  on public.checklist_grupos_implementacao for all
  to authenticated using (true) with check (true);

create policy "checklist_itens_implementacao_all_authenticated"
  on public.checklist_itens_implementacao for all
  to authenticated using (true) with check (true);

create trigger checklist_grupos_implementacao_set_updated_at
  before update on public.checklist_grupos_implementacao
  for each row execute function public.set_updated_at();

create trigger checklist_itens_implementacao_set_updated_at
  before update on public.checklist_itens_implementacao
  for each row execute function public.set_updated_at();

-- ============================================================
-- Quais itens de checklist estão marcados em cada implementação
-- ============================================================
create table if not exists public.implementacao_checklist_marcado (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  item_id uuid not null references public.checklist_itens_implementacao(id) on delete cascade,
  marcado boolean not null default true,
  marcado_em timestamptz not null default now(),
  unique (implementacao_id, item_id)
);

create index if not exists implementacao_checklist_marcado_implementacao_id_idx on public.implementacao_checklist_marcado(implementacao_id);

alter table public.implementacao_checklist_marcado enable row level security;

create policy "implementacao_checklist_marcado_all_authenticated"
  on public.implementacao_checklist_marcado for all
  to authenticated using (true) with check (true);

-- ============================================================
-- Seed: grupos e itens do POP de Implementação de CRM (Kommo Basic/PRO)
-- ============================================================
do $$
declare
  g_pre uuid;
  g_s1 uuid;
  g_s2 uuid;
  g_s3 uuid;
  g_s4 uuid;
  g_crit uuid;
begin
  if exists (select 1 from public.checklist_grupos_implementacao) then
    return;
  end if;

  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('pre_requisito', 'Pré-requisito — Formulário de Pré-Configuração', 0) returning id into g_pre;
  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('semana_1', 'Semana 1 — Configurações Iniciais', 1) returning id into g_s1;
  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('semana_2', 'Semana 2 — Automações (Parte I)', 2) returning id into g_s2;
  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('semana_3', 'Semana 3 — Automações (Parte II & Relatórios)', 3) returning id into g_s3;
  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('semana_4', 'Semana 4 — Entrega Final', 4) returning id into g_s4;
  insert into public.checklist_grupos_implementacao (chave, titulo, ordem) values ('criterios_sucesso', 'Critérios de Sucesso / Qualidade da Entrega', 5) returning id into g_crit;

  insert into public.checklist_itens_implementacao (grupo_id, texto, ordem) values
    (g_pre, 'E-mail válido confirmado (necessário pra criação da conta no Kommo)', 0),
    (g_pre, 'WhatsApp Corporativo (conta business) em uso por todos os usuários que vão operar o CRM', 1),
    (g_pre, 'Acesso às credenciais do Facebook vinculado ao número do WhatsApp Business', 2),
    (g_pre, 'Conta Kommo criada via V4 Company (não diretamente pelo cliente)', 3),

    (g_s1, 'Apresentação completa da plataforma Kommo', 0),
    (g_s1, 'Inserção e configuração de usuários', 1),
    (g_s1, 'Estruturação dos funis de venda', 2),
    (g_s1, 'Gestão de cards e pipeline', 3),
    (g_s1, 'Dicas e gatilhos de entrada e saída em cada etapa do funil', 4),
    (g_s1, 'Configuração de campos personalizados nos cards', 5),
    (g_s1, 'Definição do layout dos cards', 6),
    (g_s1, 'Treinamento do time', 7),

    (g_s2, 'Conexão dos canais de comunicação (WhatsApp, e-mail, etc.)', 0),
    (g_s2, 'Criação do bot de boas-vindas', 1),
    (g_s2, 'Configuração de modelos de mensagens', 2),
    (g_s2, 'Criação de tarefas e notas automáticas', 3),
    (g_s2, 'Automações de movimentação de cards no funil', 4),
    (g_s2, 'Inserção de motivos de perda', 5),

    (g_s3, 'Refinamento das movimentações automáticas de cards', 0),
    (g_s3, 'Ajustes e correções na plataforma', 1),
    (g_s3, 'Revisão completa das automações configuradas', 2),
    (g_s3, 'Configuração dos relatórios de desempenho de vendas', 3),

    (g_s4, 'Treinamento: importação e exportação de dados via Excel', 0),
    (g_s4, 'Revisão geral de toda a configuração do CRM', 1),
    (g_s4, 'Ajustes finais ou novas configurações, se necessário', 2),
    (g_s4, 'Orientação para contratação da plataforma', 3),
    (g_s4, 'Entrega do Playbook de Implementação de CRM', 4),

    (g_crit, 'Todos os usuários da equipe comercial cadastrados e com acesso ativo', 0),
    (g_crit, 'Canais de comunicação conectados e recebendo mensagens de fato no CRM (não só configurados na tela)', 1),
    (g_crit, 'Funil de vendas estruturado refletindo o processo real do cliente — não um funil genérico copiado de outro projeto', 2),
    (g_crit, 'Bot de boas-vindas ativo e testado em uma conversa real', 3),
    (g_crit, 'Automações de movimentação de cards funcionando sem precisar de ajuste manual do consultor', 4),
    (g_crit, 'Motivos de perda cadastrados e compatíveis com a realidade comercial do cliente', 5),
    (g_crit, 'Relatórios de desempenho configurados e exibindo dados corretos (não zerados ou com erro de mapeamento)', 6),
    (g_crit, 'Importação/exportação de dados testada com uma base real do cliente, não só demonstrada', 7),
    (g_crit, 'Playbook entregue e revisado junto com o cliente — não apenas enviado por e-mail sem contexto', 8),
    (g_crit, 'Time comercial opera o CRM sozinho ao final da Semana 4, sem depender do consultor para tarefas do dia a dia', 9),
    (g_crit, 'Cliente decide contratar o plano pago ao fim dos 30 dias — sinal de que percebeu valor, não só usou de graça e abandonou', 10),
    (g_crit, 'Pipeline está sendo alimentado ativamente pelo time, não é uma casca configurada e vazia', 11),
    (g_crit, 'Gestor consegue usar os relatórios para decisão, não só visualizar números sem interpretar', 12),
    (g_crit, 'Não há retorno perceptível à planilha/WhatsApp como ferramenta paralela nas semanas seguintes à entrega', 13);
end $$;

-- ============================================================
-- Credenciais de acesso do cliente no CRM (login/senha), guardadas
-- criptografadas via pgcrypto com uma chave mantida no Supabase Vault.
-- A tabela não tem policy de select/insert/update — leitura e escrita
-- só acontecem através das funções SECURITY DEFINER abaixo, pra nunca
-- expor a senha em texto puro nem permitir gravar sem criptografar.
-- ============================================================
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'crm_credenciais_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'crm_credenciais_key');
  end if;
end $$;

create table if not exists public.credenciais_crm (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  login text not null,
  senha_criptografada bytea not null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credenciais_crm_implementacao_id_idx on public.credenciais_crm(implementacao_id);

alter table public.credenciais_crm enable row level security;

create policy "credenciais_crm_delete_authenticated"
  on public.credenciais_crm for delete
  to authenticated
  using (true);

create trigger credenciais_crm_set_updated_at
  before update on public.credenciais_crm
  for each row execute function public.set_updated_at();

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
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  insert into public.credenciais_crm (implementacao_id, login, senha_criptografada, observacoes)
  values (p_implementacao_id, p_login, pgp_sym_encrypt(p_senha, v_chave), nullif(trim(p_observacoes), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_credencial_crm(uuid, text, text, text) from public;
grant execute on function public.salvar_credencial_crm(uuid, text, text, text) to authenticated;

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
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  update public.credenciais_crm
  set login = p_login,
      senha_criptografada = pgp_sym_encrypt(p_senha, v_chave),
      observacoes = nullif(trim(p_observacoes), '')
  where id = p_id;
end;
$$;

revoke all on function public.atualizar_credencial_crm(uuid, text, text, text) from public;
grant execute on function public.atualizar_credencial_crm(uuid, text, text, text) to authenticated;

create or replace function public.listar_credenciais_crm(p_implementacao_id uuid)
returns table (id uuid, login text, observacoes text, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.login, c.observacoes, c.created_at, c.updated_at
  from public.credenciais_crm c
  where c.implementacao_id = p_implementacao_id
  order by c.created_at asc;
$$;

revoke all on function public.listar_credenciais_crm(uuid) from public;
grant execute on function public.listar_credenciais_crm(uuid) to authenticated;

create or replace function public.revelar_credencial_crm(p_id uuid)
returns table (login text, senha text, observacoes text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'crm_credenciais_key';
  if v_chave is null then
    raise exception 'Chave de criptografia não configurada.';
  end if;

  return query
  select c.login, pgp_sym_decrypt(c.senha_criptografada, v_chave), c.observacoes
  from public.credenciais_crm c
  where c.id = p_id;
end;
$$;

revoke all on function public.revelar_credencial_crm(uuid) from public;
grant execute on function public.revelar_credencial_crm(uuid) to authenticated;
