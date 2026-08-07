-- Checkpoint de Adoção — 30 dias pós-entrega (POP v2, seção 6.3).
-- Instrumento separado do checklist técnico (Gate de Saída) e do
-- formulário de avaliação/NPS: mede se a adoção do Kommo realmente
-- aconteceu depois que o cliente ficou sozinho com a ferramenta.
--
-- Preenchido pelo cliente via link público (mesmo padrão de
-- public_get_mapeamento / public_save_respostas da migration 0002):
-- acesso só por função SECURITY DEFINER, nunca por RLS aberto pro
-- papel `anon`, sempre restrito a uma única implementação por código.

-- ============================================================
-- Código curto público da implementação, pra montar o link do
-- checkpoint (/checkpoint/<codigo>) sem expor o uuid interno.
-- ============================================================
alter table public.implementacoes_crm
  add column if not exists codigo_checkpoint text;

create or replace function public.set_codigo_checkpoint()
returns trigger
language plpgsql
as $$
declare
  novo_codigo text;
  tentativas int := 0;
begin
  if new.codigo_checkpoint is not null then
    return new;
  end if;

  loop
    novo_codigo := public.gerar_codigo_curto();
    tentativas := tentativas + 1;
    exit when not exists (select 1 from public.implementacoes_crm where codigo_checkpoint = novo_codigo);
    if tentativas > 20 then
      raise exception 'Não foi possível gerar um código de checkpoint único';
    end if;
  end loop;

  new.codigo_checkpoint := novo_codigo;
  return new;
end;
$$;

drop trigger if exists trg_set_codigo_checkpoint on public.implementacoes_crm;
create trigger trg_set_codigo_checkpoint
  before insert on public.implementacoes_crm
  for each row execute function public.set_codigo_checkpoint();

-- Backfill das implementações já existentes.
do $$
declare
  r record;
  novo_codigo text;
  tentativas int;
begin
  for r in select id from public.implementacoes_crm where codigo_checkpoint is null loop
    tentativas := 0;
    loop
      novo_codigo := public.gerar_codigo_curto();
      tentativas := tentativas + 1;
      exit when not exists (select 1 from public.implementacoes_crm where codigo_checkpoint = novo_codigo);
      if tentativas > 20 then
        raise exception 'Não foi possível gerar um código de checkpoint único no backfill';
      end if;
    end loop;
    update public.implementacoes_crm set codigo_checkpoint = novo_codigo where id = r.id;
  end loop;
end $$;

alter table public.implementacoes_crm alter column codigo_checkpoint set not null;
alter table public.implementacoes_crm add constraint implementacoes_crm_codigo_checkpoint_key unique (codigo_checkpoint);

-- ============================================================
-- Respostas do checkpoint (uma por implementação — é um instrumento
-- único, disparado 30 dias após a Semana 4, não recorrente).
-- ============================================================
create table if not exists public.checkpoints_adocao (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  uso_diario text not null check (uso_diario in ('so_kommo', 'kommo_mais_planilha', 'voltou_planilha')),
  frequencia_uso text not null check (frequencia_uso in ('diariamente', 'semanalmente', 'raramente', 'nao_uso')),
  obstaculo text,
  intencao_manutencao text not null check (intencao_manutencao in ('sim', 'talvez', 'nao')),
  -- Sinal de risco de churn: resposta 1 do POP indicando volta pra
  -- planilha/WhatsApp. Não fica só como dado passivo — aparece
  -- destacado na tela da implementação pro consultor agir.
  risco_churn boolean generated always as (uso_diario = 'voltou_planilha') stored,
  respondido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (implementacao_id)
);

create index if not exists checkpoints_adocao_implementacao_id_idx on public.checkpoints_adocao(implementacao_id);

alter table public.checkpoints_adocao enable row level security;

create policy "checkpoints_adocao_all_authenticated"
  on public.checkpoints_adocao for all
  to authenticated
  using (true) with check (true);

create trigger checkpoints_adocao_set_updated_at
  before update on public.checkpoints_adocao
  for each row execute function public.set_updated_at();

-- ============================================================
-- Leitura pública: só o necessário pra renderizar o formulário
-- (nome do cliente e se já foi respondido — nunca dados internos da
-- implementação).
-- ============================================================
create or replace function public.public_get_checkpoint_by_codigo(p_codigo text)
returns table (
  nome_cliente text,
  ja_respondido boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.nome_cliente,
    exists(select 1 from public.checkpoints_adocao c where c.implementacao_id = i.id) as ja_respondido
  from public.implementacoes_crm i
  where i.codigo_checkpoint = p_codigo;
$$;

revoke all on function public.public_get_checkpoint_by_codigo(text) from public;
grant execute on function public.public_get_checkpoint_by_codigo(text) to anon, authenticated;

-- ============================================================
-- Escrita pública: grava a resposta única do checkpoint. Uma vez
-- respondido, novas chamadas falham (mesmo padrão de envio único do
-- formulário de diagnóstico).
-- ============================================================
create or replace function public.public_save_checkpoint(
  p_codigo text,
  p_uso_diario text,
  p_frequencia_uso text,
  p_obstaculo text,
  p_intencao_manutencao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_implementacao_id uuid;
begin
  select id into v_implementacao_id
  from public.implementacoes_crm
  where codigo_checkpoint = p_codigo
  for update;

  if v_implementacao_id is null then
    raise exception 'Checkpoint não encontrado';
  end if;

  if exists (select 1 from public.checkpoints_adocao where implementacao_id = v_implementacao_id) then
    raise exception 'Este checkpoint já foi respondido';
  end if;

  insert into public.checkpoints_adocao (
    implementacao_id, uso_diario, frequencia_uso, obstaculo, intencao_manutencao
  ) values (
    v_implementacao_id, p_uso_diario, p_frequencia_uso, nullif(trim(p_obstaculo), ''), p_intencao_manutencao
  );
end;
$$;

revoke all on function public.public_save_checkpoint(text, text, text, text, text) from public;
grant execute on function public.public_save_checkpoint(text, text, text, text, text) to anon, authenticated;
