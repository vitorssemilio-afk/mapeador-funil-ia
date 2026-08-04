-- Lógica condicional nas perguntas do formulário: uma pergunta pode só
-- aparecer (no wizard, no resumo e no texto mandado pra IA) quando a
-- resposta de outra pergunta bater com um valor específico (ex: "Sim").
--
-- Revisa os blocos 2 a 5 (Origem e Ferramentas, Jornada de Compra, Regras
-- do Jogo, Automações e Pós-Venda) com base em planilha atualizada,
-- introduzindo perguntas de "portão" (Sim/Não) que liberam perguntas de
-- detalhe, e adiciona 3 blocos novos: Sua Equipe e Suas Metas, Como a
-- Venda Acontece na Prática, e O Que Vocês Já Têm Hoje.

alter table public.perguntas_formulario
  add column if not exists condicao_pergunta_id text
    references public.perguntas_formulario(pergunta_id) on delete set null,
  add column if not exists condicao_valores text[];

do $$
declare
  bloco1 uuid;
  bloco2 uuid;
  bloco3 uuid;
  bloco4 uuid;
  bloco5 uuid;
  bloco6 uuid;
  bloco7 uuid;
begin
  select id into bloco1 from public.blocos_formulario where titulo = 'Origem e Ferramentas Atuais';
  select id into bloco2 from public.blocos_formulario where titulo = 'A Jornada de Compra';
  select id into bloco3 from public.blocos_formulario where titulo = 'Regras de Jogo (Qualificação e Perdas)';
  select id into bloco4 from public.blocos_formulario where titulo = 'Automações e Pós-Venda';

  -- ============================================================
  -- Bloco 2: Origem e Ferramentas Atuais
  -- ============================================================
  if bloco1 is not null then
    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
    values
      (bloco1, 'q1_usa_outras_ferramentas', 2, 'escolha_unica',
        'Além do que você já usa pra controlar vendas, vocês usam outras ferramentas no dia a dia (WhatsApp Business, planilha, e-mail marketing, etc.) que precisariam se conectar com o novo sistema?',
        null,
        '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false)
    on conflict (pergunta_id) do nothing;

    update public.perguntas_formulario
    set
      label = 'Quais dessas ferramentas?',
      ordem = 3,
      opcoes = '[
        {"value":"whatsapp_business","label":"WhatsApp Business"},
        {"value":"gerenciador_anuncios","label":"Gerenciador de Anúncios (Facebook/Meta Ads)"},
        {"value":"rd_station","label":"RD Station Marketing"},
        {"value":"plataforma_ecommerce","label":"Plataforma de E-commerce"},
        {"value":"erp_bling_tiny","label":"ERP (Bling, Tiny, etc.)"}
      ]'::jsonb,
      condicao_pergunta_id = 'q1_usa_outras_ferramentas',
      condicao_valores = array['sim']
    where pergunta_id = 'q1_ferramentas_integrar';
  end if;

  -- ============================================================
  -- Bloco 3: A Jornada de Compra
  -- ============================================================
  if bloco2 is not null then
    update public.perguntas_formulario
    set
      opcoes = '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb,
      condicao_pergunta_id = null,
      condicao_valores = null
    where pergunta_id = 'q2_etapas_pessoas_diferentes';

    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
    values
      (bloco2, 'q2_caminho_diferente_existe', 2, 'escolha_unica',
        'Existe algum tipo de cliente, produto ou serviço que segue um caminho completamente diferente na hora da venda?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false),
      (bloco2, 'q2_etapa_trava_existe', 4, 'escolha_unica',
        'Existe alguma etapa que trava a venda e depende de terceiros ou documentos?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false)
    on conflict (pergunta_id) do nothing;

    update public.perguntas_formulario
    set
      ordem = 3,
      condicao_pergunta_id = 'q2_caminho_diferente_existe',
      condicao_valores = array['sim']
    where pergunta_id = 'q2_caminho_diferente';

    update public.perguntas_formulario
    set
      ordem = 5,
      condicao_pergunta_id = 'q2_etapa_trava_existe',
      condicao_valores = array['sim']
    where pergunta_id = 'q2_etapa_trava_terceiros';
  end if;

  -- ============================================================
  -- Bloco 4: Regras de Jogo (Qualificação e Perdas)
  -- ============================================================
  if bloco3 is not null then
    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria)
    values
      (bloco3, 'q3_tempo_ate_desistir', 4, 'texto_curto',
        'Por quanto tempo vocês continuam tentando contato antes de desistir de vez?',
        null, null, false),
      (bloco3, 'q3_regra_de_ouro_existe', 6, 'escolha_unica',
        'Existe alguma ''regra de ouro'' do seu negócio que NUNCA pode ser esquecida durante o atendimento?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false)
    on conflict (pergunta_id) do nothing;

    update public.perguntas_formulario set ordem = 5 where pergunta_id = 'q3_dados_obrigatorios_primeiro_contato';

    update public.perguntas_formulario
    set
      ordem = 7,
      condicao_pergunta_id = 'q3_regra_de_ouro_existe',
      condicao_valores = array['sim']
    where pergunta_id = 'q3_regra_de_ouro';

    update public.perguntas_formulario
    set condicao_pergunta_id = 'q3_cadencia_follow_up', condicao_valores = array['tenta_1_vez', 'processo_claro']
    where pergunta_id = 'q3_tempo_ate_desistir';
  end if;

  -- ============================================================
  -- Bloco 5: Automações e Pós-Venda
  -- ============================================================
  if bloco4 is not null then
    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria, condicao_pergunta_id, condicao_valores)
    values
      (bloco4, 'q4_pos_venda_tem_contato', 3, 'escolha_unica',
        'Vocês fazem algum tipo de contato depois da venda (pós-venda, suporte, oferta de novos produtos)?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false,
        'q4_relacao_pos_venda', array['encerra']),
      (bloco4, 'q4_pos_venda_frequencia', 4, 'texto_curto',
        'Com que frequência e de que forma?',
        null, null, false,
        'q4_pos_venda_tem_contato', array['sim'])
    on conflict (pergunta_id) do nothing;
  end if;

  -- ============================================================
  -- Bloco 6 (novo): Sua Equipe e Suas Metas
  -- ============================================================
  if not exists (select 1 from public.blocos_formulario where titulo = 'Sua Equipe e Suas Metas') then
    insert into public.blocos_formulario (titulo, ordem) values ('Sua Equipe e Suas Metas', 5) returning id into bloco5;

    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria, condicao_pergunta_id, condicao_valores)
    values
      (bloco5, 'q5_mesma_pessoa_ou_passa', 0, 'escolha_unica',
        'Na sua equipe, uma mesma pessoa cuida do cliente do primeiro contato até o pagamento, ou passa de pessoa em pessoa ao longo do processo?',
        null,
        '[
          {"value":"mesma_pessoa","label":"A mesma pessoa cuida de tudo"},
          {"value":"passa_pessoa_pessoa","label":"Passa de pessoa em pessoa ao longo do processo"}
        ]'::jsonb, false, null, null),
      (bloco5, 'q5_etapas_quem_cuida', 1, 'texto_curto',
        'Quais são essas etapas e quem cuida de cada uma?',
        null, null, false, 'q5_mesma_pessoa_ou_passa', array['passa_pessoa_pessoa']),
      (bloco5, 'q5_aprovacao_desconto_existe', 2, 'escolha_unica',
        'Existe alguém que precisa aprovar descontos ou condições especiais antes de fechar uma venda?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false, null, null),
      (bloco5, 'q5_aprovacao_desconto_quem', 3, 'texto_curto',
        'Quem é essa pessoa e quando ela costuma ser acionada?',
        null, null, false, 'q5_aprovacao_desconto_existe', array['sim']),
      (bloco5, 'q5_tem_meta', 4, 'escolha_unica',
        'Vocês têm uma meta de vendas para bater todo mês?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false, null, null),
      (bloco5, 'q5_qual_meta', 5, 'texto_curto',
        'Qual é essa meta? (pode ser em quantidade de vendas, em dinheiro, ou os dois)',
        null, null, true, 'q5_tem_meta', array['sim']),
      (bloco5, 'q5_sazonalidade_existe', 6, 'escolha_unica',
        'Tem época do ano em que vocês recebem muito mais (ou muito menos) gente interessada em comprar?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false, null, null),
      (bloco5, 'q5_sazonalidade_detalhe', 7, 'texto_curto',
        'Quais épocas, e o que muda nesse período?',
        null, null, false, 'q5_sazonalidade_existe', array['sim']);
  end if;

  -- ============================================================
  -- Bloco 7 (novo): Como a Venda Acontece na Prática
  -- ============================================================
  if not exists (select 1 from public.blocos_formulario where titulo = 'Como a Venda Acontece na Prática') then
    insert into public.blocos_formulario (titulo, ordem) values ('Como a Venda Acontece na Prática', 6) returning id into bloco6;

    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria, condicao_pergunta_id, condicao_valores)
    values
      (bloco6, 'q6_passos_venda', 0, 'texto_longo',
        'Pensando do primeiro contato até o pagamento, quais são os "passos" que uma venda passa na sua empresa? Liste na ordem',
        'Ex: "1. Cliente pergunta preço, 2. Eu mando orçamento, 3. Cliente decide, 4. Pagamento"',
        null, true, null, null),
      (bloco6, 'q6_como_manda_preco', 1, 'escolha_unica',
        'Como vocês costumam mandar o preço/orçamento para o cliente?',
        null,
        '[
          {"value":"whatsapp_texto","label":"Por WhatsApp, escrito"},
          {"value":"pdf_email","label":"PDF ou orçamento formal por e-mail"},
          {"value":"proposta_formal","label":"Proposta/contrato formal"},
          {"value":"verbal_ligacao","label":"Verbalmente, por ligação ou presencial"},
          {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Como?"}}
        ]'::jsonb, false, null, null),
      (bloco6, 'q6_negocia_existe', 2, 'escolha_unica',
        'O cliente costuma tentar negociar o preço ou as condições de pagamento?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false, null, null),
      (bloco6, 'q6_negocia_o_que', 3, 'texto_curto',
        'O que costuma ser negociado com mais frequência — preço, prazo de pagamento, ou outra coisa?',
        null, null, false, 'q6_negocia_existe', array['sim']),
      (bloco6, 'q6_formalizacao', 4, 'escolha_unica',
        'Depois que o cliente decide comprar, como é formalizado o combinado?',
        null,
        '[
          {"value":"contrato_assinado","label":"Contrato assinado"},
          {"value":"apenas_pagamento","label":"Apenas o pagamento"},
          {"value":"nota_fiscal","label":"Nota fiscal"},
          {"value":"nada_formal","label":"Nada formal"}
        ]'::jsonb, false, null, null);
  end if;

  -- ============================================================
  -- Bloco 8 (novo): O Que Vocês Já Têm Hoje
  -- ============================================================
  if not exists (select 1 from public.blocos_formulario where titulo = 'O Que Vocês Já Têm Hoje') then
    insert into public.blocos_formulario (titulo, ordem) values ('O Que Vocês Já Têm Hoje', 7) returning id into bloco7;

    insert into public.perguntas_formulario
      (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, obrigatoria, condicao_pergunta_id, condicao_valores)
    values
      (bloco7, 'q7_ja_tem_lista', 0, 'escolha_unica',
        'Vocês já têm uma lista de clientes ou pessoas interessadas guardada em algum lugar hoje?',
        null, '[{"value":"sim","label":"Sim"},{"value":"nao","label":"Não"}]'::jsonb, false, null, null),
      (bloco7, 'q7_onde_lista', 1, 'texto_curto',
        'Onde essa lista está guardada hoje? (planilha, agenda, outro sistema, WhatsApp)',
        null, null, false, 'q7_ja_tem_lista', array['sim']),
      (bloco7, 'q7_trazer_ou_zero', 2, 'escolha_unica',
        'Você gostaria de trazer essas informações para o novo sistema, ou prefere começar do zero?',
        null,
        '[
          {"value":"trazer","label":"Trazer as informações que já temos"},
          {"value":"comecar_do_zero","label":"Prefiro começar do zero"}
        ]'::jsonb, false, 'q7_ja_tem_lista', array['sim']);
  end if;
end $$;