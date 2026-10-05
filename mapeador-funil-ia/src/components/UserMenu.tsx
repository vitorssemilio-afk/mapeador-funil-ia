// Menu do usuário no canto superior direito (seção 21/22 do prompt) — hoje
// só existem email e "Sair" de fato (não há página de perfil ou
// configurações pessoais ainda), então o menu fica deliberadamente simples
// em vez de inventar itens que não existem.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IconChevronDown } from './icons';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <span className="user-menu-email">{user?.email}</span>
        <IconChevronDown className="user-menu-chevron" />
      </button>

      {aberto && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-panel-email">{user?.email}</div>
          <button
            type="button"
            className="user-menu-panel-item"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              signOut();
            }}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
