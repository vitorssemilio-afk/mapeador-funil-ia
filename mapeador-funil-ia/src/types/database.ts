export type MapeamentoStatus =
  | 'em_preenchimento'
  | 'processando_ia'
  | 'aguardando_esclarecimento'
  | 'concluido'
  | 'erro';

export type Mapeamento = {
  id: string;
  user_id: string;
  nome_negocio: string;
  status: MapeamentoStatus;
  respostas: Record<string, unknown>;
  enviado_pelo_cliente: boolean;
  codigo_curto: string;
  created_at: string;
  updated_at: string;
};

export type MapeamentoPublico = {
  id: string;
  nome_negocio: string;
  respostas: Record<string, unknown>;
  enviado_pelo_cliente: boolean;
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
  created_at: string;
  updated_at: string;
};

export type ImplementacaoStatus =
  | 'pre_requisito'
  | 'semana_1'
  | 'semana_2'
  | 'semana_3'
  | 'semana_4'
  | 'concluida'
  | 'cancelada';

export type ImplementacaoCrm = {
  id: string;
  mapeamento_id: string;
  user_id: string;
  nome_cliente: string;
  consultor_responsavel: string | null;
  stakeholder_decisor: string | null;
  status: ImplementacaoStatus;
  conta_criada_via_v4: boolean;
  email_conta_kommo: string | null;
  whatsapp_corporativo_confirmado: boolean;
  acesso_facebook_confirmado: boolean;
  plano_contratado: string | null;
  periodo_contratado: string | null;
  data_decisao_plano: string | null;
  observacoes: string | null;
  created_at: string;
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

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13';
  };
  public: {
    Tables: {
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
    };
    Views: {
      [_ in never]: never;
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
    };
    Enums: {
      mapeamento_status: MapeamentoStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
