-- Mini auditoria de estabilidade (P1): a migration 0063 reescreveu
-- registrar_marcos_mapeamento (create or replace function, corpo inteiro)
-- pra remover a lógica de kickoff_realizado_em — mas, nessa reescrita,
-- também derrubou sem querer o bloco de funil_validado_em que a migration
-- 0037 tinha introduzido, sem nenhuma relação com o que a 0063 queria
-- corrigir. Resultado: desde que a 0063 passou a valer, clientes.
-- funil_validado_em nunca mais é gravado, mesmo com Mapeamento.tsx
-- continuando a avançar mapeamentos.status pra 'funil_validado'
-- normalmente — a Timeline perde a entrada "Funil validado" e o Cronograma
-- mostra esse marco preso em "aguardando etapa anterior" pra sempre.
--
-- Corpo abaixo = o vigente em 0063, conferido linha a linha, mais o bloco
-- de funil_validado_em de volta (mesmo formato/guarda que tinha em 0037:
-- só grava se ainda está null, nunca sobrescreve). Nada de kickoff ou
-- qualquer outra regra foi alterado.
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

  -- Restaurado (ver migration 0037 — tinha sido perdido na reescrita da
  -- migration 0063, sem relação com o que ela corrigia).
  if new.status = 'funil_validado' and old.status is distinct from 'funil_validado' then
    update public.clientes set funil_validado_em = now()
      where id = new.cliente_id and funil_validado_em is null;
  end if;

  -- kickoff_realizado_em NÃO é setado aqui (ver migration 0063) — só pela
  -- reunião formal de Kickoff, via sincronizarMarcoCliente/handleValidarFunil,
  -- que já grava a data real da reunião.

  return new;
end;
$$;

-- ============================================================
-- Backfill: clientes que validaram o funil enquanto o trigger estava
-- quebrado (entre a 0063 e esta migration) ficaram com funil_validado_em
-- null mesmo tendo um mapeamento de vendas com status = 'funil_validado'.
--
-- Fonte da data, em ordem de preferência (sem usar now() indiscriminadamente):
--   1. funil_versoes.aprovada_em da aprovação mais antiga desse mapeamento —
--      é o timestamp real do clique em "Validar funil" (aprovarVersao grava
--      isso na mesma transação que levaria o mapeamento a 'funil_validado'),
--      a fonte mais precisa disponível.
--   2. mapeamentos.updated_at do mapeamento de vendas validado mais antigo
--      desse cliente — usado só quando não existe nenhuma linha aprovada em
--      funil_versoes (ex: aprovação muito antiga, de antes da migration 0045
--      de versionamento). Não existe uma tabela de histórico de status de
--      mapeamentos no banco, então não há uma 3ª fonte distinta além dessas
--      duas — ao contrário do que foi sugerido, "timestamp de mudança do
--      mapeamento" e "updated_at como fallback" seriam a mesma coisa aqui.
--
-- Só atualiza quem está null hoje — clientes com funil_validado_em já
-- preenchido não são tocados.
-- ============================================================
update public.clientes c
set funil_validado_em = coalesce(
  (
    select fv.aprovada_em
    from public.funil_versoes fv
    join public.mapeamentos m on m.id = fv.mapeamento_id
    where m.cliente_id = c.id
      and m.tipo = 'vendas'
      and fv.status = 'aprovada'
      and fv.aprovada_em is not null
    order by fv.aprovada_em asc
    limit 1
  ),
  (
    select m.updated_at
    from public.mapeamentos m
    where m.cliente_id = c.id
      and m.tipo = 'vendas'
      and m.status = 'funil_validado'
    order by m.updated_at asc
    limit 1
  )
)
where c.funil_validado_em is null
  and exists (
    select 1 from public.mapeamentos m
    where m.cliente_id = c.id
      and m.tipo = 'vendas'
      and m.status = 'funil_validado'
  );
