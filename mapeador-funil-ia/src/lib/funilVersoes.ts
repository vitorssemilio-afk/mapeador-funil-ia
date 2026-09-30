// Versionamento simples dos funis (ver migration 0045). Toda versão nasce
// via gerar-funil (que já grava a linha em funil_versoes, ver
// supabase/functions/gerar-funil/index.ts) — o que falta é marcar "esta
// versão foi aprovada pro cliente", o que pode acontecer por dois caminhos
// diferentes (o fluxo de "Registrar Kickoff" em Mapeamento.tsx, ou a
// confirmação do Kickoff como realizado em ImplementacaoDetalhe.tsx). Esta
// função é o ponto único que os dois caminhos chamam, pra não duplicar a
// regra "nunca sobrescrever silenciosamente uma aprovação já registrada".
//
// P1-A1 da auditoria funcional: a versão a aprovar é sempre um parâmetro
// explícito, escolhido por quem está validando — nunca mais inferida
// automaticamente como "a mais recente" (isso podia aprovar silenciosamente
// um rascunho interno que o cliente nunca viu).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, FunilVersao } from '../types/database';

// Pergunta feita ao confirmar o Kickoff como realizado (Mapeamento.tsx e
// ImplementacaoDetalhe.tsx) — decide se o funil já pode ser considerado
// validado ou se ainda precisa de uma rodada de ajustes (ver
// PROXIMOS_STATUS_MAPEAMENTO em statusFluxo.ts, que já modela exatamente
// essas duas saídas). Fonte única — não duplicar esse tipo/rótulo em cada
// tela.
export type ValidacaoFunilKickoff = 'sem_ajustes' | 'pequenos_ajustes' | 'precisa_revisar';

export const VALIDACAO_FUNIL_KICKOFF_LABELS: Record<ValidacaoFunilKickoff, string> = {
  sem_ajustes: 'Sim, sem ajustes',
  pequenos_ajustes: 'Sim, com pequenos ajustes',
  precisa_revisar: 'Não, precisa revisar',
};

export function statusMapeamentoPorValidacao(resposta: ValidacaoFunilKickoff): 'funil_validado' | 'ajustes_solicitados' {
  return resposta === 'precisa_revisar' ? 'ajustes_solicitados' : 'funil_validado';
}

export async function aprovarVersao(
  supabase: SupabaseClient<Database>,
  mapeamentoId: string,
  versao: number,
  params: { aprovadoPorEmail: string | null; kickoffReuniaoId?: string | null },
): Promise<{ error: string | null }> {
  const { data: versaoAlvo, error: buscaError } = await supabase
    .from('funil_versoes')
    .select('*')
    .eq('mapeamento_id', mapeamentoId)
    .eq('versao', versao)
    .maybeSingle();

  if (buscaError) return { error: buscaError.message };
  if (!versaoAlvo) return { error: `Versão ${versao} não encontrada para aprovação.` };

  // Já aprovada: mantém a aprovação original intacta, sem sobrescrever
  // data/responsável/kickoff registrados na primeira vez (revalidação é
  // idempotente).
  if (versaoAlvo.status === 'aprovada') return { error: null };

  const { error: updateError } = await supabase
    .from('funil_versoes')
    .update({
      status: 'aprovada',
      aprovada_em: new Date().toISOString(),
      aprovada_por_email: params.aprovadoPorEmail,
      kickoff_reuniao_id: params.kickoffReuniaoId ?? null,
    })
    .eq('id', versaoAlvo.id);

  return { error: updateError?.message ?? null };
}

// Cria uma nova versão em rascunho a partir de uma existente (tipicamente a
// versão aprovada que o usuário está vendo) — único caminho pra editar o
// conteúdo de uma versão aprovada, já que ela é imutável a nível de banco
// (trigger em funis_gerados, ver migration 0060). Retorna o número da nova
// versão criada.
export async function criarVersaoFunilParaEdicao(
  supabase: SupabaseClient<Database>,
  mapeamentoId: string,
  versaoOrigem: number,
): Promise<{ novaVersao: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('criar_versao_funil_a_partir_de', {
    p_mapeamento_id: mapeamentoId,
    p_versao_origem: versaoOrigem,
  });

  if (error) return { novaVersao: null, error: error.message };
  return { novaVersao: data, error: null };
}

export function rotuloVersao(versao: FunilVersao, versaoMaisRecente: number): string {
  const base = versao.versao === versaoMaisRecente ? `Versão ${versao.versao} (atual)` : `Versão ${versao.versao}`;
  return versao.status === 'aprovada' ? `${base} — Aprovada` : base;
}
