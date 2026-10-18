-- Cancelamento de implementação (pedido do Vitor) — hoje "cancelada" já
-- existe como valor de status (tipo/constraint/badge/filtros já tratam),
-- mas nada registra QUANDO foi cancelada nem POR QUÊ, e o relógio de
-- "dia X do ciclo"/"Xd atrasado" (operacaoResumo.ts) continua correndo
-- pra sempre depois disso, porque é calculado sempre contra a data de
-- HOJE, nunca contra o momento do cancelamento — por isso o cliente
-- cancelado ficava acumulando atraso indefinidamente.
--
-- Esta migration só resolve o lado do banco: guardar quando/por que foi
-- cancelada. O congelamento do relógio em si é no frontend
-- (operacaoResumo.ts passa a usar `cancelada_em` como "hoje" quando o
-- status é cancelada, em vez da data real).
alter table public.implementacoes_crm
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text;

-- Mantém cancelada_em coerente com o status não importa o caminho usado
-- pra chegar em 'cancelada' — tanto a RPC cancelar_implementacao abaixo
-- quanto uma edição direta do campo "Status" no formulário geral
-- (ImplementacaoDetalhe.tsx, handleSalvarGeral, que já existia antes
-- desta migration e continua fazendo update direto). Reverter o status
-- pra qualquer outro valor limpa cancelada_em (senão o relógio ficaria
-- congelado num cliente reativado por engano).
create or replace function public.sincronizar_cancelamento_implementacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    new.cancelada_em := coalesce(new.cancelada_em, now());
  elsif new.status is distinct from 'cancelada' then
    new.cancelada_em := null;
    new.motivo_cancelamento := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_cancelamento_implementacao on public.implementacoes_crm;
create trigger trg_sincronizar_cancelamento_implementacao
  before update on public.implementacoes_crm
  for each row execute function public.sincronizar_cancelamento_implementacao();

-- Ação explícita "Cancelar implementação" (em vez de só escolher
-- 'cancelada' no <select> genérico de status, que não pede motivo nenhum)
-- — mesmo padrão de RPC com validação + auditoria já usado em
-- atualizar_data_marco_cliente/vincular_ata_manualmente.
create or replace function public.cancelar_implementacao(
  p_implementacao_id uuid,
  p_motivo text
)
returns public.implementacoes_crm
language plpgsql
security definer
set search_path = public
as $$
declare
  v_implementacao public.implementacoes_crm;
  v_status_anterior public.implementacoes_crm.status%type;
begin
  if not public.tenho_acesso_a_implementacao(p_implementacao_id) then
    raise exception 'Você não tem acesso a esta implementação.' using errcode = '42501';
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Informe o motivo do cancelamento.';
  end if;

  select * into v_implementacao from public.implementacoes_crm where id = p_implementacao_id;
  if not found then
    raise exception 'Implementação não encontrada.';
  end if;

  if v_implementacao.status = 'cancelada' then
    raise exception 'Esta implementação já está cancelada.';
  end if;

  v_status_anterior := v_implementacao.status;

  update public.implementacoes_crm
  set status = 'cancelada', motivo_cancelamento = trim(p_motivo)
  where id = p_implementacao_id
  returning * into v_implementacao;

  perform public.registrar_auditoria(
    'implementacao_cancelada',
    'implementacoes_crm',
    p_implementacao_id,
    v_implementacao.cliente_id,
    p_implementacao_id,
    jsonb_build_object('status_anterior', v_status_anterior, 'motivo', trim(p_motivo))
  );

  return v_implementacao;
end;
$$;

revoke all on function public.cancelar_implementacao(uuid, text) from public;
grant execute on function public.cancelar_implementacao(uuid, text) to authenticated;
