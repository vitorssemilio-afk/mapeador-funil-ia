// Grupo colapsável de atividades dentro de um ciclo (redesign da tela de
// checklist) — "ESTRUTURAÇÃO DO CRM · 7/7 concluídas", recolhível. Lembra
// se o consultor recolheu/expandiu via localStorage (preferência por
// navegador, não por dado da implementação — nunca precisa de uma coluna
// nova pra isso).
import { useState, type ReactNode } from 'react';
import { IconChevronDown } from '../icons';

type AtividadeGrupoProps = {
  // Chave estável (ex: `${implementacaoId}:${ciclo}:${nomeGrupo}`) pra
  // persistir o estado de recolhido só deste grupo específico.
  chaveStorage: string;
  nome: string;
  concluidas: number;
  total: number;
  children: ReactNode;
};

function lerPreferenciaRecolhido(chave: string): boolean {
  try {
    return window.localStorage.getItem(`checklist-grupo-recolhido:${chave}`) === '1';
  } catch {
    return false;
  }
}

export function AtividadeGrupo({ chaveStorage, nome, concluidas, total, children }: AtividadeGrupoProps) {
  const [recolhido, setRecolhido] = useState(() => lerPreferenciaRecolhido(chaveStorage));

  function alternar() {
    setRecolhido((atual) => {
      const novo = !atual;
      try {
        window.localStorage.setItem(`checklist-grupo-recolhido:${chaveStorage}`, novo ? '1' : '0');
      } catch {
        // localStorage indisponível (modo privado etc.) — só não persiste, não quebra a tela.
      }
      return novo;
    });
  }

  return (
    <div className="checklist-grupo">
      <button
        type="button"
        className="checklist-grupo-cabecalho"
        onClick={alternar}
        aria-expanded={!recolhido}
      >
        <IconChevronDown className={`checklist-grupo-chevron${recolhido ? ' recolhido' : ''}`} />
        <span className="checklist-grupo-nome">{nome}</span>
        <span className="checklist-grupo-contagem">
          {concluidas}/{total} concluídas
        </span>
      </button>
      {!recolhido && <div className="checklist-grupo-corpo">{children}</div>}
    </div>
  );
}
