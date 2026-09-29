// Motor do cronograma por dependência: uma atividade só ganha data planejada
// depois que sua dependência (um marco do cliente, ou a implementação ter
// saído de um ciclo anterior) de fato aconteceu. Nunca gera todas as datas
// do projeto de uma vez — cada marco libera as próximas atividades.
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
} from '../types/database';

export type StatusAtividade =
  | 'aguardando_etapa_anterior'
  | 'agendado'
  | 'em_andamento'
  | 'concluido'
  | 'atrasado'
  | 'bloqueado_cliente';

export const STATUS_ATIVIDADE_LABELS: Record<StatusAtividade, string> = {
  aguardando_etapa_anterior: 'Aguardando etapa anterior',
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  atrasado: 'Atrasado',
  bloqueado_cliente: 'Bloqueado pelo cliente',
};

export const STATUS_ATIVIDADE_TONE: Record<StatusAtividade, 'warning' | 'info' | 'success' | 'danger'> = {
  aguardando_etapa_anterior: 'warning',
  agendado: 'info',
  em_andamento: 'info',
  concluido: 'success',
  atrasado: 'danger',
  bloqueado_cliente: 'danger',
};

export type AtividadeResolvida = {
  // null = atividade virtual (ex: Trial Kommo), calculada e não editável por aqui.
  id: string | null;
  nome: string;
  ciclo: string;
  responsavel: string | null;
  dependenciaLabel: string | null;
  prazoDias: number | null;
  dataLiberacao: Date | null;
  dataPlanejada: Date | null;
  dataReal: Date | null;
  agendadoPara: Date | null;
  atrasoDias: number;
  status: StatusAtividade;
  bloqueadoPeloCliente: boolean;
};

const ORDEM_STATUS_IMPL: Record<ImplementacaoStatus, number> = {
  preparacao_crm: 0,
  crm_em_configuracao: 1,
  treinamento_agendado: 2,
  automacoes: 3,
  entrega: 4,
  adocao: 5,
  concluida: 6,
  cancelada: 99,
};

const LABEL_CICLO_CHAVE: Partial<Record<string, string>> = {
  preparacao_crm: 'Preparação do CRM concluída',
  crm_em_configuracao: 'CRM em configuração concluída',
  treinamento_agendado: 'Treinamento agendado concluído',
  automacoes: 'Automações concluídas',
  entrega: 'Entrega concluída',
};

const LABEL_MARCO: Partial<Record<keyof Cliente, string>> = {
  contratado_em: 'Contratação',
  formulario_enviado_em: 'Formulário enviado',
  formulario_respondido_em: 'Formulário respondido',
  funil_gerado_em: 'Funil gerado',
  funil_revisado_em: 'Funil revisado internamente',
  kickoff_realizado_em: 'Kickoff realizado',
  conta_kommo_criada_em: 'Conta Kommo criada',
  treinamento_realizado_em: 'Treinamento realizado',
  implementacao_concluida_em: 'Implementação concluída',
};

function adicionarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function diferencaEmDias(depois: Date, antes: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((inicioDoDia(depois).getTime() - inicioDoDia(antes).getTime()) / MS_POR_DIA);
}

// Primeira vez que a implementação alcançou um status além do ciclo
// informado (ou seja, quando esse ciclo foi de fato concluído).
function dataLiberacaoCiclo(cicloChave: string, historico: ImplementacaoStatusHistorico[]): Date | null {
  const ordemCiclo = ORDEM_STATUS_IMPL[cicloChave as ImplementacaoStatus];
  if (ordemCiclo == null) return null;

  const candidatos = historico
    .filter((h) => ORDEM_STATUS_IMPL[h.status_novo] > ordemCiclo)
    .sort((a, b) => new Date(a.alterado_em).getTime() - new Date(b.alterado_em).getTime());

  return candidatos[0] ? new Date(candidatos[0].alterado_em) : null;
}

