// Módulo de Relatórios e Entrega Final (núcleo, Fase 1) — labels, tipos de
// snapshot e os montadores que consolidam dados JÁ existentes no sistema em
// cada documento. Nenhuma regra de negócio é recalculada aqui: cronograma,
// trial, critérios e adoção continuam vindo das fontes oficiais (ver
// src/lib/atividadesCronograma.ts, trialKommo.ts, criteriosEntrega.ts,
// diagnosticoAdocao.ts) — esta lib só organiza o que elas já calcularam.
import type { AtividadeResolvida } from './atividadesCronograma';
import { formatCampoEtapaLabel } from '../data/etapaCampos';
import {
  ATIVIDADES_FORA_KOMMO_LABELS,
  AUTONOMIA_EQUIPE_LABELS,
  PERCENTUAL_PROCESSO_LABELS,
  resolverDiagnosticoAdocao,
  USO_RELATORIOS_DECISAO_LABELS,
} from './diagnosticoAdocao';
import { nomeConsultor } from './operacaoResumo';
import { TIPOS_REUNIAO_OBRIGATORIOS, TIPO_REUNIAO_LABELS } from './reunioes';
import type {
  CheckpointAdocao,
  Cliente,
  ClienteOcorrencia,
  Consultor,
  CriterioEntrega,
  CriterioEntregaStatus,
  FunilGerado,
  FunilVersao,
  ImplementacaoCrm,
  Reuniao,
  StatusAceiteEntrega,
  StatusRelatorioImplementacao,
  TipoRelatorioImplementacao,
  VisaoRelatorio,
} from '../types/database';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { resolverResumoCriteriosEntrega, STATUS_CRITERIO_LABELS } from './criteriosEntrega';
import type { FaseCronograma } from './cronograma';

export const TIPO_RELATORIO_LABELS: Record<TipoRelatorioImplementacao, string> = {
  implementacao: 'Relatório de Implementação',
  funil_vendas: 'Documento do Funil de Vendas',
  funil_pos_venda: 'Documento do Funil de Pós-Venda',
  entrega_final: 'Relatório de Entrega Final',
  adocao: 'Relatório de Adoção',
  playbook: 'Playbook Final de Implementação',
};

export const STATUS_RELATORIO_LABELS: Record<StatusRelatorioImplementacao, string> = {
  rascunho: 'Rascunho',
  gerado: 'Gerado',
  final: 'Final',
  arquivado: 'Arquivado',
  entregue: 'Entregue',
};

export const STATUS_RELATORIO_TONE: Record<
  StatusRelatorioImplementacao,
  'neutral' | 'info' | 'success' | 'warning'
> = {
  rascunho: 'neutral',
  gerado: 'info',
  final: 'success',
  arquivado: 'warning',
  entregue: 'success',
};

export const VISAO_RELATORIO_LABELS: Record<VisaoRelatorio, string> = {
  executiva: 'Visão executiva',
  tecnica: 'Visão técnica',
};

export const STATUS_ACEITE_LABELS: Record<StatusAceiteEntrega, string> = {
  aguardando_aceite: 'Aguardando aceite',
  aceito: 'Aceito',
  aceito_com_ressalvas: 'Aceito com ressalvas',
  nao_aceito: 'Não aceito',
};

export const STATUS_ACEITE_TONE: Record<StatusAceiteEntrega, 'neutral' | 'success' | 'warning' | 'danger'> = {
  aguardando_aceite: 'neutral',
  aceito: 'success',
  aceito_com_ressalvas: 'warning',
  nao_aceito: 'danger',
};

