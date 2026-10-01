// Feedback de ação padrão (polimento visual — substitui a troca de texto
// ad hoc em botões e os poucos window.alert equivalentes espalhados pelo
// app por um único componente: "Reunião agendada.", "Pendência
// resolvida." etc. aparecem aqui, empilhados, com saída automática.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastVariante = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  mensagem: string;
  variante: ToastVariante;
};

type ToastContextValue = {
  mostrarToast: (mensagem: string, variante?: ToastVariante) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DURACAO_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(0);

  const removerToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (mensagem: string, variante: ToastVariante = 'success') => {
      const id = proximoId.current++;
      setToasts((prev) => [...prev, { id, mensagem, variante }]);
      setTimeout(() => removerToast(id), DURACAO_MS);
    },
    [removerToast],
  );

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.variante}`}>
            <span>{t.mensagem}</span>
            <button type="button" className="toast-fechar" onClick={() => removerToast(t.id)} aria-label="Fechar">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de um ToastProvider.');
  return ctx;
}
