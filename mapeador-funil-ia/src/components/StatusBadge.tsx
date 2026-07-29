import type { MapeamentoStatus } from '../types/database';

const LABELS: Record<MapeamentoStatus, string> = {
  em_preenchimento: 'Em preenchimento',
  processando_ia: 'Processando IA',
  aguardando_esclarecimento: 'IA pediu esclarecimento',
  concluido: 'Concluído',
  erro: 'Erro',
};

type Props = {
  status: MapeamentoStatus;
  enviadoPeloCliente?: boolean;
};

export function StatusBadge({ status, enviadoPeloCliente = false }: Props) {
  if (status === 'em_preenchimento' && enviadoPeloCliente) {
    return <span className="status-badge status-concluido">Cliente respondeu</span>;
  }

  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}
