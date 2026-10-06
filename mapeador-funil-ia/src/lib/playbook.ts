// Playbook Final de Implementação — monta o documento a partir de dados que
// JÁ existem no sistema (seção 3 do pedido), reaproveitando ao máximo o que
// o módulo de Relatórios/Entrega já resolve (construirSnapshotDocumentoFunil
// pro funil, resolverResumoCriteriosEntrega pros critérios etc.) em vez de
// recalcular nada. Seções sem fonte estruturada no produto hoje (objetivos,
// regras de movimentação, integrações, follow-up, motivos de perda, bot,
// indicadores, rotinas, regras de ouro, boas práticas, gestão de mudanças,
// fora do escopo, próximos passos, suporte) ficam só em texto_editavel —
// nunca inventadas a partir de dado estruturado que não existe.
import type {
  CheckpointAdocao,
  Cliente,
  Consultor,
  CriterioEntrega,
  CriterioEntregaStatus,
  EntregaAceite,
  EntregaRessalva,
  FunilGerado,
  FunilVersao,
  ImplementacaoCrm,
  Reuniao,
} from '../types/database';
import { resolverResumoCriteriosEntrega, STATUS_CRITERIO_LABELS } from './criteriosEntrega';
import { nomeConsultor } from './operacaoResumo';
import { construirSnapshotDocumentoFunil, STATUS_ACEITE_LABELS, type SnapshotDocumentoFunil } from './relatoriosEntrega';

export type SecaoPlaybookChave =
  | 'sobre'
  | 'objetivos'
  | 'visaoGeral'
  | 'jornadaComercial'
  | 'funilVendas'
  | 'funilPosVenda'
  | 'regrasMovimentacao'
  | 'camposPersonalizados'
  | 'automacoes'
  | 'responsabilidades'
  | 'usuarios'
  | 'treinamentos'
  | 'entregasRealizadas'
  | 'pendenciasRessalvas'
  | 'foraDoEscopo'
  | 'boasPraticas'
  | 'rotinaVendedor'
  | 'rotinaGestor'
  | 'regrasDeOuro'
  | 'gestaoMudancas'
  | 'proximosPassos'
  | 'suporte'
  | 'aceite';

// origem 'automatica' = construída a partir de dado real a cada geração;
// 'manual' = só existe em texto_editavel (ver TEXTO_SUGERIDO_SECAO_MANUAL
// abaixo), consultor é quem escreve/edita/oculta.
export const SECOES_PLAYBOOK: { chave: SecaoPlaybookChave; titulo: string; origem: 'automatica' | 'manual' }[] = [
  { chave: 'sobre', titulo: 'Sobre este documento', origem: 'manual' },
  { chave: 'objetivos', titulo: 'Objetivos da implementação', origem: 'manual' },
  { chave: 'visaoGeral', titulo: 'Visão geral da solução', origem: 'automatica' },
  { chave: 'jornadaComercial', titulo: 'Jornada comercial', origem: 'automatica' },
  { chave: 'funilVendas', titulo: 'Funil de vendas', origem: 'automatica' },
  { chave: 'funilPosVenda', titulo: 'Pós-venda', origem: 'automatica' },
  { chave: 'regrasMovimentacao', titulo: 'Regras de movimentação', origem: 'manual' },
  { chave: 'camposPersonalizados', titulo: 'Campos personalizados', origem: 'automatica' },
  { chave: 'automacoes', titulo: 'Automações', origem: 'automatica' },
  { chave: 'responsabilidades', titulo: 'Responsabilidades', origem: 'automatica' },
  { chave: 'usuarios', titulo: 'Usuários e acessos', origem: 'automatica' },
  { chave: 'treinamentos', titulo: 'Treinamentos realizados', origem: 'automatica' },
  { chave: 'entregasRealizadas', titulo: 'Entregas realizadas', origem: 'automatica' },
  { chave: 'pendenciasRessalvas', titulo: 'Pendências e ressalvas', origem: 'automatica' },
  { chave: 'foraDoEscopo', titulo: 'Fora do escopo', origem: 'manual' },
  { chave: 'boasPraticas', titulo: 'Boas práticas futuras', origem: 'manual' },
  { chave: 'rotinaVendedor', titulo: 'Rotina recomendada para vendedores', origem: 'manual' },
  { chave: 'rotinaGestor', titulo: 'Rotina recomendada para gestores', origem: 'manual' },
  { chave: 'regrasDeOuro', titulo: 'Regras de ouro do CRM', origem: 'manual' },
  { chave: 'gestaoMudancas', titulo: 'Gestão de mudanças', origem: 'manual' },
  { chave: 'proximosPassos', titulo: 'Próximos passos', origem: 'manual' },
  { chave: 'suporte', titulo: 'Suporte', origem: 'manual' },
  { chave: 'aceite', titulo: 'Aceite da implementação', origem: 'automatica' },
];

