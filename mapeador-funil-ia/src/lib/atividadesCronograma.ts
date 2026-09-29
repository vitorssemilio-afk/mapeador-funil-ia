// Motor do cronograma por dependência: uma atividade só ganha data planejada
// depois que sua dependência (um marco do cliente, ou a implementação ter
// saído de um ciclo anterior) de fato aconteceu. Nunca gera todas as datas
// do projeto de uma vez — cada marco libera as próximas atividades.
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ImpactoResponsavel,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
  MarcoRemarcacao,
} from '../types/database';

export const IMPACTO_RESPONSAVEL_LABELS: Record<ImpactoResponsavel, string> = {
  cliente: 'Cliente',
  consultor: 'Consultor',
  v4: 'V4',
  problema_tecnico: 'Problema técnico',
  outro: 'Outro',
};

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
  // Dia do projeto (contado do Kickoff realizado) em que isso aconteceu ou
  // está previsto — null se ainda não há kickoff realizado ou nenhuma data
  // conhecida pra essa atividade.
  diaDesdeKickoff: number | null;
  // Janela fixa de 10 dias por ciclo (ver JANELA_CICLO_DIAS abaixo) —
  // independente de prazoDias/atrasoDias, que é sobre o prazo PRÓPRIO da
  // atividade. Uma atividade pode estar dentro do seu prazo_dias e ainda
  // assim fora da janela do ciclo (ou vice-versa): são dois alertas
  // diferentes, mostrados lado a lado.
  foraDaJanelaDoCiclo: boolean;
  diasAcimaDaJanela: number;
  // Só preenchido pros marcos remarcáveis (Kickoff/Treinamento) que já foram
  // remarcados — diferença entre a data agendada atual e a PRIMEIRA data que
  // esse marco já teve. Atividades normais nunca têm remarcação própria.
  deslocamentoDias: number | null;
};

// Janela estrutural de 10 dias por ciclo, contada a partir do Kickoff
// realizado — a regra nova dos "40 dias em 4 ciclos de 10". É fixa e não
// muda com prazo_dias de cada atividade nem com o quanto o ciclo anterior
// demorou; só serve pra sinalizar "isso passou do dia X do projeto", nunca
// pra empurrar o prazo geral de 40 dias (esse continua ancorado só em
// kickoff_realizado_em, ver cronograma.ts).
const JANELA_CICLO_DIAS: Partial<Record<string, number>> = {
  'Preparação do CRM': 10,
  'CRM em configuração': 10,
  'Treinamento agendado': 10,
  'Automações I': 20,
  'Automações II': 30,
  Entrega: 40,
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

// Calcula diaDesdeKickoff/foraDaJanelaDoCiclo/diasAcimaDaJanela a partir de
// uma data de referência (real, se já aconteceu; senão a planejada/agendada)
// e do limite de dias da janela do ciclo — usado tanto por resolverAtividade
// quanto por resolverMarcoAgendavel, pra manter os dois cálculos idênticos.
function calcularJanelaCiclo(
  dataReferencia: Date | null,
  kickoffRealizadoEm: string | null,
  limiteDias: number | undefined,
): { diaDesdeKickoff: number | null; foraDaJanelaDoCiclo: boolean; diasAcimaDaJanela: number } {
  if (!dataReferencia || !kickoffRealizadoEm) {
    return { diaDesdeKickoff: null, foraDaJanelaDoCiclo: false, diasAcimaDaJanela: 0 };
  }

  const diaDesdeKickoff = diferencaEmDias(dataReferencia, new Date(kickoffRealizadoEm));
  if (limiteDias == null) {
    return { diaDesdeKickoff, foraDaJanelaDoCiclo: false, diasAcimaDaJanela: 0 };
  }

  const diasAcimaDaJanela = Math.max(0, diaDesdeKickoff - limiteDias);
  return { diaDesdeKickoff, foraDaJanelaDoCiclo: diasAcimaDaJanela > 0, diasAcimaDaJanela };
}

// Quando um marco "_realizado_em" ainda não aconteceu, mas o "_agendado_para"
// irmão já foi marcado, a dependência é tratada como liberada por PROJEÇÃO —
// é exatamente isso que faz as atividades dependentes moverem a data
// planejada sozinhas assim que alguém agenda ou remarca o Kickoff/Treinamento,
// sem esperar a reunião de fato acontecer nem precisar de um recálculo manual.
const CAMPO_AGENDADO_IRMAO: Partial<Record<string, keyof Cliente>> = {
  kickoff_realizado_em: 'kickoff_agendado_para',
  treinamento_realizado_em: 'treinamento_agendado_para',
};

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

    if (!liberada) {
      const campoIrmao = CAMPO_AGENDADO_IRMAO[campo];
      const valorAgendado = campoIrmao ? cliente?.[campoIrmao] : null;
      if (typeof valorAgendado === 'string' && valorAgendado.length > 0) {
        liberada = true;
        dataLiberacao = new Date(`${valorAgendado}T12:00:00`);
      }
    }
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

  const janela = calcularJanelaCiclo(
    dataReal ?? dataPlanejada,
    cliente?.kickoff_realizado_em ?? null,
    JANELA_CICLO_DIAS[atividade.ciclo],
  );

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
    ...janela,
    deslocamentoDias: null,
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
      diaDesdeKickoff: null,
      foraDaJanelaDoCiclo: false,
      diasAcimaDaJanela: 0,
      deslocamentoDias: null,
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
    diaDesdeKickoff: null,
    foraDaJanelaDoCiclo: false,
    diasAcimaDaJanela: 0,
    deslocamentoDias: null,
  };
}

