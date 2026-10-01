// Ciclo de vida do mapeamento (vendas ou pós-venda). Os primeiros 4 valores
// são escritos automaticamente pelo fluxo de geração via IA
// (em_preenchimento → processando_ia → funil_gerado, com
// aguardando_esclarecimento/erro como desvios). Os 5 seguintes são estados
// manuais, definidos pelo time depois que o funil já existe: revisão
// interna → pronto para kickoff → kickoff agendado → (ajustes solicitados ⟷
// funil validado). 'concluido' é um valor LEGADO: existiu antes dessa
// reorganização (com o significado ambíguo de "a IA terminou"), foi
// migrado pra 'funil_validado' nos registros existentes e nenhum código
// novo volta a escrevê-lo — mantido só pra não quebrar o tipo de linhas
// que por algum motivo ainda o tenham.
export type MapeamentoStatus =
  | 'em_preenchimento'
  | 'processando_ia'
  | 'aguardando_esclarecimento'
  | 'funil_gerado'
  | 'em_revisao_interna'
  | 'pronto_kickoff'
  | 'kickoff_agendado'
  | 'ajustes_solicitados'
  | 'funil_validado'
  | 'concluido'
  | 'erro';

export type MapeamentoTipo = 'vendas' | 'pos_venda';

// Marcos do ciclo de vida do cliente (contratação → ... → adoção). Datados
// automaticamente pelo produto quando dá (triggers no banco — ver migration
// 0034), sempre editáveis manualmente na ficha do cliente. Campos "_para"
// são datas agendadas/planejadas; "_em" são o que de fato aconteceu.
export type MarcosCliente = {
  contratado_em: string | null;
  formulario_enviado_em: string | null;
  formulario_respondido_em: string | null;
  funil_gerado_em: string | null;
  funil_revisado_em: string | null;
  funil_validado_em: string | null;
  kickoff_agendado_para: string | null;
  kickoff_realizado_em: string | null;
  conta_kommo_solicitada_em: string | null;
  conta_kommo_criada_em: string | null;
  treinamento_agendado_para: string | null;
  treinamento_realizado_em: string | null;
  extensao_14_solicitada_em: string | null;
  extensao_14_aprovada_em: string | null;
  extensao_7_solicitada_em: string | null;
  extensao_7_aprovada_em: string | null;
  contratacao_kommo_solicitada_em: string | null;
  implementacao_concluida_em: string | null;
};

