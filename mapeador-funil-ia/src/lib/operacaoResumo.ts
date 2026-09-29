// Consolida os dados que já existem no banco (mapeamentos, implementações,
// checklist, prazos) numa visão por cliente pra alimentar o dashboard
// "Operação CRM". Não inventa dado nenhum: onde a informação ainda não
// existe no produto (Trial Kommo, agenda do Google Calendar), os campos
// ficam null/vazios de propósito, prontos pra serem preenchidos quando
// essas integrações existirem — nunca com valor fictício.
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { prazoFaseAtual, prazoGeral, type PrazoFase, type PrazoGeral } from './cronograma';
import { CATEGORIA_OCORRENCIA_LABELS } from './ocorrencias';
import { alertaReuniaoObrigatoria, TIPOS_REUNIAO_OBRIGATORIOS } from './reunioes';
import { funilValidado, MAPEAMENTO_STATUS_LABELS } from './statusFluxo';
import { resolverResumoTrialKommo } from './trialKommo';
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
  prazoFase: PrazoFase | null;
  prazoProcesso: PrazoGeral | null;
  consultor: string | null;
  consultorEmail: string | null;
  consultorApoio: string | null;
  // Sempre null por enquanto — não existe campo de Trial Kommo no produto
  // ainda. Mantido aqui pra já existir o lugar certo quando o dado chegar
  // (ver DIAS_TRIAL_KOMMO / integração futura).
  trialDiasRestantes: null;
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
  prazoFase: PrazoFase | null;
}): string {
  const { vendas, posVenda, implementacao, precisaPosVenda, prazoFase } = params;

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
  if (prazoFase?.atrasada) return 'Revisar cronograma com o cliente';
  return `Acompanhar checklist — ${IMPLEMENTACAO_STATUS_LABELS[implementacao.status]}`;
}

function calcularSaude(params: {
  vendas: Mapeamento | null;
  implementacao: ImplementacaoCrm | null;
  prazoFase: PrazoFase | null;
  prazoProcesso: PrazoGeral | null;
}): SaudeCliente {
  const { vendas, implementacao, prazoFase, prazoProcesso } = params;

  if (implementacao?.status === 'concluida') return 'concluido';
  if (implementacao?.status === 'cancelada') return 'normal';
  if (vendas?.status === 'erro') return 'critico';

  if (implementacao) {
    if (prazoFase?.atrasada) return prazoFase.diasAtraso > 2 ? 'critico' : 'atencao';
    if (prazoProcesso?.atrasada) return prazoProcesso.diasAtraso > 3 ? 'critico' : 'atencao';
    if (prazoProcesso && !prazoProcesso.atrasada && prazoProcesso.diasRestantes <= 3) return 'atencao';
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
  hoje: Date;
}): ClienteResumo[] {
  const { clientes, mapeamentos, implementacoes, historico, atividades, statusRows, consultores, hoje } = params;

  return clientes.map((cliente) => {
    const doCliente = mapeamentos.filter((m) => m.cliente_id === cliente.id);
    const vendas = doCliente.find((m) => m.tipo === 'vendas') ?? null;
    const posVenda = doCliente.find((m) => m.tipo === 'pos_venda') ?? null;
    const implementacao = implementacoes.find((i) => i.cliente_id === cliente.id) ?? null;

    const prazoFase = implementacao ? prazoFaseAtual(implementacao, historico, hoje) : null;
    const prazoProcesso = implementacao ? prazoGeral(implementacao, cliente.kickoff_realizado_em, hoje) : null;

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
      saude: calcularSaude({ vendas, implementacao, prazoFase, prazoProcesso }),
      progresso: implementacao ? progressoImplementacao(implementacao.id, atividades, statusRows) : null,
      proximaAcao: proximaAcaoLabel({ vendas, posVenda, implementacao, precisaPosVenda, prazoFase }),
      prazoFase,
      prazoProcesso,
      consultor: nomeConsultor(implementacao?.consultor_responsavel_id ?? null, consultores),
      consultorEmail: emailConsultor(implementacao?.consultor_responsavel_id ?? null, consultores),
      consultorApoio: nomeConsultor(implementacao?.consultor_apoio_id ?? null, consultores),
      trialDiasRestantes: null,
    };
  });
}

function prazoLabelDe(resumo: ClienteResumo): string | null {
  if (resumo.prazoFase) {
    return resumo.prazoFase.atrasada
      ? `${resumo.prazoFase.diasAtraso}d atrasada`
      : `${resumo.prazoFase.diasRestantes}d restantes`;
  }
  if (resumo.prazoProcesso) {
    return resumo.prazoProcesso.atrasada
      ? `${resumo.prazoProcesso.diasAtraso}d atrasado`
      : `${resumo.prazoProcesso.diasRestantes}d restantes`;
  }
  return null;
}

const DIAS_SEM_RESPOSTA_PARA_ALERTAR = 3;

// Só os alertas que dá pra calcular com dado real hoje. Trial Kommo, Kickoff
// agendado, treinamento etc. entram aqui quando essas integrações existirem
// — o formato do alerta (motivo/prazo/próxima ação/consultor) já está
// pronto pra receber esses casos novos sem precisar mudar o componente.
export function construirAlertas(
  resumos: ClienteResumo[],
  hoje: Date,
  ocorrenciasAbertas: ClienteOcorrencia[] = [],
  reunioes: Reuniao[] = [],
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

    if (r.prazoFase?.atrasada) {
      alertas.push({
        ...base,
        motivo: `${r.faseAtual} atrasada`,
        severidade: r.prazoFase.diasAtraso > 2 ? 'critico' : 'atencao',
      });
      continue;
    }

    if (r.prazoProcesso?.atrasada) {
      alertas.push({
        ...base,
        motivo: 'Prazo geral da implementação atrasado',
        severidade: r.prazoProcesso.diasAtraso > 3 ? 'critico' : 'atencao',
      });
      continue;
    }

    const resumoTrial = resolverResumoTrialKommo(r.cliente, hoje);
    if (resumoTrial?.precisaAlerta) {
      alertas.push({
        ...base,
        motivo: `Trial Kommo vence em ${resumoTrial.diasRestantes}d — extensão de ${resumoTrial.proximaExtensao?.rotulo} ainda não solicitada`,
        severidade: resumoTrial.diasRestantes <= 1 ? 'critico' : 'atencao',
      });
      continue;
    }

    const reunioesDoCliente = reunioes.filter((reuniao) => reuniao.cliente_id === r.cliente.id);
    const alertaReuniao = TIPOS_REUNIAO_OBRIGATORIOS.map((tipo) =>
      alertaReuniaoObrigatoria({
        tipo,
        reunioesDoTipo: reunioesDoCliente.filter((reuniao) => reuniao.tipo === tipo),
        kickoffRealizadoEm: r.cliente.kickoff_realizado_em,
        hoje,
      }),
    ).find((alerta) => alerta != null);
    if (alertaReuniao) {
      alertas.push({ ...base, motivo: alertaReuniao.titulo, severidade: 'atencao' });
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
