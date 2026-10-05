// Fonte única da estrutura da sidebar — grupos, itens, rotas e permissão.
// Reaproveitado também pelos breadcrumbs (Breadcrumbs.tsx), pra não manter
// os mesmos rótulos duplicados em dois lugares.
import type { ComponentType, SVGProps } from 'react';
import {
  IconActivity,
  IconBarChart,
  IconBell,
  IconBuilding,
  IconCalendar,
  IconDatabase,
  IconFileText,
  IconHome,
  IconLayers,
  IconSettings,
  IconTimeline,
  IconUsers,
  IconWorkflow,
} from './icons';

export type SidebarItem = {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  // Rotas filhas que também devem marcar este item como ativo (ex:
  // /clientes/:id continua destacando "Clientes" — seção 17 do prompt).
  matchPrefixes?: string[];
  // Só true pro único módulo hoje de fato bloqueado por completo pra quem
  // não é administrador (ObservabilidadeIA.tsx já mostra "tela restrita a
  // administradores" nessa condição) — reaproveita exatamente esse mesmo
  // sinal (sou_administrador()), não uma regra nova.
  somenteAdministrador?: boolean;
};

export type SidebarGroup = {
  titulo: string;
  itens: SidebarItem[];
};

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    titulo: 'Operação',
    itens: [
      { label: 'Home', to: '/', icon: IconHome },
      { label: 'Clientes', to: '/clientes', icon: IconBuilding, matchPrefixes: ['/clientes'] },
      { label: 'Agenda', to: '/agenda', icon: IconCalendar },
      {
        label: 'Implementações',
        to: '/implementacoes',
        icon: IconWorkflow,
        matchPrefixes: ['/implementacoes'],
      },
      { label: 'Cronograma', to: '/cronograma', icon: IconTimeline },
    ],
  },
  {
    titulo: 'Mapeamento',
    itens: [
      { label: 'Formulários', to: '/formulario', icon: IconFileText },
      { label: 'Relatório de Respostas', to: '/relatorio-respostas', icon: IconBarChart },
      { label: 'Campos Padrão', to: '/campos-padrao', icon: IconDatabase },
      { label: 'Templates', to: '/templates', icon: IconLayers, matchPrefixes: ['/templates'] },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { label: 'Dashboard Gerencial', to: '/gestao', icon: IconBarChart },
      { label: 'Notificações', to: '/notificacoes', icon: IconBell },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { label: 'Consultores', to: '/consultores', icon: IconUsers },
      { label: 'Configurações', to: '/configuracoes', icon: IconSettings },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      {
        label: 'Observabilidade de IA',
        to: '/observabilidade-ia',
        icon: IconActivity,
        somenteAdministrador: true,
      },
    ],
  },
];

export function itemEstaAtivo(item: SidebarItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  if (pathname === item.to) return true;
  return (item.matchPrefixes ?? [item.to]).some((prefixo) => pathname.startsWith(`${prefixo}/`));
}
