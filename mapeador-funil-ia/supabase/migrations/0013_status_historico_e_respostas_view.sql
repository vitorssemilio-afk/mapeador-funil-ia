-- 1) Histórico automático de status das implementações de CRM: toda vez
--    que o status muda (ou a implementação é criada), grava uma linha com
--    a data real da mudança — sem precisar de preenchimento manual.
create table if not exists public.implementacao_status_historico (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  alterado_em timestamptz not null default now()
);

create index if not exists implementacao_status_historico_implementacao_id_idx
  on public.implementacao_status_historico(implementacao_id);

alter table public.implementacao_status_historico enable row level security;

create policy "implementacao_status_historico_select_authenticated"
  on public.implementacao_status_historico for select
  to authenticated
  using (true);

create or replace function public.registrar_status_historico_implementacao()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.implementacao_status_historico (implementacao_id, status_anterior, status_novo)
    values (new.id, null, new.status);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.implementacao_status_historico (implementacao_id, status_anterior, status_novo)
    values (new.id, old.status, new.status);
  end if;

  return new;
end;
$$;

drop trigger if exists implementacoes_crm_registrar_status_historico on public.implementacoes_crm;

create trigger implementacoes_crm_registrar_status_historico
  after insert or update on public.implementacoes_crm
  for each row execute function public.registrar_status_historico_implementacao();

-- Backfill: cria um registro inicial pra implementações já existentes,
-- usando created_at como data aproximada da entrada no status atual.
insert into public.implementacao_status_historico (implementacao_id, status_anterior, status_novo, alterado_em)
select id, null, status, created_at
from public.implementacoes_crm i
where not exists (
  select 1 from public.implementacao_status_historico h where h.implementacao_id = i.id
);

-- ============================================================
-- 2) View que achata as respostas do formulário (jsonb) em uma linha por
--    pergunta respondida, pra dar pra ler/filtrar/exportar direto no
--    Table Editor do Supabase sem precisar entender jsonb.
--    O formulário é 100% dinâmico (configurável pelo admin), então não dá
--    pra ter uma coluna fixa por pergunta — a view resolve isso mapeando
--    cada chave do jsonb pro texto da pergunta correspondente.
-- ============================================================
create or replace view public.mapeamentos_respostas_flat
with (security_invoker = true) as
select
  m.id as mapeamento_id,
  m.nome_negocio,
  m.status as mapeamento_status,
  m.created_at as mapeamento_criado_em,
  b.titulo as bloco_titulo,
  p.pergunta_id,
  p.label as pergunta_label,
  p.tipo as pergunta_tipo,
  r.valor as resposta_bruta,
  case
    when jsonb_typeof(r.valor) = 'array' then
      array_to_string(array(select jsonb_array_elements_text(r.valor)), ', ')
    when jsonb_typeof(r.valor) = 'string' then r.valor #>> '{}'
    else r.valor::text
  end as resposta_texto
from public.mapeamentos m
cross join lateral jsonb_each(m.respostas) as r(chave, valor)
join public.perguntas_formulario p on p.pergunta_id = r.chave
join public.blocos_formulario b on b.id = p.bloco_id
where r.chave not like '\_%' escape '\';

comment on view public.mapeamentos_respostas_flat is
  'Respostas de mapeamentos.respostas (jsonb) achatadas em uma linha por pergunta, para leitura/filtro/export no Table Editor.';

grant select on public.mapeamentos_respostas_flat to authenticated;