// Texto padrão sugerido pras seções manuais — ponto de partida editável, não
// uma regra do cliente (o pedido é explícito: "boa prática recomendada",
// nunca apresentado como já definido pelo cliente). Pré-preenche
// texto_editavel na primeira geração; o consultor edita/apaga livremente.
export const TEXTO_SUGERIDO_SECAO_MANUAL: Partial<Record<SecaoPlaybookChave, string>> = {
  sobre:
    'Este playbook consolida os processos, configurações, automações e boas práticas definidos durante a implementação do CRM. O documento serve como referência para gestores e usuários da operação, garantindo continuidade e padronização após a conclusão do projeto.',
  objetivos: '',
  regrasMovimentacao: '',
  foraDoEscopo: '',
  boasPraticas:
    '- Não alterar etapas do funil sem revisar as automações associadas.\n- Não criar campos personalizados sem necessidade real.\n- Manter os motivos de perda padronizados.\n- Redistribuir os leads de um usuário antes de desativá-lo.\n- Documentar qualquer mudança estrutural no CRM.',
  rotinaVendedor:
    'Início do dia: revisar tarefas, verificar leads novos e contatos atrasados.\nDurante o dia: registrar interações, atualizar etapas, sempre deixar uma próxima ação definida.\nFinal do dia: revisar oportunidades sem próxima ação e atualizar o pipeline.',
  rotinaGestor:
    'Diário: acompanhar leads parados e oportunidades sem próxima ação.\nSemanal: revisar o pipeline por etapa e os motivos de perda registrados.\nMensal: revisar indicadores gerais da operação.',
  regrasDeOuro:
    '1. Se não está no CRM, não aconteceu.\n2. Toda oportunidade deve ter uma próxima ação definida.\n3. O funil deve representar a situação real do cliente.\n4. Toda perda deve ter um motivo registrado.\n5. O CRM é a fonte oficial da operação comercial.',
  gestaoMudancas:
    'Mudanças estruturais no CRM (etapas, automações, campos) podem impactar relatórios e integrações existentes — avalie o impacto antes de alterar.',
  proximosPassos: '',
  suporte: '',
};

export type SnapshotPlaybook = {
  capa: {
    cliente: string;
    consultor: string | null;
    crm: string;
    kickoffEmIso: string | null;
    dataEntregaIso: string | null;
  };
  visaoGeral: Array<{ componente: string; status: 'Implementado' | 'Não aplicável' }>;
  jornadaComercial: string[];
  funilVendas: SnapshotDocumentoFunil | null;
  funilPosVenda: SnapshotDocumentoFunil | null;
  camposPersonalizados: Array<{ campo: string; etapa: string; obrigatorio: boolean }>;
  automacoes: Array<{ automacao: string; etapa: string }>;
  responsabilidades: Array<{ atividade: string; responsavel: string }>;
  usuarios: Array<{ nome: string; papel: string }>;
  treinamentos: Array<{ dataHoraIso: string | null; status: string }>;
  entregasRealizadas: Array<{ item: string; status: string }>;
  pendenciasRessalvas: Array<{ item: string; status: string }>;
  aceite: { status: string | null; ressalvas: string[] };
};