// ============================================================
// Relatório de Implementação / Relatório de Entrega Final — mesma
// estrutura de fatos (seções 3 e 7 do pedido se sobrepõem quase
// totalmente); o que muda é o título, o texto editável e o fato de a
// entrega final alimentar o aceite.
// ============================================================
export type SnapshotConsolidadoImplementacao = {
  capa: {
    cliente: string;
    consultor: string | null;
    kickoffEm: string | null;
    conclusaoEm: string | null;
    duracaoDias: number | null;
    statusAtual: string;
  };
  linhaDoTempo: Array<{ marco: string; dataIso: string | null }>;
  cronograma: {
    diaInicial: string | null;
    conclusao: string | null;
    atividadesPrincipais: Array<{ nome: string; ciclo: string; status: string; dataRealIso: string | null }>;
    atrasosRelevantes: Array<{ nome: string; ciclo: string; atrasoDias: number }>;
  };
  reunioes: Array<{ tipo: string; status: string; dataHoraIso: string | null }>;
  ocorrencias: Array<{
    descricao: string;
    categoria: string;
    status: string;
    dataOcorrenciaIso: string;
    diasImpacto: number | null;
    resolvidaEmIso: string | null;
  }>;
  criterios: Array<{
    titulo: string;
    status: string;
    evidencia: string | null;
    responsavel: string | null;
    justificativaNaoAplica: string | null;
  }>;
  entregaveis: string[];
};

export function construirSnapshotConsolidadoImplementacao(input: {
  implementacao: ImplementacaoCrm;
  cliente: Cliente | null;
  consultores: Consultor[];
  fasesCronograma: FaseCronograma[];
  atividadesResolvidas: AtividadeResolvida[];
  reunioes: Reuniao[];
  ocorrencias: ClienteOcorrencia[];
  criterios: CriterioEntrega[];
  criteriosStatus: CriterioEntregaStatus[];
}): SnapshotConsolidadoImplementacao {
  const {
    implementacao,
    cliente,
    consultores,
    fasesCronograma,
    atividadesResolvidas,
    reunioes,
    ocorrencias,
    criterios,
    criteriosStatus,
  } = input;

  const kickoffEm = cliente?.kickoff_realizado_em ?? null;
  const faseConcluida = fasesCronograma.find((f) => f.status === 'entrega' && f.fim) ?? null;
  const conclusaoEm = implementacao.status === 'concluida' ? faseConcluida?.fim?.toISOString() ?? null : null;
  const duracaoDias =
    kickoffEm && conclusaoEm
      ? Math.round((new Date(conclusaoEm).getTime() - new Date(kickoffEm).getTime()) / 86400000)
      : null;

  const linhaDoTempo: SnapshotConsolidadoImplementacao['linhaDoTempo'] = [
    { marco: 'Formulário enviado', dataIso: null },
    { marco: 'Kickoff', dataIso: cliente?.kickoff_realizado_em ?? null },
    { marco: 'Conta Kommo criada', dataIso: cliente?.conta_kommo_criada_em ?? null },
    { marco: 'Treinamento', dataIso: cliente?.treinamento_realizado_em ?? null },
  ].concat(
    fasesCronograma
      .filter((f) => f.status === 'automacoes' || f.status === 'entrega')
      .map((f) => ({ marco: IMPLEMENTACAO_STATUS_LABELS[f.status], dataIso: f.inicio.toISOString() })),
  );

  const atividadesReais = atividadesResolvidas.filter((a) => a.id !== null);
  const atividadesPrincipais = atividadesReais
    .filter((a) => a.status === 'concluido')
    .map((a) => ({ nome: a.nome, ciclo: a.ciclo, status: a.status, dataRealIso: a.dataReal?.toISOString() ?? null }));
  const atrasosRelevantes = atividadesReais
    .filter((a) => a.atrasoDias > 0)
    .map((a) => ({ nome: a.nome, ciclo: a.ciclo, atrasoDias: a.atrasoDias }));

  const resumoCriterios = resolverResumoCriteriosEntrega(criterios, criteriosStatus, implementacao.id);
  const statusPorCriterio = new Map(
    criteriosStatus.filter((s) => s.implementacao_id === implementacao.id).map((s) => [s.criterio_id, s]),
  );

  return {
    capa: {
      cliente: implementacao.nome_cliente,
      consultor: nomeConsultor(implementacao.consultor_responsavel_id, consultores),
      kickoffEm,
      conclusaoEm,
      duracaoDias,
      statusAtual: IMPLEMENTACAO_STATUS_LABELS[implementacao.status],
    },
    linhaDoTempo,
    cronograma: {
      diaInicial: kickoffEm,
      conclusao: conclusaoEm,
      atividadesPrincipais,
      atrasosRelevantes,
    },
    reunioes: reunioes.map((r) => ({ tipo: TIPO_REUNIAO_LABELS[r.tipo], status: r.status, dataHoraIso: r.data_hora })),
    ocorrencias: ocorrencias.map((o) => ({
      descricao: o.descricao,
      categoria: o.categoria,
      status: o.status,
      dataOcorrenciaIso: o.data_ocorrencia,
      diasImpacto: o.dias_impacto,
      resolvidaEmIso: o.resolvida_em,
    })),
    criterios: criterios.map((c) => {
      const status = statusPorCriterio.get(c.id);
      return {
        titulo: c.nome,
        status: STATUS_CRITERIO_LABELS[status?.status ?? 'pendente'],
        evidencia: status?.evidencia ?? null,
        responsavel: nomeConsultor(status?.responsavel_validacao_id ?? null, consultores),
        justificativaNaoAplica: status?.justificativa_nao_aplica ?? null,
      };
    }),
    entregaveis: [
      ...(resumoCriterios.todosObrigatoriosAtendidos ? ['Critérios técnicos de entrega concluídos'] : []),
      ...(cliente?.treinamento_realizado_em ? ['Treinamento da equipe realizado'] : []),
      ...(cliente?.conta_kommo_criada_em ? ['Conta Kommo configurada'] : []),
    ],
  };
}

