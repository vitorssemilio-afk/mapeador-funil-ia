// Consolida os dados que já existem no banco (mapeamentos, implementações,
// checklist, prazos) numa visão por cliente pra alimentar o dashboard
// "Operação CRM". Não inventa dado nenhum: onde a informação ainda não
// existe no produto (agenda do Google Calendar), os campos ficam null/vazios
// de propósito, prontos pra serem preenchidos quando essas integrações
// existirem — nunca com valor fictício.
//
// P1-A4 da auditoria funcional: esta é a ÚNICA fonte de verdade pra saúde,
// prazo e atraso da implementação — Home/Dashboard, ficha do cliente e
// qualquer outra tela leem daqui. Antes disso existiam DOIS motores
// paralelos: este (baseado em atividadesCronograma.ts, ciclos de 40 dias a
// partir do Kickoff realizado) e um antigo em cronograma.ts
// (prazoFaseAtual/prazoGeral, semanal, ancorado em quando alguém atualizou
// manualmente o `status` da implementação) — os dois podiam discordar sobre
// se um cliente estava atrasado. O motor semanal foi removido; cronograma.ts
// mantém só os helpers de visualização do Gantt histórico (fasesImplementacao
// etc.), que não calculam atraso/saúde.
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import {
  calcularDiaCiclo,
  resolverAtividade,
  type AtividadeResolvida,
  type DiaCiclo,
} from './atividadesCronograma';
import { CATEGORIA_OCORRENCIA_LABELS } from './ocorrencias';
import { alertaReuniaoObrigatoria, TIPOS_REUNIAO_OBRIGATORIOS } from './reunioes';
import { funilValidado, MAPEAMENTO_STATUS_LABELS } from './statusFluxo';
import { resolverResumoTrialKommo, type ResumoTrialKommo } from './trialKommo';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ClienteOcorrencia,
  Consultor,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
  Mapeamento,
  Reuniao,
} from '../types/database';

export function nomeConsultor(consultorId: string | null, consultores: Consultor[]): string | null {
  if (!consultorId) return null;
  return consultores.find((c) => c.id === consultorId)?.nome ?? null;
}

function emailConsultor(consultorId: string | null, consultores: Consultor[]): string | null {
  if (!consultorId) return null;
  return consultores.find((c) => c.id === consultorId)?.email ?? null;
}

export type SaudeCliente = 'normal' | 'atencao' | 'critico' | 'aguardando_cliente' | 'concluido';

export const SAUDE_LABELS: Record<SaudeCliente, string> = {
  normal: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
  aguardando_cliente: 'Aguardando cliente',
  concluido: 'Concluído',
};

export type ClienteResumo = {
  cliente: Cliente;
  vendas: Mapeamento | null;
  posVenda: Mapeamento | null;
  implementacao: ImplementacaoCrm | null;
  faseAtual: string;
  saude: SaudeCliente;
  // 0-100, null quando ainda não há implementação (nada pra progredir).
  progresso: number | null;
  proximaAcao: string;
  // Dia do projeto/ciclo atual (ver atividadesCronograma.ts) — null sem
  // Kickoff realizado ainda. Única fonte de "atraso geral" da implementação.
  diaCiclo: DiaCiclo | null;
  // Atividades do cronograma com status 'atrasado' agora — mesmo cálculo
  // usado na tela da implementação (resolverAtividade), nunca uma versão
  // simplificada à parte.
  atividadesAtrasadas: AtividadeResolvida[];
  trial: ResumoTrialKommo | null;
  reuniaoObrigatoriaPendente: boolean;
  consultor: string | null;
  consultorEmail: string | null;
  consultorApoio: string | null;
};

export type AlertaOperacao = {
  clienteId: string;
  clienteNome: string;
  motivo: string;
  prazoLabel: string | null;
  proximaAcao: string;
  consultor: string | null;
  severidade: 'atencao' | 'critico';
};

function preRequisitoCompleto(impl: ImplementacaoCrm): boolean {
  return (
    (impl.email_conta_kommo ?? '').trim().length > 0 &&
    impl.whatsapp_corporativo_confirmado &&
    impl.acesso_facebook_confirmado
  );
}

function progressoImplementacao(
  implementacaoId: string,
  atividades: AtividadeCronograma[],
  statusRows: AtividadeStatusRow[],
): number | null {
  const atividadesVisiveis = atividades.filter(
    (a) => a.implementacao_id === null || a.implementacao_id === implementacaoId,
  );
  if (atividadesVisiveis.length === 0) return null;

  const feitas = atividadesVisiveis.filter((a) =>
    statusRows.some((s) => s.implementacao_id === implementacaoId && s.atividade_id === a.id && s.data_real),
  ).length;
  return Math.round((feitas / atividadesVisiveis.length) * 100);
}

