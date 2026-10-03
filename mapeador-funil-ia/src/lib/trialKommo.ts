// Controle completo do Trial Kommo: 3 períodos (14 + 7 + 14 = 35 dias no
// máximo), começando em conta_kommo_criada_em. A primeira extensão concedida
// é a de 7 dias, a segunda é a de 14 — os campos `extensao_14_*`/
// `extensao_7_*` em `clientes` continuam nomeados pela DURAÇÃO que cada um
// concede (não pela ordem), então nada muda no banco: só a ordem em que são
// aplicados aqui. Independente do prazo de 40 dias da implementação (esse é
// ancorado no Kickoff — ver cronograma.ts) — os dois indicadores nunca se
// misturam.
import type { Cliente } from '../types/database';

export type StatusTrial =
  | 'ativo'
  | 'proximo_vencimento'
  | 'extensao_pendente'
  | 'extensao_solicitada'
  | 'estendido'
  | 'encerrado';

export const STATUS_TRIAL_LABELS: Record<StatusTrial, string> = {
  ativo: 'Ativo',
  proximo_vencimento: 'Próximo do vencimento',
  extensao_pendente: 'Extensão pendente',
  extensao_solicitada: 'Extensão solicitada',
  estendido: 'Estendido',
  encerrado: 'Encerrado',
};

export const STATUS_TRIAL_TONE: Record<StatusTrial, 'warning' | 'info' | 'success' | 'danger'> = {
  ativo: 'success',
  proximo_vencimento: 'warning',
  extensao_pendente: 'danger',
  extensao_solicitada: 'info',
  estendido: 'info',
  encerrado: 'danger',
};

export const DIAS_TRIAL_INICIAL = 14;
export const DIAS_EXTENSAO_14 = 14;
export const DIAS_EXTENSAO_7 = 7;
export const DIAS_TRIAL_MAXIMO = DIAS_TRIAL_INICIAL + DIAS_EXTENSAO_14 + DIAS_EXTENSAO_7; // 35

// A que distância do vencimento os alertas de "próximo do vencimento" devem
// disparar — 5, 3, 1 e 0 (no próprio dia).
const DIAS_ALERTA = [5, 3, 1, 0];

export type ProximaExtensaoTrial = {
  rotulo: string; // "+14 dias" | "+7 dias"
  dias: number;
  solicitadaEm: string | null;
  aprovadaEm: string | null;
};

