// Regras do ciclo de vida do mapeamento (vendas/pós-venda) depois que a IA
// já gerou o funil. A partir daí o avanço é manual — feito pelo time, não
// pela IA — passando por revisão interna, kickoff com o cliente e (se
// necessário) uma ou mais rodadas de ajustes, até o cliente validar o
// funil de fato.
import type { MapeamentoStatus } from '../types/database';

// Todo status a partir do qual já existe um funil gerado pela IA pra
// mostrar na tela (inclui os estados manuais de revisão/kickoff/ajustes, e
// o 'concluido' legado — ver types/database.ts).
const COM_FUNIL_GERADO = new Set<MapeamentoStatus>([
  'funil_gerado',
  'em_revisao_interna',
  'pronto_kickoff',
  'kickoff_agendado',
  'ajustes_solicitados',
  'funil_validado',
  'concluido',
]);

export function funilJaGerado(status: MapeamentoStatus): boolean {
  return COM_FUNIL_GERADO.has(status);
}

// Mesmo conjunto acima, em array — útil pra `.in('status', ...)` em queries.
export const STATUS_COM_FUNIL_GERADO = [...COM_FUNIL_GERADO];

// Só depois que o cliente validou o funil (na reunião de Kickoff, ou numa
// rodada de ajustes) é que a implementação de CRM pode começar.
const VALIDADOS = new Set<MapeamentoStatus>(['funil_validado', 'concluido']);

export function funilValidado(status: MapeamentoStatus): boolean {
  return VALIDADOS.has(status);
}

// Checklist de pré-requisitos do Kickoff (ver ImplementacaoDetalhe, aba
// Reuniões): "em ou depois de" em vez de "igual a", porque o fluxo permite
// voltar um passo (ex: ajustes_solicitados → em_revisao_interna) sem que
// isso desfaça marcos já alcançados antes.
const EM_OU_APOS_REVISAO_INTERNA = new Set<MapeamentoStatus>([
  'em_revisao_interna',
  'pronto_kickoff',
  'kickoff_agendado',
  'ajustes_solicitados',
  'funil_validado',
  'concluido',
]);

export function emOuAposRevisaoInterna(status: MapeamentoStatus): boolean {
  return EM_OU_APOS_REVISAO_INTERNA.has(status);
}

const EM_OU_APOS_PRONTO_KICKOFF = new Set<MapeamentoStatus>([
  'pronto_kickoff',
  'kickoff_agendado',
  'ajustes_solicitados',
  'funil_validado',
  'concluido',
]);

export function emOuAposProntoKickoff(status: MapeamentoStatus): boolean {
  return EM_OU_APOS_PRONTO_KICKOFF.has(status);
}

// Estados manuais do fluxo pós-geração — não são escritos pela IA, só por
// ação do time.
export const MAPEAMENTO_STATUS_MANUAIS: MapeamentoStatus[] = [
  'em_revisao_interna',
  'pronto_kickoff',
  'kickoff_agendado',
  'ajustes_solicitados',
  'funil_validado',
];

// Pra qual(is) status dá pra avançar manualmente a partir de cada status
// atual, pelos botões genéricos de Mapeamento.tsx. 'funil_gerado' só pode ir
// pra revisão interna; da revisão em diante já é possível seguir o fluxo
// linear ou voltar um passo.
//
// Prompt 62 (ETAPA 4/7, regras inegociáveis #2 e #5): 'kickoff_agendado' e
// toda transição que representa uma DECISÃO DO CLIENTE sobre o funil
// (funil_validado/ajustes_solicitados a partir daqui) saíram desta tabela —
// elas não são mais um botão genérico de troca de status. 'kickoff_agendado'
// agora só é alcançado de verdade ao agendar a reunião (ver
// ImplementacaoDetalhe.tsx, handleSalvarReuniao), e a decisão do cliente só
// é registrada pela ação própria "Registrar validação do cliente" (mesmo
// arquivo, registrarValidacaoFunil em funilVersoes.ts) — nunca mais como
// efeito colateral de avançar um status aqui. 'ajustes_solicitados' →
// 'em_revisao_interna' continua manual: é o time decidindo agir sobre um
// pedido já registrado, não uma nova decisão do cliente.
export const PROXIMOS_STATUS_MAPEAMENTO: Partial<Record<MapeamentoStatus, MapeamentoStatus[]>> = {
  funil_gerado: ['em_revisao_interna'],
  em_revisao_interna: ['pronto_kickoff'],
  ajustes_solicitados: ['em_revisao_interna'],
};

export const MAPEAMENTO_STATUS_LABELS: Record<MapeamentoStatus, string> = {
  em_preenchimento: 'Em preenchimento',
  processando_ia: 'Processando IA',
  aguardando_esclarecimento: 'IA pediu esclarecimento',
  funil_gerado: 'Funil gerado',
  em_revisao_interna: 'Em revisão interna',
  pronto_kickoff: 'Pronto para Kickoff',
  kickoff_agendado: 'Kickoff agendado',
  ajustes_solicitados: 'Ajustes solicitados',
  funil_validado: 'Funil validado',
  concluido: 'Funil validado',
  erro: 'Erro',
};
