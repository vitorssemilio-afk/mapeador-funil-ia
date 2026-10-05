import { useLocation, NavLink } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight } from './icons';
import { itemEstaAtivo, SIDEBAR_GROUPS } from './sidebarConfig';

type SidebarProps = {
  colapsada: boolean;
  onAlternarColapso: () => void;
  souAdministrador: boolean;
  // Drawer mobile (seção 25): quando aberta, a sidebar aparece como
  // overlay e fecha ao navegar ou clicar fora.
  drawerAberta: boolean;
  onFecharDrawer: () => void;
  nomeProduto: string;
}

export function Sidebar({
  colapsada,
  onAlternarColapso,
  souAdministrador,
  drawerAberta,
  onFecharDrawer,
  nomeProduto,
}: SidebarProps) {
  const { pathname } = useLocation();

  return (
    <>
      {drawerAberta && (
        <button
          type="button"
          className="sidebar-drawer-backdrop"
          aria-label="Fechar menu"
          onClick={onFecharDrawer}
        />
      )}
      <aside
        className={`sidebar${colapsada ? ' sidebar-collapsed' : ''}${drawerAberta ? ' sidebar-drawer-open' : ''}`}
      >
        <div className="sidebar-top">
          <NavLink to="/" end className="sidebar-logo" onClick={onFecharDrawer}>
            <img src="/favicon.svg" alt="" className="sidebar-logo-mark" />
            {/* Visibilidade controlada só por CSS (não por JSX condicional) —
                assim o drawer mobile sempre mostra o nome, mesmo que a
                preferência de desktop esteja "recolhida" (seção 25). */}
            <span className="sidebar-logo-nome">{nomeProduto}</span>
          </NavLink>
        </div>

        <nav className="sidebar-nav">
          {SIDEBAR_GROUPS.map((grupo) => {
            const itensVisiveis = grupo.itens.filter((item) => !item.somenteAdministrador || souAdministrador);
            if (itensVisiveis.length === 0) return null;
            return (
              <div className="sidebar-group" key={grupo.titulo}>
                <div className="sidebar-group-titulo">{grupo.titulo}</div>
                {itensVisiveis.map((item) => {
                  const Icon = item.icon;
                  const ativo = itemEstaAtivo(item, pathname);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={`sidebar-link${ativo ? ' active' : ''}`}
                      aria-label={item.label}
                      onClick={onFecharDrawer}
                    >
                      <Icon className="sidebar-link-icon" />
                      <span className="sidebar-link-label">{item.label}</span>
                      <span className="sidebar-tooltip">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onAlternarColapso}
          aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
        >
          {colapsada ? <IconChevronRight /> : <IconChevronLeft />}
          <span className="sidebar-collapse-tooltip">{colapsada ? 'Expandir menu' : 'Recolher menu'}</span>
        </button>
      </aside>
    </>
  );
}
