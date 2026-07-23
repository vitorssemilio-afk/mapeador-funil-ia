import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          Mapeador de Funil IA
        </Link>
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
