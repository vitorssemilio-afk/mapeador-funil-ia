// Modal/popover de conclusão de atividade (prompt 51, seções 4-9): marcar
// uma atividade como concluída nunca grava a data de HOJE direto — sempre
// passa por aqui, pra quem está atualizando um cliente que já estava em
// andamento há dias/semanas poder informar a data real do acontecimento.
// Mesmo componente serve pra EDITAR a data de uma atividade já concluída
// (não precisa desmarcar e marcar de novo — seção 7).
import { useState } from 'react';

type ConcluirAtividadeModalProps = {
  nomeAtividade: string;
  // Data real já registrada (ISO), se for uma edição — null quando é a
  // primeira conclusão (data padrão passa a ser hoje, mas editável).
  valorInicialIso: string | null;
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (dataIso: string) => void;
};

function paraInputDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function hojeInputDate(): string {
  const hoje = new Date();
  const local = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function ConcluirAtividadeModal({
  nomeAtividade,
  valorInicialIso,
  salvando,
  onCancelar,
  onConfirmar,
}: ConcluirAtividadeModalProps) {
  const hoje = hojeInputDate();
  const [data, setData] = useState(valorInicialIso ? paraInputDate(valorInicialIso) : hoje);

  const titulo = valorInicialIso ? 'Editar data de conclusão' : 'Concluir atividade';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="card modal-card">
        <h2>{titulo}</h2>
        <p className="field-hint">
          Atividade: <strong>{nomeAtividade}</strong>
        </p>
        <label className="field">
          <span>Data de conclusão</span>
          <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={salvando || !data}
            onClick={() => onConfirmar(`${data}T12:00:00`)}
          >
            Confirmar conclusão
          </button>
        </div>
      </div>
    </div>
  );
}
