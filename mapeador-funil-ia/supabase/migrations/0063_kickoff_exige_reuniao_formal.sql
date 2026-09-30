-- P1-A2 da auditoria funcional: era possível marcar o Kickoff como
-- realizado (clientes.kickoff_realizado_em, o marco que ancora os 40 dias
-- da implementação) sem existir nenhuma reunião formal de Kickoff — bastava
-- avançar o status do mapeamento pelos botões genéricos de
-- Mapeamento.tsx (kickoff_agendado -> funil_validado/ajustes_solicitados),
-- que disparavam o trigger registrar_marcos_mapeamento (migration 0034) e
-- setavam kickoff_realizado_em = now() incondicionalmente.
--
-- Essa era uma via alternativa legada, anterior ao módulo de Reuniões
-- (migration 0041). Hoje o caminho correto já existe e é usado —
-- sincronizarMarcoCliente (ImplementacaoDetalhe.tsx) grava
-- kickoff_realizado_em com a data REAL da reunião só quando uma Reuniao
-- tipo=kickoff é marcada como realizada — mas o caminho antigo continuava
-- ativo em paralelo, sem exigir reunião nenhuma.
--
-- Duas correções:
-- 1. Remove do trigger antigo (registrar_marcos_mapeamento) a lógica que
--    setava kickoff_realizado_em a partir de uma transição de status —
--    fonte única de verdade passa a ser exclusivamente a reunião formal.
-- 2. Trigger novo em `clientes`: recusa a nível de banco qualquer UPDATE
--    que tente setar kickoff_realizado_em (de null para não-null) sem
--    existir uma reunião (cliente_id, tipo='kickoff', status='realizada')
--    — proteção independente de qual tela/RPC tentar fazer essa escrita,
--    hoje ou no futuro.

create or replace function public.registrar_marcos_mapeamento()
returns trigger
language plpgsql
as $$
begin
  if new.cliente_id is null or new.tipo <> 'vendas' then
    return new;
  end if;

  if new.enviado_em is not null and old.enviado_em is null then
    update public.clientes set formulario_respondido_em = new.enviado_em
      where id = new.cliente_id and formulario_respondido_em is null;
  end if;

  if new.status = 'funil_gerado' and old.status is distinct from 'funil_gerado' then
    update public.clientes set funil_gerado_em = now()
      where id = new.cliente_id and funil_gerado_em is null;
  end if;

  if new.status = 'pronto_kickoff' and old.status = 'em_revisao_interna' then
    update public.clientes set funil_revisado_em = now()
      where id = new.cliente_id and funil_revisado_em is null;
  end if;

  -- kickoff_realizado_em NÃO é mais setado aqui (ver migration 0063) — só
  -- pela reunião formal de Kickoff, via sincronizarMarcoCliente/
  -- handleValidarFunil, que já grava a data real da reunião.

  return new;
end;
$$;

create or replace function public.exigir_reuniao_kickoff_formal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kickoff_realizado_em is not null and old.kickoff_realizado_em is null then
    if not exists (
      select 1 from public.reunioes r
      where r.cliente_id = new.id
        and r.tipo = 'kickoff'
        and r.status = 'realizada'
    ) then
      raise exception 'Não é possível marcar o Kickoff como realizado sem uma reunião formal de Kickoff registrada para este cliente.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_exigir_reuniao_kickoff on public.clientes;
create trigger clientes_exigir_reuniao_kickoff
  before update on public.clientes
  for each row execute function public.exigir_reuniao_kickoff_formal();
