import {
  calcularVencimento,
  dataEntradaStatusAtual,
  diferencaEmDias,
  inicioDoDia,
} from './agendaImplementacao';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  ImplementacaoCrm,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
  Mapeamento,
} from '../types/database';

export const PX_POR_DIA = 26;

// Que status cada grupo de checklist representa — "semana_1" está dividida
// em duas sessões (chaves diferentes) mas as duas contam pra mesma fase do
// cronograma. Grupos sem fase própria (ex: "criterios_sucesso", que libera
// junto com a Semana 4 mas não tem uma janela de tempo exclusiva) retornam
// null e seus itens não entram no Gantt.
function statusDoGrupo(chave: string): ImplementacaoStatus | null {
  if (chave === 'pre_requisito') return 'pre_requisito';
  if (chave === 'semana_1' || chave === 'semana_1_sessao1' || chave === 'semana_1_sessao2') return 'semana_1';
  if (chave === 'semana_2') return 'semana_2';
  if (chave === 'semana_3') return 'semana_3';
  if (chave === 'semana_4') return 'semana_4';
  return null;
}

// Só essas fases têm uma janela de tempo própria — "concluida"/"cancelada"
// são estados finais, não uma fase com checklist e prazo.
const FASES_COM_DATA: ImplementacaoStatus[] = ['pre_requisito', 'semana_1', 'semana_2', 'semana_3', 'semana_4'];

export function adicionarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

export type FaseCronograma = {
  status: ImplementacaoStatus;
  titulo: string;
  inicio: Date;
  // null = a implementação ainda está nessa fase (não avançou pra próxima).
  fim: Date | null;
};

// Fases já alcançadas por uma implementação, com data real de início (pela
// primeira vez que o histórico registrou entrada nela) e fim (a entrada na
// fase seguinte do histórico, ou null se ainda não saiu dela). Fases futuras
// (ainda não alcançadas) não entram aqui — o Gantt só mostra o que já
// aconteceu de fato, sem projeção especulativa.
export function fasesImplementacao(
  implementacao: ImplementacaoCrm,
  historico: ImplementacaoStatusHistorico[],
): FaseCronograma[] {
  const linha = historico
    .filter((h) => h.implementacao_id === implementacao.id)
    .sort((a, b) => new Date(a.alterado_em).getTime() - new Date(b.alterado_em).getTime());

  const fases: FaseCronograma[] = [];

  for (let i = 0; i < linha.length; i++) {
    const status = linha[i].status_novo;
    if (!FASES_COM_DATA.includes(status)) continue;
    if (fases.some((f) => f.status === status)) continue;

    const proximaTransicao = linha.slice(i + 1).find((h) => h.status_novo !== status);
    fases.push({
      status,
      titulo: IMPLEMENTACAO_STATUS_LABELS[status],
      inicio: new Date(linha[i].alterado_em),
      fim: proximaTransicao ? new Date(proximaTransicao.alterado_em) : null,
    });
  }

  return fases;
}

export type ItemCronograma = {
  item: ChecklistItemImplementacao;
  grupoTitulo: string;
  grupoStatus: ImplementacaoStatus | null;
  feito: boolean;
  dataConclusao: Date | null;
  // Só existe se a fase do item já foi alcançada e o item tem dia definido.
  vencimento: Date | null;
  diasAtraso: number;
};