// ============================================================
// Documento do Funil (vendas ou pós-venda) — usa exclusivamente a versão
// APROVADA (nunca rascunho). A visão executiva/técnica é decidida na
// geração e só controla o que a tela de impressão exibe — o snapshot
// sempre guarda o conteúdo completo.
// ============================================================
export type SnapshotDocumentoFunil = {
  nomeProcesso: string;
  versao: number;
  aprovadaEmIso: string | null;
  aprovadaPorEmail: string | null;
  etapas: Array<{
    nome: string;
    objetivo: string;
    entrada: string;
    saida: string;
    responsavel: string;
    sla: string;
    camposObrigatorios: string[];
    camposDesejaveis: string[];
    automacao: string[];
    script: string | null;
    regrasNegocio: string[];
    regrasPerda: string[];
    tarefas: string[];
  }>;
};

export function construirSnapshotDocumentoFunil(input: {
  nomeProcesso: string;
  versaoAprovada: FunilVersao;
  funis: FunilGerado[];
}): SnapshotDocumentoFunil {
  const { nomeProcesso, versaoAprovada, funis } = input;

  const etapas = funis.flatMap((f) =>
    f.etapas.map((etapa) => ({
      nome: etapa.nome,
      objetivo: etapa.objetivo,
      entrada: etapa.gatilho_entrada,
      saida: etapa.gatilho_saida,
      responsavel: etapa.responsavel,
      sla: etapa.sla,
      camposObrigatorios: (etapa.campos_obrigatorios ?? []).map(formatCampoEtapaLabel),
      camposDesejaveis: (etapa.campos_desejaveis ?? []).map(formatCampoEtapaLabel),
      automacao: etapa.automacao ?? [],
      script: etapa.script_sugerido,
      regrasNegocio: etapa.regras_negocio ?? [],
      regrasPerda: etapa.regras_perda ?? [],
      tarefas: etapa.tarefas ?? [],
    })),
  );

  return {
    nomeProcesso,
    versao: versaoAprovada.versao,
    aprovadaEmIso: versaoAprovada.aprovada_em,
    aprovadaPorEmail: versaoAprovada.aprovada_por_email,
    etapas,
  };
}

// ============================================================
// Checklist de prontidão da entrega (seção 6) — só itens que já têm uma
// fonte oficial no sistema hoje (não inventa campos de rastreio novos como
// "pipeline configurado" ou "automações testadas", que não existem como
// dado estruturado em nenhuma tabela — ver limitação conhecida no relatório
// técnico final do módulo).
// ============================================================
export type ItemChecklistEntrega = {
  label: string;
  atendido: boolean;
};

export type ChecklistEntregaResultado = {
  itens: ItemChecklistEntrega[];
  concluidos: number;
  total: number;
  pronto: boolean;
};

