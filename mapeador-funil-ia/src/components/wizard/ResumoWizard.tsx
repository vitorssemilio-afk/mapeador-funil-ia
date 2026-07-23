import { FORM_BLOCKS, type Pergunta } from '../../data/formSchema';

function formatValor(pergunta: Pergunta, respostas: Record<string, unknown>): string {
  const valor = respostas[pergunta.id];

  if (pergunta.tipo === 'escolha_unica') {
    const opcao = pergunta.opcoes?.find((o) => o.value === valor);
    return opcao?.label ?? '—';
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

export function ResumoWizard({ respostas }: { respostas: Record<string, unknown> }) {
  return (
    <div className="wizard-resumo">
      <h2>Resumo do mapeamento</h2>
      <p className="field-hint">
        Revise as respostas abaixo. Você pode voltar para editar qualquer bloco antes de gerar o
        funil.
      </p>

      {FORM_BLOCKS.map((bloco) => (
        <div key={bloco.titulo} className="resumo-bloco">
          <h3>{bloco.titulo}</h3>
          <dl className="resumo-lista">
            {bloco.perguntas.map((p) => (
              <div key={p.id} className="resumo-item">
                <dt>{p.label}</dt>
                <dd>{formatValor(p, respostas)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
