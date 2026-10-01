// Central de Notificações — leitura e ações compartilhadas entre o sino do
// cabeçalho e a página completa. O status de leitura é por usuário
// (notificacoes_status) e a ausência de linha ali significa "não lida" —
// mesmo raciocínio de atividades_status/criterios_entrega_status: nunca
// duas fontes de verdade, só combina na hora de exibir.
import { supabase } from './supabaseClient';
import type { CategoriaNotificacao, Notificacao, NotificacaoStatus, PrioridadeNotificacao } from '../types/database';

export type NotificacaoComStatus = Notificacao & {
  lida: boolean;
  arquivada: boolean;
};

export const CATEGORIA_LABELS: Record<CategoriaNotificacao, string> = {
  implementacao: 'Implementação',
  trial: 'Trial Kommo',
  formulario: 'Formulário',
  funil: 'Funil',
  reuniao: 'Reunião',
  pendencia: 'Pendência',
  sistema: 'Sistema',
};

export const PRIORIDADE_LABELS: Record<PrioridadeNotificacao, string> = {
  informativa: 'Informativa',
  atencao: 'Atenção',
  alta: 'Alta',
  critica: 'Crítica',
};

// Cores discretas, reaproveitando os mesmos tokens de --color-* já usados
// em status-badge no resto do produto — nenhuma cor nova, nenhum vermelho
// pra tudo que é só "atenção".
export const PRIORIDADE_TONE: Record<PrioridadeNotificacao, 'info' | 'warning' | 'danger'> = {
  informativa: 'info',
  atencao: 'warning',
  alta: 'danger',
  critica: 'danger',
};

export async function carregarNotificacoes(limite = 200): Promise<{
  notificacoes: NotificacaoComStatus[];
  error: string | null;
}> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const [{ data: base, error: baseError }, { data: statusRows, error: statusError }] = await Promise.all([
    supabase.from('notificacoes').select('*').order('created_at', { ascending: false }).limit(limite),
    userId
      ? supabase.from('notificacoes_status').select('*').eq('user_id', userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (baseError) return { notificacoes: [], error: baseError.message };
  if (statusError) return { notificacoes: [], error: statusError.message };

  const statusPorNotificacao = new Map((statusRows ?? []).map((s) => [s.notificacao_id, s]));

  const notificacoes: NotificacaoComStatus[] = (base ?? []).map((n) => {
    const status = statusPorNotificacao.get(n.id);
    return { ...n, lida: status?.lida ?? false, arquivada: status?.arquivada ?? false };
  });

  return { notificacoes, error: null };
}

export async function contarNaoLidas(): Promise<number> {
  const { notificacoes, error } = await carregarNotificacoes(500);
  if (error) return 0;
  // P2 da mini auditoria: um alerta auto-resolvido não conta mais como
  // pendência, mesmo que ninguém tenha marcado como lido manualmente.
  return notificacoes.filter((n) => !n.lida && !n.arquivada && !n.resolvida_em).length;
}

async function upsertStatus(
  notificacaoId: string,
  patch: { lida?: boolean; arquivada?: boolean },
): Promise<{ error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: 'Não autenticado.' };

  const agora = new Date().toISOString();
  const payload: Partial<NotificacaoStatus> & Pick<NotificacaoStatus, 'notificacao_id' | 'user_id'> = {
    notificacao_id: notificacaoId,
    user_id: userId,
  };
  if (patch.lida !== undefined) {
    payload.lida = patch.lida;
    payload.lida_em = patch.lida ? agora : null;
  }
  if (patch.arquivada !== undefined) {
    payload.arquivada = patch.arquivada;
    payload.arquivada_em = patch.arquivada ? agora : null;
  }

  const { error } = await supabase.from('notificacoes_status').upsert(payload, { onConflict: 'notificacao_id,user_id' });
  return { error: error?.message ?? null };
}

export function marcarComoLida(notificacaoId: string) {
  return upsertStatus(notificacaoId, { lida: true });
}

export function marcarComoNaoLida(notificacaoId: string) {
  return upsertStatus(notificacaoId, { lida: false });
}

export function arquivarNotificacao(notificacaoId: string) {
  return upsertStatus(notificacaoId, { arquivada: true, lida: true });
}

export async function marcarTodasComoLidas(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('marcar_todas_notificacoes_como_lidas');
  return { error: error?.message ?? null };
}

export type GrupoData = 'hoje' | 'ontem' | 'anteriores';

export const GRUPO_DATA_LABELS: Record<GrupoData, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  anteriores: 'Anteriores',
};

export function agruparPorData(notificacoes: NotificacaoComStatus[]): Record<GrupoData, NotificacaoComStatus[]> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const grupos: Record<GrupoData, NotificacaoComStatus[]> = { hoje: [], ontem: [], anteriores: [] };

  for (const n of notificacoes) {
    const data = new Date(n.created_at);
    data.setHours(0, 0, 0, 0);
    if (data.getTime() === hoje.getTime()) grupos.hoje.push(n);
    else if (data.getTime() === ontem.getTime()) grupos.ontem.push(n);
    else grupos.anteriores.push(n);
  }

  return grupos;
}
