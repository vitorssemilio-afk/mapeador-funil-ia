export type PerguntaTipo =
  | 'texto_curto'
  | 'texto_longo'
  | 'numero'
  | 'escolha_unica'
  | 'escolha_multipla';

export type OpcaoPergunta = {
  value: string;
  label: string;
  campoLivre?: {
    placeholder: string;
  };
};

export type Pergunta = {
  id: string;
  tipo: PerguntaTipo;
  label: string;
  helper?: string;
  opcoes?: OpcaoPergunta[];
  prefixo?: string;
  obrigatoria?: boolean;
};

export type BlocoFormulario = {
  titulo: string;
  perguntas: Pergunta[];
};

export const FORM_BLOCKS: BlocoFormulario[] = [
  {
    titulo: 'Perfil da Empresa e Volumetria',
    perguntas: [
      {
        id: 'q0_nome_empresa',
        tipo: 'texto_curto',
        label: 'Nome da Empresa:',
        obrigatoria: true,
      },
      {
        id: 'q0_nome_cargo_respondente',
        tipo: 'texto_curto',
        label: 'Nome e cargo de quem está respondendo:',
      },
      {
        id: 'q0_segmento_atuacao',
        tipo: 'escolha_unica',
        label: 'Qual é o principal segmento de atuação da empresa?',
        opcoes: [
          { value: 'b2b', label: 'B2B (Empresas)' },
          { value: 'varejo_ecommerce', label: 'Varejo e E-commerce' },
          { value: 'servicos', label: 'Serviços' },
          { value: 'industria', label: 'Indústria' },
          { value: 'imobiliario', label: 'Imobiliário' },
          { value: 'saas_tecnologia', label: 'SaaS e Tecnologia' },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q0_produtos_servicos',
        tipo: 'texto_curto',
        label: 'O que vocês vendem, em poucas palavras? (Liste os principais produtos ou serviços)',
      },
      {
        id: 'q0_pessoas_usando_crm',
        tipo: 'escolha_unica',
        label: 'Quantas pessoas vão usar o CRM no dia a dia para atender ou vender?',
        opcoes: [
          { value: 'ate_1', label: 'Apenas 1 pessoa' },
          { value: '2_a_3', label: '2 a 3 pessoas' },
          { value: '4_a_10', label: '4 a 10 pessoas' },
          { value: 'mais_10', label: 'Mais de 10 pessoas' },
        ],
      },
      {
        id: 'q0_leads_por_mes',
        tipo: 'escolha_unica',
        label:
          'Em um mês normal, quantas pessoas novas (leads) entram em contato com interesse em comprar?',
        helper: 'Pode ser uma estimativa.',
        opcoes: [
          { value: 'ate_100', label: 'Até 100' },
          { value: '101_a_500', label: '101 a 500' },
          { value: '501_a_1000', label: '501 a 1.000' },
          { value: 'mais_1000', label: 'Mais de 1.000' },
        ],
      },
      {
        id: 'q0_ticket_medio',
        tipo: 'escolha_unica',
        label: 'Qual costuma ser o valor médio de uma venda (Ticket Médio)?',
        opcoes: [
          { value: 'ate_500', label: 'Até R$ 500' },
          { value: '501_a_2000', label: 'R$ 501 a R$ 2.000' },
          { value: '2001_a_10000', label: 'R$ 2.001 a R$ 10.000' },
          { value: 'acima_10000', label: 'Acima de R$ 10.000' },
          { value: 'varia_muito', label: 'Varia muito' },
        ],
      },
      {
        id: 'q0_ciclo_venda',
        tipo: 'escolha_unica',
        label:
          'Da primeira conversa até o pagamento, quanto tempo o processo costuma levar em média (Ciclo de Venda)?',
        opcoes: [
          { value: 'imediato', label: 'Fechamento imediato (no mesmo dia)' },
          { value: '2_a_7_dias', label: '2 a 7 dias' },
          { value: '1_a_4_semanas', label: '1 a 4 semanas' },
          { value: 'mais_1_mes', label: 'Mais de um mês' },
        ],
      },
    ],
  },
  {
    titulo: 'Origem e Ferramentas Atuais',
    perguntas: [
      {
        id: 'q1_canais_chegada',
        tipo: 'escolha_multipla',
        label: 'Por quais canais a maioria dos seus clientes chega hoje?',
        opcoes: [
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'instagram_direct', label: 'Instagram Direct' },
          { value: 'site_landing_page', label: 'Site ou Landing Page' },
          { value: 'anuncios', label: 'Anúncios (Google/Meta Ads)' },
          { value: 'indicacao', label: 'Indicação' },
          { value: 'telefone', label: 'Telefone' },
        ],
      },
      {
        id: 'q1_controle_vendas_atual',
        tipo: 'escolha_unica',
        label: 'Onde e como vocês controlam as vendas e o cadastro de clientes hoje?',
        opcoes: [
          { value: 'so_whatsapp', label: 'Só pelo WhatsApp mesmo' },
          { value: 'planilhas', label: 'Planilhas (Excel/Google Sheets)' },
          { value: 'outro_crm', label: 'Outro CRM (ex: Pipedrive, RD)' },
          { value: 'erp', label: 'ERP ou Sistema de Gestão' },
          { value: 'caderno', label: 'Caderno' },
        ],
      },
      {
        id: 'q1_ferramentas_integrar',
        tipo: 'escolha_multipla',
        label: 'Quais destas ferramentas vocês já usam e precisariam integrar ao CRM?',
        opcoes: [
          { value: 'whatsapp_business', label: 'WhatsApp Business' },
          { value: 'gerenciador_anuncios', label: 'Gerenciador de Anúncios (Facebook/Meta Ads)' },
          { value: 'rd_station', label: 'RD Station Marketing' },
          { value: 'plataforma_ecommerce', label: 'Plataforma de E-commerce' },
          { value: 'erp_bling_tiny', label: 'ERP (Bling, Tiny, etc.)' },
          { value: 'nenhuma', label: 'Nenhuma' },
        ],
      },
    ],
  },
  {
    titulo: 'A Jornada de Compra',
    perguntas: [
      {
        id: 'q2_jornada_ultimo_cliente',
        tipo: 'texto_longo',
        label:
          'Pense no último cliente que comprou de vocês. Conte, com suas palavras, como foi a jornada dele.',
        helper:
          'Ex: Viu anúncio no Instagram, chamou no Whats. O atendente tirou dúvidas e enviou PDF. O cliente sumiu. Fizemos retorno 2 dias depois. Ele pediu desconto, enviamos o link e pagou no Pix.',
      },
      {
        id: 'q2_etapas_pessoas_diferentes',
        tipo: 'escolha_unica',
        label: 'O seu processo de vendas tem momentos diferentes que são feitos por pessoas diferentes?',
        opcoes: [
          { value: 'mesma_pessoa', label: 'Não, a mesma pessoa atende e vende' },
          {
            value: 'triagem_fechamento',
            label: 'Sim, temos quem faz a triagem (pré-venda) e quem fecha a venda',
          },
          {
            value: 'venda_entrega',
            label: 'Sim, temos a etapa de Venda e depois uma etapa de Entrega/Operação',
          },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q2_caminho_diferente',
        tipo: 'texto_curto',
        label:
          'Existe algum tipo de cliente, produto ou serviço que segue um caminho completamente diferente na hora da venda?',
        helper:
          'Ex: Clientes de recorrência (que já compram sempre) têm um processo diferente de clientes novos.',
      },
      {
        id: 'q2_etapa_trava_terceiros',
        tipo: 'texto_curto',
        label: 'Existe alguma etapa que trava a venda e depende de terceiros ou documentos?',
        helper:
          'Ex: Envio de documentação para análise de crédito, liberação de plano de saúde, visita técnica, aprovação de orçamento.',
      },
    ],
  },
  {
    titulo: 'Regras de Jogo (Qualificação e Perdas)',
    perguntas: [
      {
        id: 'q3_motivos_perda',
        tipo: 'escolha_multipla',
        label: 'Quais são os 3 principais motivos reais pelos quais vocês PERDEM vendas hoje?',
        opcoes: [
          { value: 'preco', label: 'Preço' },
          { value: 'achou_caro', label: 'Achou caro' },
          { value: 'sumiu', label: 'Parou de responder (Sumiu)' },
          { value: 'concorrente', label: 'Comprou no concorrente' },
          { value: 'nao_era_momento', label: 'Não era o momento certo' },
          { value: 'produto_indisponivel', label: 'Produto indisponível' },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q3_criterio_qualificacao',
        tipo: 'texto_curto',
        label:
          'O que faz você perceber que um contato é bom e vale a pena investir tempo nele (Critério de Qualificação)?',
      },
      {
        id: 'q3_sla_primeira_resposta',
        tipo: 'escolha_unica',
        label: 'Em quanto tempo, no máximo, um novo contato DEVE receber a primeira resposta da sua equipe?',
        helper: 'SLA de Atendimento.',
        opcoes: [
          { value: 'ate_10_min', label: 'Imediatamente (até 10 minutos)' },
          { value: 'ate_1_hora', label: 'Em até 1 hora' },
          { value: 'mesmo_dia', label: 'No mesmo dia' },
          { value: 'ate_24h', label: 'Em até 24 horas' },
        ],
      },
      {
        id: 'q3_cadencia_follow_up',
        tipo: 'escolha_unica',
        label: 'O que a equipe deve fazer quando um cliente para de responder (dá vácuo)?',
        helper: 'Cadência de follow-up.',
        opcoes: [
          { value: 'nao_fazemos_nada', label: 'Não fazemos nada' },
          { value: 'tenta_1_vez', label: 'Tentamos mais 1 vez e desistimos' },
          {
            value: 'processo_claro',
            label: 'Temos um processo claro de tentar X vezes em dias diferentes',
          },
          { value: 'sem_regra', label: 'Não temos regra, cada um faz de um jeito' },
        ],
      },
      {
        id: 'q3_dados_obrigatorios_primeiro_contato',
        tipo: 'texto_curto',
        label: 'No primeiro contato, quais são as informações OBRIGATÓRIAS que a equipe precisa coletar?',
        helper: 'Ex: Nome, Dor principal, CNPJ, Se tem convênio, etc.',
      },
      {
        id: 'q3_regra_de_ouro',
        tipo: 'texto_curto',
        label:
          "Existe alguma 'regra de ouro' do seu negócio que NUNCA pode ser esquecida durante o atendimento?",
        helper: 'Ex: Não passar preço por WhatsApp antes de agendar reunião, Exigir CNPJ ativo, etc.',
      },
    ],
  },
  {
    titulo: 'Automações e Pós-Venda',
    perguntas: [
      {
        id: 'q4_maior_gargalo',
        tipo: 'escolha_multipla',
        label: 'Hoje, qual é o maior gargalo ou dor de cabeça no seu atendimento comercial?',
        opcoes: [
          { value: 'esquece_follow_up', label: 'Vendedor esquece de fazer follow-up (retorno)' },
          { value: 'perguntas_repetitivas', label: 'Muito tempo gasto com perguntas repetitivas' },
          { value: 'perde_controle', label: 'Perdemos o controle de quem já foi respondido' },
          { value: 'falta_relatorios', label: 'Falta de relatórios confiáveis' },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q4_tarefas_automatizar',
        tipo: 'escolha_multipla',
        label: 'Se você pudesse automatizar tarefas no CRM para ganhar tempo, quais escolheria?',
        opcoes: [
          { value: 'boas_vindas', label: 'Mensagem imediata de boas-vindas' },
          { value: 'distribuicao_leads', label: 'Distribuição automática de leads' },
          { value: 'lembrete_retorno', label: 'Tarefas lembrando de retornar contato' },
          { value: 'catalogo_automatico', label: 'Envio automático de catálogo' },
          { value: 'resgate_sumidos', label: 'Mensagem de resgate para clientes que sumiram' },
        ],
      },
      {
        id: 'q4_relacao_pos_venda',
        tipo: 'escolha_unica',
        label: 'Depois que a venda é feita, o que acontece na relação com esse cliente?',
        opcoes: [
          { value: 'encerra', label: 'O contato encerra ali' },
          { value: 'pede_avaliacao', label: 'Pedimos avaliação (Google/Pesquisa)' },
          { value: 'tenta_vender_de_novo', label: 'Tentamos vender novamente após X meses' },
          {
            value: 'acompanhamento_perto',
            label: 'Existe um acompanhamento de perto (Sucesso do Cliente)',
          },
        ],
      },
    ],
  },
];
