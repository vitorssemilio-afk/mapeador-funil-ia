import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `topbar-nav-link${isActive ? ' active' : ''}`;
}

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <NavLink to="/" end className="topbar-brand">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            Mapeador de Funil IA
          </NavLink>
          <nav className="topbar-nav">
            <NavLink to="/implementacoes" className={navLinkClass}>
              Implementações
            </NavLink>
            <NavLink to="/formulario" className={navLinkClass}>
              Formulário
            </NavLink>
            <NavLink to="/campos-padrao" className={navLinkClass}>
              Campos Padrão
            </NavLink>
          </nav>
        </div>
        <div className="topbar-user">
          <span className="topbar-email">{user?.email}</span>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sair
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
