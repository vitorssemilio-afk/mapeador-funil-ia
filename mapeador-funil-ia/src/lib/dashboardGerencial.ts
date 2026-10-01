// Dashboard Gerencial ("Gestão") — responde "como está performando a
// operação?", diferente da Home operacional ("o que eu preciso fazer
// agora?"). Por isso este arquivo NUNCA inventa uma fórmula nova: toda
// agregação aqui é feita em cima das mesmas fontes oficiais já usadas em
// Home/Agenda/ficha do cliente (operacaoResumo.ts para saúde/prazo/trial,
// atividadesCronograma.ts para o motor de ciclos, trialKommo.ts para Trial,
// reunioes.ts para reuniões obrigatórias, criteriosEntrega.ts para entrega,
// diagnosticoAdocao.ts para adoção). Onde um dado não existe de verdade no
// produto (nenhuma data de "primeira automação" isolada, por exemplo), o
// indicador correspondente fica de fora — nunca é fabricado.
import {
  CICLOS_OPERACIONAIS,
  resolverAtividade,
  type AtividadeResolvida,
} from './atividadesCronograma';
import { calcularMetricas } from './marcosCliente';
import { CATEGORIA_OCORRENCIA_LABELS } from './ocorrencias';
import {
  nomeConsultor,
  type ClienteResumo,
  type SaudeCliente,
} from './operacaoResumo';
import { alertaReuniaoObrigatoria, TIPOS_REUNIAO_OBRIGATORIOS, TIPO_REUNIAO_LABELS } from './reunioes';
import { funilJaGerado, funilValidado, MAPEAMENTO_STATUS_LABELS } from './statusFluxo';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  CheckpointAdocao,
  Cliente,
  ClienteOcorrencia,
  Consultor,
  CriterioEntrega,
  CriterioEntregaStatus,
  FunilVersao,
  ImpactoResponsavel,
  ImplementacaoCrm,
  Mapeamento,
  MarcosCliente,
  Reuniao,
  ReuniaoRemarcacao,
} from '../types/database';
import { resolverResumoCriteriosEntrega } from './criteriosEntrega';
import { resolverDiagnosticoAdocao, type StatusDiagnosticoAdocao } from './diagnosticoAdocao';

function diasEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / MS_POR_DIA);
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 === 0 ? (ordenado[meio - 1] + ordenado[meio]) / 2 : ordenado[meio];
}