// Itens do checklist inteiro de uma implementação (todas as fases, feitas ou
// não), cada um com sua data de conclusão real (se feito) ou vencimento
// calculado (se pendente e a fase dele já começou) — pra render de uma linha
// por item no Gantt detalhado.
export function itensCronograma(params: {
  implementacao: ImplementacaoCrm;
  grupos: ChecklistGrupoImplementacao[];
  itens: ChecklistItemImplementacao[];
  marcados: Map<string, { marcado: boolean; marcadoEm: string | null }>;
  fases: FaseCronograma[];
  hoje: Date;
}): ItemCronograma[] {
  const { implementacao, grupos, itens, marcados, fases, hoje } = params;

  const itensDaImplementacao = itens.filter(
    (item) => item.implementacao_id === null || item.implementacao_id === implementacao.id,
  );

  return itensDaImplementacao
    .map((item) => {
      const grupo = grupos.find((g) => g.id === item.grupo_id);
      const grupoStatus = grupo ? statusDoGrupo(grupo.chave) : null;
      const fase = fases.find((f) => f.status === grupoStatus);
      const marcadoInfo = marcados.get(item.id);
      const feito = marcadoInfo?.marcado ?? false;

      const vencimento =
        !feito && fase && item.dia_semana != null ? calcularVencimento(fase.inicio, item.dia_semana) : null;

      return {
        item,
        grupoTitulo: grupo?.titulo ?? '—',
        grupoStatus,
        feito,
        dataConclusao: feito && marcadoInfo?.marcadoEm ? new Date(marcadoInfo.marcadoEm) : null,
        vencimento,
        diasAtraso: vencimento ? Math.max(0, diferencaEmDias(hoje, vencimento)) : 0,
      };
    })
    .sort((a, b) => {
      const grupoA = grupos.find((g) => g.id === a.item.grupo_id)?.ordem ?? 0;
      const grupoB = grupos.find((g) => g.id === b.item.grupo_id)?.ordem ?? 0;
      if (grupoA !== grupoB) return grupoA - grupoB;
      return a.item.ordem - b.item.ordem;
    });
}

export type EscalaTempo = {
  inicio: Date;
  totalDias: number;
};

// Escala compartilhada do eixo de tempo do Gantt: da menor data envolvida até
// a maior (ou hoje, o que for maior), com uma folga de 2 dias em cada ponta.
export function calcularEscala(datas: Date[], hoje: Date): EscalaTempo {
  const todasDatas = [...datas, hoje].filter((d) => !Number.isNaN(d.getTime()));
  const minTime = Math.min(...todasDatas.map((d) => d.getTime()));
  const maxTime = Math.max(...todasDatas.map((d) => d.getTime()));

  const inicio = adicionarDias(inicioDoDia(new Date(minTime)), -2);
  const fim = adicionarDias(inicioDoDia(new Date(maxTime)), 2);

  return { inicio, totalDias: Math.max(1, diferencaEmDias(fim, inicio)) };
}

export function diaParaPx(data: Date, escala: EscalaTempo): number {
  return diferencaEmDias(data, escala.inicio) * PX_POR_DIA;
}

export const ALTURA_RAIA = 32;

export type FaseComRaia = {
  fase: FaseCronograma;
  raia: number;
  left: number;
  width: number;
};

// Empacota fases que se sobrepõem no tempo em "raias" verticais dentro da
// mesma linha, pra nenhuma fase ficar visualmente escondida atrás de outra
// quando duas aconteceram no mesmo período (ex: entrou na Semana 2 no mesmo
// dia em que saiu da Semana 1).
export function empacotarFasesEmRaias(fases: FaseCronograma[], escala: EscalaTempo, hoje: Date): FaseComRaia[] {
  const fimPorRaia: number[] = [];
  const resultado: FaseComRaia[] = [];

  for (const fase of fases) {
    const inicioPx = diaParaPx(fase.inicio, escala);
    const fimPx = diaParaPx(fase.fim ?? hoje, escala);
    const largura = Math.max(PX_POR_DIA, fimPx - inicioPx);
    const direita = inicioPx + largura;

    let raia = fimPorRaia.findIndex((limite) => inicioPx >= limite);
    if (raia === -1) {
      raia = fimPorRaia.length;
      fimPorRaia.push(direita);
    } else {
      fimPorRaia[raia] = direita;
    }

    resultado.push({ fase, raia, left: inicioPx, width: largura });
  }

  return resultado;
}

// ============================================================
// Prazos e alertas de atraso
// ============================================================

// Duração planejada do POP inteiro (pré-requisito + semana_1..4), em dias
// corridos a partir de quando o cliente respondeu o formulário de
// mapeamento (não de quando a implementação foi criada — o pré-requisito
// pode ficar dias parado esperando o kickoff, e isso não deveria "esconder"
// atraso real do relógio geral).
export const DURACAO_TOTAL_DIAS = 40;

// Prazo "leve" de cada semana do checklist — combina com o padrão de item
// numerado de 1 a 7 (dia_semana) já usado na Agenda. A diferença entre a
// soma das 4 semanas (28) e o total do POP (40) é a folga de segurança do
// processo como um todo (pré-requisito + qualquer deslize).
export const PRAZO_DIAS_POR_SEMANA = 7;

