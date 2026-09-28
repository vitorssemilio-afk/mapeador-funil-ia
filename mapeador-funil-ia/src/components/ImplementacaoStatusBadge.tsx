import type { ImplementacaoStatus } from '../types/database';

export const IMPLEMENTACAO_STATUS_LABELS: Record<ImplementacaoStatus, string> = {
  preparacao_crm: 'Preparação do CRM',
  crm_em_configuracao: 'CRM em configuração',
  treinamento_agendado: 'Treinamento agendado',
  automacoes: 'Automações',
  entrega: 'Entrega',
  adocao: 'Adoção',
  concluida: 'Concluído',
  cancelada: 'Cancelada',
};

const TONE: Record<ImplementacaoStatus, 'warning' | 'info' | 'success' | 'danger'> = {
  preparacao_crm: 'warning',
  crm_em_configuracao: 'info',
  treinamento_agendado: 'info',
  automacoes: 'info',
  entrega: 'info',
  adocao: 'info',
  concluida: 'success',
  cancelada: 'danger',
};

export function ImplementacaoStatusBadge({ status }: { status: ImplementacaoStatus }) {
  return (
    <span className={`status-badge status-tone-${TONE[status]}`}>
      {IMPLEMENTACAO_STATUS_LABELS[status]}
    </span>
  );
}
