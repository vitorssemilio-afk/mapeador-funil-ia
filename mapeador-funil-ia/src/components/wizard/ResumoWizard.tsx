import { FORM_BLOCKS } from '../../data/formSchema';
import { formatValorPergunta } from '../../data/formatRespostas';

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
                <dd>{formatValorPergunta(p, respostas)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
