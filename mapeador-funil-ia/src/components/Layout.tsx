import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `topbar-nav-link${isActive ? ' active' : ''}`;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          />
        </svg>
      )}
    </button>
  );
}

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <NavLink to="/" end className="topbar-brand">
            <span className="brand-mark" aria-hidden="true">
              C
            </span>
            CRM Flow
          </NavLink>
          <nav className="topbar-nav">
            <NavLink to="/agenda" className={navLinkClass}>
              Agenda
            </NavLink>
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
          <ThemeToggle />
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