export function construirSnapshotPlaybook(input: {
  implementacao: ImplementacaoCrm;
  cliente: Cliente | null;
  consultores: Consultor[];
  versaoFunilVendasAprovada: FunilVersao | null;
  funisVendas: FunilGerado[];
  versaoFunilPosVendaAprovada: FunilVersao | null;
  funisPosVenda: FunilGerado[];
  reunioes: Reuniao[];
  criterios: CriterioEntrega[];
  criteriosStatus: CriterioEntregaStatus[];
  ressalvas: EntregaRessalva[];
  aceite: EntregaAceite | null;
  checkpointAdocao: CheckpointAdocao | null;
}): SnapshotPlaybook {
  const {
    implementacao,
    cliente,
    consultores,
    versaoFunilVendasAprovada,
    funisVendas,
    versaoFunilPosVendaAprovada,
    funisPosVenda,
    reunioes,
    criterios,
    criteriosStatus,
    ressalvas,
    aceite,
    checkpointAdocao,
  } = input;

  const funilVendas = versaoFunilVendasAprovada
    ? construirSnapshotDocumentoFunil({
        nomeProcesso: implementacao.nome_cliente,
        versaoAprovada: versaoFunilVendasAprovada,
        funis: funisVendas,
      })
    : null;

  const funilPosVenda = versaoFunilPosVendaAprovada
    ? construirSnapshotDocumentoFunil({
        nomeProcesso: implementacao.nome_cliente,
        versaoAprovada: versaoFunilPosVendaAprovada,
        funis: funisPosVenda,
      })
    : null;

  const treinamentoRealizado = !!cliente?.treinamento_realizado_em;
  const resumoCriterios = resolverResumoCriteriosEntrega(criterios, criteriosStatus, implementacao.id);
  const statusPorCriterio = new Map(
    criteriosStatus.filter((s) => s.implementacao_id === implementacao.id).map((s) => [s.criterio_id, s]),
  );

  const visaoGeral: SnapshotPlaybook['visaoGeral'] = [
    { componente: 'Funil de vendas', status: funilVendas ? 'Implementado' : 'Não aplicável' },
    { componente: 'Funil de pós-venda', status: funilPosVenda ? 'Implementado' : 'Não aplicável' },
    { componente: 'Treinamento da equipe', status: treinamentoRealizado ? 'Implementado' : 'Não aplicável' },
    {
      componente: 'Critérios técnicos de entrega',
      status: resumoCriterios.todosObrigatoriosAtendidos ? 'Implementado' : 'Não aplicável',
    },
    { componente: 'Checkpoint de 30 dias (adoção)', status: checkpointAdocao ? 'Implementado' : 'Não aplicável' },
  ];

  const camposPersonalizados: SnapshotPlaybook['camposPersonalizados'] = (funilVendas?.etapas ?? []).flatMap(
    (etapa) => [
      ...etapa.camposObrigatorios.map((campo) => ({ campo, etapa: etapa.nome, obrigatorio: true })),
      ...etapa.camposDesejaveis.map((campo) => ({ campo, etapa: etapa.nome, obrigatorio: false })),
    ],
  );

  const automacoes: SnapshotPlaybook['automacoes'] = (funilVendas?.etapas ?? []).flatMap((etapa) =>
    etapa.automacao.map((automacao) => ({ automacao, etapa: etapa.nome })),
  );

  const responsabilidades: SnapshotPlaybook['responsabilidades'] = (funilVendas?.etapas ?? [])
    .filter((etapa) => etapa.responsavel)
    .map((etapa) => ({ atividade: etapa.nome, responsavel: etapa.responsavel }));

  const idsVinculados = new Set(
    [implementacao.consultor_responsavel_id, implementacao.consultor_adicional_id].filter(
      (v): v is string => v != null,
    ),
  );
  const usuarios: SnapshotPlaybook['usuarios'] = consultores
    .filter((c) => idsVinculados.has(c.id))
    .map((c) => ({
      nome: c.nome,
      papel: c.id === implementacao.consultor_responsavel_id ? 'Consultor responsável' : 'Consultor de apoio',
    }));

  const treinamentos: SnapshotPlaybook['treinamentos'] = reunioes
    .filter((r) => r.tipo === 'treinamento')
    .map((r) => ({ dataHoraIso: r.data_hora, status: r.status }));

  const entregasRealizadas: SnapshotPlaybook['entregasRealizadas'] = criterios.map((c) => ({
    item: c.nome,
    status: STATUS_CRITERIO_LABELS[statusPorCriterio.get(c.id)?.status ?? 'pendente'],
  }));

  const pendenciasRessalvas: SnapshotPlaybook['pendenciasRessalvas'] = ressalvas.map((r) => ({
    item: r.ressalva,
    status: r.resolvida ? 'Resolvida' : 'Pendente',
  }));

  return {
    capa: {
      cliente: implementacao.nome_cliente,
      consultor: nomeConsultor(implementacao.consultor_responsavel_id, consultores),
      crm: 'Kommo',
      kickoffEmIso: cliente?.kickoff_realizado_em ?? null,
      dataEntregaIso: new Date().toISOString(),
    },
    visaoGeral,
    jornadaComercial: (funilVendas?.etapas ?? []).map((e) => e.nome),
    funilVendas,
    funilPosVenda,
    camposPersonalizados,
    automacoes,
    responsabilidades,
    usuarios,
    treinamentos,
    entregasRealizadas,
    pendenciasRessalvas,
    aceite: {
      status: aceite ? STATUS_ACEITE_LABELS[aceite.status] : null,
      ressalvas: ressalvas.map((r) => r.ressalva),
    },
  };
}

