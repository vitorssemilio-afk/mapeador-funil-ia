// Prompt 64, Bloco 6 (seções 36-43) — agregação estatística do Relatório de
// Respostas, extraída de RelatorioRespostas.tsx pra poder ser testada
// isoladamente (mesmo padrão de marcosCliente.ts no Bloco 2). Nenhuma regra
// nova de dado: só a mesma contagem/soma que já existia na página, mais o
// aviso de base estatística baixa (mesmo conceito de baseBaixa já usado em
// dashboardGerencial.ts, adaptado pra percentual — 1-2 respostas não sustenta
// uma porcentagem sem aviso).
import type { OpcaoPergunta, Pergunta } from '../data/formSchema';
import type { MapeamentoRespostaFlat } from '../types/database';

export const LIMITE_BASE_BAIXA = 2;

export type ItemFrequencia = { valor: string; label: string; contagem: number };

export type ResumoEscolha = {
  tipo: 'escolha';
  pergunta: Pergunta;
  itens: ItemFrequencia[];
  totalRespondentes: number;
  baseBaixa: boolean;
};

export type ResumoNumero = {
  tipo: 'numero';
  pergunta: Pergunta;
  totalRespondentes: number;
  media: number;
  minimo: number;
  maximo: number;
  baseBaixa: boolean;
};

export type ResumoPergunta = ResumoEscolha | ResumoNumero;

function labelDaOpcao(opcoes: OpcaoPergunta[] | undefined, valor: string): string {
  return opcoes?.find((o) => o.value === valor)?.label ?? valor;
}

export function resumirEscolha(pergunta: Pergunta, linhas: MapeamentoRespostaFlat[]): ResumoEscolha {
  const contagens = new Map<string, number>();

  for (const linha of linhas) {
    const bruta = linha.resposta_bruta;
    const valores = Array.isArray(bruta) ? (bruta as string[]) : [String(bruta)];
    for (const valor of valores) {
      if (!valor) continue;
      contagens.set(valor, (contagens.get(valor) ?? 0) + 1);
    }
  }

  const itens: ItemFrequencia[] = [...contagens.entries()]
    .map(([valor, contagem]) => ({ valor, label: labelDaOpcao(pergunta.opcoes, valor), contagem }))
    .sort((a, b) => b.contagem - a.contagem);

  return {
    tipo: 'escolha',
    pergunta,
    itens,
    totalRespondentes: linhas.length,
    baseBaixa: linhas.length <= LIMITE_BASE_BAIXA,
  };
}

export function resumirNumero(pergunta: Pergunta, linhas: MapeamentoRespostaFlat[]): ResumoNumero | null {
  // Number(null) é 0 — sem o filtro abaixo, uma pergunta não respondida
  // contaria como resposta "0" e puxaria a média pra baixo indevidamente.
  const valores = linhas
    .map((linha) => linha.resposta_bruta)
    .filter((v): v is string | number => v != null && v !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (valores.length === 0) return null;

  const soma = valores.reduce((s, v) => s + v, 0);

  return {
    tipo: 'numero',
    pergunta,
    totalRespondentes: valores.length,
    media: soma / valores.length,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
    baseBaixa: valores.length <= LIMITE_BASE_BAIXA,
  };
}