export function calcularChecklistEntrega(input: {
  funilAprovado: boolean;
  treinamentoRealizado: boolean;
  reunioesObrigatoriasRealizadas: boolean;
  criteriosObrigatoriosAtendidos: boolean;
  documentacaoEntregaPreparada: boolean;
}): ChecklistEntregaResultado {
  const itens: ItemChecklistEntrega[] = [
    { label: 'Funil de vendas aprovado', atendido: input.funilAprovado },
    { label: 'Treinamento da equipe realizado', atendido: input.treinamentoRealizado },
    { label: 'Reuniões obrigatórias realizadas', atendido: input.reunioesObrigatoriasRealizadas },
    { label: 'Critérios técnicos de entrega concluídos', atendido: input.criteriosObrigatoriosAtendidos },
    { label: 'Documentação de entrega preparada', atendido: input.documentacaoEntregaPreparada },
  ];
  const concluidos = itens.filter((i) => i.atendido).length;
  return { itens, concluidos, total: itens.length, pronto: concluidos === itens.length };
}

export function tiposReuniaoObrigatoriasRealizadas(reunioes: Reuniao[]): boolean {
  return TIPOS_REUNIAO_OBRIGATORIOS.every((tipo) => reunioes.some((r) => r.tipo === tipo && r.status === 'realizada'));
}

// ============================================================
// Relatório de Adoção (Fase 2, seção 22) — só existe quando já houve
// resposta ao Checkpoint de 30 dias. O diagnóstico (saudável/atenção/
// crítico) vem inteiro de resolverDiagnosticoAdocao — a mesma regra oficial
// já usada na tela da implementação, nunca recalculada aqui.
// ============================================================
export type SnapshotRelatorioAdocao = {
  respondidoEmIso: string;
  status: 'saudavel' | 'atencao' | 'critico';
  sinais: string[];
  recomendacoes: string[];
  percentualProcessoKommo: string | null;
  autonomiaEquipe: string | null;
  usoRelatoriosDecisao: string | null;
  atividadesForaKommo: string | null;
  quaisAtividadesForaKommo: string | null;
  principalDificuldade: string | null;
};

export function construirSnapshotRelatorioAdocao(checkpoint: CheckpointAdocao): SnapshotRelatorioAdocao {
  const diagnostico = resolverDiagnosticoAdocao(checkpoint);
  return {
    respondidoEmIso: checkpoint.respondido_em,
    status: diagnostico.status,
    sinais: diagnostico.sinais,
    recomendacoes: diagnostico.recomendacoes,
    percentualProcessoKommo: checkpoint.percentual_processo_kommo
      ? PERCENTUAL_PROCESSO_LABELS[checkpoint.percentual_processo_kommo]
      : null,
    autonomiaEquipe: checkpoint.autonomia_equipe ? AUTONOMIA_EQUIPE_LABELS[checkpoint.autonomia_equipe] : null,
    usoRelatoriosDecisao: checkpoint.uso_relatorios_decisao
      ? USO_RELATORIOS_DECISAO_LABELS[checkpoint.uso_relatorios_decisao]
      : null,
    atividadesForaKommo: checkpoint.atividades_fora_kommo
      ? ATIVIDADES_FORA_KOMMO_LABELS[checkpoint.atividades_fora_kommo]
      : null,
    quaisAtividadesForaKommo: checkpoint.quais_atividades_fora_kommo,
    principalDificuldade: checkpoint.principal_dificuldade,
  };
}

// ============================================================
// Vínculo com a reunião final (Fase 2, seção 28) — rótulo derivado do
// status já existente da reunião tipo 'reuniao_final', sem nenhum campo
// novo: antes dela acontecer, a entrega está "em preparação"; depois,
// "apresentada".
// ============================================================
export type StatusPreparoEntrega = 'preparando_entrega' | 'entrega_apresentada';

export const STATUS_PREPARO_ENTREGA_LABELS: Record<StatusPreparoEntrega, string> = {
  preparando_entrega: 'Preparando entrega',
  entrega_apresentada: 'Entrega apresentada',
};

export function resolverStatusPreparoEntrega(reunioes: Reuniao[]): StatusPreparoEntrega {
  const reuniaoFinalRealizada = reunioes.some((r) => r.tipo === 'reuniao_final' && r.status === 'realizada');
  return reuniaoFinalRealizada ? 'entrega_apresentada' : 'preparando_entrega';
}