export type Cliente = MarcosCliente & {
  id: string;
  nome_empresa: string;
  nome_contato: string | null;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
  // "Informações do cliente" — nome_fantasia começa igual a nome_empresa
  // (backfill na migration 0040), editável à parte a partir daí.
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj: string | null;
  site: string | null;
  cidade: string | null;
  uf: string | null;
  // Preenchido automaticamente por trigger com quem cria o cliente (ver
  // migration 0051) — controla o acesso por vínculo (fase 2 de segurança).
  consultor_responsavel_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClienteContato = {
  id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  papel_projeto: string | null;
  principal: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoriaOcorrencia =
  | 'cliente_cancelou_reuniao'
  | 'cliente_nao_compareceu'
  | 'consultor_cancelou'
  | 'reuniao_remarcada'
  | 'acesso_pendente'
  | 'pendencia_cliente'
  | 'problema_tecnico'
  | 'mudanca_escopo'
  | 'outro';

export type StatusOcorrencia = 'aberta' | 'resolvida';

export type ClienteOcorrencia = {
  id: string;
  cliente_id: string;
  categoria: CategoriaOcorrencia;
  descricao: string;
  responsavel_impacto: ImpactoResponsavel;
  data_ocorrencia: string;
  impacta_cronograma: boolean;
  dias_impacto: number | null;
  status: StatusOcorrencia;
  resolvida_em: string | null;
  autor_email: string | null;
  // Quem precisa resolver a pendência e até quando (ambos opcionais) — sem
  // isso não tinha como gerar alerta de "pendência vencendo". Ver P2-A8,
  // migration 0065.
  consultor_responsavel_id: string | null;
  prazo: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoriaNotificacao =
  | 'implementacao'
  | 'trial'
  | 'formulario'
  | 'funil'
  | 'reuniao'
  | 'pendencia'
  | 'sistema';

export type PrioridadeNotificacao = 'informativa' | 'atencao' | 'alta' | 'critica';

export type Notificacao = {
  id: string;
  categoria: CategoriaNotificacao;
  tipo: string;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  implementacao_id: string | null;
  prioridade: PrioridadeNotificacao;
  rota: string | null;
  entidade_tipo: string | null;
  entidade_id: string | null;
  chave_idempotencia: string;
  created_at: string;
};

export type NotificacaoStatus = {
  id: string;
  notificacao_id: string;
  user_id: string;
  lida: boolean;
  lida_em: string | null;
  arquivada: boolean;
  arquivada_em: string | null;
  updated_at: string;
};

export type IaOperacaoTipo = 'gerar_funil' | 'regenerar_etapa' | 'criar_funil_kommo';

export type IaOperacaoStatus =
  | 'aguardando'
  | 'processando'
  | 'concluido'
  | 'falhou'
  | 'resposta_invalida'
  | 'cancelado'
  | 'tentando_novamente';

export type IaOperacao = {
  id: string;
  tipo_operacao: IaOperacaoTipo;
  cliente_id: string | null;
  mapeamento_id: string | null;
  funil_id: string | null;
  implementacao_id: string | null;
  etapa_index: number | null;
  user_id: string | null;
  user_email: string | null;
  status: IaOperacaoStatus;
  tentativa: number;
  modelo: string | null;
  duracao_ms: number | null;
  erro_codigo: string | null;
  erro_mensagem_tecnica: string | null;
  erro_mensagem_amigavel: string | null;
  created_at: string;
  finalizado_em: string | null;
};

export type ClienteObservacao = {
  id: string;
  cliente_id: string;
  user_id: string | null;
  autor_email: string | null;
  texto: string;
  created_at: string;
};

export type ClienteArquivo = {
  id: string;
  cliente_id: string;
  nome_arquivo: string;
  caminho_storage: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  user_id: string | null;
  autor_email: string | null;
  created_at: string;
};

export type Mapeamento = {
  id: string;
  user_id: string;
  cliente_id: string | null;
  nome_negocio: string;
  status: MapeamentoStatus;
  respostas: Record<string, unknown>;
  enviado_pelo_cliente: boolean;
  codigo_curto: string;
  tipo: MapeamentoTipo;
  mapeamento_origem_id: string | null;
  // Instante em que o cliente enviou o formulário (enviado_pelo_cliente virou
  // true) — null se ainda não foi enviado, ou se foi enviado antes desta
  // coluna existir e não há como saber a data exata (nesse caso, updated_at
  // é a melhor aproximação disponível).
  enviado_em: string | null;
  // Quem confirmou ter revisado a versão atual do funil, e quando — ver o
  // botão "Marcar como revisado" na tela de Mapeamento. Independente do
  // status do funil em si (em_revisao_interna etc.), é só um registro de
  // auditoria de quem olhou por último.
  revisado_por_email: string | null;
  revisado_em: string | null;
  created_at: string;
  updated_at: string;
};

export type MapeamentoPublico = {
  id: string;
  nome_negocio: string;
  respostas: Record<string, unknown>;
  enviado_pelo_cliente: boolean;
  tipo: MapeamentoTipo;
};

export type TipoFunil =
  | 'qualificacao'
  | 'vendas'
  | 'comparecimento'
  | 'pos_venda'
  | 'outro';

export type CampoEtapa = {
  nome: string;
  tipo: TipoCampo | string;
  opcoes?: string[];
  // Em qual entidade do CRM esse campo deve ser criado — LEAD (a negociação
  // em si) ou CONTATO (a pessoa, dado que se repete entre negociações
  // diferentes, ex: telefone, CPF, e-mail). Ausente = LEAD, pra manter
  // compatibilidade com funis gerados antes desse campo existir.
  entidade?: 'LEAD' | 'CONTATO';
};

export type EtapaFunil = {
  nome: string;
  objetivo: string;
  gatilho_entrada: string;
  gatilho_saida: string;
  tarefas: string[];
  campos_obrigatorios: CampoEtapa[];
  campos_desejaveis: CampoEtapa[];
  sla: string;
  regras_negocio: string[];
  regras_perda: string[];
  responsavel: string;
  automacao: string[];
  script_sugerido: string | null;
};

export type FunilGerado = {
  id: string;
  mapeamento_id: string;
  user_id: string;
  nome_funil: string;
  tipo_funil: TipoFunil | string;
  justificativa: string | null;
  etapas: EtapaFunil[];
  ordem: number;
  versao: number;
  created_at: string;
};

// Versionamento simples: uma linha por (mapeamento, versão), independente
// do funil ser de vendas ou pós-venda. 'aprovada' nunca é sobrescrita — uma
// aprovação posterior de outra versão ganha sua própria linha (ver
// src/lib/funilVersoes.ts e a migration 0045). A imutabilidade do CONTEÚDO
// de uma versão aprovada (funis_gerados.etapas) é garantida a nível de
// banco por um trigger (migration 0060) — editar uma versão aprovada exige
// criar uma nova versão via RPC criar_versao_funil_a_partir_de.
export type OrigemFunilVersao = 'ia' | 'manual';
export type StatusFunilVersao = 'rascunho' | 'aprovada';

export type FunilVersao = {
  id: string;
  mapeamento_id: string;
  versao: number;
  origem: OrigemFunilVersao;
  gerado_por_email: string | null;
  status: StatusFunilVersao;
  aprovada_em: string | null;
  aprovada_por_email: string | null;
  kickoff_reuniao_id: string | null;
  // Versão a partir da qual esta foi criada via "Criar nova versão para
  // edição" (null quando nasceu de uma geração/regeneração normal pela IA).
  versao_origem: number | null;
  created_at: string;
};

export type TransicaoEntreFunis = {
  de_funil: string;
  para_funil: string;
  condicao: string;
};

export type NivelComplexidade = 'baixa' | 'media' | 'alta';

export type GeracaoMeta = {
  id: string;
  mapeamento_id: string;
  user_id: string;
  versao: number;
  pontos_para_validar: string[];
  transicoes_entre_funis: TransicaoEntreFunis[];
  nivel_complexidade: NivelComplexidade | null;
  semanas_estimadas: number | null;
  observacao_estimativa: string | null;
  indicadores_dashboard: string[];
  classificacao_modelo_negocio: string | null;
  created_at: string;
};

export type EntidadeCampo = 'LEAD' | 'CONTATO';

export type TipoCampo =
  | 'lista_suspensa'
  | 'texto_curto'
  | 'texto_longo'
  | 'numero'
  | 'data'
  | 'checkbox'
  | 'telefone';

export type CampoPadrao = {
  id: string;
  entidade: EntidadeCampo;
  nome_campo: string;
  tipo: TipoCampo;
  opcoes: string[] | null;
  created_at: string;
};

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

export type BlocoFormularioRow = {
  id: string;
  titulo: string;
  ordem: number;
  formulario_tipo: MapeamentoTipo;
  created_at: string;
  updated_at: string;
};

export type PerguntaFormularioRow = {
  id: string;
  bloco_id: string;
  pergunta_id: string;
  ordem: number;
  tipo: PerguntaTipo;
  label: string;
  helper: string | null;
  opcoes: OpcaoPergunta[] | null;
  prefixo: string | null;
  obrigatoria: boolean;
  condicao_pergunta_id: string | null;
  condicao_valores: string[] | null;
  // false = a resposta continua sendo coletada normalmente, mas não entra no
  // texto passado pro prompt de geração do funil por IA.
  incluir_na_geracao_ia: boolean;
  created_at: string;
  updated_at: string;
};

// Ciclo de vida da implementação de CRM — fases 10 a 16 do ciclo de vida
// completo do cliente (as fases 1 a 9 ficam em MapeamentoStatus). Substitui
// os antigos 'pre_requisito'/'semana_1'..'semana_4' (nomes migrados 1:1,
// ver migration 0033) por nomes que descrevem o que a fase é, não quando
// ela acontece.
export type ImplementacaoStatus =
  | 'preparacao_crm'
  | 'crm_em_configuracao'
  | 'treinamento_agendado'
  | 'automacoes'
  | 'entrega'
  | 'adocao'
  | 'concluida'
  | 'cancelada';

export type PapelConsultor = 'administrador' | 'consultor' | 'consultor_apoio';

export type Consultor = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cargo: string | null;
  avatar_url: string | null;
  ativo: boolean;
  user_id: string | null;
  role: PapelConsultor;
  created_at: string;
  updated_at: string;
};

export type ImplementacaoConsultorHistorico = {
  id: string;
  implementacao_id: string;
  consultor_anterior_id: string | null;
  consultor_novo_id: string;
  alterado_em: string;
  alterado_por_email: string | null;
};

export type ImplementacaoCrm = {
  id: string;
  mapeamento_id: string;
  cliente_id: string | null;
  user_id: string;
  nome_cliente: string;
  // Texto livre anterior à criação de `consultores` — mantido só de
  // referência (ver migration 0040), não usado por código novo.
  consultor_responsavel_texto_legado: string | null;
  consultor_responsavel_id: string | null;
  consultor_adicional_id: string | null;
  stakeholder_decisor: string | null;
  status: ImplementacaoStatus;
  conta_criada_via_v4: boolean;
  email_conta_kommo: string | null;
  whatsapp_corporativo_confirmado: boolean;
  acesso_facebook_confirmado: boolean;
  plano_contratado: string | null;
  periodo_contratado: string | null;
  data_decisao_plano: string | null;
  // Status comercial da contratação do Kommo — separado dos critérios
  // técnicos de entrega (ver migration 0047): "cliente contratar o plano
  // pago" nunca é critério de qualidade da implementação em si.
  status_contratacao_kommo: StatusContratacaoKommo;
  observacoes: string | null;
  codigo_checkpoint: string;
  created_at: string;
  updated_at: string;
};

export type StatusContratacaoKommo = 'contratado' | 'em_decisao' | 'nao_contratado';

// Critérios de entrega: "a implementação foi corretamente entregue?" —
// técnico e objetivo, sob controle da V4. Nunca inclui adoção do cliente
// (isso é checkpoints_adocao, uma coisa completamente separada).
export type StatusCriterioEntrega = 'pendente' | 'em_validacao' | 'concluido' | 'nao_se_aplica';

export type CriterioEntrega = {
  id: string;
  chave: string | null;
  nome: string;
  ordem: number;
  obrigatorio: boolean;
  created_at: string;
};

export type CriterioEntregaStatus = {
  id: string;
  implementacao_id: string;
  criterio_id: string;
  status: StatusCriterioEntrega;
  evidencia: string | null;
  observacao: string | null;
  justificativa_nao_aplica: string | null;
  data_validacao: string | null;
  responsavel_validacao_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ImplementacaoStatusHistorico = {
  id: string;
  implementacao_id: string;
  status_anterior: ImplementacaoStatus | null;
  status_novo: ImplementacaoStatus;
  alterado_em: string;
};

// Atividades do cronograma da implementação, com dependência explícita
// entre marcos — substitui o checklist fixo por semana (que ainda existe no
// banco por segurança/histórico, mas não é mais lido pelo produto). Uma
// atividade só ganha data planejada depois que sua dependência de fato
// acontece (nunca todas de uma vez na contratação).
export type AtividadeCronograma = {
  id: string;
  chave: string | null;
  nome: string;
  ciclo: string;
  ordem: number;
  responsavel_padrao: string | null;
  // 'marco:<campo de Cliente>' | 'ciclo:<ImplementacaoStatus>' | null (sem dependência).
  depende_de: string | null;
  prazo_dias: number | null;
  requer_evidencia: boolean;
  // Quando esta atividade REPRESENTA uma reunião do módulo de Reuniões
  // (Check-in 1/2, Reunião final) — a reunião passa a ser a fonte única da
  // data (agendada/realizada), nunca um campo duplicado em
  // atividades_status. null = atividade comum, sem reunião associada. Ver
  // resolverAtividade em atividadesCronograma.ts e migration 0064 (P1-C2).
  reuniao_tipo: TipoReuniao | null;
  // null = item do template global (compartilhado); preenchido = item
  // derivado automaticamente do funil dessa implementação específica.
  implementacao_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AtividadeStatusRow = {
  id: string;
  implementacao_id: string;
  atividade_id: string;
  data_real: string | null;
  agendado_para: string | null;
  bloqueado_pelo_cliente: boolean;
  evidencia: string | null;
  created_at: string;
  updated_at: string;
};

export type ImpactoResponsavel = 'cliente' | 'consultor' | 'v4' | 'problema_tecnico' | 'outro';

// Auditoria de toda remarcação de kickoff_agendado_para/treinamento_agendado_para
// — distinto de uma edição livre desses campos pelo formulário genérico de
// marcos: guarda a data anterior (nunca perdida), exige motivo e de quem foi
// o impacto. Ver src/lib/atividadesCronograma.ts (resolverMarcoAgendavel).
export type MarcoRemarcacao = {
  id: string;
  cliente_id: string;
  campo_marco: 'kickoff_agendado_para' | 'treinamento_agendado_para';
  data_anterior: string | null;
  data_nova: string;
  motivo: string;
  responsavel_impacto: ImpactoResponsavel;
  created_at: string;
};

export type TipoReuniao =
  | 'kickoff'
  | 'treinamento'
  | 'checkin_1'
  | 'checkin_2'
  | 'tira_duvidas'
  | 'reuniao_final'
  | 'extraordinaria';

export type StatusReuniao =
  | 'nao_agendada'
  | 'agendada'
  | 'realizada'
  | 'remarcada'
  | 'cliente_nao_compareceu'
  | 'consultor_nao_compareceu'
  | 'cancelada';

// Kickoff e Treinamento continuam também escrevendo em
// clientes.kickoff_realizado_em/treinamento_realizado_em (e seus pares
// "_agendado_para") ao salvar — esses marcos são o que ancora o prazo de 40
// dias e o gate do treinamento em outros lugares do produto (ver
// src/lib/cronograma.ts e src/lib/atividadesCronograma.ts), então o módulo
// de Reuniões escreve nos dois lugares em vez de duplicar essa lógica.
export type Reuniao = {
  id: string;
  cliente_id: string;
  implementacao_id: string | null;
  tipo: TipoReuniao;
  titulo: string | null;
  data_hora: string | null;
  consultor_responsavel_id: string | null;
  participantes: string | null;
  link: string | null;
  status: StatusReuniao;
  ata: string | null;
  resumo: string | null;
  decisoes: string | null;
  pendencias_cliente: string | null;
  pendencias_internas: string | null;
  proximos_passos: string | null;
  // Preparação pra uma futura sincronização com calendário externo (Google
  // Calendar ou outro) — hoje sempre null, nenhum código lê ou escreve
  // nesses campos ainda. Genéricos de propósito (não específicos do
  // Google), pra não exigir outra migration de schema quando essa
  // integração for retomada.
  external_calendar_id: string | null;
  external_event_id: string | null;
  calendar_provider: string | null;
  created_at: string;
  updated_at: string;
};

export type ReuniaoRemarcacao = {
  id: string;
  reuniao_id: string;
  data_anterior: string | null;
  data_nova: string;
  motivo: string;
  responsavel_impacto: ImpactoResponsavel;
  alterado_por_email: string | null;
  created_at: string;
};

// Configuração global (singleton, id sempre true), não por cliente — as 4
// URLs de solicitação do Pipefy, cadastradas uma vez e reutilizadas em toda
// a operação. Sem integração com a API do Pipefy nesta versão: só os links.
export type ConfiguracaoPipefy = {
  id: true;
  url_criacao_conta: string | null;
  url_extensao_14: string | null;
  url_extensao_7: string | null;
  url_contratacao_definitiva: string | null;
  updated_at: string;
};

export type ChecklistGrupoImplementacao = {
  id: string;
  chave: string;
  titulo: string;
  ordem: number;
  created_at: string;
  updated_at: string;
};

export type ChecklistItemImplementacao = {
  id: string;
  grupo_id: string;
  texto: string;
  ordem: number;
  requer_evidencia: boolean;
  // null = item do template global do POP (compartilhado); preenchido =
  // item derivado automaticamente do funil dessa implementação específica.
  implementacao_id: string | null;
  // Dia (1-7) dentro da janela de 7 dias corridos do grupo/semana, contado a
  // partir da entrada da implementação naquele status. Null = sem prazo
  // definido, o item não aparece na Agenda diária.
  dia_semana: number | null;
  created_at: string;
  updated_at: string;
};

export type ImplementacaoChecklistMarcado = {
  id: string;
  implementacao_id: string;
  item_id: string;
  marcado: boolean;
  evidencia: string | null;
  marcado_em: string;
};

export type UsoDiarioCheckpoint = 'so_kommo' | 'kommo_mais_planilha' | 'voltou_planilha';
export type FrequenciaUsoCheckpoint = 'diariamente' | 'semanalmente' | 'raramente' | 'nao_uso';
export type IntencaoManutencaoCheckpoint = 'sim' | 'talvez' | 'nao';
export type PercentualProcessoKommo = 'praticamente_tudo' | 'maior_parte' | 'cerca_metade' | 'pouco' | 'quase_nada';
export type AutonomiaEquipeCheckpoint =
  | 'sim_totalmente'
  | 'maior_parte_vezes'
  | 'precisamos_ajuda_frequente'
  | 'nao_conseguimos_sem_ajuda';
export type UsoRelatoriosDecisaoCheckpoint = 'sim_mais_uma_vez' | 'sim_uma_vez' | 'ainda_nao' | 'nao_sei_utilizar';
export type AtividadesForaKommoCheckpoint =
  | 'nao_tudo_no_kommo'
  | 'sim_algumas'
  | 'sim_varias'
  | 'voltou_processo_antigo';

export type CheckpointAdocao = {
  id: string;
  implementacao_id: string;
  uso_diario: UsoDiarioCheckpoint;
  frequencia_uso: FrequenciaUsoCheckpoint;
  obstaculo: string | null;
  intencao_manutencao: IntencaoManutencaoCheckpoint;
  risco_churn: boolean;
  percentual_processo_kommo: PercentualProcessoKommo | null;
  autonomia_equipe: AutonomiaEquipeCheckpoint | null;
  uso_relatorios_decisao: UsoRelatoriosDecisaoCheckpoint | null;
  atividades_fora_kommo: AtividadesForaKommoCheckpoint | null;
  quais_atividades_fora_kommo: string | null;
  principal_dificuldade: string | null;
  respondido_em: string;
  created_at: string;
  updated_at: string;
};

// Ação que o consultor registra depois de analisar as respostas do
// checkpoint — um log simples, não um novo fluxo de status.
export type CheckpointAcompanhamento = {
  id: string;
  implementacao_id: string;
  descricao: string;
  responsavel_id: string | null;
  autor_email: string | null;
  created_at: string;
};

export type CheckpointPublico = {
  nome_cliente: string;
  ja_respondido: boolean;
};

export type CredencialCrmListada = {
  id: string;
  login: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type CredencialCrmRevelada = {
  login: string;
  senha: string;
  observacoes: string | null;
};

// A tabela credenciais_crm nunca é lida/gravada diretamente pelo client —
// só via as funções salvar/atualizar/listar/revelar_credencial_crm. Esse
// tipo existe só pra tipar o `.delete()`, a única operação direta permitida.
export type CredencialCrmRow = {
  id: string;
  implementacao_id: string;
  login: string;
  senha_criptografada: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

// Mesmo padrão de CredencialCrmRow: só existe pra tipar o `.delete()` da
// tabela credenciais_api_kommo, nunca lida/gravada direto pelo client.
export type CredencialApiKommoRow = {
  id: string;
  implementacao_id: string;
  subdominio: string;
  token_criptografado: string;
  created_at: string;
  updated_at: string;
};

export type CredencialApiKommoMeta = {
  subdominio: string;
  created_at: string;
  updated_at: string;
};

export type FunilKommoCriacao = {
  id: string;
  funil_gerado_id: string;
  implementacao_id: string;
  user_id: string;
  kommo_pipeline_id: number;
  kommo_status_ids: { id: number; nome: string }[];
  kommo_campos_ids: { id: number; nome: string }[];
  criado_em: string;
  updated_at: string;
};

export type MapeamentoRespostaFlat = {
  mapeamento_id: string;
  nome_negocio: string;
  mapeamento_status: MapeamentoStatus;
  enviado_pelo_cliente: boolean;
  mapeamento_criado_em: string;
  bloco_titulo: string;
  pergunta_id: string;
  pergunta_label: string;
  pergunta_tipo: PerguntaTipo;
  resposta_bruta: unknown;
  resposta_texto: string | null;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
      clientes: {
        Row: Cliente;
        Insert: Partial<Cliente> & Pick<Cliente, 'nome_empresa'>;
        Update: Partial<Cliente>;
        Relationships: [];
      };
      cliente_observacoes: {
        Row: ClienteObservacao;
        Insert: Partial<ClienteObservacao> & Pick<ClienteObservacao, 'cliente_id' | 'texto'>;
        Update: Partial<ClienteObservacao>;
        Relationships: [];
      };
      cliente_contatos: {
        Row: ClienteContato;
        Insert: Partial<ClienteContato> & Pick<ClienteContato, 'cliente_id' | 'nome'>;
        Update: Partial<ClienteContato>;
        Relationships: [];
      };
      cliente_ocorrencias: {
        Row: ClienteOcorrencia;
        Insert: Partial<ClienteOcorrencia> &
          Pick<ClienteOcorrencia, 'cliente_id' | 'categoria' | 'descricao' | 'responsavel_impacto'>;
        Update: Partial<ClienteOcorrencia>;
        Relationships: [];
      };
      notificacoes: {
        Row: Notificacao;
        Insert: Partial<Notificacao> & Pick<Notificacao, 'categoria' | 'tipo' | 'titulo' | 'prioridade' | 'chave_idempotencia'>;
        Update: Partial<Notificacao>;
        Relationships: [];
      };
      notificacoes_status: {
        Row: NotificacaoStatus;
        Insert: Partial<NotificacaoStatus> & Pick<NotificacaoStatus, 'notificacao_id' | 'user_id'>;
        Update: Partial<NotificacaoStatus>;
        Relationships: [];
      };
      ia_operacoes: {
        Row: IaOperacao;
        Insert: Partial<IaOperacao> & Pick<IaOperacao, 'tipo_operacao'>;
        Update: Partial<IaOperacao>;
        Relationships: [];
      };
      consultores: {
        Row: Consultor;
        Insert: Partial<Consultor> & Pick<Consultor, 'nome' | 'email'>;
        Update: Partial<Consultor>;
        Relationships: [];
      };
      implementacao_consultor_historico: {
        Row: ImplementacaoConsultorHistorico;
        Insert: Partial<ImplementacaoConsultorHistorico> &
          Pick<ImplementacaoConsultorHistorico, 'implementacao_id' | 'consultor_novo_id'>;
        Update: Partial<ImplementacaoConsultorHistorico>;
        Relationships: [];
      };
      reunioes: {
        Row: Reuniao;
        Insert: Partial<Reuniao> & Pick<Reuniao, 'cliente_id' | 'tipo'>;
        Update: Partial<Reuniao>;
        Relationships: [];
      };
      reuniao_remarcacoes: {
        Row: ReuniaoRemarcacao;
        Insert: Partial<ReuniaoRemarcacao> &
          Pick<ReuniaoRemarcacao, 'reuniao_id' | 'data_nova' | 'motivo' | 'responsavel_impacto'>;
        Update: Partial<ReuniaoRemarcacao>;
        Relationships: [];
      };
      cliente_arquivos: {
        Row: ClienteArquivo;
        Insert: Partial<ClienteArquivo> & Pick<ClienteArquivo, 'cliente_id' | 'nome_arquivo' | 'caminho_storage'>;
        Update: Partial<ClienteArquivo>;
        Relationships: [];
      };
      mapeamentos: {
        Row: Mapeamento;
        Insert: Partial<Mapeamento> & Pick<Mapeamento, 'nome_negocio' | 'user_id'>;
        Update: Partial<Mapeamento>;
        Relationships: [];
      };
      funis_gerados: {
        Row: FunilGerado;
        Insert: Partial<FunilGerado> &
          Pick<FunilGerado, 'mapeamento_id' | 'user_id' | 'nome_funil' | 'tipo_funil'>;
        Update: Partial<FunilGerado>;
        Relationships: [];
      };
      funil_versoes: {
        Row: FunilVersao;
        Insert: Partial<FunilVersao> & Pick<FunilVersao, 'mapeamento_id' | 'versao'>;
        Update: Partial<FunilVersao>;
        Relationships: [];
      };
      geracoes_meta: {
        Row: GeracaoMeta;
        Insert: Partial<GeracaoMeta> & Pick<GeracaoMeta, 'mapeamento_id' | 'user_id' | 'versao'>;
        Update: Partial<GeracaoMeta>;
        Relationships: [];
      };
      campos_padrao: {
        Row: CampoPadrao;
        Insert: Partial<CampoPadrao> & Pick<CampoPadrao, 'entidade' | 'nome_campo' | 'tipo'>;
        Update: Partial<CampoPadrao>;
        Relationships: [];
      };
      blocos_formulario: {
        Row: BlocoFormularioRow;
        Insert: Partial<BlocoFormularioRow> & Pick<BlocoFormularioRow, 'titulo' | 'ordem'>;
        Update: Partial<BlocoFormularioRow>;
        Relationships: [];
      };
      perguntas_formulario: {
        Row: PerguntaFormularioRow;
        Insert: Partial<PerguntaFormularioRow> &
          Pick<PerguntaFormularioRow, 'bloco_id' | 'pergunta_id' | 'ordem' | 'tipo' | 'label'>;
        Update: Partial<PerguntaFormularioRow>;
        Relationships: [];
      };
      implementacoes_crm: {
        Row: ImplementacaoCrm;
        Insert: Partial<ImplementacaoCrm> &
          Pick<ImplementacaoCrm, 'mapeamento_id' | 'user_id' | 'nome_cliente'>;
        Update: Partial<ImplementacaoCrm>;
        Relationships: [];
      };
      criterios_entrega: {
        Row: CriterioEntrega;
        Insert: Partial<CriterioEntrega> & Pick<CriterioEntrega, 'nome' | 'ordem'>;
        Update: Partial<CriterioEntrega>;
        Relationships: [];
      };
      criterios_entrega_status: {
        Row: CriterioEntregaStatus;
        Insert: Partial<CriterioEntregaStatus> & Pick<CriterioEntregaStatus, 'implementacao_id' | 'criterio_id'>;
        Update: Partial<CriterioEntregaStatus>;
        Relationships: [];
      };
      atividades_cronograma: {
        Row: AtividadeCronograma;
        Insert: Partial<AtividadeCronograma> & Pick<AtividadeCronograma, 'nome' | 'ciclo'>;
        Update: Partial<AtividadeCronograma>;
        Relationships: [];
      };
      atividades_status: {
        Row: AtividadeStatusRow;
        Insert: Partial<AtividadeStatusRow> & Pick<AtividadeStatusRow, 'implementacao_id' | 'atividade_id'>;
        Update: Partial<AtividadeStatusRow>;
        Relationships: [];
      };
      checklist_grupos_implementacao: {
        Row: ChecklistGrupoImplementacao;
        Insert: Partial<ChecklistGrupoImplementacao> &
          Pick<ChecklistGrupoImplementacao, 'chave' | 'titulo' | 'ordem'>;
        Update: Partial<ChecklistGrupoImplementacao>;
        Relationships: [];
      };
      checklist_itens_implementacao: {
        Row: ChecklistItemImplementacao;
        Insert: Partial<ChecklistItemImplementacao> &
          Pick<ChecklistItemImplementacao, 'grupo_id' | 'texto' | 'ordem'>;
        Update: Partial<ChecklistItemImplementacao>;
        Relationships: [];
      };
      implementacao_checklist_marcado: {
        Row: ImplementacaoChecklistMarcado;
        Insert: Partial<ImplementacaoChecklistMarcado> &
          Pick<ImplementacaoChecklistMarcado, 'implementacao_id' | 'item_id'>;
        Update: Partial<ImplementacaoChecklistMarcado>;
        Relationships: [];
      };
      credenciais_crm: {
        Row: CredencialCrmRow;
        Insert: Partial<CredencialCrmRow> &
          Pick<CredencialCrmRow, 'implementacao_id' | 'login' | 'senha_criptografada'>;
        Update: Partial<CredencialCrmRow>;
        Relationships: [];
      };
      funis_kommo_criacoes: {
        Row: FunilKommoCriacao;
        Insert: Partial<FunilKommoCriacao> &
          Pick<FunilKommoCriacao, 'funil_gerado_id' | 'implementacao_id' | 'user_id' | 'kommo_pipeline_id'>;
        Update: Partial<FunilKommoCriacao>;
        Relationships: [];
      };
      credenciais_api_kommo: {
        Row: CredencialApiKommoRow;
        Insert: Partial<CredencialApiKommoRow> &
          Pick<CredencialApiKommoRow, 'implementacao_id' | 'subdominio' | 'token_criptografado'>;
        Update: Partial<CredencialApiKommoRow>;
        Relationships: [];
      };
      implementacao_status_historico: {
        Row: ImplementacaoStatusHistorico;
        Insert: Partial<ImplementacaoStatusHistorico> &
          Pick<ImplementacaoStatusHistorico, 'implementacao_id' | 'status_novo'>;
        Update: Partial<ImplementacaoStatusHistorico>;
        Relationships: [];
      };
      checkpoints_adocao: {
        Row: CheckpointAdocao;
        Insert: Partial<CheckpointAdocao> &
          Pick<CheckpointAdocao, 'implementacao_id' | 'uso_diario' | 'frequencia_uso' | 'intencao_manutencao'>;
        Update: Partial<CheckpointAdocao>;
        Relationships: [];
      };
      checkpoint_acompanhamentos: {
        Row: CheckpointAcompanhamento;
        Insert: Partial<CheckpointAcompanhamento> & Pick<CheckpointAcompanhamento, 'implementacao_id' | 'descricao'>;
        Update: Partial<CheckpointAcompanhamento>;
        Relationships: [];
      };
      marco_remarcacoes: {
        Row: MarcoRemarcacao;
        Insert: Partial<MarcoRemarcacao> &
          Pick<MarcoRemarcacao, 'cliente_id' | 'campo_marco' | 'data_nova' | 'motivo' | 'responsavel_impacto'>;
        Update: Partial<MarcoRemarcacao>;
        Relationships: [];
      };
      configuracoes_pipefy: {
        Row: ConfiguracaoPipefy;
        Insert: Partial<ConfiguracaoPipefy>;
        Update: Partial<ConfiguracaoPipefy>;
        Relationships: [];
      };
    };
    Views: {
      mapeamentos_respostas_flat: {
        Row: MapeamentoRespostaFlat;
        Relationships: [];
      };
    };
    Functions: {
      public_get_mapeamento: {
        Args: { p_id: string };
        Returns: MapeamentoPublico[];
      };
      public_get_mapeamento_by_codigo: {
        Args: { p_codigo: string };
        Returns: MapeamentoPublico[];
      };
      public_save_respostas: {
        Args: { p_id: string; p_respostas: Record<string, unknown>; p_finalizar: boolean };
        Returns: undefined;
      };
      salvar_credencial_crm: {
        Args: {
          p_implementacao_id: string;
          p_login: string;
          p_senha: string;
          p_observacoes?: string | null;
        };
        Returns: string;
      };
      atualizar_credencial_crm: {
        Args: {
          p_id: string;
          p_login: string;
          p_senha: string;
          p_observacoes?: string | null;
        };
        Returns: undefined;
      };
      listar_credenciais_crm: {
        Args: { p_implementacao_id: string };
        Returns: CredencialCrmListada[];
      };
      revelar_credencial_crm: {
        Args: { p_id: string };
        Returns: CredencialCrmRevelada[];
      };
      salvar_credencial_api_kommo: {
        Args: { p_implementacao_id: string; p_subdominio: string; p_token: string };
        Returns: string;
      };
      obter_credencial_api_kommo_meta: {
        Args: { p_implementacao_id: string };
        Returns: CredencialApiKommoMeta[];
      };
      obter_credencial_api_kommo: {
        Args: { p_implementacao_id: string };
        Returns: { subdominio: string; token: string }[];
      };
      public_get_checkpoint_by_codigo: {
        Args: { p_codigo: string };
        Returns: CheckpointPublico[];
      };
      public_save_checkpoint: {
        Args: {
          p_codigo: string;
          p_uso_diario: string;
          p_frequencia_uso: string;
          p_obstaculo: string | null;
          p_intencao_manutencao: string;
        };
        Returns: undefined;
      };
      sou_administrador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      marcar_todas_notificacoes_como_lidas: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      registrar_inicio_ia_operacao: {
        Args: {
          p_tipo_operacao: IaOperacaoTipo;
          p_cliente_id: string | null;
          p_mapeamento_id: string | null;
          p_funil_id: string | null;
          p_implementacao_id: string | null;
          p_etapa_index: number | null;
          p_tentativa: number;
          p_modelo: string | null;
        };
        Returns: string;
      };
      registrar_fim_ia_operacao: {
        Args: {
          p_id: string;
          p_status: IaOperacaoStatus;
          p_duracao_ms: number;
          p_erro_codigo?: string | null;
          p_erro_mensagem_tecnica?: string | null;
          p_erro_mensagem_amigavel?: string | null;
        };
        Returns: undefined;
      };
      criar_versao_funil_a_partir_de: {
        Args: {
          p_mapeamento_id: string;
          p_versao_origem: number;
        };
        Returns: number;
      };
      corrigir_marco_cliente: {
        Args: {
          p_cliente_id: string;
          p_campo: string;
          p_novo_valor: string | null;
          p_justificativa: string;
        };
        Returns: undefined;
      };
      transferir_consultor_responsavel_implementacao: {
        Args: {
          p_implementacao_id: string;
          p_novo_consultor_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      mapeamento_status: MapeamentoStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