export type ResumoTrialKommo = {
  status: StatusTrial;
  periodoAtual: 'Trial inicial' | 'Primeira extensão' | 'Segunda extensão';
  diaAtualPeriodo: number; // 1-based, dentro da duração do período atual
  duracaoPeriodoAtual: number; // 14, 14 ou 7
  usoTotalDias: number; // dias corridos desde conta_kommo_criada_em, 1-based
  usoTotalMaximo: number; // 35
  diasRestantes: number; // do período atual — pode ser negativo (já venceu)
  vencimento: Date;
  proximaExtensao: ProximaExtensaoTrial | null; // null = já usou as duas (2ª aprovada)
  precisaAlerta: boolean; // dias restantes bate um dos gatilhos (5/3/1/0) e a próxima extensão ainda não foi sequer solicitada
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

export type ConfiguracaoTrialKommo = {
  diasInicial: number;
  diasExtensao14: number;
  diasExtensao7: number;
  diasAlerta: number[];
};

export const CONFIGURACAO_TRIAL_PADRAO: ConfiguracaoTrialKommo = {
  diasInicial: DIAS_TRIAL_INICIAL,
  diasExtensao14: DIAS_EXTENSAO_14,
  diasExtensao7: DIAS_EXTENSAO_7,
  diasAlerta: DIAS_ALERTA,
};

// null = Trial ainda não começou (conta Kommo ainda não foi criada) — nunca
// mostra período/vencimento antes disso. `config` é opcional e default pros
// 3 períodos + alertas hardcoded — a área de Configurações resolve o valor
// certo por cliente (snapshot do Kickoff, ou a config global pra quem
// ainda não teve Kickoff) e passa aqui.
export function resolverResumoTrialKommo(
  cliente: Cliente,
  hoje: Date,
  config: ConfiguracaoTrialKommo = CONFIGURACAO_TRIAL_PADRAO,
): ResumoTrialKommo | null {
  if (!cliente.conta_kommo_criada_em) return null;

  const { diasInicial, diasExtensao14, diasExtensao7, diasAlerta } = config;

  const inicio = new Date(cliente.conta_kommo_criada_em);
  const vencimentoTrialInicial = adicionarDias(inicio, diasInicial);
  // Primeira extensão concedida = +7 dias (campos extensao_7_*); segunda =
  // +14 dias (campos extensao_14_*) — ordem invertida em relação ao nome
  // dos campos, de propósito (ver comentário no topo do arquivo). As duas
  // contam de forma INDEPENDENTE (nunca uma exige a outra ter sido aprovada
  // antes) — clientes que já tinham extensao_14_aprovada_em preenchido de
  // quando a 2ª extensão ainda não existia continuam com esses dias
  // contados normalmente, sem perder nada retroativamente.
  const primeiraExtensaoAprovada = !!cliente.extensao_7_aprovada_em;
  const segundaExtensaoAprovada = !!cliente.extensao_14_aprovada_em;

  const vencimentoAposPrimeira = primeiraExtensaoAprovada
    ? adicionarDias(vencimentoTrialInicial, diasExtensao7)
    : vencimentoTrialInicial;
  const vencimento = segundaExtensaoAprovada ? adicionarDias(vencimentoAposPrimeira, diasExtensao14) : vencimentoAposPrimeira;

  const periodoAtual: ResumoTrialKommo['periodoAtual'] = segundaExtensaoAprovada
    ? 'Segunda extensão'
    : primeiraExtensaoAprovada
      ? 'Primeira extensão'
      : 'Trial inicial';
  const duracaoPeriodoAtual = segundaExtensaoAprovada ? diasExtensao14 : primeiraExtensaoAprovada ? diasExtensao7 : diasInicial;
  const inicioPeriodoAtual = segundaExtensaoAprovada
    ? vencimentoAposPrimeira
    : primeiraExtensaoAprovada
      ? vencimentoTrialInicial
      : inicio;

  const diaAtualPeriodo = diferencaEmDias(hoje, inicioPeriodoAtual) + 1;
  const usoTotalDias = diferencaEmDias(hoje, inicio) + 1;
  const diasRestantes = diferencaEmDias(vencimento, hoje);

  const proximaExtensao: ProximaExtensaoTrial | null = segundaExtensaoAprovada
    ? null
    : primeiraExtensaoAprovada
      ? {
          rotulo: '+14 dias',
          dias: diasExtensao14,
          solicitadaEm: cliente.extensao_14_solicitada_em,
          aprovadaEm: cliente.extensao_14_aprovada_em,
        }
      : {
          rotulo: '+7 dias',
          dias: diasExtensao7,
          solicitadaEm: cliente.extensao_7_solicitada_em,
          aprovadaEm: cliente.extensao_7_aprovada_em,
        };

  const solicitada = !!proximaExtensao?.solicitadaEm && !proximaExtensao.aprovadaEm;

  const maiorAlerta = Math.max(...diasAlerta);

  let status: StatusTrial;
  if (!proximaExtensao && diasRestantes < 0) {
    status = 'encerrado';
  } else if (solicitada) {
    status = 'extensao_solicitada';
  } else if (proximaExtensao && diasRestantes < 0) {
    status = 'extensao_pendente';
  } else if (diasRestantes <= maiorAlerta) {
    status = 'proximo_vencimento';
  } else if (primeiraExtensaoAprovada || segundaExtensaoAprovada) {
    status = 'estendido';
  } else {
    status = 'ativo';
  }

  const precisaAlerta = !solicitada && !!proximaExtensao && diasAlerta.some((d) => diasRestantes <= d);

  return {
    status,
    periodoAtual,
    diaAtualPeriodo,
    duracaoPeriodoAtual,
    usoTotalDias,
    usoTotalMaximo: diasInicial + diasExtensao14 + diasExtensao7,
    diasRestantes,
    vencimento,
    proximaExtensao,
    precisaAlerta,
  };
}
