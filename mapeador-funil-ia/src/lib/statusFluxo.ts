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
// atual. 'funil_gerado' só pode ir pra revisão interna; da revisão em
// diante já é possível seguir o fluxo linear ou voltar um passo.
export const PROXIMOS_STATUS_MAPEAMENTO: Partial<Record<MapeamentoStatus, MapeamentoStatus[]>> = {
  funil_gerado: ['em_revisao_interna'],
  em_revisao_interna: ['pronto_kickoff'],
  pronto_kickoff: ['kickoff_agendado', 'em_revisao_interna'],
  kickoff_agendado: ['funil_validado', 'ajustes_solicitados'],
  ajustes_solicitados: ['em_revisao_interna', 'funil_validado'],
  funil_validado: ['ajustes_solicitados'],
  concluido: ['ajustes_solicitados'],
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
