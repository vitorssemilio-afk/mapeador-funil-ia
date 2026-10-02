// Módulo de Templates de Implementação (núcleo, Fase 1) — labels e
// pequenos helpers compartilhados entre a lista e o editor de templates.
import type { StatusTemplate, TipoCriterioTemplate } from '../types/database';

export const STATUS_TEMPLATE_LABELS: Record<StatusTemplate, string> = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  arquivado: 'Arquivado',
};

export const STATUS_TEMPLATE_TONE: Record<StatusTemplate, 'neutral' | 'success' | 'warning'> = {
  rascunho: 'neutral',
  ativo: 'success',
  arquivado: 'warning',
};

export const TIPO_CRITERIO_TEMPLATE_LABELS: Record<TipoCriterioTemplate, string> = {
  entrega: 'Entrega',
  adocao: 'Adoção',
};
