import type { Pergunta } from '../../data/formSchema';

type Props = {
  pergunta: Pergunta;
  respostas: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
};

export function PerguntaField({ pergunta, respostas, onChange }: Props) {
  const valor = respostas[pergunta.id];

  if (pergunta.tipo === 'texto_curto') {
    return (
      <label className="field">
        <span>{pergunta.label}</span>
        {pergunta.helper && <p className="field-hint">{pergunta.helper}</p>}
        <input
          type="text"
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(pergunta.id, e.target.value)}
        />
      </label>
    );
  }

  if (pergunta.tipo === 'texto_longo') {
    return (
      <label className="field">
        <span>{pergunta.label}</span>
        {pergunta.helper && <p className="field-hint">{pergunta.helper}</p>}
        <textarea
          rows={3}
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(pergunta.id, e.target.value)}
        />
      </label>
    );
  }

  if (pergunta.tipo === 'numero') {
    return (
      <label className="field">
        <span>{pergunta.label}</span>
        {pergunta.helper && <p className="field-hint">{pergunta.helper}</p>}
        <div className="input-prefix-group">
          {pergunta.prefixo && <span className="input-prefix">{pergunta.prefixo}</span>}
          <input
            type="number"
            min={0}
            value={typeof valor === 'number' ? valor : ''}
            onChange={(e) =>
              onChange(pergunta.id, e.target.value === '' ? '' : Number(e.target.value))
            }
          />
        </div>
      </label>
    );
  }

  if (pergunta.tipo === 'escolha_unica') {
    return (
      <fieldset className="field">
        <legend>{pergunta.label}</legend>
        {pergunta.helper && <p className="field-hint">{pergunta.helper}</p>}
        <div className="options-list">
          {pergunta.opcoes?.map((opcao) => (
            <label key={opcao.value} className="option-radio">
              <input
                type="radio"
                name={pergunta.id}
                checked={valor === opcao.value}
                onChange={() => onChange(pergunta.id, opcao.value)}
              />
              <span>{opcao.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const selecionadas = Array.isArray(valor) ? (valor as string[]) : [];
  const livreKey = `${pergunta.id}__livre`;
  const livreValores = (respostas[livreKey] as Record<string, string>) ?? {};

  return (
    <fieldset className="field">
      <legend>{pergunta.label}</legend>
      {pergunta.helper && <p className="field-hint">{pergunta.helper}</p>}
      <div className="options-list">
        {pergunta.opcoes?.map((opcao) => {
          const checked = selecionadas.includes(opcao.value);
          return (
            <div key={opcao.value} className="option-checkbox-wrap">
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selecionadas, opcao.value]
                      : selecionadas.filter((v) => v !== opcao.value);
                    onChange(pergunta.id, next);
                  }}
                />
                <span>{opcao.label}</span>
              </label>
              {opcao.campoLivre && checked && (
                <input
                  type="text"
                  className="option-livre-input"
                  placeholder={opcao.campoLivre.placeholder}
                  value={livreValores[opcao.value] ?? ''}
                  onChange={(e) =>
                    onChange(livreKey, { ...livreValores, [opcao.value]: e.target.value })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