export function resolverAtividade(params: {
  atividade: AtividadeCronograma;
  statusRow: AtividadeStatusRow | null;
  historico: ImplementacaoStatusHistorico[];
  cliente: Cliente | null;
  hoje: Date;
}): AtividadeResolvida {
  const { atividade, statusRow, historico, cliente, hoje } = params;

  let liberada = true;
  let dataLiberacao: Date | null = null;
  let dependenciaLabel: string | null = null;

  if (atividade.depende_de?.startsWith('marco:')) {
    const campo = atividade.depende_de.slice('marco:'.length) as keyof Cliente;
    const valor = cliente?.[campo];
    liberada = typeof valor === 'string' && valor.length > 0;
    dataLiberacao = liberada ? new Date(valor as string) : null;
    dependenciaLabel = LABEL_MARCO[campo] ?? campo;
  } else if (atividade.depende_de?.startsWith('ciclo:')) {
    const cicloChave = atividade.depende_de.slice('ciclo:'.length);
    dataLiberacao = dataLiberacaoCiclo(cicloChave, historico);
    liberada = dataLiberacao !== null;
    dependenciaLabel = LABEL_CICLO_CHAVE[cicloChave] ?? cicloChave;
  }

  const bloqueadoPeloCliente = statusRow?.bloqueado_pelo_cliente ?? false;
  const dataReal = statusRow?.data_real ? new Date(statusRow.data_real) : null;
  const agendadoPara = statusRow?.agendado_para ? new Date(`${statusRow.agendado_para}T12:00:00`) : null;

  const dataPlanejada =
    liberada && dataLiberacao && atividade.prazo_dias != null
      ? adicionarDias(dataLiberacao, atividade.prazo_dias)
      : null;

  let status: StatusAtividade;
  let atrasoDias = 0;

  if (bloqueadoPeloCliente) {
    status = 'bloqueado_cliente';
  } else if (dataReal) {
    status = 'concluido';
  } else if (!liberada) {
    status = 'aguardando_etapa_anterior';
  } else if (agendadoPara && agendadoPara.getTime() > hoje.getTime()) {
    status = 'agendado';
  } else if (dataPlanejada && hoje.getTime() > dataPlanejada.getTime()) {
    status = 'atrasado';
    atrasoDias = diferencaEmDias(hoje, dataPlanejada);
  } else {
    status = 'em_andamento';
  }

  return {
    id: atividade.id,
    nome: atividade.nome,
    ciclo: atividade.ciclo,
    responsavel: atividade.responsavel_padrao,
    dependenciaLabel,
    prazoDias: atividade.prazo_dias,
    dataLiberacao,
    dataPlanejada,
    dataReal,
    agendadoPara,
    atrasoDias,
    status,
    bloqueadoPeloCliente,
  };
}

// Trial Kommo: 14 dias a partir da conta criada, +14 se a 1ª extensão foi
// aprovada, +7 se a 2ª também foi. Nunca inventa vencimento antes da conta
// existir — enquanto conta_kommo_criada_em não acontece, fica "aguardando
// etapa anterior" como qualquer outra atividade dependente de marco.
export function resolverTrialKommo(cliente: Cliente, hoje: Date): AtividadeResolvida {
  if (!cliente.conta_kommo_criada_em) {
    return {
      id: null,
      nome: 'Trial Kommo',
      ciclo: 'Trial Kommo',
      responsavel: null,
      dependenciaLabel: 'Conta Kommo criada',
      prazoDias: 14,
      dataLiberacao: null,
      dataPlanejada: null,
      dataReal: null,
      agendadoPara: null,
      atrasoDias: 0,
      status: 'aguardando_etapa_anterior',
      bloqueadoPeloCliente: false,
    };
  }

  const inicio = new Date(cliente.conta_kommo_criada_em);
  let vencimento = adicionarDias(inicio, 14);
  if (cliente.extensao_14_aprovada_em) vencimento = adicionarDias(vencimento, 14);
  if (cliente.extensao_7_aprovada_em) vencimento = adicionarDias(vencimento, 7);

  const atrasado = hoje.getTime() > vencimento.getTime();

  return {
    id: null,
    nome: 'Trial Kommo',
    ciclo: 'Trial Kommo',
    responsavel: null,
    dependenciaLabel: 'Conta Kommo criada',
    prazoDias: null,
    dataLiberacao: inicio,
    dataPlanejada: vencimento,
    dataReal: null,
    agendadoPara: null,
    atrasoDias: atrasado ? diferencaEmDias(hoje, vencimento) : 0,
    status: atrasado ? 'atrasado' : 'em_andamento',
    bloqueadoPeloCliente: false,
  };
}
