// Confirmação padrão (polimento visual) — substitui window.confirm por um
// modal consistente com o resto do app, principalmente em ações
// destrutivas (onde o botão de confirmar vira "danger" automaticamente).
// Uso: const confirmar = useConfirm(); if (await confirmar({...})) { ... }
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type OpcoesConfirmacao = {
  titulo: string;
  descricao?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  destrutivo?: boolean;
};

type ConfirmContextValue = (opcoes: OpcoesConfirmacao) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmacao | null>(null);
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback((novasOpcoes: OpcoesConfirmacao) => {
    setOpcoes(novasOpcoes);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function responder(valor: boolean) {
    resolverRef.current?.(valor);
    setOpcoes(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {opcoes && (
        <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-label={opcoes.titulo}>
          <div className="card modal-card confirm-dialog">
            <h2>{opcoes.titulo}</h2>
            {opcoes.descricao && <p className="field-hint">{opcoes.descricao}</p>}
            <div className="wizard-actions">
              <button type="button" className="btn btn-secondary" onClick={() => responder(false)}>
                {opcoes.cancelarLabel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={`btn ${opcoes.destrutivo ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => responder(true)}
                autoFocus
              >
                {opcoes.confirmarLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de um ConfirmProvider.');
  return ctx;
}
