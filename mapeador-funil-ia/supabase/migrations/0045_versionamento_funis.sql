-- Versionamento simples dos funis. `funis_gerados.versao` já existia (um
-- número por leva de geração), mas sem nenhuma metadado sobre quem/quando/
-- por quê, nem noção de "esta versão foi aprovada pro cliente" — só o
-- número e a data de cada linha de etapa. Esta tabela adiciona uma linha
-- por (mapeamento, versão), independente do funil de vendas ou pós-venda
-- (mapeamentos.tipo não importa aqui, os dois usam a mesma mapeamento_id).
create table if not exists public.funil_versoes (
  id uuid primary key default gen_random_uuid(),
  mapeamento_id uuid not null references public.mapeamentos(id) on delete cascade,
  versao integer not null,
  -- Hoje só 'ia' é gerado de fato (toda versão nasce de gerar-funil) — o
  -- valor 'manual' fica pronto pra quando houver edição de etapas sem
  -- passar pela IA.
  origem text not null default 'ia' check (origem in ('ia', 'manual')),
  gerado_por_email text,
  -- 'aprovada' nunca é sobrescrita depois de marcada — uma nova versão
  -- aprovada mais tarde ganha sua PRÓPRIA linha com status 'aprovada',
  -- sem tocar na linha da aprovação anterior.
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovada')),
  aprovada_em timestamptz,
  aprovada_por_email text,
  kickoff_reuniao_id uuid references public.reunioes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (mapeamento_id, versao)
);

create index if not exists funil_versoes_mapeamento_id_idx on public.funil_versoes (mapeamento_id);

alter table public.funil_versoes enable row level security;

create policy "funil_versoes_all_authenticated"
  on public.funil_versoes for all
  to authenticated
  using (true) with check (true);

-- Backfill: uma linha por (mapeamento_id, versao) já existente em
-- funis_gerados, pra nenhum funil já gerado ficar de fora do
-- versionamento a partir de agora.
insert into public.funil_versoes (mapeamento_id, versao, origem, status, created_at)
select fg.mapeamento_id, fg.versao, 'ia', 'rascunho', min(fg.created_at)
from public.funis_gerados fg
group by fg.mapeamento_id, fg.versao
on conflict (mapeamento_id, versao) do nothing;

-- Melhor esforço: mapeamentos cujo funil já está validado (ou a
-- implementação já concluída) têm a versão mais recente marcada como
-- aprovada retroativamente — não dá pra saber o e-mail de quem aprovou no
-- passado, então aprovada_por_email fica em branco pra esses casos.
update public.funil_versoes fv
set status = 'aprovada', aprovada_em = m.updated_at
from public.mapeamentos m
where fv.mapeamento_id = m.id
  and m.status in ('funil_validado', 'concluido')
  and fv.versao = (select max(fv2.versao) from public.funil_versoes fv2 where fv2.mapeamento_id = m.id);
