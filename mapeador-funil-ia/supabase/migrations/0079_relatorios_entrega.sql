-- ============================================================
-- Módulo de Relatórios e Entrega Final (núcleo, Fase 1) — consolida dados
-- já existentes (funil aprovado, cronograma, reuniões, critérios, trial,
-- ocorrências, checkpoint de adoção) em documentos gerados e rastreáveis,
-- sem criar um fluxo paralelo nem duplicar regra de negócio nenhuma: o
-- conteúdo é sempre montado no cliente a partir das fontes oficiais já em
-- produção, e só o resultado (snapshot) é persistido aqui.
-- ============================================================

-- 1) Identidade visual mínima pros documentos (seção 17) — reaproveita a
-- configuração administrativa já existente (configuracoes_operacao), não
-- cria uma config paralela.
alter table public.configuracoes_operacao
  add column if not exists logo_url text,
  add column if not exists cor_principal text;

create or replace function public.atualizar_configuracao_operacao(p_patch jsonb)
returns public.configuracoes_operacao
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.configuracoes_operacao;
  v_novo public.configuracoes_operacao;
  v_email text;
  v_campo text;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem alterar as configurações da operação.' using errcode = '42501';
  end if;

  select * into v_atual from public.configuracoes_operacao where id = true;
  v_email := auth.jwt() ->> 'email';

  update public.configuracoes_operacao
  set
    nome_operacao = coalesce(p_patch->>'nome_operacao', nome_operacao),
    nome_produto = coalesce(p_patch->>'nome_produto', nome_produto),
    razao_social = case when p_patch ? 'razao_social' then nullif(p_patch->>'razao_social', '') else razao_social end,
    cnpj = case when p_patch ? 'cnpj' then nullif(p_patch->>'cnpj', '') else cnpj end,
    texto_padrao_rodape = case when p_patch ? 'texto_padrao_rodape' then nullif(p_patch->>'texto_padrao_rodape', '') else texto_padrao_rodape end,
    logo_url = case when p_patch ? 'logo_url' then nullif(p_patch->>'logo_url', '') else logo_url end,
    cor_principal = case when p_patch ? 'cor_principal' then nullif(p_patch->>'cor_principal', '') else cor_principal end,
    atualizado_por_email = v_email,
    updated_at = now()
  where id = true
  returning * into v_novo;

  for v_campo in select jsonb_object_keys(p_patch)
  loop
    insert into public.configuracoes_historico (campo, valor_anterior, valor_novo, alterado_por_email)
    values (v_campo, to_jsonb(v_atual) -> v_campo, to_jsonb(v_novo) -> v_campo, v_email);
  end loop;

  return v_novo;
end;
$$;

-- ============================================================
-- 2) Relatórios/documentos gerados (seções 2/3/4/5/7/12/13/14)
-- ============================================================
create table if not exists public.relatorios_implementacao (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo text not null check (tipo in ('implementacao', 'funil_vendas', 'funil_pos_venda', 'entrega_final', 'adocao')),
  -- Só os documentos do funil usam visão executiva/técnica (seção 4).
  visao text check (visao in ('executiva', 'tecnica')),
  versao int not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'gerado', 'final', 'arquivado')),
  titulo text not null,
  -- Dados consolidados no momento da geração (seção 14 — snapshot): o
  -- relatório final continua representando o estado daquela data mesmo que
  -- os dados de origem mudem depois.
  conteudo_snapshot jsonb not null default '{}'::jsonb,
  -- Único conteúdo editável manualmente (resumo executivo, observações,
  -- próximos passos) — nunca fatos estruturais, que vêm sempre do snapshot
  -- (seção 30).
  texto_editavel jsonb not null default '{}'::jsonb,
  motivo_nova_versao text,
  gerado_por_email text,
  gerado_em timestamptz,
  finalizado_em timestamptz,
  arquivado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relatorios_implementacao_impl_tipo_idx
  on public.relatorios_implementacao (implementacao_id, tipo, versao desc);

-- Versionamento automático (seção 13) — nunca sobrescreve: cada nova versão
-- é uma linha nova, a anterior fica intacta pro histórico.
create or replace function public.definir_versao_relatorio_implementacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.versao is null then
    select coalesce(max(versao), 0) + 1 into new.versao
    from public.relatorios_implementacao
    where implementacao_id = new.implementacao_id and tipo = new.tipo;
  end if;
  return new;
