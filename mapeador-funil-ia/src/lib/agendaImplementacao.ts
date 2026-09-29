import { resolverAtividade, resolverTrialKommo, type AtividadeResolvida } from './atividadesCronograma';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
} from '../types/database';

export type ItemAgenda = {
  implementacao: ImplementacaoCrm;
  atividade: AtividadeResolvida;
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

// Atividades pendentes (não concluídas nem bloqueadas pelo cliente) de uma
// implementação, cuja data planejada cai no dia selecionado. Se o dia
// selecionado é hoje, também traz o atrasado (vencimento < hoje) — pra
// funcionar como lista de pendências do dia, não só do que vence exatamente
// hoje. Em outros dias mostra só o que vence naquele dia exato, pra dar uma
// prévia do que vem a seguir.
export function atividadesDaAgenda(params: {
  entradas: {
    implementacao: ImplementacaoCrm;
    atividades: AtividadeCronograma[];
    statusRows: AtividadeStatusRow[];
    cliente: Cliente | null;
    // Já filtrado pra essa implementação — resolverAtividade não filtra sozinho.
    historico: ImplementacaoStatusHistorico[];
  }[];
  diaSelecionado: Date;
  hoje: Date;
}): ItemAgenda[] {
  const { entradas, diaSelecionado, hoje } = params;
  const diaAlvo = inicioDoDia(diaSelecionado);
  const ehHoje = diferencaEmDias(diaAlvo, hoje) === 0;

  const resultado: ItemAgenda[] = [];

  for (const { implementacao, atividades, statusRows, cliente, historico } of entradas) {
    const atividadesVisiveis = atividades.filter(
      (a) => a.implementacao_id === null || a.implementacao_id === implementacao.id,
    );

    const resolvidas: AtividadeResolvida[] = atividadesVisiveis.map((atividade) =>
      resolverAtividade({
        atividade,
        statusRow: statusRows.find((s) => s.atividade_id === atividade.id) ?? null,
        historico,
        cliente,
        hoje,
      }),
    );
    if (cliente) resolvidas.push(resolverTrialKommo(cliente, hoje));

    for (const atividade of resolvidas) {
      if (atividade.status === 'concluido' || atividade.status === 'bloqueado_cliente') continue;
      if (!atividade.dataPlanejada) continue;

      const dentroDoAlvo = ehHoje
        ? atividade.dataPlanejada.getTime() <= diaAlvo.getTime()
        : atividade.dataPlanejada.getTime() === diaAlvo.getTime();
      if (!dentroDoAlvo) continue;

      resultado.push({
        implementacao,
        atividade,
        vencimento: atividade.dataPlanejada,
        diasAtraso: atividade.atrasoDias,
      });
    }
  }

  return resultado.sort((a, b) => {
    if (a.vencimento.getTime() !== b.vencimento.getTime()) return a.vencimento.getTime() - b.vencimento.getTime();
    return a.implementacao.nome_cliente.localeCompare(b.implementacao.nome_cliente);
  });
}
