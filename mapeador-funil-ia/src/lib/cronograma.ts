import { diferencaEmDias, inicioDoDia } from './agendaImplementacao';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import type { ImplementacaoCrm, ImplementacaoStatus, ImplementacaoStatusHistorico } from '../types/database';

export const PX_POR_DIA = 26;

// Só essas fases têm uma janela de tempo própria — "adocao"/"concluida"/
// "cancelada" são estados finais/de acompanhamento, não uma fase com
// checklist e prazo semanal.
const FASES_COM_DATA: ImplementacaoStatus[] = [
  'preparacao_crm',
  'crm_em_configuracao',
  'treinamento_agendado',
  'automacoes',
  'entrega',
];

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
// Tempo até a 1ª reunião (informativo — não é sinal de atraso/saúde; esse
// vem só de atividadesCronograma.ts/operacaoResumo.ts, ver P1-A4)
// ============================================================

export type TempoAteReuniao = {
  dias: number;
  // false = a implementação ainda está no pré-requisito (tempo ainda
  // correndo); true = já saiu dele, o número é definitivo.
  concluido: boolean;
};

// Quanto tempo levou (ou está levando) entre o Kickoff realizado e a
// implementação sair da Preparação do CRM.
export function tempoAteReuniao(
  implementacao: ImplementacaoCrm,
  historico: ImplementacaoStatusHistorico[],
  kickoffRealizadoEm: string | null,
  hoje: Date,
): TempoAteReuniao | null {
  if (!kickoffRealizadoEm) return null;
  const inicioProcesso = new Date(kickoffRealizadoEm);

  const saidaPreRequisito = historico
    .filter((h) => h.implementacao_id === implementacao.id && h.status_novo !== 'preparacao_crm')
    .sort((a, b) => new Date(a.alterado_em).getTime() - new Date(b.alterado_em).getTime())[0];

  if (saidaPreRequisito) {
    return {
      dias: Math.max(0, diferencaEmDias(new Date(saidaPreRequisito.alterado_em), inicioProcesso)),
      concluido: true,
    };
  }

  return { dias: Math.max(0, diferencaEmDias(hoje, inicioProcesso)), concluido: false };
}
