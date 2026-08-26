-- Controle de prazos da implementação de CRM: até hoje só existia o
-- histórico observado de quando cada status mudou (implementacao_status_historico),
-- sem nenhuma noção de "prazo esperado" pra alertar atraso. O relógio dos
-- 40 dias corridos do processo começa a contar quando o CLIENTE responde o
-- formulário de mapeamento (não quando a implementação é criada, que pode
-- ficar dias parada em pré-requisito esperando o kickoff) — por isso
-- precisamos registrar esse instante, que hoje não existe como coluna
-- própria (só o boolean enviado_pelo_cliente, sem timestamp).

alter table public.mapeamentos
  add column if not exists enviado_em timestamptz;

-- Backfill: pros mapeamentos já enviados antes desta migration, updated_at
-- é a melhor aproximação disponível (é tocado pelo trigger set_updated_at
-- no mesmo update que marca enviado_pelo_cliente = true).
update public.mapeamentos
set enviado_em = updated_at
where enviado_pelo_cliente = true
  and enviado_em is null;

create or replace function public.public_save_respostas(
  p_id uuid,
  p_respostas jsonb,
  p_finalizar boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja_enviado boolean;
  v_nome text;
begin
  select enviado_pelo_cliente into v_ja_enviado
  from public.mapeamentos
  where id = p_id
  for update;

  if v_ja_enviado is null then
    raise exception 'Mapeamento não encontrado';
  end if;

  if v_ja_enviado then
    raise exception 'Este formulário já foi enviado e não pode mais ser editado';
  end if;

  v_nome := nullif(trim(p_respostas->>'q0_nome_empresa'), '');

  update public.mapeamentos
  set
    respostas = p_respostas,
    nome_negocio = coalesce(v_nome, nome_negocio),
    enviado_pelo_cliente = coalesce(p_finalizar, false),
    enviado_em = case when coalesce(p_finalizar, false) then now() else enviado_em end
  where id = p_id;
end;
$$;
