import type { MapeamentoStatus } from '../types/database';

const LABELS: Record<MapeamentoStatus, string> = {
  em_preenchimento: 'Em preenchimento',
  processando_ia: 'Processando IA',
  concluido: 'Concluído',
  erro: 'Erro',
};

export function StatusBadge({ status }: { status: MapeamentoStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}
