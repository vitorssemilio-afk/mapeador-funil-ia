-- Saneamento dos 11 casos de "Geração do funil → Kickoff" cronologicamente
-- impossíveis, identificados pelo Dashboard Gerencial depois da correção da
-- migration 0082/PR #110 (que parou de misturar esses casos na média).
--
-- Investigação (ver relatório de auditoria, não versionado aqui):
--   - Os 11 clientes têm `funil_gerado_em` com o EXATO mesmo timestamp até
--     o microssegundo (2026-09-28 23:33:28.890728+00), em `clientes` e, num
--     deles, também em `reunioes.data_hora` — assinatura de uma única
--     transação SQL externa ao produto, não de deriva histórica acumulada.
--   - Auditoria de código (app, as 3 Edge Functions, o único cron job)
--     descartou qualquer rotina do produto como origem — nenhuma faz UPDATE
--     em lote nessas tabelas. Os Postgres Logs do período já expiraram
--     (retenção do plano), então a origem exata fica sem confirmação, mas
--     a causa (operação externa pontual, não bug do app) está bem
--     estabelecida por eliminação.
--   - Em TODOS os 11 casos, a ordem cronológica real sempre foi correta: a
--     data real da primeira versão do funil (funil_versoes.created_at, que
--     não foi tocada por esse evento) já é anterior ao kickoff_realizado_em
--     em cada um. Só o valor atual de `funil_gerado_em` está errado.
--
-- Critério de correção segura (nunca Math.abs(), nunca now()): restaura
-- `funil_gerado_em` para a data da primeira versão real do funil, e SÓ
-- quando isso de fato resolve a inconsistência (nova data < kickoff) — não
-- é um UPDATE cego por timestamp, é condicional à evidência de cada linha.
-- Cada correção é gravada em auditoria com o valor anterior.
--
-- Não corrigido por esta migration (fica para decisão manual futura, sem
-- fonte confiável de recuperação): o outlier "Kickoff → treinamento = 48d"
-- do cliente "Refine Grooming Concept" — o treinamento dele tem o mesmo
-- timestamp corrompido, mas a reunião de treinamento correspondente em
-- `reunioes` também está com a data corrompida, então não há uma segunda
-- fonte independente pra confirmar a data real (ao contrário do funil, que
-- tem `funil_versoes`).
do $$
declare
  v_timestamp_corrompido constant timestamptz := '2026-09-28 23:33:28.890728+00';
  v_rec record;
  v_total_corrigidos int := 0;
begin
  for v_rec in
    select
      c.id as cliente_id,
      c.funil_gerado_em as valor_anterior,
      min(fv.created_at) as valor_novo
    from public.clientes c
    join public.mapeamentos m on m.cliente_id = c.id and m.tipo = 'vendas'
    join public.funil_versoes fv on fv.mapeamento_id = m.id
    where c.funil_gerado_em = v_timestamp_corrompido
      and c.kickoff_realizado_em is not null
    group by c.id, c.funil_gerado_em, c.kickoff_realizado_em
    having min(fv.created_at) < c.kickoff_realizado_em
  loop
    update public.clientes
    set funil_gerado_em = v_rec.valor_novo
    where id = v_rec.cliente_id;

    perform public.registrar_auditoria(
      'saneamento_funil_gerado_em_corrompido',
      'cliente',
      v_rec.cliente_id,
      v_rec.cliente_id,
      null,
      jsonb_build_object(
        'valor_anterior', v_rec.valor_anterior,
        'novo_valor', v_rec.valor_novo,
        'motivo', 'funil_gerado_em sobrescrito por evento externo em 2026-09-28 23:33:28.890728+00; restaurado para a data da primeira versão real do funil (funil_versoes.created_at)',
        'migration', '0083_saneia_funil_gerado_em_corrompido'
      )
    );

    v_total_corrigidos := v_total_corrigidos + 1;
  end loop;

  raise notice 'Saneamento de funil_gerado_em: % cliente(s) corrigido(s).', v_total_corrigidos;
end $$;
