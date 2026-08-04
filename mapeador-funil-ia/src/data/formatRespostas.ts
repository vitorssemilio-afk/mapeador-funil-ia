import { perguntaVisivel, type BlocoFormulario, type Pergunta } from './formSchema.ts';

export function formatValorPergunta(pergunta: Pergunta, respostas: Record<string, unknown>): string {
  const valor = respostas[pergunta.id];

  if (pergunta.tipo === 'escolha_unica') {
    const opcao = pergunta.opcoes?.find((o) => o.value === valor);
    if (!opcao) return '—';
    const livre = (respostas[`${pergunta.id}__livre`] as Record<string, string>) ?? {};
    const texto = livre[opcao.value];
    return texto ? `${opcao.label} (${texto})` : opcao.label;
  }

  if (pergunta.tipo === 'escolha_multipla') {
    const selecionadas = Array.isArray(valor) ? (valor as string[]) : [];
    if (selecionadas.length === 0) return '—';
    const livre = (respostas[`${pergunta.id}__livre`] as Record<string, string>) ?? {};
    return selecionadas
      .map((v) => {
        const opcao = pergunta.opcoes?.find((o) => o.value === v);
        const label = opcao?.label ?? v;
        const texto = livre[v];
        return texto ? `${label} (${texto})` : label;
      })
      .join(', ');
  }

  if (pergunta.tipo === 'numero') {
    if (typeof valor !== 'number') return '—';
    return pergunta.prefixo ? `${pergunta.prefixo} ${valor}` : String(valor);
  }

  if (typeof valor === 'string' && valor.trim()) return valor;
  return '—';
}

export function formatRespostasTexto(
  blocos: BlocoFormulario[],
  respostas: Record<string, unknown>,
): string {
  const partes: string[] = [];

  for (const bloco of blocos) {
    const perguntasVisiveis = bloco.perguntas.filter((p) => perguntaVisivel(p, respostas));
    if (perguntasVisiveis.length === 0) continue;

    partes.push(`## ${bloco.titulo}`);
    for (const pergunta of perguntasVisiveis) {
      partes.push(`- ${pergunta.label}\n  Resposta: ${formatValorPergunta(pergunta, respostas)}`);
    }
    partes.push('');
  }

  return partes.join('\n').trim();
}