function percentual(parte: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

// ============================================================
// Filtros
// ============================================================
export type FiltroConsultorGestao = 'todos' | 'meus' | string;
export type FiltroStatusGestao = 'todos' | 'ativos' | 'concluidos';

export type FiltrosGestao = {
  consultor: FiltroConsultorGestao;
  clienteId: string;
  status: FiltroStatusGestao;
  saude: SaudeCliente | '';
  ciclo: 1 | 2 | 3 | 4 | '';
  periodoDias: number | '';
};

export const FILTROS_GESTAO_PADRAO: FiltrosGestao = {
  consultor: 'todos',
  clienteId: '',
  status: 'todos',
  saude: '',
  ciclo: '',
  periodoDias: '',
};

// "Meus clientes" compara por e-mail (não por consultor_responsavel_id) —
// mesmo padrão já usado em Dashboard.tsx (soMeusClientes/meuEmail), porque
// o usuário logado é identificado pelo e-mail da autenticação, e
// ClienteResumo já carrega consultorEmail pronto pra essa comparação.
export function aplicarFiltrosGestao(
  resumos: ClienteResumo[],
  filtros: FiltrosGestao,
  meuEmail: string,
  hoje: Date,
): ClienteResumo[] {
  return resumos.filter((r) => {
    if (filtros.consultor === 'meus') {
      if ((r.consultorEmail ?? '').toLowerCase() !== meuEmail.toLowerCase()) return false;
    } else if (filtros.consultor !== 'todos') {
      if (r.cliente.consultor_responsavel_id !== filtros.consultor) return false;
    }

    if (filtros.clienteId && r.cliente.id !== filtros.clienteId) return false;

    if (filtros.status === 'ativos' && (!r.implementacao || r.implementacao.status === 'concluida' || r.implementacao.status === 'cancelada')) {
      return false;
    }
    if (filtros.status === 'concluidos' && r.implementacao?.status !== 'concluida') return false;

    if (filtros.saude && r.saude !== filtros.saude) return false;

    if (filtros.ciclo) {
      const nomeCiclo = CICLOS_OPERACIONAIS[filtros.ciclo - 1]?.nome;
      if (!r.diaCiclo?.ciclo || r.diaCiclo.ciclo.nome !== nomeCiclo) return false;
    }

    if (filtros.periodoDias) {
      const referencia = r.cliente.contratado_em;
      if (!referencia) return false;
      const dias = diasEntre(referencia, hoje.toISOString());
      if (dias == null || dias > filtros.periodoDias) return false;
    }

    return true;
  });
}

// ============================================================
// 3. Indicadores principais
// ============================================================
export type IndicadorComClientes = {
  valor: number;
  clientes: Cliente[];
};

export type IndicadoresPrincipais = {
  implementacoesAtivas: IndicadorComClientes;
  implementacoesConcluidas: IndicadorComClientes;
  dentroDoPrazo: IndicadorComClientes;
  emAtencao: IndicadorComClientes;
  criticas: IndicadorComClientes;
  tempoMedioImplementacaoDias: number | null;
  percentualConcluidoEm40Dias: number | null;
  clientesComTrialAtivo: IndicadorComClientes;
  trialsProximosDoVencimento: IndicadorComClientes;
  adocaoSaudavel: IndicadorComClientes;
  adocaoAtencao: IndicadorComClientes;
  adocaoCritica: IndicadorComClientes;
};

function porSaude(resumos: ClienteResumo[], saude: SaudeCliente): IndicadorComClientes {
  const itens = resumos.filter((r) => r.saude === saude);
  return { valor: itens.length, clientes: itens.map((r) => r.cliente) };
}

export function construirIndicadoresPrincipais(
  resumos: ClienteResumo[],
  diagnosticosPorImplementacao: Map<string, StatusDiagnosticoAdocao>,
): IndicadoresPrincipais {
  const ativas = resumos.filter((r) => r.implementacao && r.implementacao.status !== 'concluida' && r.implementacao.status !== 'cancelada');
  const concluidas = resumos.filter((r) => r.implementacao?.status === 'concluida');

  const temposConclusao = concluidas
    .map((r) => diasEntre(r.cliente.kickoff_realizado_em, r.cliente.implementacao_concluida_em))
    .filter((d): d is number => d != null);

  const concluidasComKickoff = concluidas.filter((r) => r.cliente.kickoff_realizado_em && r.cliente.implementacao_concluida_em);
  const concluidasEm40 = concluidasComKickoff.filter((r) => {
    const dias = diasEntre(r.cliente.kickoff_realizado_em, r.cliente.implementacao_concluida_em);
    return dias != null && dias <= 40;
  });

  const comTrial = resumos.filter((r) => r.trial && r.trial.status !== 'encerrado');
  const trialProximoVencimento = resumos.filter((r) => r.trial?.status === 'proximo_vencimento');

  function porDiagnostico(status: StatusDiagnosticoAdocao): IndicadorComClientes {
    const itens = resumos.filter(
      (r) => r.implementacao && diagnosticosPorImplementacao.get(r.implementacao.id) === status,
    );
    return { valor: itens.length, clientes: itens.map((r) => r.cliente) };
  }

  return {
    implementacoesAtivas: { valor: ativas.length, clientes: ativas.map((r) => r.cliente) },
    implementacoesConcluidas: { valor: concluidas.length, clientes: concluidas.map((r) => r.cliente) },
    dentroDoPrazo: porSaude(resumos, 'normal'),
    emAtencao: porSaude(resumos, 'atencao'),
    criticas: porSaude(resumos, 'critico'),
    tempoMedioImplementacaoDias: media(temposConclusao),
    percentualConcluidoEm40Dias: percentual(concluidasEm40.length, concluidasComKickoff.length),
    clientesComTrialAtivo: { valor: comTrial.length, clientes: comTrial.map((r) => r.cliente) },
    trialsProximosDoVencimento: { valor: trialProximoVencimento.length, clientes: trialProximoVencimento.map((r) => r.cliente) },
    adocaoSaudavel: porDiagnostico('saudavel'),
    adocaoAtencao: porDiagnostico('atencao'),
    adocaoCritica: porDiagnostico('critico'),
  };
}

// ============================================================
// 4. Tempos do processo
// ============================================================
export type TempoProcesso = {
  label: string;
  mediaDias: number | null;
  medianaDias: number | null;
  amostras: number;
};

// As mesmas 8 métricas já calculadas por cliente em marcosCliente.ts
// (reaproveitadas aqui, não recalculadas) + 1 que já é só uma diferença
// direta entre dois campos existentes (início do Trial → conclusão).
// "Treinamento → primeira automação" fica de fora: não existe no produto
// uma data isolada de "primeira automação concluída" fácil de atribuir sem
// ambiguidade — ver relatório final.
const MARCOS_NULOS: MarcosCliente = {
  contratado_em: null,
  formulario_enviado_em: null,
  formulario_respondido_em: null,
  funil_gerado_em: null,
  funil_revisado_em: null,
  funil_validado_em: null,
  kickoff_agendado_para: null,
  kickoff_realizado_em: null,
  conta_kommo_solicitada_em: null,
  conta_kommo_criada_em: null,
  treinamento_agendado_para: null,
  treinamento_realizado_em: null,
  extensao_14_solicitada_em: null,
  extensao_14_aprovada_em: null,
  extensao_7_solicitada_em: null,
  extensao_7_aprovada_em: null,
  contratacao_kommo_solicitada_em: null,
  implementacao_concluida_em: null,
};

export function construirTemposProcesso(clientes: Cliente[]): TempoProcesso[] {
  const porLabel = new Map<string, number[]>();
  for (const { label } of calcularMetricas(MARCOS_NULOS)) {
    porLabel.set(label, []);
  }

  for (const cliente of clientes) {
    for (const metrica of calcularMetricas(cliente)) {
      if (metrica.dias == null) continue;
      const lista = porLabel.get(metrica.label) ?? [];
      lista.push(metrica.dias);
      porLabel.set(metrica.label, lista);
    }
  }

  const inicioTrialConclusao: number[] = [];
  for (const cliente of clientes) {
    const dias = diasEntre(cliente.conta_kommo_criada_em, cliente.implementacao_concluida_em);
    if (dias != null) inicioTrialConclusao.push(dias);
  }
  porLabel.set('Início do Trial → conclusão', inicioTrialConclusao);

  return Array.from(porLabel.entries()).map(([label, dias]) => ({
    label,
    mediaDias: media(dias),
    medianaDias: mediana(dias),
    amostras: dias.length,
  }));
}

// ============================================================
// 5. Ciclos
// ============================================================
export type DesempenhoCiclo = {
  numero: 1 | 2 | 3 | 4;
  nome: string;
  concluidasNoPrazo: number;
  concluidasTotal: number;
  percentualNoPrazo: number | null;
  emAtraso: number;
  principaisAtividadesAtrasadas: { nome: string; quantidade: number }[];
  diaMedioConclusao: number | null;
};

export function construirDesempenhoCiclos(params: {
  implementacoes: ImplementacaoCrm[];
  clientesPorId: Map<string, Cliente>;
  atividades: AtividadeCronograma[];
  statusRows: AtividadeStatusRow[];
  reunioes: Reuniao[];
  hoje: Date;
  historico: Parameters<typeof resolverAtividade>[0]['historico'];
}): DesempenhoCiclo[] {
  const { implementacoes, clientesPorId, atividades, statusRows, reunioes, hoje, historico: implementacaoStatusHistorico } = params;

  return CICLOS_OPERACIONAIS.map((ciclo, idx) => {
    const atividadesDoCiclo = atividades.filter((a) => a.ciclo === ciclo.nome);
    let concluidasNoPrazo = 0;
    let concluidasTotal = 0;
    let emAtraso = 0;
    const diasConclusao: number[] = [];
    const contagemAtrasadas = new Map<string, number>();

    for (const implementacao of implementacoes) {
      if (implementacao.status === 'cancelada') continue;
      const cliente = implementacao.cliente_id ? (clientesPorId.get(implementacao.cliente_id) ?? null) : null;
      if (!cliente?.kickoff_realizado_em) continue;

      const atividadesVisiveis = atividadesDoCiclo.filter(
        (a) => a.implementacao_id === null || a.implementacao_id === implementacao.id,
      );

      for (const atividade of atividadesVisiveis) {
        const resolvida = resolverAtividade({
          atividade,
          statusRow: statusRows.find((s) => s.atividade_id === atividade.id && s.implementacao_id === implementacao.id) ?? null,
          historico: implementacaoStatusHistorico.filter((h) => h.implementacao_id === implementacao.id),
          cliente,
          reunioes,
          hoje,
        });

        if (resolvida.dataReal) {
          concluidasTotal += 1;
          if (!resolvida.foraDaJanelaDoCiclo) concluidasNoPrazo += 1;
          if (resolvida.diaDesdeKickoff != null) diasConclusao.push(resolvida.diaDesdeKickoff - ciclo.diaInicio + 1);
        } else if (resolvida.status === 'atrasado') {
          emAtraso += 1;
          contagemAtrasadas.set(atividade.nome, (contagemAtrasadas.get(atividade.nome) ?? 0) + 1);
        }
      }
    }

    const principais = Array.from(contagemAtrasadas.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nome, quantidade]) => ({ nome, quantidade }));

    return {
      numero: (idx + 1) as 1 | 2 | 3 | 4,
      nome: ciclo.nome,
      concluidasNoPrazo,
      concluidasTotal,
      percentualNoPrazo: percentual(concluidasNoPrazo, concluidasTotal),
      emAtraso,
      principaisAtividadesAtrasadas: principais,
      diaMedioConclusao: media(diasConclusao),
    };
  });
}

