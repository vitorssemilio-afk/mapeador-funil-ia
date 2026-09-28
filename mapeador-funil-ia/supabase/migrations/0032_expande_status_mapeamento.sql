-- Reorganização do ciclo de vida do cliente (vendas/mapeamento): "Concluído"
-- hoje é ambíguo — pode significar só que a IA terminou de gerar o funil.
-- Esta migration só ADICIONA os novos valores ao enum mapeamento_status;
-- o backfill dos dados existentes e o resto da reorganização ficam na
-- próxima migration, porque um valor de enum recém-criado só pode ser
-- USADO (em comparação, cast, etc.) depois que a transação que o criou
-- for commitada — não dá pra fazer as duas coisas na mesma migration.
--
-- 'concluido' continua existindo no enum (não dá pra remover um valor de
-- enum com segurança) mas passa a ser tratado como valor LEGADO pelo
-- código: nenhuma escrita nova usa 'concluido' a partir de agora, ele só
-- aparece em registros antigos, equivalente a 'funil_validado'.
alter type public.mapeamento_status add value if not exists 'funil_gerado';
alter type public.mapeamento_status add value if not exists 'em_revisao_interna';
alter type public.mapeamento_status add value if not exists 'pronto_kickoff';
alter type public.mapeamento_status add value if not exists 'kickoff_agendado';
alter type public.mapeamento_status add value if not exists 'ajustes_solicitados';
alter type public.mapeamento_status add value if not exists 'funil_validado';
