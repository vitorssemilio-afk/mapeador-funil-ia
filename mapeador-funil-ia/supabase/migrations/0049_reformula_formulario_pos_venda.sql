-- Reformula o formulário público de pós-venda: pergunta classificadora
-- antes dos blocos, reorganização em 9 blocos (com um bloco novo, "Problemas
-- e Suporte"), linguagem mais simples (sem jargão de Customer Success) e
-- mais lógica condicional. Nenhuma pergunta ou bloco existente é excluído —
-- só reordenados, reagrupados e, em alguns casos, reescritos (mesmo
-- pergunta_id, mesmos valores de opção) pra manter todas as respostas já
-- coletadas válidas. O único bloco removido é um que já ficava vazio depois
-- de mover suas perguntas pro bloco que sobrevive na fusão (mesmo padrão já
-- usado na migration 0028).
do $$
declare
  v_bloco_classificador uuid;
  v_bloco_depois_compra uuid;
  v_bloco_entrega_ativacao uuid;
  v_bloco_acompanhamento uuid;
  v_bloco_problemas_suporte uuid;
  v_bloco_satisfacao uuid;
  v_bloco_retencao_risco uuid;
  v_bloco_expansao uuid;
  v_bloco_renovacao_antigo uuid;
  v_bloco_indicacao uuid;
  v_bloco_estrutura uuid;
begin
  if exists (select 1 from public.perguntas_formulario where pergunta_id = 'pos_classificador_situacao') then
    return;
  end if;

  select id into v_bloco_depois_compra from public.blocos_formulario
    where titulo = 'Depois que a Venda Acontece' and formulario_tipo = 'pos_venda';
  select id into v_bloco_entrega_ativacao from public.blocos_formulario
    where titulo = 'Acompanhamento do Produto/Serviço' and formulario_tipo = 'pos_venda';
  select id into v_bloco_acompanhamento from public.blocos_formulario
    where titulo = 'Acompanhamento e Relacionamento' and formulario_tipo = 'pos_venda';
  select id into v_bloco_satisfacao from public.blocos_formulario
    where titulo = 'Satisfação e Feedback' and formulario_tipo = 'pos_venda';
  select id into v_bloco_retencao_risco from public.blocos_formulario
    where titulo = 'Sinais de Risco e Churn' and formulario_tipo = 'pos_venda';
  select id into v_bloco_expansao from public.blocos_formulario
    where titulo = 'Expansão: Upsell e Cross-sell' and formulario_tipo = 'pos_venda';
  select id into v_bloco_renovacao_antigo from public.blocos_formulario
    where titulo = 'Renovação e Retenção Contratual' and formulario_tipo = 'pos_venda';
  select id into v_bloco_indicacao from public.blocos_formulario
    where titulo = 'Indicação e Advocacia' and formulario_tipo = 'pos_venda';
  select id into v_bloco_estrutura from public.blocos_formulario
    where titulo = 'Estrutura do Pós-Venda' and formulario_tipo = 'pos_venda';

  if v_bloco_depois_compra is null or v_bloco_entrega_ativacao is null or v_bloco_acompanhamento is null
    or v_bloco_satisfacao is null or v_bloco_retencao_risco is null or v_bloco_expansao is null
    or v_bloco_renovacao_antigo is null or v_bloco_indicacao is null or v_bloco_estrutura is null then
    raise exception 'Blocos base do formulário de pós-venda não encontrados — abortando pra não inserir na posição errada.';
  end if;

  -- ============================================================
  -- Bloco novo, sempre o primeiro: só a pergunta classificadora, que
  -- adapta a linguagem do resto do formulário ao tipo de negócio.
  -- ============================================================
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Sobre o seu pós-venda', -1, 'pos_venda') returning id into v_bloco_classificador;

  insert into public.perguntas_formulario (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values (v_bloco_classificador, 'pos_classificador_situacao', 0, 'escolha_unica',
    'Depois da compra, qual dessas situações mais parece com o seu negócio?',
    'Escolha a que mais se aproxima do seu dia a dia — as próximas perguntas vão se adaptar a essa resposta.',
    '[
      {"value":"produto_entrega","label":"O cliente compra um produto e recebe ou retira"},
      {"value":"servico_realizado","label":"O cliente contrata um serviço que será realizado"},
      {"value":"implantacao_onboarding","label":"O cliente passa por implantação/onboarding antes de usar"},
      {"value":"assinatura_mensalidade","label":"O cliente paga uma assinatura ou mensalidade"},
      {"value":"recompra_tempo","label":"O cliente costuma comprar novamente depois de algum tempo"},
      {"value":"mais_de_uma","label":"Mais de uma dessas situações"}
    ]'::jsonb, true);

  -- ============================================================
  -- Renomeia e reordena os 9 blocos existentes pra bater com a nova
  -- estrutura pedida (o bloco classificador acima é o "antes dos blocos").
  -- ============================================================
  update public.blocos_formulario set titulo = 'Depois que o cliente compra', ordem = 0 where id = v_bloco_depois_compra;
  update public.blocos_formulario set titulo = 'Entrega / Ativação', ordem = 1 where id = v_bloco_entrega_ativacao;
  update public.blocos_formulario set titulo = 'Acompanhamento', ordem = 2 where id = v_bloco_acompanhamento;
  update public.blocos_formulario set titulo = 'Satisfação', ordem = 4 where id = v_bloco_satisfacao;
  update public.blocos_formulario set titulo = 'Retenção e Risco', ordem = 5 where id = v_bloco_retencao_risco;
  update public.blocos_formulario set titulo = 'Recompra, Renovação e Expansão', ordem = 6 where id = v_bloco_expansao;
  update public.blocos_formulario set titulo = 'Indicação', ordem = 7 where id = v_bloco_indicacao;
  update public.blocos_formulario set titulo = 'Estrutura Atual do Pós-venda', ordem = 8 where id = v_bloco_estrutura;

  -- Bloco novo "Problemas e Suporte" — recebe a pergunta de reclamação que
  -- já existia em "Acompanhamento" (fazia mais sentido separada do
  -- relacionamento contínuo) + as 3 perguntas novas.
  insert into public.blocos_formulario (titulo, ordem, formulario_tipo)
  values ('Problemas e Suporte', 3, 'pos_venda') returning id into v_bloco_problemas_suporte;

  update public.perguntas_formulario
  set bloco_id = v_bloco_problemas_suporte, ordem = 0,
      label = 'Quando um cliente reclama ou tem um problema depois da venda, qual costuma ser o processo?'
  where pergunta_id = 'qpv1_processo_reclamacao';

  insert into public.perguntas_formulario (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_problemas_suporte, 'qpv1_tempo_primeira_resposta', 1, 'escolha_unica',
      'Quando um cliente entra em contato depois da compra, em quanto tempo vocês gostariam que ele recebesse a primeira resposta?',
      null,
      '[
        {"value":"ate_1_hora","label":"Até 1 hora"},
        {"value":"mesmo_dia","label":"No mesmo dia"},
        {"value":"ate_24h","label":"Até 24 horas"},
        {"value":"ate_48h","label":"Até 48 horas"},
        {"value":"sem_prazo_definido","label":"Não temos um prazo definido"}
      ]'::jsonb, true),
    (v_bloco_problemas_suporte, 'qpv1_quem_resolve', 2, 'escolha_unica',
      'Quando existe reclamação ou problema, quem normalmente resolve?', null,
      '[
        {"value":"mesma_pessoa_atende","label":"A mesma pessoa que já atende o cliente"},
        {"value":"equipe_dedicada_suporte","label":"Uma equipe dedicada de suporte/atendimento"},
        {"value":"area_tecnica","label":"Uma área técnica específica"},
        {"value":"depende_do_caso","label":"Depende do caso, não é sempre a mesma pessoa"},
        {"value":"ninguem_formalmente","label":"Ninguém formalmente definido"}
      ]'::jsonb, true),
    (v_bloco_problemas_suporte, 'qpv1_encaminhamento_outra_area', 3, 'escolha_unica',
      'Existe algum tipo de problema que precisa ser encaminhado para outra pessoa ou área?', null,
      '[
        {"value":"sim_frequentemente","label":"Sim, isso acontece com frequência"},
        {"value":"sim_as_vezes","label":"Às vezes, em casos específicos"},
        {"value":"nao_resolvemos_direto","label":"Não, resolvemos sempre direto"}
      ]'::jsonb, false);

  -- ============================================================
  -- Bloco 2 — Entrega / Ativação: critério de sucesso da ativação.
  -- ============================================================
  insert into public.perguntas_formulario (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_entrega_ativacao, 'qpv4_criterio_sucesso_ativacao', 2, 'texto_longo',
      'Em que momento vocês consideram que o cliente recebeu o que precisava ou teve sucesso com a compra?',
      'Exemplos: produto entregue sem problema, instalação concluída, serviço realizado, primeira aula feita, cliente começou a usar, resultado alcançado.',
      null, true);

  -- ============================================================
  -- Bloco 1 — Depois que o cliente compra: passagem de bastão da venda
  -- pro pós-venda.
  -- ============================================================
  insert into public.perguntas_formulario (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
  values
    (v_bloco_depois_compra, 'qpv0_passagem_bastao', 4, 'escolha_unica',
      'Quando a venda é fechada, como as informações chegam até quem vai cuidar do cliente depois?', null,
      '[
        {"value":"crm","label":"CRM"},
        {"value":"whatsapp","label":"WhatsApp"},
        {"value":"planilha","label":"Planilha"},
        {"value":"grupo_interno","label":"Grupo interno"},
        {"value":"reuniao_repasse","label":"Reunião ou repasse manual"},
        {"value":"sem_passagem","label":"Não existe uma passagem definida"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Como funciona?"}}
      ]'::jsonb, true),
    (v_bloco_depois_compra, 'qpv0_info_obrigatoria_repasse', 5, 'texto_longo',
      'Quais informações precisam obrigatoriamente ser repassadas depois da venda?', null, null, false);

  -- ============================================================
  -- Bloco 5 (Satisfação): simplifica a linguagem e adiciona lógica
  -- condicional — "Não" pula as perguntas detalhadas.
  -- ============================================================
  update public.perguntas_formulario
  set label = 'Vocês perguntam ao cliente se ele ficou satisfeito depois da compra?',
      opcoes = '[
        {"value":"nao_pede","label":"Não"},
        {"value":"informal","label":"Às vezes"},
        {"value":"processo_formal","label":"Sim, temos um processo"}
      ]'::jsonb
  where pergunta_id = 'qpv2_pede_avaliacao';

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria,
     condicao_pergunta_id, condicao_valores)
  values
    (v_bloco_satisfacao, 'qpv2_como_avalia', 1, 'escolha_unica', 'Como vocês fazem essa avaliação?', null,
      '[
        {"value":"conversa_informal","label":"Conversa informal"},
        {"value":"pesquisa_simples","label":"Pesquisa simples"},
        {"value":"nps_csat","label":"NPS/CSAT"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Como?"}}
      ]'::jsonb, false,
      'qpv2_pede_avaliacao', array['informal', 'processo_formal']);

  update public.perguntas_formulario
  set condicao_pergunta_id = 'qpv2_pede_avaliacao', condicao_valores = array['informal', 'processo_formal']
  where pergunta_id in ('qpv2_uso_do_feedback', 'qpv2_tipo_avaliacao', 'qpv2_acao_feedback_negativo');

  update public.perguntas_formulario
  set label = 'Quando a avaliação é ruim, existe uma ação padrão?'
  where pergunta_id = 'qpv2_acao_feedback_negativo';

  -- ============================================================
  -- Bloco 6 (Retenção e Risco): linguagem que não depende só da palavra
  -- "cancelamento" — cobre também inatividade/afastamento em negócios de
  -- recompra esporádica.
  -- ============================================================
  update public.perguntas_formulario
  set label = 'Quais sinais mostram que um cliente pode deixar de comprar, cancelar ou se afastar da empresa?'
  where pergunta_id = 'qpv5_sinais_risco';

  update public.perguntas_formulario
  set label = 'Vocês sabem, mesmo que aproximadamente, quantos clientes cancelam, somem ou deixam de comprar?'
  where pergunta_id = 'qpv5_taxa_cancelamento';

  -- ============================================================
  -- Bloco 7 (Recompra, Renovação e Expansão) — funde o antigo bloco de
  -- Renovação neste (que já vira o bloco de Expansão renomeado), sem
  -- excluir nenhuma das perguntas de nenhum dos dois. Linguagem sem
  -- "upsell"/"cross-sell" nas perguntas voltadas ao cliente.
  -- ============================================================
  update public.blocos_formulario set titulo = 'Recompra, Renovação e Expansão' where id = v_bloco_expansao;

  update public.perguntas_formulario set bloco_id = v_bloco_expansao, ordem = 5
  where pergunta_id in ('qpv7_prazo_inicio_conversa', 'qpv7_quem_conduz');
  delete from public.blocos_formulario where id = v_bloco_renovacao_antigo;

  update public.perguntas_formulario
  set label = 'Depois da primeira compra, existe uma opção mais completa ou de maior valor que vocês podem oferecer ao cliente?'
  where pergunta_id = 'qpv6_tem_upsell';

  update public.perguntas_formulario
  set label = 'Quem já é cliente pode comprar outros produtos ou serviços diferentes de vocês?'
  where pergunta_id = 'qpv6_tem_crosssell';
end $$;