end;
$$;

create trigger trg_definir_versao_relatorio_implementacao
  before insert on public.relatorios_implementacao
  for each row execute function public.definir_versao_relatorio_implementacao();

create trigger trg_relatorios_implementacao_updated_at
  before update on public.relatorios_implementacao
  for each row execute function public.set_updated_at();

alter table public.relatorios_implementacao enable row level security;

-- Permissões (seção 34): consultor com acesso à implementação prepara e
-- gera; admin tem acesso a tudo via tenho_acesso_a_implementacao. Cliente
-- não tem usuário nesse sistema, então não precisa de policy própria.
create policy "relatorios_implementacao_select"
  on public.relatorios_implementacao for select
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id));

create policy "relatorios_implementacao_insert"
  on public.relatorios_implementacao for insert
  to authenticated
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

create policy "relatorios_implementacao_update"
  on public.relatorios_implementacao for update
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

-- ============================================================
-- 3) Aceite da entrega (seções 8/9/10/11) — uma linha por implementação,
-- que evolui de estado; o histórico de cada transição fica em
-- auditoria_eventos (reaproveitada, seção 35), não duplicado aqui.
-- ============================================================
create table if not exists public.entregas_aceite (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null unique references public.implementacoes_crm(id) on delete cascade,
  relatorio_entrega_final_id uuid references public.relatorios_implementacao(id) on delete set null,
  data_entrega date,
  responsavel_entrega_id uuid references public.consultores(id),
  contato_cliente text,
  status text not null default 'aguardando_aceite' check (
    status in ('aguardando_aceite', 'aceito', 'aceito_com_ressalvas', 'nao_aceito')
  ),
  observacao text,
  -- Só preenchidos quando status = 'nao_aceito' (seção 10).
  motivo_nao_aceito text,
  itens_contestados text,
  proximos_passos_nao_aceito text,
  registrado_por_email text,
  registrado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_entregas_aceite_updated_at
  before update on public.entregas_aceite
  for each row execute function public.set_updated_at();

alter table public.entregas_aceite enable row level security;

create policy "entregas_aceite_select"
  on public.entregas_aceite for select
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id));

create policy "entregas_aceite_insert"
  on public.entregas_aceite for insert
  to authenticated
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

create policy "entregas_aceite_update"
  on public.entregas_aceite for update
  to authenticated
  using (public.tenho_acesso_a_implementacao(implementacao_id))
  with check (public.tenho_acesso_a_implementacao(implementacao_id));

-- ============================================================
-- 4) Ressalvas do aceite (seção 9) — uma ou mais por aceite, cada uma pode
-- opcionalmente virar uma pendência vinculada na mesma tabela oficial de
-- ocorrências do cliente (cliente_ocorrencias), nunca uma pendência
-- paralela.
-- ============================================================
create table if not exists public.entrega_ressalvas (
  id uuid primary key default gen_random_uuid(),
  aceite_id uuid not null references public.entregas_aceite(id) on delete cascade,
  ressalva text not null,
  responsavel_id uuid references public.consultores(id),
  prazo date,
  acao_necessaria text,
  pendencia_id uuid references public.cliente_ocorrencias(id) on delete set null,
  resolvida boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.entrega_ressalvas enable row level security;

create policy "entrega_ressalvas_select"
  on public.entrega_ressalvas for select
  to authenticated
  using (
    exists (
      select 1 from public.entregas_aceite a
      where a.id = aceite_id and public.tenho_acesso_a_implementacao(a.implementacao_id)
    )
  );

create policy "entrega_ressalvas_insert"
  on public.entrega_ressalvas for insert
  to authenticated
  with check (
    exists (
      select 1 from public.entregas_aceite a
      where a.id = aceite_id and public.tenho_acesso_a_implementacao(a.implementacao_id)
    )
  );

create policy "entrega_ressalvas_update"
  on public.entrega_ressalvas for update
  to authenticated
  using (
    exists (
      select 1 from public.entregas_aceite a
      where a.id = aceite_id and public.tenho_acesso_a_implementacao(a.implementacao_id)
    )
  )
  with check (
    exists (
      select 1 from public.entregas_aceite a
      where a.id = aceite_id and public.tenho_acesso_a_implementacao(a.implementacao_id)
    )
  );