// Todas as atividades do cronograma dessa implementação, já resolvidas
// (status/atraso/dependência) pelo mesmo motor usado em ImplementacaoDetalhe
// — nunca uma segunda fórmula de atraso aqui.
function resolverAtividadesDaImplementacao(params: {
  implementacaoId: string;
  atividades: AtividadeCronograma[];
  statusRows: AtividadeStatusRow[];
  historico: ImplementacaoStatusHistorico[];
  cliente: Cliente;
  reunioes: Reuniao[];
  hoje: Date;
}): AtividadeResolvida[] {
  const { implementacaoId, atividades, statusRows, historico, cliente, reunioes, hoje } = params;
  const atividadesVisiveis = atividades.filter(
    (a) => a.implementacao_id === null || a.implementacao_id === implementacaoId,
  );
  const historicoDaImplementacao = historico.filter((h) => h.implementacao_id === implementacaoId);

  return atividadesVisiveis.map((atividade) =>
    resolverAtividade({
      atividade,
      statusRow:
        statusRows.find((s) => s.implementacao_id === implementacaoId && s.atividade_id === atividade.id) ?? null,
      historico: historicoDaImplementacao,
      cliente,
      reunioes,
      hoje,
    }),
  );
}

function faseAtualLabel(vendas: Mapeamento | null, implementacao: ImplementacaoCrm | null): string {
  if (implementacao) return IMPLEMENTACAO_STATUS_LABELS[implementacao.status];
  if (!vendas) return 'Sem mapeamento';
  if (vendas.status === 'em_preenchimento') return vendas.enviado_pelo_cliente ? 'Cliente respondeu' : 'Aguardando formulário';
  if (vendas.status === 'processando_ia') return 'Gerando funil';
  if (vendas.status === 'aguardando_esclarecimento') return 'IA pediu esclarecimento';
  if (vendas.status === 'erro') return 'Erro na geração';
  return MAPEAMENTO_STATUS_LABELS[vendas.status];
}

function proximaAcaoLabel(params: {
  vendas: Mapeamento | null;
  posVenda: Mapeamento | null;
  implementacao: ImplementacaoCrm | null;
  precisaPosVenda: boolean;
  temAtividadeAtrasada: boolean;
}): string {
  const { vendas, posVenda, implementacao, precisaPosVenda, temAtividadeAtrasada } = params;

  if (!vendas) return 'Criar mapeamento de vendas';
  if (vendas.status === 'em_preenchimento') {
    return vendas.enviado_pelo_cliente ? 'Gerar funil de vendas' : 'Enviar link do formulário';
  }
  if (vendas.status === 'aguardando_esclarecimento') return 'Responder esclarecimento da IA';
  if (vendas.status === 'processando_ia') return 'Aguardando geração do funil';
  if (vendas.status === 'erro') return 'Revisar e tentar gerar o funil de novo';

  if (!implementacao) {
    return funilValidado(vendas.status)
      ? 'Iniciar implementação de CRM'
      : `Avançar o funil — ${MAPEAMENTO_STATUS_LABELS[vendas.status]}`;
  }
  if (implementacao.status === 'concluida') return 'Nenhuma — implementação concluída';
  if (implementacao.status === 'preparacao_crm' && !preRequisitoCompleto(implementacao)) {
    return 'Confirmar pré-requisitos (acessos)';
  }
  if (precisaPosVenda) return 'Enviar formulário de pós-venda';
  if (posVenda && posVenda.status === 'em_preenchimento' && !posVenda.enviado_pelo_cliente) {
    return 'Aguardar/cobrar resposta do pós-venda';
  }
  if (temAtividadeAtrasada) return 'Revisar cronograma com o cliente';
  return `Acompanhar checklist — ${IMPLEMENTACAO_STATUS_LABELS[implementacao.status]}`;
}

