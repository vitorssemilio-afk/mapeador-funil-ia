// Integração com o App de Atas (MVP) — labels/tons compartilhados entre a
// seção "Ata" da reunião (ImplementacaoDetalhe/ClienteDetalhe) e a área de
// erros de integração (ObservabilidadeIA). Nenhuma regra de negócio mora
// aqui — a identificação de vínculo e a idempotência acontecem na Edge
// Function `webhook-atas` e nas RPCs da migration 0080.
import type { ResponsavelTipoAcaoAta, StatusAcaoAta, StatusAtaReuniao } from '../types/database';

export const STATUS_ATA_LABELS: Record<StatusAtaReuniao, string> = {
  recebida: 'Recebida',
  processada: 'Processada',
  requer_revisao: 'Requer revisão',
  vinculada: 'Vinculada',
  erro_vinculo: 'Erro de vínculo',
  falhou: 'Falhou',
};

export const STATUS_ATA_TONE: Record<StatusAtaReuniao, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  recebida: 'info',
  processada: 'success',
  requer_revisao: 'warning',
  vinculada: 'success',
  erro_vinculo: 'danger',
  falhou: 'danger',
};

export const STATUS_ACAO_ATA_LABELS: Record<StatusAcaoAta, string> = {
  pendente_revisao: 'Pendente de revisão',
  convertida_pendencia: 'Convertida em pendência',
  descartada: 'Descartada',
};

export const STATUS_ACAO_ATA_TONE: Record<StatusAcaoAta, 'warning' | 'success' | 'neutral'> = {
  pendente_revisao: 'warning',
  convertida_pendencia: 'success',
  descartada: 'neutral',
};

export const RESPONSAVEL_TIPO_ACAO_LABELS: Record<ResponsavelTipoAcaoAta, string> = {
  cliente: 'Cliente',
  interna: 'Interna (equipe)',
};

export function fonteAtaLabel(integrationSource: string): string {
  if (integrationSource === 'manual') return 'Importada manualmente';
  return `Extraído pelo App de Atas (${integrationSource})`;
}