// ============================================================
// 6. Causas de atraso
// ============================================================
export type CausaAtraso = {
  responsavel: ImpactoResponsavel;
  label: string;
  quantidade: number;
  percentual: number | null;
};

export type MotivoFrequente = {
  categoria: string;
  quantidade: number;
};

export const IMPACTO_LABEL_GESTAO: Record<ImpactoResponsavel, string> = {
  cliente: 'Cliente',
  consultor: 'Consultor',
  v4: 'V4 (interno)',
  problema_tecnico: 'Problema técnico',
  outro: 'Outro',
};

export function construirCausasAtraso(ocorrencias: ClienteOcorrencia[]): {
  porResponsavel: CausaAtraso[];
  motivosFrequentes: MotivoFrequente[];
} {
  const total = ocorrencias.length;
  const ordem: ImpactoResponsavel[] = ['cliente', 'consultor', 'v4', 'problema_tecnico', 'outro'];
  const porResponsavel = ordem.map((responsavel) => {
    const quantidade = ocorrencias.filter((o) => o.responsavel_impacto === responsavel).length;
    return { responsavel, label: IMPACTO_LABEL_GESTAO[responsavel], quantidade, percentual: percentual(quantidade, total) };
  });

  const porCategoria = new Map<string, number>();
  for (const o of ocorrencias) {
    const label = CATEGORIA_OCORRENCIA_LABELS[o.categoria];
    porCategoria.set(label, (porCategoria.get(label) ?? 0) + 1);
  }
  const motivosFrequentes = Array.from(porCategoria.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, quantidade]) => ({ categoria, quantidade }));

  return { porResponsavel, motivosFrequentes };
}

