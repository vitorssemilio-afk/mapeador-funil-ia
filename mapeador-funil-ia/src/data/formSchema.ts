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
    titulo: 'Sobre o negócio',
    perguntas: [
      {
        id: 'q0_nome_negocio',
        tipo: 'texto_curto',
        label: 'Qual o nome do negócio?',
        obrigatoria: true,
      },
      {
        id: 'q0_descricao_produto',
        tipo: 'texto_longo',
        label: 'O que vocês vendem, em poucas palavras? (produto, serviço, especialidade)',
      },
      {
        id: 'q0_ticket_medio',
        tipo: 'numero',
        label: 'Qual o valor médio de cada venda/atendimento?',
        prefixo: 'R$',
        helper: 'Não precisa ser exato, um valor aproximado já ajuda.',
      },
      {
        id: 'q0_modelo_atendimento',
        tipo: 'escolha_unica',
        label: 'O atendimento comercial é feito por...',
        opcoes: [
          { value: 'pessoas', label: 'Pessoas (time humano)' },
          { value: 'robo', label: 'Robô/automação' },
          { value: 'misto', label: 'Misto (pessoas + automação)' },
        ],
      },
    ],
  },
  {
    titulo: 'Como o lead chega até vocês',
    perguntas: [
      {
        id: 'q1_canais_entrada',
        tipo: 'escolha_multipla',
        label: 'Por onde os leads chegam até vocês?',
        helper: 'Marque quantos forem verdade.',
        opcoes: [
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'site', label: 'Site' },
          { value: 'instagram', label: 'Instagram/Redes sociais' },
          { value: 'indicacao', label: 'Indicação' },
          { value: 'anuncio_pago', label: 'Anúncio pago' },
          { value: 'ligacao', label: 'Ligação telefônica' },
          { value: 'presencial', label: 'Presencial' },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q1_tempo_primeiro_contato',
        tipo: 'escolha_unica',
        label: 'Hoje, em quanto tempo vocês costumam dar a primeira resposta a um lead novo?',
        opcoes: [
          { value: 'ate_5_min', label: 'Até 5 minutos' },
          { value: 'ate_30_min', label: 'Até 30 minutos' },
          { value: 'ate_24h', label: 'Até 24 horas' },
          { value: 'mais_1_dia', label: 'Mais de 1 dia' },
          { value: 'sem_padrao', label: 'Não temos um padrão' },
        ],
      },
      {
        id: 'q1_triagem_inicial',
        tipo: 'texto_longo',
        label: 'Assim que o lead chega, existe alguma pergunta ou triagem imediata? Qual?',
      },
    ],
  },
  {
    titulo: 'Qualificação',
    perguntas: [
      {
        id: 'q2_criterio_qualificado',
        tipo: 'texto_longo',
        label:
          "O que precisa ser verdade sobre uma pessoa para vocês considerarem que ela 'tem perfil' para comprar/ser atendida?",
      },
      {
        id: 'q2_perguntas_qualificacao',
        tipo: 'texto_longo',
        label:
          'Quais perguntas vocês costumam fazer para entender se essa pessoa é um bom cliente em potencial?',
      },
      {
        id: 'q2_desqualifica_na_hora',
        tipo: 'texto_longo',
        label:
          'Existe algo que já elimina o lead na hora (ex: fora da região, não tem o problema que vocês resolvem, sem orçamento mínimo)?',
      },
    ],
  },
  {
    titulo: 'Agendamento / Proposta',
    perguntas: [
      {
        id: 'q3_proximo_passo',
        tipo: 'texto_curto',
        label:
          'Depois que o lead é qualificado, qual é o próximo passo? (ex: marcar reunião, agendar consulta, enviar orçamento)',
      },
      {
        id: 'q3_dados_coletados',
        tipo: 'texto_longo',
        label:
          'Quais informações vocês PRECISAM ter dessa pessoa antes de avançar? (ex: nome completo, CPF, data de nascimento, documento específico)',
      },
      {
        id: 'q3_prazo_padrao',
        tipo: 'texto_curto',
        label: 'Existe um prazo padrão para isso acontecer? (ex: agendar em até 24h)',
      },
    ],
  },
  {
    titulo: 'Apresentação, negociação e fechamento',
    perguntas: [
      {
        id: 'q4_como_apresenta_preco',
        tipo: 'texto_longo',
        label: 'Como e quando o preço/orçamento é apresentado ao cliente?',
      },
      {
        id: 'q4_objecoes_comuns',
        tipo: 'texto_longo',
        label: 'Quais são as objeções/dúvidas mais comuns nessa fase, e como vocês costumam responder?',
      },
      {
        id: 'q4_o_que_define_venda_ganha',
        tipo: 'texto_longo',
        label:
          "O que precisa acontecer para a venda ser considerada 'fechada'? (ex: assinatura de contrato, pagamento de entrada, confirmação verbal)",
      },
    ],
  },
  {
    titulo: 'Pós-venda / retenção',
    perguntas: [
      {
        id: 'q5_acompanhamento_pos_venda',
        tipo: 'texto_longo',
        label: 'O que acontece depois que a venda é fechada? Existe algum acompanhamento?',
      },
      {
        id: 'q5_pede_feedback',
        tipo: 'texto_longo',
        label: 'Vocês pedem avaliação/feedback do cliente? Como e quando?',
      },
      {
        id: 'q5_gatilho_reativacao',
        tipo: 'texto_longo',
        label:
          'Existe algum motivo para vocês entrarem em contato de novo com um cliente antigo (ex: renovação, check-up, nova compra)? Depois de quanto tempo?',
      },
    ],
  },
  {
    titulo: 'Perda e desqualificação',
    perguntas: [
      {
        id: 'q6_motivos_perda',
        tipo: 'texto_longo',
        label:
          'Quais são os principais motivos pelos quais um lead NÃO vira cliente? (liste os que mais acontecem)',
      },
      {
        id: 'q6_lead_sumiu',
        tipo: 'texto_longo',
        label: 'O que vocês fazem quando um lead para de responder?',
      },
    ],
  },
  {
    titulo: 'Pessoas e responsabilidades',
    perguntas: [
      {
        id: 'q7_responsaveis_por_etapa',
        tipo: 'texto_longo',
        label:
          'Quem cuida de cada parte do processo? (ex: recepção cuida do agendamento, vendedor cuida da negociação, gestor aprova descontos)',
      },
      {
        id: 'q7_tamanho_equipe',
        tipo: 'numero',
        label: 'Quantas pessoas trabalham hoje no processo comercial?',
        helper: 'Conte todos que participam, mesmo que não seja a função principal deles.',
      },
    ],
  },
  {
    titulo: 'Ferramentas e automação atual',
    perguntas: [
      {
        id: 'q8_ferramentas_atuais',
        tipo: 'escolha_multipla',
        label: 'Quais ferramentas vocês já usam?',
        helper: 'Marque quantas fizerem sentido.',
        opcoes: [
          { value: 'crm', label: 'CRM', campoLivre: { placeholder: 'Qual?' } },
          { value: 'planilha', label: 'Planilha' },
          { value: 'whatsapp_business', label: 'WhatsApp Business' },
          {
            value: 'agenda',
            label: 'Agenda/sistema de agendamento',
            campoLivre: { placeholder: 'Qual?' },
          },
          { value: 'nenhuma', label: 'Nenhuma' },
          { value: 'outro', label: 'Outro', campoLivre: { placeholder: 'Qual?' } },
        ],
      },
      {
        id: 'q8_automacoes_existentes',
        tipo: 'texto_longo',
        label:
          'Já existe algo automático hoje? (ex: lembrete automático, mensagem de boas-vindas, cobrança automática)',
      },
    ],
  },
  {
    titulo: 'Particularidades do negócio',
    perguntas: [
      {
        id: 'q9_diferenca_tipo_cliente',
        tipo: 'texto_longo',
        label:
          'Existe algum tipo de cliente que segue um caminho diferente? (ex: particular x convênio, à vista x parcelado, pessoa física x empresa)',
      },
      {
        id: 'q9_documentos_ou_aprovacoes',
        tipo: 'texto_longo',
        label: 'Existe algum documento, exame ou aprovação necessária antes de fechar a venda?',
      },
      {
        id: 'q9_regra_importante',
        tipo: 'texto_longo',
        label:
          'Existe alguma regra importante do seu negócio que nunca pode ser esquecida no atendimento? (ex: sigilo, prazo legal, protocolo específico)',
      },
    ],
  },
];
