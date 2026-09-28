import type { MapeamentoStatus } from '../types/database';
import { MAPEAMENTO_STATUS_LABELS } from '../lib/statusFluxo';

const TONE: Record<MapeamentoStatus, 'warning' | 'info' | 'success' | 'danger'> = {
  em_preenchimento: 'warning',
  processando_ia: 'info',
  aguardando_esclarecimento: 'warning',
  funil_gerado: 'info',
  em_revisao_interna: 'info',
  pronto_kickoff: 'info',
  kickoff_agendado: 'info',
  ajustes_solicitados: 'warning',
  funil_validado: 'success',
  concluido: 'success',
  erro: 'danger',
};

type Props = {
  status: MapeamentoStatus;
  enviadoPeloCliente?: boolean;
};

export function StatusBadge({ status, enviadoPeloCliente = false }: Props) {
  if (status === 'em_preenchimento' && enviadoPeloCliente) {
    return <span className="status-badge status-tone-success">Cliente respondeu</span>;
  }

  return (
    <span className={`status-badge status-tone-${TONE[status]}`}>{MAPEAMENTO_STATUS_LABELS[status]}</span>
  );
}
