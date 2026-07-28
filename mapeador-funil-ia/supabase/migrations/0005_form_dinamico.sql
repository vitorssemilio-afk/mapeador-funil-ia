-- Perguntas do formulário deixam de ser fixas no código (formSchema.ts) e
-- passam a morar no banco, pra dar pra admin criar/editar/excluir perguntas
-- pela tela /formulario sem precisar mexer em código.
--
-- IMPORTANTE: pergunta_id é a chave usada dentro do jsonb `respostas` de
-- cada mapeamento já salvo. O seed abaixo preserva exatamente os mesmos
-- ids que já existiam em formSchema.ts pra não perder a ligação com
-- respostas já preenchidas.

create table if not exists public.blocos_formulario (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  ordem int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perguntas_formulario (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid not null references public.blocos_formulario(id) on delete cascade,
  pergunta_id text not null unique,
  ordem int not null,
  tipo text not null check (tipo in (
    'texto_curto', 'texto_longo', 'numero', 'escolha_unica', 'escolha_multipla'
  )),
  label text not null,
  helper text,
  opcoes jsonb,
  prefixo text,
  obrigatoria boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists perguntas_formulario_bloco_id_idx on public.perguntas_formulario(bloco_id);

alter table public.blocos_formulario enable row level security;
alter table public.perguntas_formulario enable row level security;

-- leitura liberada geral (inclusive anon, pro formulário público em /f/:codigo
-- precisar saber quais perguntas mostrar); escrita só pra quem está logado.
create policy "blocos_formulario_select_anon"
  on public.blocos_formulario for select
  to anon
  using (true);

create policy "blocos_formulario_all_authenticated"
  on public.blocos_formulario for all
  to authenticated
  using (true) with check (true);

create policy "perguntas_formulario_select_anon"
  on public.perguntas_formulario for select
  to anon
  using (true);

create policy "perguntas_formulario_all_authenticated"
  on public.perguntas_formulario for all
  to authenticated
  using (true) with check (true);

create trigger blocos_formulario_set_updated_at
  before update on public.blocos_formulario
  for each row execute function public.set_updated_at();

create trigger perguntas_formulario_set_updated_at
  before update on public.perguntas_formulario
  for each row execute function public.set_updated_at();

-- ============================================================
-- Seed: os 5 blocos e 24 perguntas que hoje vivem em formSchema.ts
-- ============================================================
do $$
declare
  bloco0 uuid;
  bloco1 uuid;
  bloco2 uuid;
  bloco3 uuid;
  bloco4 uuid;
begin
  if exists (select 1 from public.blocos_formulario) then
    return;
  end if;

  insert into public.blocos_formulario (titulo, ordem) values ('Perfil da Empresa e Volumetria', 0) returning id into bloco0;
  insert into public.blocos_formulario (titulo, ordem) values ('Origem e Ferramentas Atuais', 1) returning id into bloco1;
  insert into public.blocos_formulario (titulo, ordem) values ('A Jornada de Compra', 2) returning id into bloco2;
  insert into public.blocos_formulario (titulo, ordem) values ('Regras de Jogo (Qualificação e Perdas)', 3) returning id into bloco3;
  insert into public.blocos_formulario (titulo, ordem) values ('Automações e Pós-Venda', 4) returning id into bloco4;

  insert into public.perguntas_formulario
    (bloco_id, pergunta_id, ordem, tipo, label, helper, opcoes, prefixo, obrigatoria)
  values
    (bloco0, 'q0_nome_empresa', 0, 'texto_curto', 'Nome da Empresa:', null, null, null, true),
    (bloco0, 'q0_nome_cargo_respondente', 1, 'texto_curto', 'Nome e cargo de quem está respondendo:', null, null, null, false),
    (bloco0, 'q0_segmento_atuacao', 2, 'escolha_unica', 'Qual é o principal segmento de atuação da empresa?', null,
      '[
        {"value":"b2b","label":"B2B (Empresas)"},
        {"value":"varejo_ecommerce","label":"Varejo e E-commerce"},
        {"value":"servicos","label":"Serviços"},
        {"value":"industria","label":"Indústria"},
        {"value":"imobiliario","label":"Imobiliário"},
        {"value":"saas_tecnologia","label":"SaaS e Tecnologia"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual?"}}
      ]'::jsonb, null, false),
    (bloco0, 'q0_produtos_servicos', 3, 'texto_curto', 'O que vocês vendem, em poucas palavras? (Liste os principais produtos ou serviços)', null, null, null, false),
    (bloco0, 'q0_pessoas_usando_crm', 4, 'escolha_unica', 'Quantas pessoas vão usar o CRM no dia a dia para atender ou vender?', null,
      '[
        {"value":"ate_1","label":"Apenas 1 pessoa"},
        {"value":"2_a_3","label":"2 a 3 pessoas"},
        {"value":"4_a_10","label":"4 a 10 pessoas"},
        {"value":"mais_10","label":"Mais de 10 pessoas"}
      ]'::jsonb, null, false),
    (bloco0, 'q0_leads_por_mes', 5, 'escolha_unica', 'Em um mês normal, quantas pessoas novas (leads) entram em contato com interesse em comprar?', 'Pode ser uma estimativa.',
      '[
        {"value":"ate_100","label":"Até 100"},
        {"value":"101_a_500","label":"101 a 500"},
        {"value":"501_a_1000","label":"501 a 1.000"},
        {"value":"mais_1000","label":"Mais de 1.000"}
      ]'::jsonb, null, false),
    (bloco0, 'q0_ticket_medio', 6, 'escolha_unica', 'Qual costuma ser o valor médio de uma venda (Ticket Médio)?', null,
      '[
        {"value":"ate_500","label":"Até R$ 500"},
        {"value":"501_a_2000","label":"R$ 501 a R$ 2.000"},
        {"value":"2001_a_10000","label":"R$ 2.001 a R$ 10.000"},
        {"value":"acima_10000","label":"Acima de R$ 10.000"},
        {"value":"varia_muito","label":"Varia muito"}
      ]'::jsonb, null, false),
    (bloco0, 'q0_ciclo_venda', 7, 'escolha_unica', 'Da primeira conversa até o pagamento, quanto tempo o processo costuma levar em média (Ciclo de Venda)?', null,
      '[
        {"value":"imediato","label":"Fechamento imediato (no mesmo dia)"},
        {"value":"2_a_7_dias","label":"2 a 7 dias"},
        {"value":"1_a_4_semanas","label":"1 a 4 semanas"},
        {"value":"mais_1_mes","label":"Mais de um mês"}
      ]'::jsonb, null, false),

    (bloco1, 'q1_canais_chegada', 0, 'escolha_multipla', 'Por quais canais a maioria dos seus clientes chega hoje?', null,
      '[
        {"value":"whatsapp","label":"WhatsApp"},
        {"value":"instagram_direct","label":"Instagram Direct"},
        {"value":"site_landing_page","label":"Site ou Landing Page"},
        {"value":"anuncios","label":"Anúncios (Google/Meta Ads)"},
        {"value":"indicacao","label":"Indicação"},
        {"value":"telefone","label":"Telefone"}
      ]'::jsonb, null, false),
    (bloco1, 'q1_controle_vendas_atual', 1, 'escolha_unica', 'Onde e como vocês controlam as vendas e o cadastro de clientes hoje?', null,
      '[
        {"value":"so_whatsapp","label":"Só pelo WhatsApp mesmo"},
        {"value":"planilhas","label":"Planilhas (Excel/Google Sheets)"},
        {"value":"outro_crm","label":"Outro CRM (ex: Pipedrive, RD)"},
        {"value":"erp","label":"ERP ou Sistema de Gestão"},
        {"value":"caderno","label":"Caderno"}
      ]'::jsonb, null, false),
    (bloco1, 'q1_ferramentas_integrar', 2, 'escolha_multipla', 'Quais destas ferramentas vocês já usam e precisariam integrar ao CRM?', null,
      '[
        {"value":"whatsapp_business","label":"WhatsApp Business"},
        {"value":"gerenciador_anuncios","label":"Gerenciador de Anúncios (Facebook/Meta Ads)"},
        {"value":"rd_station","label":"RD Station Marketing"},
        {"value":"plataforma_ecommerce","label":"Plataforma de E-commerce"},
        {"value":"erp_bling_tiny","label":"ERP (Bling, Tiny, etc.)"},
        {"value":"nenhuma","label":"Nenhuma"}
      ]'::jsonb, null, false),

    (bloco2, 'q2_jornada_ultimo_cliente', 0, 'texto_longo', 'Pense no último cliente que comprou de vocês. Conte, com suas palavras, como foi a jornada dele.',
      'Ex: Viu anúncio no Instagram, chamou no Whats. O atendente tirou dúvidas e enviou PDF. O cliente sumiu. Fizemos retorno 2 dias depois. Ele pediu desconto, enviamos o link e pagou no Pix.',
      null, null, false),
    (bloco2, 'q2_etapas_pessoas_diferentes', 1, 'escolha_unica', 'O seu processo de vendas tem momentos diferentes que são feitos por pessoas diferentes?', null,
      '[
        {"value":"mesma_pessoa","label":"Não, a mesma pessoa atende e vende"},
        {"value":"triagem_fechamento","label":"Sim, temos quem faz a triagem (pré-venda) e quem fecha a venda"},
        {"value":"venda_entrega","label":"Sim, temos a etapa de Venda e depois uma etapa de Entrega/Operação"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual?"}}
      ]'::jsonb, null, false),
    (bloco2, 'q2_caminho_diferente', 2, 'texto_curto', 'Existe algum tipo de cliente, produto ou serviço que segue um caminho completamente diferente na hora da venda?',
      'Ex: Clientes de recorrência (que já compram sempre) têm um processo diferente de clientes novos.', null, null, false),
    (bloco2, 'q2_etapa_trava_terceiros', 3, 'texto_curto', 'Existe alguma etapa que trava a venda e depende de terceiros ou documentos?',
      'Ex: Envio de documentação para análise de crédito, liberação de plano de saúde, visita técnica, aprovação de orçamento.', null, null, false),

    (bloco3, 'q3_motivos_perda', 0, 'escolha_multipla', 'Quais são os 3 principais motivos reais pelos quais vocês PERDEM vendas hoje?', null,
      '[
        {"value":"preco","label":"Preço"},
        {"value":"achou_caro","label":"Achou caro"},
        {"value":"sumiu","label":"Parou de responder (Sumiu)"},
        {"value":"concorrente","label":"Comprou no concorrente"},
        {"value":"nao_era_momento","label":"Não era o momento certo"},
        {"value":"produto_indisponivel","label":"Produto indisponível"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual?"}}
      ]'::jsonb, null, false),
    (bloco3, 'q3_criterio_qualificacao', 1, 'texto_curto', 'O que faz você perceber que um contato é bom e vale a pena investir tempo nele (Critério de Qualificação)?', null, null, null, false),
    (bloco3, 'q3_sla_primeira_resposta', 2, 'escolha_unica', 'Em quanto tempo, no máximo, um novo contato DEVE receber a primeira resposta da sua equipe?', 'SLA de Atendimento.',
      '[
        {"value":"ate_10_min","label":"Imediatamente (até 10 minutos)"},
        {"value":"ate_1_hora","label":"Em até 1 hora"},
        {"value":"mesmo_dia","label":"No mesmo dia"},
        {"value":"ate_24h","label":"Em até 24 horas"}
      ]'::jsonb, null, false),
    (bloco3, 'q3_cadencia_follow_up', 3, 'escolha_unica', 'O que a equipe deve fazer quando um cliente para de responder (dá vácuo)?', 'Cadência de follow-up.',
      '[
        {"value":"nao_fazemos_nada","label":"Não fazemos nada"},
        {"value":"tenta_1_vez","label":"Tentamos mais 1 vez e desistimos"},
        {"value":"processo_claro","label":"Temos um processo claro de tentar X vezes em dias diferentes"},
        {"value":"sem_regra","label":"Não temos regra, cada um faz de um jeito"}
      ]'::jsonb, null, false),
    (bloco3, 'q3_dados_obrigatorios_primeiro_contato', 4, 'texto_curto', 'No primeiro contato, quais são as informações OBRIGATÓRIAS que a equipe precisa coletar?',
      'Ex: Nome, Dor principal, CNPJ, Se tem convênio, etc.', null, null, false),
    (bloco3, 'q3_regra_de_ouro', 5, 'texto_curto', 'Existe alguma ''regra de ouro'' do seu negócio que NUNCA pode ser esquecida durante o atendimento?',
      'Ex: Não passar preço por WhatsApp antes de agendar reunião, Exigir CNPJ ativo, etc.', null, null, false),

    (bloco4, 'q4_maior_gargalo', 0, 'escolha_multipla', 'Hoje, qual é o maior gargalo ou dor de cabeça no seu atendimento comercial?', null,
      '[
        {"value":"esquece_follow_up","label":"Vendedor esquece de fazer follow-up (retorno)"},
        {"value":"perguntas_repetitivas","label":"Muito tempo gasto com perguntas repetitivas"},
        {"value":"perde_controle","label":"Perdemos o controle de quem já foi respondido"},
        {"value":"falta_relatorios","label":"Falta de relatórios confiáveis"},
        {"value":"outro","label":"Outro","campoLivre":{"placeholder":"Qual?"}}
      ]'::jsonb, null, false),
    (bloco4, 'q4_tarefas_automatizar', 1, 'escolha_multipla', 'Se você pudesse automatizar tarefas no CRM para ganhar tempo, quais escolheria?', null,
      '[
        {"value":"boas_vindas","label":"Mensagem imediata de boas-vindas"},
        {"value":"distribuicao_leads","label":"Distribuição automática de leads"},
        {"value":"lembrete_retorno","label":"Tarefas lembrando de retornar contato"},
        {"value":"catalogo_automatico","label":"Envio automático de catálogo"},
        {"value":"resgate_sumidos","label":"Mensagem de resgate para clientes que sumiram"}
      ]'::jsonb, null, false),
    (bloco4, 'q4_relacao_pos_venda', 2, 'escolha_unica', 'Depois que a venda é feita, o que acontece na relação com esse cliente?', null,
      '[
        {"value":"encerra","label":"O contato encerra ali"},
        {"value":"pede_avaliacao","label":"Pedimos avaliação (Google/Pesquisa)"},
        {"value":"tenta_vender_de_novo","label":"Tentamos vender novamente após X meses"},
        {"value":"acompanhamento_perto","label":"Existe um acompanhamento de perto (Sucesso do Cliente)"}
      ]'::jsonb, null, false);
end $$;
