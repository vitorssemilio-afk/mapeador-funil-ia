-- Reorganiza o formulário de pós-venda: adiciona 6 blocos novos (Acompanhamento
-- do Produto/Serviço, Sinais de Risco e Churn, Expansão: Upsell e Cross-sell,
-- Renovação e Retenção Contratual, Indicação e Advocacia, Estrutura do
-- Pós-Venda), acrescenta 2 perguntas ao bloco "Satisfação e Feedback" já
-- existente, e move 3 perguntas do bloco "Upsell, Renovação e Retenção" pros
-- blocos novos onde fazem mais sentido — esvaziando esse bloco, que é então
-- removido junto com a 4ª pergunta que ficaria órfã nele
-- (qpv3_tenta_upsell, redundante com as perguntas novas de upsell).
do $$
declare
  v_bloco_acompanhamento_produto uuid;
  v_bloco_acompanhamento_relacionamento uuid;
  v_bloco_risco_churn uuid;
  v_bloco_satisfacao uuid;
  v_bloco_expansao uuid;
  v_bloco_renovacao uuid;
  v_bloco_indicacao uuid;
  v_bloco_estrutura uuid;
  v_bloco_upsell_antigo uuid;
begin
  if exists (
    select 1 from public.blocos_formulario
    where titulo = 'Acompanhamento do Produto/Serviço' and formulario_tipo = 'pos_venda'
  ) then
    return;
  end if;

  select id into v_bloco_acompanhamento_relacionamento
  from public.blocos_formulario
  where titulo = 'Acompanhamento e Relacionamento' and formulario_tipo = 'pos_venda';

  select id into v_bloco_satisfacao
  from public.blocos_formulario
  where titulo = 'Satisfação e Feedback' and formulario_tipo = 'pos_venda';

  select id into v_bloco_upsell_antigo
  from public.blocos_formulario
  where titulo = 'Upsell, Renovação e Retenção' and formulario_tipo = 'pos_venda';

  if v_bloco_acompanhamento_relacionamento is null or v_bloco_satisfacao is null or v_bloco_upsell_antigo is null then
    raise exception 'Blocos base do formulário de pós-venda não encontrados — abortando pra não inserir na posição errada.';
  end if;

  -- Reordena os blocos existentes pra abrir espaço pros novos, na sequência
  -- final: 0 Depois que a Venda Acontece, 1 Acompanhamento do
  -- Produto/Serviço, 2 Acompanhamento e Relacionamento, 3 Sinais de Risco e
  -- Churn, 4 Satisfação e Feedback, 5 Expansão: Upsell e Cross-sell,
  -- 6 Renovação e Retenção Contratual, 7 Indicação e Advocacia,
  -- 8 Estrutura do Pós-Venda.
  update public.blocos_formulario set ordem = 2 where id = v_bloco_acompanhamento_relacionamento;
  update public.blocos_formulario set ordem = 4 where id = v_bloco_satisfacao;

  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Acompanhamento do Produto/Serviço', 1, 'pos_venda') returning id into v_bloco_acompanhamento_produto;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Sinais de Risco e Churn', 3, 'pos_venda') returning id into v_bloco_risco_churn;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Expansão: Upsell e Cross-sell', 5, 'pos_venda') returning id into v_bloco_expansao;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Renovação e Retenção Contratual', 6, 'pos_venda') returning id into v_bloco_renovacao;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Indicação e Advocacia', 7, 'pos_venda') returning id into v_bloco_indicacao;
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Estrutura do Pós-Venda', 8, 'pos_venda') returning id into v_bloco_estrutura;

  -- ============================================================
  -- Acompanhamento do Produto/Serviço
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_acompanhamento_produto, 'qpv4_onboarding_formal', 0, 'escolha_unica',
      'Existe algum momento formal de boas-vindas/onboarding, ou o acompanhamento começa junto com o primeiro uso?',
      null,
      '[
        {"value":"onboarding_formal","label":"Sim, temos um onboarding formal e estruturado"},
        {"value":"comeca_no_uso","label":"Não, o acompanhamento começa junto com o primeiro uso"},
        {"value":"nao_ha","label":"Não existe um momento definido, cada caso é diferente"}
      ]'::jsonb, true),
    (v_bloco_acompanhamento_produto, 'qpv4_material_apoio', 1, 'escolha_unica',
      'Vocês enviam algum material de apoio ao cliente logo após a compra (manual, vídeo, tutorial)?',
      'Pode ser PDF, vídeo, link de tutorial, etc.',
      '[
        {"value":"sim","label":"Sim, enviamos material de apoio"},
        {"value":"nao","label":"Não enviamos nada formal"}
      ]'::jsonb, false);

  -- ============================================================
  -- Sinais de Risco e Churn
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_risco_churn, 'qpv5_sinais_risco', 0, 'escolha_multipla',
      'Quais sinais concretos indicam que um cliente está em risco de cancelar?', null,
      '[
        {"value":"queda_uso","label":"Queda no uso do produto/serviço"},
        {"value":"atraso_pagamento","label":"Atraso ou inadimplência no pagamento"},
        {"value":"reclamacao_recorrente","label":"Reclamações recorrentes"},
        {"value":"silencio","label":"Cliente para de responder/interagir"},
        {"value":"pedido_cancelamento","label":"Cliente já pede cancelamento diretamente"},
        {"value":"outro","label":"Outro sinal","campoLivre":{"placeholder":"Descreva o sinal"}}
      ]'::jsonb, true),
    (v_bloco_risco_churn, 'qpv5_monitoramento_ativo', 1, 'escolha_unica',
      'Alguém monitora esses sinais de forma ativa, ou vocês só percebem quando o cliente já avisa que quer cancelar?',
      null,
      '[
        {"value":"monitoramento_ativo","label":"Sim, monitoramos ativamente"},
        {"value":"so_quando_avisa","label":"Só percebemos quando o cliente avisa"},
        {"value":"as_vezes","label":"Às vezes, não é um processo constante"}
      ]'::jsonb, true),
    (v_bloco_risco_churn, 'qpv5_tentativa_retencao', 2, 'escolha_unica',
      'Quando um cliente sinaliza risco de cancelamento, existe tentativa formal de reverter antes do cancelamento se concretizar?',
      null,
      '[
        {"value":"sim","label":"Sim, temos uma ação formal de retenção"},
        {"value":"as_vezes","label":"Às vezes, depende do caso"},
        {"value":"nao","label":"Não, não fazemos nada formal"}
      ]'::jsonb, true),
    (v_bloco_risco_churn, 'qpv5_quem_conduz_retencao', 3, 'texto_longo',
      'Quem conduz essa tentativa de retenção e o que costuma ser oferecido?', null, null, false),
    (v_bloco_risco_churn, 'qpv5_taxa_cancelamento', 4, 'texto_curto',
      'Vocês sabem, mesmo que aproximadamente, qual a taxa de cancelamento hoje?',
      'Pode ser uma estimativa.', null, false);

  update public.perguntas_formulario
  set condicao_pergunta_id = 'qpv5_tentativa_retencao', condicao_valores = array['sim', 'as_vezes']
  where pergunta_id = 'qpv5_quem_conduz_retencao';

  update public.perguntas_formulario
  set bloco_id = v_bloco_risco_churn, ordem = 5
  where pergunta_id = 'qpv3_motivos_perda_cliente';

  -- ============================================================
  -- Satisfação e Feedback (bloco já existente, só acrescenta perguntas)
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_satisfacao, 'qpv2_tipo_avaliacao', 2, 'escolha_unica',
      'A avaliação de satisfação é estruturada (NPS, CSAT) ou informal (conversa, percepção do time)?',
      null,
      '[
        {"value":"estruturada","label":"Estruturada (NPS, CSAT ou pesquisa formal)"},
        {"value":"informal","label":"Informal, pela percepção do time"},
        {"value":"nao_avaliamos","label":"Não avaliamos isso hoje"}
      ]'::jsonb, false),
    (v_bloco_satisfacao, 'qpv2_acao_feedback_negativo', 3, 'escolha_unica',
      'Quando um cliente dá nota baixa ou feedback negativo, existe uma ação padrão de resposta ou depende de quem recebe?',
      null,
      '[
        {"value":"padrao","label":"Sim, existe uma ação padrão"},
        {"value":"depende","label":"Depende de quem recebe o feedback"},
        {"value":"nao_ha","label":"Não fazemos nada formal com isso"}
      ]'::jsonb, false);

  -- ============================================================
  -- Expansão: Upsell e Cross-sell
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_expansao, 'qpv6_tem_upsell', 0, 'escolha_unica',
      'Vocês têm plano ou produto superior para oferecer a quem já é cliente (upsell)?', null,
      '[
        {"value":"sim","label":"Sim, temos plano/produto superior"},
        {"value":"nao","label":"Não temos essa opção hoje"}
      ]'::jsonb, true),
    (v_bloco_expansao, 'qpv6_sinal_upgrade', 1, 'texto_longo',
      'Existe algum sinal de uso que indica que o cliente está pronto para subir de plano/produto?',
      null, null, false),
    (v_bloco_expansao, 'qpv6_tem_crosssell', 2, 'escolha_unica',
      'Além do que o cliente já comprou, vocês vendem outros produtos ou serviços para a mesma base de clientes (cross-sell)?',
      null,
      '[
        {"value":"sim","label":"Sim, vendemos outros produtos/serviços"},
        {"value":"nao","label":"Não, vendemos só o mesmo produto"}
      ]'::jsonb, true),
    (v_bloco_expansao, 'qpv6_produtos_complementares', 3, 'texto_longo',
      'Quais são esses produtos ou serviços complementares?', null, null, false),
    (v_bloco_expansao, 'qpv6_quem_aborda', 4, 'escolha_unica',
      'Quem identifica e aborda essas oportunidades de expansão, o time de pós-venda, o time de vendas, ou ninguém formalmente?',
      null,
      '[
        {"value":"pos_venda","label":"O time de pós-venda"},
        {"value":"vendas","label":"O time de vendas entra de novo"},
        {"value":"ninguem","label":"Ninguém faz isso formalmente"}
      ]'::jsonb, true);

  update public.perguntas_formulario
  set condicao_pergunta_id = 'qpv6_tem_upsell', condicao_valores = array['sim']
  where pergunta_id = 'qpv6_sinal_upgrade';

  update public.perguntas_formulario
  set condicao_pergunta_id = 'qpv6_tem_crosssell', condicao_valores = array['sim']
  where pergunta_id = 'qpv6_produtos_complementares';

  update public.perguntas_formulario
  set bloco_id = v_bloco_expansao, ordem = 5
  where pergunta_id = 'qpv3_tem_recompra';

  -- ============================================================
  -- Renovação e Retenção Contratual (só aparece se o negócio tiver
  -- recompra/renovação, sinalizado na pergunta movida qpv3_tem_recompra)
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria,
     condicao_pergunta_id, condicao_valores)
  values
    (v_bloco_renovacao, 'qpv7_prazo_inicio_conversa', 0, 'escolha_unica',
      'Quanto tempo antes do vencimento a conversa de renovação costuma começar?', null,
      '[
        {"value":"30_dias","label":"Até 30 dias antes"},
        {"value":"30_60_dias","label":"Entre 30 e 60 dias antes"},
        {"value":"60_mais","label":"Mais de 60 dias antes"},
        {"value":"nao_definido","label":"Não temos um prazo definido"}
      ]'::jsonb, true,
      'qpv3_tem_recompra', array['recorrente', 'esporadica']),
    (v_bloco_renovacao, 'qpv7_quem_conduz', 1, 'escolha_unica',
      'Quem conduz a renovação, o mesmo time de pós-venda ou vendas entra de novo?', null,
      '[
        {"value":"pos_venda","label":"O mesmo time de pós-venda"},
        {"value":"vendas","label":"O time de vendas entra de novo"},
        {"value":"varia","label":"Varia conforme o cliente"}
      ]'::jsonb, true,
      'qpv3_tem_recompra', array['recorrente', 'esporadica']);

  -- ============================================================
  -- Indicação e Advocacia
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_indicacao, 'qpv8_pede_indicacao', 0, 'escolha_unica',
      'Vocês pedem indicação para os clientes atuais?', null,
      '[
        {"value":"sim","label":"Sim, pedimos indicação"},
        {"value":"nao","label":"Não pedimos indicação hoje"}
      ]'::jsonb, true),
    (v_bloco_indicacao, 'qpv8_momento', 1, 'escolha_unica',
      'Em que momento vocês costumam pedir a indicação?', null,
      '[
        {"value":"pos_venda_imediato","label":"Logo após a venda"},
        {"value":"apos_satisfacao","label":"Depois de perceber que o cliente está satisfeito"},
        {"value":"momento_pontual","label":"Em algum momento específico (evento, aniversário de contrato, etc.)"},
        {"value":"sem_momento_definido","label":"Não temos um momento definido"}
      ]'::jsonb, false),
    (v_bloco_indicacao, 'qpv8_incentivo', 2, 'texto_curto',
      'Existe algum incentivo ou benefício para quem indica?', null, null, false),
    (v_bloco_indicacao, 'qpv8_rastreia', 3, 'escolha_unica',
      'Vocês conseguem rastrear se uma indicação virou venda?', null,
      '[
        {"value":"sim","label":"Sim, conseguimos rastrear"},
        {"value":"nao","label":"Não, não temos esse controle"}
      ]'::jsonb, false);

  update public.perguntas_formulario
  set condicao_pergunta_id = 'qpv8_pede_indicacao', condicao_valores = array['sim']
  where pergunta_id in ('qpv8_momento', 'qpv8_incentivo', 'qpv8_rastreia');

  -- ============================================================
  -- Estrutura do Pós-Venda
  -- ============================================================
  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_estrutura, 'qpv9_responsavel_formal', 0, 'escolha_unica',
      'Existe pessoa ou time formalmente responsável pelo pós-venda como processo, além de quem atende no dia a dia?',
      null,
      '[
        {"value":"sim","label":"Sim, existe responsável formal"},
        {"value":"nao","label":"Não, é dividido entre quem atende"}
      ]'::jsonb, true),
    (v_bloco_estrutura, 'qpv9_funil_no_crm', 1, 'escolha_unica',
      'Hoje já existe algum funil, etapa ou pipeline de pós-venda no CRM de vocês, ou tudo é feito fora do sistema?',
      null,
      '[
        {"value":"ja_existe","label":"Sim, já existe funil/etapa de pós-venda no CRM"},
        {"value":"fora_sistema","label":"Não, é feito fora do sistema (planilha, WhatsApp, etc.)"},
        {"value":"nao_temos_crm","label":"Não temos CRM hoje"}
      ]'::jsonb, true);

  update public.perguntas_formulario
  set bloco_id = v_bloco_estrutura, ordem = 2
  where pergunta_id = 'qpv3_meta_pos_venda';

  -- ============================================================
  -- Bloco antigo "Upsell, Renovação e Retenção": todas as perguntas
  -- relevantes já foram movidas pra outros blocos acima. A que sobra
  -- (qpv3_tenta_upsell) é redundante com as perguntas novas de "Expansão:
  -- Upsell e Cross-sell" — remove ela e o bloco, que fica vazio.
  -- ============================================================
  delete from public.perguntas_formulario where pergunta_id = 'qpv3_tenta_upsell';
  delete from public.blocos_formulario where id = v_bloco_upsell_antigo;
end $$;
