// Versionamento simples dos funis (ver migration 0045). Toda versão nasce
// via gerar-funil (que já grava a linha em funil_versoes, ver
// supabase/functions/gerar-funil/index.ts) — o que falta é marcar "esta
// versão foi aprovada pro cliente", o que pode acontecer por dois caminhos
// diferentes (o avanço manual de status em Mapeamento.tsx, ou a confirmação
// do Kickoff como realizado em ImplementacaoDetalhe.tsx). Esta função é o
// ponto único que os dois caminhos chamam, pra não duplicar a regra "nunca
// sobrescrever silenciosamente uma aprovação já registrada".
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, FunilVersao } from '../types/database';

export async function aprovarVersaoAtual(
  supabase: SupabaseClient<Database>,
  mapeamentoId: string,
  params: { aprovadoPorEmail: string | null; kickoffReuniaoId?: string | null },
): Promise<{ error: string | null }> {
  const { data: versaoAtual, error: buscaError } = await supabase
    .from('funil_versoes')
    .select('*')
    .eq('mapeamento_id', mapeamentoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (buscaError) return { error: buscaError.message };

  // Sem nenhuma linha de versão ainda (mapeamento sem funil gerado) — nada
  // a aprovar.
  if (!versaoAtual) return { error: null };

  // Já aprovada: mantém a aprovação original intacta, sem sobrescrever
  // data/responsável/kickoff registrados na primeira vez.
  if (versaoAtual.status === 'aprovada') return { error: null };

  const { error: updateError } = await supabase
    .from('funil_versoes')
    .update({
      status: 'aprovada',
      aprovada_em: new Date().toISOString(),
      aprovada_por_email: params.aprovadoPorEmail,
      kickoff_reuniao_id: params.kickoffReuniaoId ?? null,
    })
    .eq('id', versaoAtual.id);

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