export type PlaybookTextoEditavel = {
  // Chaves na ordem de exibição — seções omitidas aqui entram no fim, na
  // ordem padrão de SECOES_PLAYBOOK (nunca desaparecem por engano).
  ordem: SecaoPlaybookChave[];
  ocultas: SecaoPlaybookChave[];
  // Texto manual (seções 'manual') ou override de uma seção 'automatica'
  // (consultor complementou/reescreveu por cima do dado gerado). Nunca
  // altera conteudo_snapshot — "Restaurar" simplesmente remove a chave daqui.
  overrides: Partial<Record<SecaoPlaybookChave, string>>;
};

export function ordemPlaybook(textoEditavel: PlaybookTextoEditavel | null): SecaoPlaybookChave[] {
  const ordemSalva = textoEditavel?.ordem ?? [];
  const resto = SECOES_PLAYBOOK.map((s) => s.chave).filter((c) => !ordemSalva.includes(c));
  return [...ordemSalva.filter((c) => SECOES_PLAYBOOK.some((s) => s.chave === c)), ...resto];
}

export function textoEditavelInicial(): PlaybookTextoEditavel {
  return {
    ordem: SECOES_PLAYBOOK.map((s) => s.chave),
    ocultas: [],
    overrides: { ...TEXTO_SUGERIDO_SECAO_MANUAL },
  };
}

// Seção 'automatica' tem dado quando o array/objeto correspondente do
// snapshot não está vazio — usado só pra decidir o status mostrado no
// editor (Completa/Sem dados), nunca pra esconder a seção sozinho (isso é
// sempre decisão do consultor, em `ocultas`).
function secaoAutomaticaTemDado(chave: SecaoPlaybookChave, snapshot: SnapshotPlaybook): boolean {
  switch (chave) {
    case 'visaoGeral':
      return snapshot.visaoGeral.some((v) => v.status === 'Implementado');
    case 'jornadaComercial':
      return snapshot.jornadaComercial.length > 0;
    case 'funilVendas':
      return snapshot.funilVendas != null && snapshot.funilVendas.etapas.length > 0;
    case 'funilPosVenda':
      return snapshot.funilPosVenda != null && snapshot.funilPosVenda.etapas.length > 0;
    case 'camposPersonalizados':
      return snapshot.camposPersonalizados.length > 0;
    case 'automacoes':
      return snapshot.automacoes.length > 0;
    case 'responsabilidades':
      return snapshot.responsabilidades.length > 0;
    case 'usuarios':
      return snapshot.usuarios.length > 0;
    case 'treinamentos':
      return snapshot.treinamentos.length > 0;
    case 'entregasRealizadas':
      return snapshot.entregasRealizadas.length > 0;
    case 'pendenciasRessalvas':
      return snapshot.pendenciasRessalvas.length > 0;
    case 'aceite':
      return snapshot.aceite.status != null;
    default:
      return false;
  }
}

export type StatusSecaoPlaybook = 'Completa' | 'Sem dados' | 'Oculta';

export function statusSecaoPlaybook(
  chave: SecaoPlaybookChave,
  snapshot: SnapshotPlaybook,
  textoEditavel: PlaybookTextoEditavel,
): StatusSecaoPlaybook {
  if (textoEditavel.ocultas.includes(chave)) return 'Oculta';
  const manifesto = SECOES_PLAYBOOK.find((s) => s.chave === chave);
  if (manifesto?.origem === 'manual') {
    return (textoEditavel.overrides[chave] ?? '').trim() ? 'Completa' : 'Sem dados';
  }
  return secaoAutomaticaTemDado(chave, snapshot) ? 'Completa' : 'Sem dados';
}
