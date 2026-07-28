-- Formulário público: cliente preenche sem login, mas não vê o funil gerado.
-- Acesso é feito por duas funções SECURITY DEFINER (não por RLS aberto),
-- então o papel `anon` nunca tem acesso direto às tabelas — só a essas
-- duas operações estreitas, sempre limitadas a um único mapeamento por id.

alter table public.mapeamentos
  add column if not exists enviado_pelo_cliente boolean not null default false;

-- ============================================================
-- Leitura pública: retorna só o necessário para renderizar o
-- formulário (nunca funis_gerados, nunca outras linhas).
-- ============================================================
create or replace function public.public_get_mapeamento(p_id uuid)
returns table (
  id uuid,
  nome_negocio text,
  respostas jsonb,
  enviado_pelo_cliente boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.nome_negocio, m.respostas, m.enviado_pelo_cliente
  from public.mapeamentos m
  where m.id = p_id;
$$;

revoke all on function public.public_get_mapeamento(uuid) from public;
grant execute on function public.public_get_mapeamento(uuid) to anon, authenticated;

-- ============================================================
-- Escrita pública: salva respostas enquanto não finalizado.
-- Uma vez enviado_pelo_cliente = true, novas chamadas falham
-- (envio único e definitivo).
-- ============================================================
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
    enviado_pelo_cliente = coalesce(p_finalizar, false)
  where id = p_id;
end;
$$;

revoke all on function public.public_save_respostas(uuid, jsonb, boolean) from public;
grant execute on function public.public_save_respostas(uuid, jsonb, boolean) to anon, authenticated;
