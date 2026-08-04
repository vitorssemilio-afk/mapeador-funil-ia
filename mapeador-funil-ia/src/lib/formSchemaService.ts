import type { BlocoFormulario, Pergunta } from '../data/formSchema';
import { supabase } from './supabaseClient';

export async function carregarFormSchema(): Promise<BlocoFormulario[]> {
  const { data: blocos, error: blocosError } = await supabase
    .from('blocos_formulario')
    .select('*')
    .order('ordem', { ascending: true });

  if (blocosError) throw blocosError;

  const { data: perguntas, error: perguntasError } = await supabase
    .from('perguntas_formulario')
    .select('*')
    .order('ordem', { ascending: true });

  if (perguntasError) throw perguntasError;

  return (blocos ?? []).map((bloco) => ({
    titulo: bloco.titulo,
    perguntas: (perguntas ?? [])
      .filter((p) => p.bloco_id === bloco.id)
      .map(
        (p): Pergunta => ({
          id: p.pergunta_id,
          tipo: p.tipo,
          label: p.label,
          helper: p.helper ?? undefined,
          opcoes: p.opcoes ?? undefined,
          prefixo: p.prefixo ?? undefined,
          obrigatoria: p.obrigatoria,
          condicao: p.condicao_pergunta_id
            ? { perguntaId: p.condicao_pergunta_id, valores: p.condicao_valores ?? [] }
            : undefined,
        }),
      ),
  }));
}