// Regra central de saúde (P1-A4) — SAUDÁVEL/ATENÇÃO/CRÍTICO nunca calculado
// de novo em nenhuma tela: todas consomem `ClienteResumo.saude`.
function calcularSaude(params: {
  vendas: Mapeamento | null;
  implementacao: ImplementacaoCrm | null;
  diaCiclo: DiaCiclo | null;
  atividadesAtrasadas: AtividadeResolvida[];
  reuniaoObrigatoriaPendente: boolean;
  trial: ResumoTrialKommo | null;
}): SaudeCliente {
  const { vendas, implementacao, diaCiclo, atividadesAtrasadas, reuniaoObrigatoriaPendente, trial } = params;

  if (implementacao?.status === 'concluida') return 'concluido';
  if (implementacao?.status === 'cancelada') return 'normal';
  if (vendas?.status === 'erro') return 'critico';

  if (implementacao) {
    const trialEmRiscoImediato = trial ? trial.status === 'encerrado' || trial.diasRestantes <= 1 : false;
    const prazoVencido = diaCiclo != null && diaCiclo.dia > 40;
    const pertoDoFimComPendencia = diaCiclo != null && diaCiclo.dia >= 35 && atividadesAtrasadas.length > 0;

    if (prazoVencido || trialEmRiscoImediato || pertoDoFimComPendencia) return 'critico';
    if (atividadesAtrasadas.length > 0 || reuniaoObrigatoriaPendente || trial?.precisaAlerta) return 'atencao';
    return 'normal';
  }

  if (vendas?.status === 'aguardando_esclarecimento') return 'atencao';
  if (vendas?.status === 'em_preenchimento') return 'aguardando_cliente';
  return 'normal';
}

export function construirResumoClientes(params: {
  clientes: Cliente[];
  mapeamentos: Mapeamento[];
  implementacoes: ImplementacaoCrm[];
  historico: ImplementacaoStatusHistorico[];
  atividades: AtividadeCronograma[];
  statusRows: AtividadeStatusRow[];
  consultores: Consultor[];
  reunioes?: Reuniao[];
  hoje: Date;
}): ClienteResumo[] {
  const {
    clientes,
    mapeamentos,
    implementacoes,
    historico,
    atividades,
    statusRows,
    consultores,
    reunioes = [],
    hoje,
  } = params;

  return clientes.map((cliente) => {
    const doCliente = mapeamentos.filter((m) => m.cliente_id === cliente.id);
    const vendas = doCliente.find((m) => m.tipo === 'vendas') ?? null;
    const posVenda = doCliente.find((m) => m.tipo === 'pos_venda') ?? null;
    const implementacao = implementacoes.find((i) => i.cliente_id === cliente.id) ?? null;

    const diaCiclo = calcularDiaCiclo(cliente.kickoff_realizado_em, hoje);
    const atividadesResolvidas = implementacao
      ? resolverAtividadesDaImplementacao({
          implementacaoId: implementacao.id,
          atividades,
          statusRows,
          historico,
          cliente,
          reunioes,
          hoje,
        })
      : [];
    const atividadesAtrasadas = atividadesResolvidas.filter((a) => a.status === 'atrasado');

    const reunioesDoCliente = reunioes.filter((r) => r.cliente_id === cliente.id);
    const reuniaoObrigatoriaPendente = TIPOS_REUNIAO_OBRIGATORIOS.some(
      (tipo) =>
        alertaReuniaoObrigatoria({
          tipo,
          reunioesDoTipo: reunioesDoCliente.filter((r) => r.tipo === tipo),
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          hoje,
        }) != null,
    );

    const trial = resolverResumoTrialKommo(cliente, hoje);

    const precisaPosVenda =
      !!implementacao &&
      ['automacoes', 'entrega', 'adocao', 'concluida'].includes(implementacao.status) &&
      !posVenda;

    return {
      cliente,
      vendas,
      posVenda,
      implementacao,
      faseAtual: faseAtualLabel(vendas, implementacao),
      saude: calcularSaude({ vendas, implementacao, diaCiclo, atividadesAtrasadas, reuniaoObrigatoriaPendente, trial }),
      progresso: implementacao ? progressoImplementacao(implementacao.id, atividades, statusRows) : null,
      proximaAcao: proximaAcaoLabel({
        vendas,
        posVenda,
        implementacao,
        precisaPosVenda,
        temAtividadeAtrasada: atividadesAtrasadas.length > 0,
      }),
      diaCiclo,
      atividadesAtrasadas,
      trial,
      reuniaoObrigatoriaPendente,
      consultor: nomeConsultor(implementacao?.consultor_responsavel_id ?? null, consultores),
      consultorEmail: emailConsultor(implementacao?.consultor_responsavel_id ?? null, consultores),
      consultorApoio: nomeConsultor(implementacao?.consultor_apoio_id ?? null, consultores),
    };
  });
}

// Único texto de prazo mostrado em qualquer tela (Dashboard, ficha do
// cliente) — nunca formatado de novo localmente.
export function prazoLabelDe(resumo: ClienteResumo): string | null {
  if (!resumo.diaCiclo) return null;
  const restantes = 40 - resumo.diaCiclo.dia;
  return restantes < 0 ? `${Math.abs(restantes)}d atrasado` : `${restantes}d restantes`;
}

