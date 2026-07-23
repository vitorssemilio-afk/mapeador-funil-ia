export type MapeamentoStatus =
  | 'em_preenchimento'
  | 'processando_ia'
  | 'concluido'
  | 'erro';

export type Mapeamento = {
  id: string;
  user_id: string;
  nome_negocio: string;
  status: MapeamentoStatus;
  respostas: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TipoFunil =
  | 'qualificacao'
  | 'vendas'
  | 'comparecimento'
  | 'pos_venda'
  | 'outro';

export type EtapaFunil = {
  nome: string;
  objetivo: string;
  gatilho_entrada: string;
  gatilho_saida: string;
  tarefas: string[];
  campos_obrigatorios: string[];
  campos_desejaveis: string[];
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
      campos_padrao: {
        Row: CampoPadrao;
        Insert: Partial<CampoPadrao> & Pick<CampoPadrao, 'entidade' | 'nome_campo' | 'tipo'>;
        Update: Partial<CampoPadrao>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      mapeamento_status: MapeamentoStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
