import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
} from '../types/database';

export type ItemAgenda = {
  implementacao: ImplementacaoCrm;
  item: ChecklistItemImplementacao;
  grupoTitulo: string;
  vencimento: Date;
  diasAtraso: number;
};

export function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function diferencaEmDias(depois: Date, antes: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((inicioDoDia(depois).getTime() - inicioDoDia(antes).getTime()) / MS_POR_DIA);
}

// Data em que a implementação entrou no status atual — pela última transição
// pra esse status no histórico. Sem histórico (não deveria acontecer, já que
// toda implementação grava um registro na criação), cai pra created_at.
export function dataEntradaStatusAtual(
  implementacao: ImplementacaoCrm,
  historico: ImplementacaoStatusHistorico[],
): Date {
  const registros = historico
    .filter((h) => h.implementacao_id === implementacao.id && h.status_novo === implementacao.status)
    .sort((a, b) => new Date(b.alterado_em).getTime() - new Date(a.alterado_em).getTime());

  return new Date(registros[0]?.alterado_em ?? implementacao.created_at);
}

export function calcularVencimento(dataEntrada: Date, diaSemana: number): Date {
  const vencimento = new Date(dataEntrada);
  vencimento.setDate(vencimento.getDate() + (diaSemana - 1));
  return inicioDoDia(vencimento);
}

// Itens pendentes (não marcados) de uma implementação, cujo prazo vence no
// dia selecionado. Se o dia selecionado é hoje, também traz o atrasado
// (vencimento < hoje) — pra funcionar como lista de pendências do dia, não
// só do que vence exatamente hoje. Em outros dias mostra só o que vence
// naquele dia exato, pra dar uma prévia do que vem a seguir.
export function itensDaAgenda(params: {
  implementacoes: ImplementacaoCrm[];
  grupos: ChecklistGrupoImplementacao[];
  itens: ChecklistItemImplementacao[];
  marcadosPorImplementacao: Map<string, Set<string>>;
  historico: ImplementacaoStatusHistorico[];
  diaSelecionado: Date;
  hoje: Date;
}): ItemAgenda[] {
  const { implementacoes, grupos, itens, marcadosPorImplementacao, historico, diaSelecionado, hoje } = params;
  const diaAlvo = inicioDoDia(diaSelecionado);
  const ehHoje = diferencaEmDias(diaAlvo, hoje) === 0;

  const resultado: ItemAgenda[] = [];

  for (const implementacao of implementacoes) {
    // Semana 1 é dividida em dois grupos de checklist (Sessão 1 e Sessão
    // 2) que compartilham o mesmo status "semana_1" — os demais status
    // têm um grupo só, com chave igual ao próprio status.
    const gruposDoStatus =
      implementacao.status === 'semana_1'
        ? grupos.filter((g) => g.chave === 'semana_1_sessao1' || g.chave === 'semana_1_sessao2')
        : grupos.filter((g) => g.chave === implementacao.status);
    if (gruposDoStatus.length === 0) continue;

    const dataEntrada = dataEntradaStatusAtual(implementacao, historico);
    const marcados = marcadosPorImplementacao.get(implementacao.id) ?? new Set<string>();

    for (const grupo of gruposDoStatus) {
      const itensDoGrupo = itens.filter(
        (item) =>
          item.grupo_id === grupo.id &&
          (item.implementacao_id === null || item.implementacao_id === implementacao.id) &&
          item.dia_semana != null &&
          !marcados.has(item.id),
      );

      for (const item of itensDoGrupo) {
        const vencimento = calcularVencimento(dataEntrada, item.dia_semana!);
        const dentroDoAlvo = ehHoje ? vencimento.getTime() <= diaAlvo.getTime() : vencimento.getTime() === diaAlvo.getTime();
        if (!dentroDoAlvo) continue;

        resultado.push({
          implementacao,
          item,
          grupoTitulo: grupo.titulo,
          vencimento,
          diasAtraso: Math.max(0, diferencaEmDias(hoje, vencimento)),
        });
      }
    }
  }

  return resultado.sort((a, b) => {
    if (a.vencimento.getTime() !== b.vencimento.getTime()) return a.vencimento.getTime() - b.vencimento.getTime();
    return a.implementacao.nome_cliente.localeCompare(b.implementacao.nome_cliente);
  });
}
