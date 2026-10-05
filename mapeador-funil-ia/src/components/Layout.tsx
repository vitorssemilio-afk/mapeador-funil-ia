import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabaseClient';
import { Breadcrumbs } from './Breadcrumbs';
import { GlobalSearch } from './GlobalSearch';
import { IconMenu, IconX } from './icons';
import { NotificationBell } from './NotificationBell';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

const CHAVE_SIDEBAR_COLAPSADA = 'crmflow.sidebar.colapsada';

function lerPreferenciaSidebar(): boolean {
  try {
    return localStorage.getItem(CHAVE_SIDEBAR_COLAPSADA) === '1';
  } catch {
    return false;
  }
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
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
  const { pathname } = useLocation();
  const [nomeProduto, setNomeProduto] = useState('CRM Flow');
  const [sidebarColapsada, setSidebarColapsada] = useState(lerPreferenciaSidebar);
  const [drawerAberta, setDrawerAberta] = useState(false);
  // Só decide o que a sidebar mostra (módulo de Sistema) — o backend
  // (RLS/RPC) continua sendo quem de fato protege rotas e dados; mesmo
  // sinal já usado em Consultores.tsx/ObservabilidadeIA.tsx/Dashboard.tsx,
  // resolvido aqui uma única vez em vez de em cada página.
  const [souAdministrador, setSouAdministrador] = useState(false);

  useEffect(() => {
    supabase
      .from('configuracoes_operacao')
      .select('nome_produto')
      .eq('id', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nome_produto) setNomeProduto(data.nome_produto);
      });
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
  }, []);

  useEffect(() => {
    setDrawerAberta(false);
  }, [pathname]);

  function alternarColapso() {
    setSidebarColapsada((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE_SIDEBAR_COLAPSADA, novo ? '1' : '0');
      } catch {
        // localStorage indisponível (modo privado etc.) — preferência só
        // não persiste entre sessões, a sidebar continua funcionando.
      }
      return novo;
    });
  }

  return (
    <div className="dashboard-shell">
      <Sidebar
        colapsada={sidebarColapsada}
        onAlternarColapso={alternarColapso}
        souAdministrador={souAdministrador}
        drawerAberta={drawerAberta}
        onFecharDrawer={() => setDrawerAberta(false)}
        nomeProduto={nomeProduto}
      />
      <div className="app-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setDrawerAberta((v) => !v)}
              aria-label={drawerAberta ? 'Fechar menu' : 'Abrir menu'}
            >
              {drawerAberta ? <IconX /> : <IconMenu />}
            </button>
            <Breadcrumbs />
          </div>
          <div className="topbar-user">
            <GlobalSearch />
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
