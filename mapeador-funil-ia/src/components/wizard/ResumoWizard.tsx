import { FORM_BLOCKS } from '../../data/formSchema';
import { formatValorPergunta } from '../../data/formatRespostas';

type Props = {
  respostas: Record<string, unknown>;
  titulo?: string;
  mensagem?: string;
};

export function ResumoWizard({
  respostas,
  titulo = 'Resumo do mapeamento',
  mensagem = 'Revise as respostas abaixo. Você pode voltar para editar qualquer bloco antes de gerar o funil.',
}: Props) {
  return (
    <div className="wizard-resumo">
      <h2>{titulo}</h2>
      <p className="field-hint">{mensagem}</p>

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
