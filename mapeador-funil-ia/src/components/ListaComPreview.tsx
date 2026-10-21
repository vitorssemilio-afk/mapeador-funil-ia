// Prompt 63, seção 5 — decisões/pendências/próximos passos não podem mais
// aparecer como uma lista enorme de uma vez (nem como coluna estreita ao
// lado de outras cinco). Mostra até `limite` itens e só revela o resto sob
// clique explícito — reaproveitado pelas quatro seções da ata (decisões,
// pendências do cliente, pendências internas, próximos passos), tanto na
// ata integrada quanto nos campos manuais da reunião.
import { useState, type ReactNode } from 'react';

type Props = {
  titulo: string;
  itens: ReactNode[];
  vazio: string;
  limite?: number;
};

export function ListaComPreview({ titulo, itens, vazio, limite = 3 }: Props) {
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (itens.length === 0) {
    return (
      <div>
        <p style={{ margin: '0 0 6px' }}>
          <strong>{titulo}</strong>
        </p>
        <p className="field-hint" style={{ margin: 0 }}>
          {vazio}
        </p>
      </div>
    );
  }

  const visiveis = mostrarTodos ? itens : itens.slice(0, limite);
  const ocultos = itens.length - visiveis.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0 }}>
        <strong>{titulo}</strong> ({itens.length})
      </p>
      <ul className="observacoes-lista">
        {visiveis.map((item, i) => (
          <li key={i} className="observacao-item">
            {item}
          </li>
        ))}
      </ul>
      {itens.length > limite && (
        <button type="button" className="btn btn-ghost btn-auto" onClick={() => setMostrarTodos((v) => !v)}>
          {mostrarTodos ? 'Ver menos' : `Ver todas (${ocultos} restantes)`}
        </button>
      )}
    </div>
  );
}
