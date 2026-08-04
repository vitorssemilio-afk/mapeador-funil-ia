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

export type CondicaoPergunta = {
  perguntaId: string;
  valores: string[];
};

export type Pergunta = {
  id: string;
  tipo: PerguntaTipo;
  label: string;
  helper?: string;
  opcoes?: OpcaoPergunta[];
  prefixo?: string;
  obrigatoria?: boolean;
  condicao?: CondicaoPergunta;
};

export type BlocoFormulario = {
  titulo: string;
  perguntas: Pergunta[];
};

// Uma pergunta condicional só aparece (e só entra no resumo/texto pra IA)
// quando a resposta da pergunta da qual ela depende bate com um dos valores
// esperados. Sem `condicao`, a pergunta é sempre visível.
export function perguntaVisivel(pergunta: Pergunta, respostas: Record<string, unknown>): boolean {
  if (!pergunta.condicao) return true;
  const valor = respostas[pergunta.condicao.perguntaId];
  const { valores } = pergunta.condicao;
  if (Array.isArray(valor)) return valor.some((v) => valores.includes(v as string));
  return typeof valor === 'string' && valores.includes(valor);
}