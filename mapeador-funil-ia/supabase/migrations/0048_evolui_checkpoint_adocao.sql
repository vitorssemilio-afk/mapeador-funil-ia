-- Evolui o Checkpoint de Adoção — 30 dias com 5 perguntas novas, mantendo
-- as 4 que já existiam. Continua sendo um instrumento da fase de adoção,
-- nunca critério obrigatório de entrega (ver migration 0047: critérios de
-- entrega são só técnicos, contratação/adoção nunca entram lá).
alter table public.checkpoints_adocao
  add column if not exists percentual_processo_kommo text
    check (percentual_processo_kommo in ('praticamente_tudo', 'maior_parte', 'cerca_metade', 'pouco', 'quase_nada')),
  add column if not exists autonomia_equipe text
    check (autonomia_equipe in ('sim_totalmente', 'maior_parte_vezes', 'precisamos_ajuda_frequente', 'nao_conseguimos_sem_ajuda')),
  add column if not exists uso_relatorios_decisao text
    check (uso_relatorios_decisao in ('sim_mais_uma_vez', 'sim_uma_vez', 'ainda_nao', 'nao_sei_utilizar')),
  add column if not exists atividades_fora_kommo text
    check (atividades_fora_kommo in ('nao_tudo_no_kommo', 'sim_algumas', 'sim_varias', 'voltou_processo_antigo')),
  add column if not exists quais_atividades_fora_kommo text,
  add column if not exists principal_dificuldade text;

-- O diagnóstico (Adoção saudável / Atenção / Crítica) e os "principais
-- sinais" são sempre calculados a partir dessas respostas (ver
-- src/lib/diagnosticoAdocao.ts) — não é gravado no banco, pra não ter duas
-- fontes de verdade que podem divergir se a regra mudar no futuro.

drop function if exists public.public_save_checkpoint(text, text, text, text, text);

create or replace function public.public_save_checkpoint(
  p_codigo text,
  p_uso_diario text,
  p_frequencia_uso text,
  p_obstaculo text,
  p_intencao_manutencao text,
  p_percentual_processo_kommo text,
  p_autonomia_equipe text,
  p_uso_relatorios_decisao text,
  p_atividades_fora_kommo text,
  p_quais_atividades_fora_kommo text,
  p_principal_dificuldade text
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
    implementacao_id, uso_diario, frequencia_uso, obstaculo, intencao_manutencao,
    percentual_processo_kommo, autonomia_equipe, uso_relatorios_decisao,
    atividades_fora_kommo, quais_atividades_fora_kommo, principal_dificuldade
  ) values (
    v_implementacao_id, p_uso_diario, p_frequencia_uso, nullif(trim(p_obstaculo), ''), p_intencao_manutencao,
    p_percentual_processo_kommo, p_autonomia_equipe, p_uso_relatorios_decisao,
    p_atividades_fora_kommo, nullif(trim(p_quais_atividades_fora_kommo), ''), nullif(trim(p_principal_dificuldade), '')
  );
end;
$$;

revoke all on function public.public_save_checkpoint(text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.public_save_checkpoint(text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Ação de acompanhamento que o consultor registra depois de analisar as
-- respostas do checkpoint — um log simples, não um novo fluxo de status.
create table if not exists public.checkpoint_acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  implementacao_id uuid not null references public.implementacoes_crm(id) on delete cascade,
  descricao text not null,
  responsavel_id uuid references public.consultores(id),
  autor_email text,
  created_at timestamptz not null default now()
);

create index if not exists checkpoint_acompanhamentos_implementacao_id_idx
  on public.checkpoint_acompanhamentos (implementacao_id);

alter table public.checkpoint_acompanhamentos enable row level security;

create policy "checkpoint_acompanhamentos_all_authenticated"
  on public.checkpoint_acompanhamentos for all
  to authenticated
  using (true) with check (true);
