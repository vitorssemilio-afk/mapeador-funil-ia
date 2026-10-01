-- P3-B4: a classificação de modelo de negócio (produto/serviço/implantação/
-- assinatura/recompra/híbrido) que a IA já fazia internamente pra decidir
-- como desenhar o funil de pós-venda nunca aparecia no JSON de saída —
-- ninguém revisando o funil conseguia conferir se bateu com o que a empresa
-- respondeu na pergunta classificadora do formulário (pos_classificador_situacao).
-- Agora o prompt é obrigado a devolver essa classificação, e ela fica
-- registrada aqui junto com o resto dos metadados da geração.
alter table public.geracoes_meta
  add column if not exists classificacao_modelo_negocio text;
