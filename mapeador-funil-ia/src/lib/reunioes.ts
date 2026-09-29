// Módulo de reuniões da implementação — 7 tipos, cada um com seu próprio
// ciclo obrigatório de 10 dias (exceto Kickoff, que é o marco que define o
// dia 1, e Tira-dúvidas/Extraordinária, que são ad-hoc e não têm ciclo
// fixo). Kickoff e Treinamento continuam também sincronizando
// clientes.kickoff_realizado_em/treinamento_realizado_em ao serem salvos —
// ver comentário em src/types/database.ts (tipo Reuniao) e a migration
// 0041.
import { CICLOS_OPERACIONAIS, calcularDiaCiclo } from './atividadesCronograma';
import type { Reuniao, StatusReuniao, TipoReuniao } from '../types/database';

export const TIPO_REUNIAO_LABELS: Record<TipoReuniao, string> = {
  kickoff: 'Kickoff',
  treinamento: 'Treinamento',
  checkin_1: 'Check-in 1',
  checkin_2: 'Check-in 2',
  tira_duvidas: 'Tira-dúvidas',
  reuniao_final: 'Reunião final / Entrega',
  extraordinaria: 'Reunião extraordinária',
};

export const STATUS_REUNIAO_LABELS: Record<StatusReuniao, string> = {
  nao_agendada: 'Não agendada',
  agendada: 'Agendada',
  realizada: 'Realizada',
  remarcada: 'Remarcada',
  cliente_nao_compareceu: 'Cliente não compareceu',
  consultor_nao_compareceu: 'Consultor não compareceu',
  cancelada: 'Cancelada',
};

export const ORIGEM_REUNIAO_LABELS: Record<Reuniao['origem'], string> = {
  manual: 'Cadastrado manualmente',
  google_calendar: 'Sincronizado do Google Calendar',
};

export const STATUS_REUNIAO_TONE: Record<StatusReuniao, 'warning' | 'info' | 'success' | 'danger'> = {
  nao_agendada: 'warning',
  agendada: 'info',
  realizada: 'success',
  remarcada: 'info',
  cliente_nao_compareceu: 'danger',
  consultor_nao_compareceu: 'danger',
  cancelada: 'danger',
};

// Índice em CICLOS_OPERACIONAIS que cada tipo de reunião obrigatória precisa
// acontecer dentro — Kickoff não está aqui (ele É o que define o dia 1) nem
// Tira-dúvidas/Extraordinária (ad-hoc, sem ciclo fixo).
const CICLO_OBRIGATORIO_POR_TIPO: Partial<Record<TipoReuniao, number>> = {
  treinamento: 0,
  checkin_1: 1,
  checkin_2: 2,
  reuniao_final: 3,
};

export const TIPOS_REUNIAO_OBRIGATORIOS = Object.keys(CICLO_OBRIGATORIO_POR_TIPO) as TipoReuniao[];

export type AlertaReuniaoObrigatoria = {
  tipo: TipoReuniao;
  titulo: string;
  diasRestantesNoCiclo: number;
};

// Só dispara quando faltam poucos dias pro fim do ciclo daquele tipo e ele
// ainda não tem reunião marcada (nem "realizada", nem "agendada") — antes
// disso não é alerta, é só "ainda dá tempo".
const DIAS_LIMITE_PARA_ALERTAR = 5;

export function alertaReuniaoObrigatoria(params: {
  tipo: TipoReuniao;
  reunioesDoTipo: Reuniao[];
  kickoffRealizadoEm: string | null;
  hoje: Date;
}): AlertaReuniaoObrigatoria | null {
  const { tipo, reunioesDoTipo, kickoffRealizadoEm, hoje } = params;

  const indiceCiclo = CICLO_OBRIGATORIO_POR_TIPO[tipo];
  if (indiceCiclo == null || !kickoffRealizadoEm) return null;

  const jaMarcada = reunioesDoTipo.some((r) => r.status === 'agendada' || r.status === 'realizada');
  if (jaMarcada) return null;

  const diaCiclo = calcularDiaCiclo(kickoffRealizadoEm, hoje);
  if (!diaCiclo) return null;

  const ciclo = CICLOS_OPERACIONAIS[indiceCiclo];
  const diasRestantesNoCiclo = ciclo.diaFim - diaCiclo.dia;

  // Só alerta durante a janela do próprio ciclo (nunca antes dele começar,
  // nem depois que ele já passou — isso já vira "atraso" em outro lugar).
  if (diaCiclo.dia < ciclo.diaInicio || diasRestantesNoCiclo < 0 || diasRestantesNoCiclo > DIAS_LIMITE_PARA_ALERTAR) {
    return null;
  }

  return {
    tipo,
    titulo: `${TIPO_REUNIAO_LABELS[tipo]} ainda não agendado — restam ${diasRestantesNoCiclo}d no ${ciclo.nome}`,
    diasRestantesNoCiclo,
  };
}
