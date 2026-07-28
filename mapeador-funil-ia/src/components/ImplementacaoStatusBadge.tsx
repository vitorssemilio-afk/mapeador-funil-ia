import type { ImplementacaoStatus } from '../types/database';

export const IMPLEMENTACAO_STATUS_LABELS: Record<ImplementacaoStatus, string> = {
  pre_requisito: 'Pré-requisito',
  semana_1: 'Semana 1',
  semana_2: 'Semana 2',
  semana_3: 'Semana 3',
  semana_4: 'Semana 4',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const TONE: Record<ImplementacaoStatus, 'warning' | 'info' | 'success' | 'danger'> = {
  pre_requisito: 'warning',
  semana_1: 'info',
  semana_2: 'info',
  semana_3: 'info',
  semana_4: 'info',
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