// Marco agendável (Kickoff/Treinamento): diferente das atividades comuns, a
// "data planejada" é diretamente a data agendada (não prazo_dias somado a
// uma liberação) — e pode ter sido remarcada uma ou mais vezes, o que o
// cliente relatou como cenário concreto: reagenda o Treinamento pra depois,
// e quer ver isso refletido como "Treinamento — 08/10 — remarcado em +4
// dias", sem perder a data original nem empurrar o prazo geral de 40 dias.
export function resolverMarcoAgendavel(params: {
  nome: string;
  ciclo: string;
  agendadoPara: string | null;
  realizadoEm: string | null;
  remarcacoes: MarcoRemarcacao[];
  kickoffRealizadoEm: string | null;
  diaLimiteCiclo: number;
  dependenciaLabel?: string | null;
  hoje: Date;
}): AtividadeResolvida {
  const {
    nome,
    ciclo,
    agendadoPara: agendadoParaRaw,
    realizadoEm,
    remarcacoes,
    kickoffRealizadoEm,
    diaLimiteCiclo,
    dependenciaLabel = 'Kickoff realizado',
    hoje,
  } = params;

  const dataReal = realizadoEm ? new Date(realizadoEm) : null;
  const agendadoPara = agendadoParaRaw ? new Date(`${agendadoParaRaw}T12:00:00`) : null;
  const dataPlanejada = agendadoPara;

  let status: StatusAtividade;
  if (dataReal) {
    status = 'concluido';
  } else if (agendadoPara && agendadoPara.getTime() > hoje.getTime()) {
    status = 'agendado';
  } else if (agendadoPara) {
    status = 'em_andamento';
  } else {
    status = kickoffRealizadoEm ? 'em_andamento' : 'aguardando_etapa_anterior';
  }

  const janela = calcularJanelaCiclo(dataReal ?? dataPlanejada, kickoffRealizadoEm, diaLimiteCiclo);

  // Deslocamento = diferença entre a PRIMEIRA data que esse marco já teve
  // (o data_anterior mais antigo registrado) e a data atual (a real, se já
  // aconteceu; senão a agendada) — null se nunca foi remarcado, ou se nem a
  // primeira remarcação tem de onde partir (data_anterior nula, marco que
  // não tinha data agendada antes da 1ª vez que foi marcado).
  let deslocamentoDias: number | null = null;
  if (remarcacoes.length > 0) {
    const maisAntiga = [...remarcacoes].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[0];
    const dataOriginal = maisAntiga.data_anterior ? new Date(`${maisAntiga.data_anterior}T12:00:00`) : null;
    const dataAtual = dataReal ?? agendadoPara;
    if (dataOriginal && dataAtual) {
      deslocamentoDias = diferencaEmDias(dataAtual, dataOriginal);
    }
  }

  return {
    id: null,
    nome,
    ciclo,
    responsavel: null,
    dependenciaLabel,
    prazoDias: null,
    dataLiberacao: null,
    dataPlanejada,
    dataReal,
    agendadoPara,
    atrasoDias: 0,
    status,
    bloqueadoPeloCliente: false,
    ...janela,
    deslocamentoDias,
  };
}
