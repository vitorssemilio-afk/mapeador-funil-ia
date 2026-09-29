import type { CategoriaOcorrencia } from '../types/database';

export const CATEGORIA_OCORRENCIA_LABELS: Record<CategoriaOcorrencia, string> = {
  cliente_cancelou_reuniao: 'Cliente cancelou reunião',
  cliente_nao_compareceu: 'Cliente não compareceu',
  consultor_cancelou: 'Consultor cancelou',
  reuniao_remarcada: 'Reunião remarcada',
  acesso_pendente: 'Acesso pendente',
  pendencia_cliente: 'Pendência do cliente',
  problema_tecnico: 'Problema técnico',
  mudanca_escopo: 'Mudança de escopo',
  outro: 'Outro',
};
