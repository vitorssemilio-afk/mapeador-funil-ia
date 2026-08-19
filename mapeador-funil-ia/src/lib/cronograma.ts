import { calcularVencimento, diferencaEmDias, inicioDoDia } from './agendaImplementacao';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  ImplementacaoCrm,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
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