const FASES_SEMANAIS: ImplementacaoStatus[] = ['semana_1', 'semana_2', 'semana_3', 'semana_4'];

// Instante em que o relógio dos 40 dias começa a contar: quando o cliente
// respondeu o formulário de mapeamento (mapeamentos.enviado_em). Mapeamentos
// enviados antes dessa coluna existir usam updated_at como aproximação (via
// backfill da migration); sem nenhum dos dois, cai pro created_at do
// mapeamento como último recurso.
export function dataInicioProcesso(
  mapeamento: Pick<Mapeamento, 'enviado_em' | 'created_at'>,
): Date {
  return new Date(mapeamento.enviado_em ?? mapeamento.created_at);
}

export function dataPrevistaConclusao(inicioProcesso: Date): Date {
  return adicionarDias(inicioProcesso, DURACAO_TOTAL_DIAS);
}

export type PrazoFase = {
  prazo: Date;
  diasRestantes: number;
  atrasada: boolean;
  diasAtraso: number;
};

// Prazo da semana atual (só existe pra semana_1..4 — pré-requisito e estados
// finais não têm uma janela própria). Conta a partir de quando a
// implementação de fato entrou nesse status, não do início do processo.
export function prazoFaseAtual(
  implementacao: ImplementacaoCrm,
  historico: ImplementacaoStatusHistorico[],
  hoje: Date,
): PrazoFase | null {
  if (!FASES_SEMANAIS.includes(implementacao.status)) return null;

  const inicioFase = dataEntradaStatusAtual(implementacao, historico);
  const prazo = adicionarDias(inicioFase, PRAZO_DIAS_POR_SEMANA);
  const diasRestantes = diferencaEmDias(prazo, hoje);

  return {
    prazo,
    diasRestantes,
    atrasada: diasRestantes < 0,
    diasAtraso: Math.max(0, -diasRestantes),
  };
}

export type PrazoGeral = {
  inicioProcesso: Date;
  prazoConclusao: Date;
  diasRestantes: number;
  atrasada: boolean;
  diasAtraso: number;
};

// Prazo do processo inteiro (os 40 dias corridos), só relevante enquanto a
// implementação ainda está em andamento — concluída/cancelada não "atrasa"
// mais.
export function prazoGeral(
  implementacao: ImplementacaoCrm,
  mapeamento: Pick<Mapeamento, 'enviado_em' | 'created_at'>,
  hoje: Date,
): PrazoGeral | null {
  if (implementacao.status === 'concluida' || implementacao.status === 'cancelada') return null;

  const inicioProcesso = dataInicioProcesso(mapeamento);
  const prazoConclusao = dataPrevistaConclusao(inicioProcesso);
  const diasRestantes = diferencaEmDias(prazoConclusao, hoje);

  return {
    inicioProcesso,
    prazoConclusao,
    diasRestantes,
    atrasada: diasRestantes < 0,
    diasAtraso: Math.max(0, -diasRestantes),
  };
}

export type TempoAteReuniao = {
  dias: number;
  // false = a implementação ainda está no pré-requisito (tempo ainda
  // correndo); true = já saiu dele, o número é definitivo.
  concluido: boolean;
};

// Quanto tempo levou (ou está levando) entre o cliente responder o
// formulário e a implementação sair do pré-requisito (proxy pra "primeira
// reunião" — é o marco que o histórico de fato registra).
export function tempoAteReuniao(
  implementacao: ImplementacaoCrm,
  historico: ImplementacaoStatusHistorico[],
  mapeamento: Pick<Mapeamento, 'enviado_em' | 'created_at'>,
  hoje: Date,
): TempoAteReuniao {
  const inicioProcesso = dataInicioProcesso(mapeamento);

  const saidaPreRequisito = historico
    .filter((h) => h.implementacao_id === implementacao.id && h.status_novo !== 'pre_requisito')
    .sort((a, b) => new Date(a.alterado_em).getTime() - new Date(b.alterado_em).getTime())[0];

  if (saidaPreRequisito) {
    return {
      dias: Math.max(0, diferencaEmDias(new Date(saidaPreRequisito.alterado_em), inicioProcesso)),
      concluido: true,
    };
  }

  return { dias: Math.max(0, diferencaEmDias(hoje, inicioProcesso)), concluido: false };
}
