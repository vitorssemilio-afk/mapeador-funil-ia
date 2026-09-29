// Critérios de Entrega — "a implementação foi corretamente entregue?" —
// separados dos Indicadores de Adoção (checkpoints_adocao) e do status
// comercial de contratação do Kommo (implementacoes_crm.status_contratacao_kommo).
// Nenhum dos três deve se misturar: contratar o plano pago, abandonar
// planilhas, usar relatórios com frequência ou o resultado do Checkpoint 30
// dias nunca contam como critério técnico de entrega.
import type { CriterioEntrega, CriterioEntregaStatus, StatusContratacaoKommo, StatusCriterioEntrega } from '../types/database';

export const STATUS_CRITERIO_LABELS: Record<StatusCriterioEntrega, string> = {
  pendente: 'Pendente',
  em_validacao: 'Em validação',
  concluido: 'Concluído',
  nao_se_aplica: 'Não se aplica',
};

export const STATUS_CRITERIO_TONE: Record<StatusCriterioEntrega, 'warning' | 'info' | 'success' | 'danger'> = {
  pendente: 'warning',
  em_validacao: 'info',
  concluido: 'success',
  nao_se_aplica: 'danger',
};

export const STATUS_CONTRATACAO_KOMMO_LABELS: Record<StatusContratacaoKommo, string> = {
  contratado: 'Contratado',
  em_decisao: 'Em decisão',
  nao_contratado: 'Não contratado',
};

export const STATUS_CONTRATACAO_KOMMO_TONE: Record<StatusContratacaoKommo, 'success' | 'warning' | 'danger'> = {
  contratado: 'success',
  em_decisao: 'warning',
  nao_contratado: 'danger',
};

export type ResumoCriteriosEntrega = {
  // Total considerado no indicador "X/Y" — exclui os marcados "não se
  // aplica" do denominador, senão um critério opcional puxaria o indicador
  // pra baixo sem nenhuma ação possível do time.
  concluidos: number;
  total: number;
  // true só quando TODO critério obrigatório está 'concluido' ou
  // 'nao_se_aplica' (com justificativa) — os não-obrigatórios não bloqueiam.
  todosObrigatoriosAtendidos: boolean;
};

export function resolverResumoCriteriosEntrega(
  criterios: CriterioEntrega[],
  statusRows: CriterioEntregaStatus[],
  implementacaoId: string,
): ResumoCriteriosEntrega {
  const statusPorCriterio = new Map(
    statusRows.filter((s) => s.implementacao_id === implementacaoId).map((s) => [s.criterio_id, s.status]),
  );

  const relevantes = criterios.filter((c) => statusPorCriterio.get(c.id) !== 'nao_se_aplica');
  const concluidos = relevantes.filter((c) => statusPorCriterio.get(c.id) === 'concluido').length;

  const obrigatorios = criterios.filter((c) => c.obrigatorio);
  const todosObrigatoriosAtendidos = obrigatorios.every((c) => {
    const status = statusPorCriterio.get(c.id) ?? 'pendente';
    return status === 'concluido' || status === 'nao_se_aplica';
  });

  return { concluidos, total: relevantes.length, todosObrigatoriosAtendidos };
}
