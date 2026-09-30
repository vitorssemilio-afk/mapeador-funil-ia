-- P0-C3 da auditoria funcional: o formulário genérico "Editar marcos" (na
-- ficha do cliente) permitia editar livremente kickoff/treinamento
-- agendado_para e realizado_em, contornando o fluxo formal de remarcação
-- (módulo de Reuniões, que exige motivo/responsável e grava histórico em
-- reuniao_remarcacoes) e, pior, permitindo alterar retroativamente
-- realizado_em depois do evento já ter acontecido — o marco que ancora os
-- 40 dias da implementação.
--
-- O frontend (ClienteDetalhe.tsx) já para de deixar esses 4 campos editáveis
-- nesse formulário quando já têm valor. Esta migration cria a única válvula
-- de escape formal pra corrigir um erro de cadastro nesses campos: uma RPC
-- admin-only que exige justificativa e sempre grava em auditoria — para não
-- ser confundida com uma remarcação de verdade.
create or replace function public.corrigir_marco_cliente(
  p_cliente_id uuid,
  p_campo text,
  p_novo_valor timestamptz,
  p_justificativa text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor_anterior timestamptz;
begin
  if not public.sou_administrador() then
    raise exception 'Apenas administradores podem corrigir um marco já registrado.';
  end if;

  if p_campo not in (
    'kickoff_agendado_para', 'kickoff_realizado_em',
    'treinamento_agendado_para', 'treinamento_realizado_em'
  ) then
    raise exception 'Campo % não pode ser corrigido por esta ação.', p_campo;
  end if;

  if p_justificativa is null or btrim(p_justificativa) = '' then
    raise exception 'Justificativa é obrigatória para corrigir um marco já registrado.';
  end if;

  execute format('select %I from public.clientes where id = $1', p_campo)
    into v_valor_anterior
    using p_cliente_id;

  execute format('update public.clientes set %I = $1 where id = $2', p_campo)
    using p_novo_valor, p_cliente_id;

  perform public.registrar_auditoria(
    'corrigir_marco_cliente',
    'cliente',
    p_cliente_id,
    p_cliente_id,
    null,
    jsonb_build_object(
      'campo', p_campo,
      'valor_anterior', v_valor_anterior,
      'novo_valor', p_novo_valor,
      'justificativa', p_justificativa
    )
  );
end;
$$;

revoke all on function public.corrigir_marco_cliente(uuid, text, timestamptz, text) from public;
grant execute on function public.corrigir_marco_cliente(uuid, text, timestamptz, text) to authenticated;
