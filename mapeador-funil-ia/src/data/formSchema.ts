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