// Único critério de "está atrasado" — prazo geral vencido (passou do Dia 40)
// ou pelo menos uma atividade do cronograma atrasada agora.
export function estaAtrasado(resumo: ClienteResumo): boolean {
  return (resumo.diaCiclo != null && resumo.diaCiclo.dia > 40) || resumo.atividadesAtrasadas.length > 0;
}

const DIAS_SEM_RESPOSTA_PARA_ALERTAR = 3;

// Só os alertas que dá pra calcular com dado real hoje. As mesmas condições
// usadas em calcularSaude alimentam esses alertas — nunca uma segunda
// fórmula à parte pra "o que está errado com esse cliente".
export function construirAlertas(
  resumos: ClienteResumo[],
  hoje: Date,
  ocorrenciasAbertas: ClienteOcorrencia[] = [],
): AlertaOperacao[] {
  const alertas: AlertaOperacao[] = [];

  for (const r of resumos) {
    const base = {
      clienteId: r.cliente.id,
      clienteNome: r.cliente.nome_empresa,
      consultor: r.consultor,
      prazoLabel: prazoLabelDe(r),
      proximaAcao: r.proximaAcao,
    };

    const ocorrenciaDoCliente = ocorrenciasAbertas.find((o) => o.cliente_id === r.cliente.id);
    if (ocorrenciaDoCliente) {
      alertas.push({
        ...base,
        motivo: `Ocorrência aberta: ${CATEGORIA_OCORRENCIA_LABELS[ocorrenciaDoCliente.categoria]}`,
        severidade: ocorrenciaDoCliente.impacta_cronograma ? 'critico' : 'atencao',
      });
      continue;
    }

    if (r.diaCiclo && r.diaCiclo.dia > 40) {
      alertas.push({
        ...base,
        motivo: 'Prazo geral da implementação atrasado (passou do Dia 40)',
        severidade: r.diaCiclo.dia - 40 > 3 ? 'critico' : 'atencao',
      });
      continue;
    }

    if (r.atividadesAtrasadas.length > 0) {
      const primeira = r.atividadesAtrasadas[0];
      alertas.push({
        ...base,
        motivo:
          r.atividadesAtrasadas.length === 1
            ? `Atividade atrasada: ${primeira.nome}`
            : `${r.atividadesAtrasadas.length} atividades atrasadas (ex: ${primeira.nome})`,
        severidade: primeira.atrasoDias > 2 ? 'critico' : 'atencao',
      });
      continue;
    }

    if (r.trial?.precisaAlerta) {
      alertas.push({
        ...base,
        motivo: `Trial Kommo vence em ${r.trial.diasRestantes}d — extensão de ${r.trial.proximaExtensao?.rotulo} ainda não solicitada`,
        severidade: r.trial.diasRestantes <= 1 ? 'critico' : 'atencao',
      });
      continue;
    }

    if (r.reuniaoObrigatoriaPendente) {
      alertas.push({ ...base, motivo: 'Reunião obrigatória ainda não agendada', severidade: 'atencao' });
      continue;
    }

    if (r.vendas?.status === 'aguardando_esclarecimento') {
      alertas.push({ ...base, motivo: 'IA pediu esclarecimento no mapeamento de vendas', severidade: 'atencao' });
      continue;
    }

    if (r.vendas?.status === 'erro') {
      alertas.push({ ...base, motivo: 'Erro ao gerar o funil de vendas', severidade: 'critico' });
      continue;
    }

    if (
      r.implementacao &&
      ['automacoes', 'entrega', 'adocao', 'concluida'].includes(r.implementacao.status) &&
      !r.posVenda
    ) {
      alertas.push({ ...base, motivo: 'Formulário de pós-venda ainda não enviado', severidade: 'atencao' });
      continue;
    }

    if (
      r.vendas &&
      r.vendas.status === 'em_preenchimento' &&
      !r.vendas.enviado_pelo_cliente &&
      diasDesde(r.vendas.created_at, hoje) >= DIAS_SEM_RESPOSTA_PARA_ALERTAR
    ) {
      alertas.push({
        ...base,
        motivo: `Formulário de vendas não respondido há ${diasDesde(r.vendas.created_at, hoje)}d`,
        severidade: 'atencao',
      });
    }
  }

  return alertas.sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === 'critico' ? -1 : 1));
}

function diasDesde(iso: string, hoje: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const criado = new Date(iso);
  criado.setHours(0, 0, 0, 0);
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((base.getTime() - criado.getTime()) / MS_POR_DIA));
}
