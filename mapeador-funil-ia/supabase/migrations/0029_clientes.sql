-- Introduz "Cliente" como entidade própria, separada do mapeamento. Até
-- agora o "nome do negócio" era só um texto solto dentro de cada
-- mapeamento — não dava pra saber quem já tinha recebido um link, nem
-- juntar num só lugar o mapeamento de vendas, o de pós-venda, a
-- implementação de CRM e observações/anexos de um mesmo cliente.

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_empresa text not null,
  nome_contato text,
  telefone text,
  email text,
  segmento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

-- Mesmo padrão de acesso compartilhado entre a equipe já usado pelo resto
-- do app (implementacoes_crm, checklist, formulário etc.).
create policy "clientes_all_authenticated"
  on public.clientes for all
  to authenticated
  using (true)
  with check (true);

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

alter table public.mapeamentos
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists mapeamentos_cliente_id_idx on public.mapeamentos(cliente_id);

alter table public.implementacoes_crm
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists implementacoes_crm_cliente_id_idx on public.implementacoes_crm(cliente_id);

-- ============================================================
-- Backfill: cria um Cliente pra cada mapeamento de vendas já existente
-- (usando o nome do negócio que já estava salvo), e vincula a ele o
-- mapeamento de pós-venda e a implementação de CRM que já existirem pra
-- esse mesmo mapeamento de vendas. Nenhum dado se perde — só organiza o
-- que já existe debaixo do Cliente correspondente.
-- ============================================================
do $$
declare
  r record;
  v_cliente_id uuid;
begin
  for r in select id, nome_negocio from public.mapeamentos where tipo = 'vendas' and cliente_id is null loop
    insert into public.clientes (nome_empresa) values (r.nome_negocio) returning id into v_cliente_id;

    update public.mapeamentos set cliente_id = v_cliente_id where id = r.id;
    update public.mapeamentos set cliente_id = v_cliente_id
      where mapeamento_origem_id = r.id and tipo = 'pos_venda';
    update public.implementacoes_crm set cliente_id = v_cliente_id where mapeamento_id = r.id;
  end loop;
end $$;
