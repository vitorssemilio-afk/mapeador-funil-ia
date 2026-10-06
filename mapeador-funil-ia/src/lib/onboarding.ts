// Conteúdo do onboarding de primeiro acesso — curto de propósito (4 passos
// + checklist), sem curso extenso. Linguagem operacional, sem termos
// técnicos de banco/implementação (trigger, migration, RLS, enum...).
export type PassoOnboarding = {
  titulo: string;
  texto: string;
};

export const PASSOS_ONBOARDING: PassoOnboarding[] = [
  {
    titulo: 'Bem-vindo ao CRM Flow',
    texto:
      'O CRM Flow centraliza toda a operação de implementação de CRM, desde o mapeamento do processo comercial até a entrega e adoção pelo cliente.',
  },
  {
    titulo: 'Como funciona uma implementação',
    texto:
      'Cliente → Formulário → Funil → Kickoff → Configuração → Treinamento → Automações → Check-ins → Entrega → Adoção. O sistema acompanha prazos, reuniões, Trial, pendências e próximos passos durante todo esse caminho.',
  },
  {
    titulo: 'Home — seu ponto de partida',
    texto:
      'A Home responde o que precisa da sua atenção agora: "Precisa da sua atenção" (alertas e atrasos), "Precisa da sua decisão" (situações que dependem de você), Agenda rápida (hoje e os próximos compromissos) e Minha carteira (seus clientes).',
  },
  {
    titulo: 'Onde encontrar cada coisa',
    texto:
      'A navegação lateral agrupa tudo por finalidade — Operação (Home, Clientes, Agenda, Implementações, Cronograma), Mapeamento (Formulários, Templates) e, quando você tem acesso, Gestão e Administração. Use Ctrl+K (ou Cmd+K) pra buscar qualquer cliente, reunião ou funil na hora.',
  },
];

export type ItemPrimeirosPassos = {
  chave: string;
  label: string;
  to: string;
  somenteAdministrador?: boolean;
};

export const ITENS_PRIMEIROS_PASSOS: ItemPrimeirosPassos[] = [
  { chave: 'conhecer_home', label: 'Conhecer a Home', to: '/' },
  { chave: 'abrir_cliente', label: 'Abrir um cliente', to: '/clientes' },
  { chave: 'consultar_agenda', label: 'Consultar a Agenda', to: '/agenda' },
  { chave: 'ver_cronograma', label: 'Ver um Cronograma', to: '/cronograma' },
  { chave: 'ver_implementacoes', label: 'Abrir uma implementação', to: '/implementacoes' },
  { chave: 'usar_busca', label: 'Usar a Busca Global (Ctrl+K)', to: '/busca' },
  { chave: 'abrir_notificacoes', label: 'Abrir a Central de Notificações', to: '/notificacoes' },
  { chave: 'abrir_dashboard_gerencial', label: 'Abrir o Dashboard Gerencial', to: '/gestao', somenteAdministrador: true },
  { chave: 'conhecer_configuracoes', label: 'Conhecer Configurações', to: '/configuracoes', somenteAdministrador: true },
];