// ============================================================
// 7. Consultor — gestão de capacidade, nunca ranking de performance.
// Ordem sempre alfabética por nome, nunca por um "score".
// ============================================================
export type DesempenhoConsultor = {
  consultorId: string;
  nome: string;
  clientesAtivos: number;
  implementacoesConcluidas: number;
  clientesEmAtencao: number;
  clientesCriticos: number;
  tempoMedioImplementacaoDias: number | null;
  pendenciasAbertas: number;
  proximasReunioes: number;
  cargaAtual: number;
};

export function construirDesempenhoConsultores(params: {
  consultores: Consultor[];
  resumos: ClienteResumo[];
  ocorrenciasAbertas: ClienteOcorrencia[];
  reunioes: Reuniao[];
  hoje: Date;
}): DesempenhoConsultor[] {
  const { consultores, resumos, ocorrenciasAbertas, reunioes, hoje } = params;

  return consultores
    .filter((c) => c.ativo)
    .map((consultor) => {
      const doConsultor = resumos.filter((r) => r.cliente.consultor_responsavel_id === consultor.id);
      const ativos = doConsultor.filter((r) => r.implementacao && r.implementacao.status !== 'concluida' && r.implementacao.status !== 'cancelada');
      const concluidas = doConsultor.filter((r) => r.implementacao?.status === 'concluida');
      const tempos = concluidas
        .map((r) => diasEntre(r.cliente.kickoff_realizado_em, r.cliente.implementacao_concluida_em))
        .filter((d): d is number => d != null);

      const pendencias = ocorrenciasAbertas.filter((o) => o.consultor_responsavel_id === consultor.id).length;
      const proximas = reunioes.filter(
        (r) =>
          r.status === 'agendada' &&
          r.data_hora &&
          new Date(r.data_hora) >= hoje &&
          (r.consultor_responsavel_id === consultor.id ||
            doConsultor.some((res) => res.implementacao?.id === r.implementacao_id)),
      ).length;

      return {
        consultorId: consultor.id,
        nome: consultor.nome,
        clientesAtivos: ativos.length,
        implementacoesConcluidas: concluidas.length,
        clientesEmAtencao: doConsultor.filter((r) => r.saude === 'atencao').length,
        clientesCriticos: doConsultor.filter((r) => r.saude === 'critico').length,
        tempoMedioImplementacaoDias: media(tempos),
        pendenciasAbertas: pendencias,
        proximasReunioes: proximas,
        cargaAtual: ativos.length,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// ============================================================
// 8. Trial Kommo — só lê resumo.trial, fonte oficial única (trialKommo.ts).
// ============================================================
export type ResumoTrialGestao = {
  ativos: IndicadorComClientes;
  trialInicial: IndicadorComClientes;
  em14Dias: IndicadorComClientes;
  em7Dias: IndicadorComClientes;
  proximosVencimento: IndicadorComClientes;
  extensaoPendente: IndicadorComClientes;
  mediaDiasUtilizados: number | null;
  percentualUsouPrimeiraExtensao: number | null;
  percentualUsouSegundaExtensao: number | null;
};

export function construirResumoTrialGestao(resumos: ClienteResumo[]): ResumoTrialGestao {
  const comTrialIniciado = resumos.filter((r) => r.cliente.conta_kommo_criada_em);

  function filtro(pred: (r: ClienteResumo) => boolean): IndicadorComClientes {
    const itens = resumos.filter(pred);
    return { valor: itens.length, clientes: itens.map((r) => r.cliente) };
  }

  const usoDias = resumos.filter((r) => r.trial).map((r) => r.trial!.usoTotalDias);
  const usouExtensao14 = comTrialIniciado.filter((r) => r.cliente.extensao_14_solicitada_em).length;
  const usouExtensao7 = comTrialIniciado.filter((r) => r.cliente.extensao_7_solicitada_em).length;

  return {
    ativos: filtro((r) => r.trial != null && r.trial.status !== 'encerrado'),
    trialInicial: filtro((r) => r.trial?.periodoAtual === 'Trial inicial'),
    em14Dias: filtro((r) => r.trial?.periodoAtual === 'Primeira extensão'),
    em7Dias: filtro((r) => r.trial?.periodoAtual === 'Segunda extensão'),
    proximosVencimento: filtro((r) => r.trial?.status === 'proximo_vencimento'),
    extensaoPendente: filtro((r) => r.trial?.status === 'extensao_pendente'),
    mediaDiasUtilizados: media(usoDias),
    percentualUsouPrimeiraExtensao: percentual(usouExtensao14, comTrialIniciado.length),
    percentualUsouSegundaExtensao: percentual(usouExtensao7, comTrialIniciado.length),
  };
}

// ============================================================
// 9. Reuniões
// ============================================================
export type ResumoReunioesGestao = {
  kickoffsRealizados: number;
  treinamentosNoPrazo: number;
  treinamentosForaDoPrazo: number;
  checkin1Realizados: number;
  checkin2Realizados: number;
  reunioesFinais: number;
  remarcadas: number;
  noShowCliente: number;
  noShowConsultor: number;
  obrigatoriasNaoAgendadas: IndicadorComClientes;
};

export function construirResumoReunioes(params: {
  clientes: Cliente[];
  reunioes: Reuniao[];
  remarcacoes: ReuniaoRemarcacao[];
  hoje: Date;
}): ResumoReunioesGestao {
  const { clientes, reunioes, remarcacoes, hoje } = params;
  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));

  const treinamentosRealizados = reunioes.filter((r) => r.tipo === 'treinamento' && r.status === 'realizada' && r.data_hora);
  let treinamentosNoPrazo = 0;
  let treinamentosForaDoPrazo = 0;
  for (const r of treinamentosRealizados) {
    const cliente = clientesPorId.get(r.cliente_id);
    if (!cliente?.kickoff_realizado_em) continue;
    const dias = diasEntre(cliente.kickoff_realizado_em, r.data_hora);
    if (dias == null) continue;
    if (dias <= 10) treinamentosNoPrazo += 1;
    else treinamentosForaDoPrazo += 1;
  }

  const remarcadasIds = new Set(remarcacoes.map((m) => m.reuniao_id));

  const obrigatoriasPendentes = new Set<string>();
  const clientesObrigatoriasPendentes: Cliente[] = [];
  for (const cliente of clientes) {
    if (!cliente.kickoff_realizado_em) continue;
    let algumaPendente = false;
    for (const tipo of TIPOS_REUNIAO_OBRIGATORIOS) {
      const alerta = alertaReuniaoObrigatoria({
        tipo,
        reunioesDoTipo: reunioes.filter((r) => r.cliente_id === cliente.id && r.tipo === tipo),
        kickoffRealizadoEm: cliente.kickoff_realizado_em,
        hoje,
      });
      if (alerta) algumaPendente = true;
    }
    if (algumaPendente && !obrigatoriasPendentes.has(cliente.id)) {
      obrigatoriasPendentes.add(cliente.id);
      clientesObrigatoriasPendentes.push(cliente);
    }
  }

  return {
    kickoffsRealizados: reunioes.filter((r) => r.tipo === 'kickoff' && r.status === 'realizada').length,
    treinamentosNoPrazo,
    treinamentosForaDoPrazo,
    checkin1Realizados: reunioes.filter((r) => r.tipo === 'checkin_1' && r.status === 'realizada').length,
    checkin2Realizados: reunioes.filter((r) => r.tipo === 'checkin_2' && r.status === 'realizada').length,
    reunioesFinais: reunioes.filter((r) => r.tipo === 'reuniao_final' && r.status === 'realizada').length,
    remarcadas: remarcadasIds.size,
    noShowCliente: reunioes.filter((r) => r.status === 'cliente_nao_compareceu').length,
    noShowConsultor: reunioes.filter((r) => r.status === 'consultor_nao_compareceu').length,
    obrigatoriasNaoAgendadas: { valor: clientesObrigatoriasPendentes.length, clientes: clientesObrigatoriasPendentes },
  };
}

export { TIPO_REUNIAO_LABELS };

// ============================================================
// 10. Funil de vendas (mapeamentos tipo='vendas')
// ============================================================
export type ResumoFunilVendas = {
  formulariosEnviados: number;
  formulariosRespondidos: number;
  funisGerados: number;
  funisEmRevisao: number;
  funisValidados: number;
  tempoMedioRespostaValidacaoDias: number | null;
};

export function construirResumoFunilVendas(mapeamentosVendas: Mapeamento[], clientesPorMapeamento: Map<string, Cliente>): ResumoFunilVendas {
  const tempos: number[] = [];
  for (const m of mapeamentosVendas) {
    const cliente = m.cliente_id ? clientesPorMapeamento.get(m.cliente_id) : null;
    if (!cliente) continue;
    const dias = diasEntre(cliente.formulario_respondido_em, cliente.funil_validado_em);
    if (dias != null) tempos.push(dias);
  }

  return {
    formulariosEnviados: mapeamentosVendas.filter((m) => m.enviado_em).length,
    formulariosRespondidos: mapeamentosVendas.filter((m) => m.enviado_pelo_cliente).length,
    funisGerados: mapeamentosVendas.filter((m) => funilJaGerado(m.status)).length,
    funisEmRevisao: mapeamentosVendas.filter((m) => m.status === 'em_revisao_interna').length,
    funisValidados: mapeamentosVendas.filter((m) => funilValidado(m.status)).length,
    tempoMedioRespostaValidacaoDias: media(tempos),
  };
}

// ============================================================
// 11. Pós-venda (mapeamentos tipo='pos_venda')
// ============================================================
export type ResumoPosVenda = {
  naoIniciado: number;
  enviado: number;
  respondido: number;
  funilGerado: number;
  funilValidado: number;
  percentualImplementado: number | null;
  tempoMedioRespostaDias: number | null;
  tempoMedioRespostaValidacaoDias: number | null;
};

export function construirResumoPosVenda(params: {
  clientesElegiveis: Cliente[]; // clientes cujo funil de vendas já foi validado (podem ter pós-venda)
  mapeamentosPosVenda: Mapeamento[];
  funilVersoes: FunilVersao[];
}): ResumoPosVenda {
  const { clientesElegiveis, mapeamentosPosVenda, funilVersoes } = params;
  const clienteIdsComPosVenda = new Set(mapeamentosPosVenda.map((m) => m.cliente_id).filter((id): id is string => id != null));
  const naoIniciado = clientesElegiveis.filter((c) => !clienteIdsComPosVenda.has(c.id)).length;

  const respostaTempos: number[] = [];
  const validacaoTempos: number[] = [];
  for (const m of mapeamentosPosVenda) {
    const diasResposta = diasEntre(m.created_at, m.enviado_em);
    if (diasResposta != null) respostaTempos.push(diasResposta);

    const aprovacao = funilVersoes.find((fv) => fv.mapeamento_id === m.id && fv.status === 'aprovada');
    const diasValidacao = diasEntre(m.enviado_em, aprovacao?.aprovada_em ?? null);
    if (diasValidacao != null) validacaoTempos.push(diasValidacao);
  }

  const funilValidadoCount = mapeamentosPosVenda.filter((m) => funilValidado(m.status)).length;

  return {
    naoIniciado,
    enviado: mapeamentosPosVenda.filter((m) => !m.enviado_pelo_cliente).length,
    respondido: mapeamentosPosVenda.filter((m) => m.enviado_pelo_cliente).length,
    funilGerado: mapeamentosPosVenda.filter((m) => funilJaGerado(m.status)).length,
    funilValidado: funilValidadoCount,
    percentualImplementado: percentual(funilValidadoCount, clientesElegiveis.length),
    tempoMedioRespostaDias: media(respostaTempos),
    tempoMedioRespostaValidacaoDias: media(validacaoTempos),
  };
}

export { MAPEAMENTO_STATUS_LABELS };

// ============================================================
// 12. Entrega — nunca misturar com adoção (critérios técnicos ≠ Checkpoint).
// ============================================================
export type ResumoEntrega = {
  criteriosConcluidos: number;
  criteriosTotal: number;
  clientesComCriteriosPendentes: IndicadorComClientes;
  implementacoesConcluidas: number;
  implementacoesAcimaDe40Dias: IndicadorComClientes;
};

export function construirResumoEntrega(params: {
  resumos: ClienteResumo[];
  criterios: CriterioEntrega[];
  criteriosStatus: CriterioEntregaStatus[];
}): ResumoEntrega {
  const { resumos, criterios, criteriosStatus } = params;
  let concluidos = 0;
  let total = 0;
  const comPendencia: Cliente[] = [];

  for (const r of resumos) {
    if (!r.implementacao) continue;
    const resumoCriterios = resolverResumoCriteriosEntrega(criterios, criteriosStatus, r.implementacao.id);
    concluidos += resumoCriterios.concluidos;
    total += resumoCriterios.total;
    if (!resumoCriterios.todosObrigatoriosAtendidos) comPendencia.push(r.cliente);
  }

  const acimaDe40 = resumos.filter(
    (r) =>
      r.implementacao &&
      r.implementacao.status !== 'concluida' &&
      r.implementacao.status !== 'cancelada' &&
      r.diaCiclo &&
      r.diaCiclo.dia > 40,
  );

  return {
    criteriosConcluidos: concluidos,
    criteriosTotal: total,
    clientesComCriteriosPendentes: { valor: comPendencia.length, clientes: comPendencia },
    implementacoesConcluidas: resumos.filter((r) => r.implementacao?.status === 'concluida').length,
    implementacoesAcimaDe40Dias: { valor: acimaDe40.length, clientes: acimaDe40.map((r) => r.cliente) },
  };
}

// ============================================================
// 13. Adoção — fonte oficial: checkpoints_adocao + diagnosticoAdocao.ts.
// ============================================================
export type ResumoAdocao = {
  saudavel: IndicadorComClientes;
  atencao: IndicadorComClientes;
  critica: IndicadorComClientes;
  distribuicaoPercentualProcesso: { label: string; quantidade: number }[];
  principaisDificuldades: string[];
  diagnosticosPorImplementacao: Map<string, StatusDiagnosticoAdocao>;
};

const PERCENTUAL_PROCESSO_LABELS: Record<string, string> = {
  quase_tudo: 'Quase tudo no Kommo',
  cerca_metade: 'Cerca de metade',
  pouco: 'Pouco',
  quase_nada: 'Quase nada',
};

export function construirResumoAdocao(params: {
  checkpoints: CheckpointAdocao[];
  resumos: ClienteResumo[];
}): ResumoAdocao {
  const { checkpoints, resumos } = params;
  const resumosPorImplementacao = new Map(resumos.filter((r) => r.implementacao).map((r) => [r.implementacao!.id, r]));

  const diagnosticosPorImplementacao = new Map<string, StatusDiagnosticoAdocao>();
  const saudavel: Cliente[] = [];
  const atencao: Cliente[] = [];
  const critica: Cliente[] = [];
  const distribuicao = new Map<string, number>();
  const dificuldades: string[] = [];

  for (const checkpoint of checkpoints) {
    const diagnostico = resolverDiagnosticoAdocao(checkpoint);
    diagnosticosPorImplementacao.set(checkpoint.implementacao_id, diagnostico.status);

    const resumo = resumosPorImplementacao.get(checkpoint.implementacao_id);
    if (resumo) {
      if (diagnostico.status === 'saudavel') saudavel.push(resumo.cliente);
      else if (diagnostico.status === 'atencao') atencao.push(resumo.cliente);
      else critica.push(resumo.cliente);
    }

    if (checkpoint.percentual_processo_kommo) {
      const label = PERCENTUAL_PROCESSO_LABELS[checkpoint.percentual_processo_kommo] ?? checkpoint.percentual_processo_kommo;
      distribuicao.set(label, (distribuicao.get(label) ?? 0) + 1);
    }
    if (checkpoint.principal_dificuldade?.trim()) {
      dificuldades.push(checkpoint.principal_dificuldade.trim());
    }
  }

  return {
    saudavel: { valor: saudavel.length, clientes: saudavel },
    atencao: { valor: atencao.length, clientes: atencao },
    critica: { valor: critica.length, clientes: critica },
    distribuicaoPercentualProcesso: Array.from(distribuicao.entries()).map(([label, quantidade]) => ({ label, quantidade })),
    principaisDificuldades: dificuldades.slice(-10).reverse(),
    diagnosticosPorImplementacao,
  };
}

// ============================================================
// 14. Saúde da implementação — distribuição direta de ClienteResumo.saude,
// sem recalcular nada (fonte oficial é operacaoResumo.ts).
// ============================================================
export type DistribuicaoSaude = { saude: SaudeCliente; valor: number; clientes: Cliente[] };

export function construirDistribuicaoSaude(resumos: ClienteResumo[]): DistribuicaoSaude[] {
  const ordem: SaudeCliente[] = ['critico', 'atencao', 'aguardando_cliente', 'normal', 'concluido'];
  return ordem.map((saude) => {
    const itens = resumos.filter((r) => r.saude === saude);
    return { saude, valor: itens.length, clientes: itens.map((r) => r.cliente) };
  });
}

export { nomeConsultor };
export type { AtividadeResolvida };
