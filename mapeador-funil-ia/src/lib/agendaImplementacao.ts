// Utilitários de data compartilhados por cronograma.ts e pelas páginas que
// desenham o Gantt/cronograma (Cronograma.tsx, ImplementacaoDetalhe.tsx).
//
// P1-A6 da auditoria funcional: este módulo tinha também uma segunda regra
// de "o que fazer hoje" (atividadesDaAgenda) rodando em paralelo à usada na
// página Agenda (construirAgendaOperacional, em agendaOperacional.ts) —
// removida daqui. A Home/Dashboard agora consome a mesma
// construirAgendaOperacional que a Agenda usa, nunca uma fórmula própria.
export function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function diferencaEmDias(depois: Date, antes: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((inicioDoDia(depois).getTime() - inicioDoDia(antes).getTime()) / MS_POR_DIA);
}
