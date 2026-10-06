// Agrupamento das atividades do checklist por finalidade (redesign da tela
// de Ciclo — ver src/components/checklist/). Usa a coluna `categoria` que
// já existe em atividades_cronograma (migration 0077, hoje só preenchida
// quando a atividade vem de um Template de Implementação e nunca lida em
// lugar nenhum do produto) — nenhuma tabela ou coluna nova. Quando a
// atividade não tem categoria definida (o caso de praticamente todo o
// template global hoje, editado direto pela tela antes de existir esse
// campo), ela cai no grupo único "Atividades do ciclo", preservando a
// leitura em lista simples até o administrador categorizar pela tela
// "Editar checklist".
import type { AtividadeResolvida } from './atividadesCronograma';

export type ItemAgrupavel = {
  atividade: AtividadeResolvida;
  categoria: string | null;
};

export type GrupoAtividades = {
  nome: string;
  itens: AtividadeResolvida[];
};

const GRUPO_SEM_CATEGORIA = 'Atividades do ciclo';

export function agruparAtividades(itens: ItemAgrupavel[]): GrupoAtividades[] {
  const grupos: GrupoAtividades[] = [];
  const indicePorNome = new Map<string, number>();

  for (const { atividade, categoria } of itens) {
    const nomeGrupo = categoria?.trim() || GRUPO_SEM_CATEGORIA;
    let indice = indicePorNome.get(nomeGrupo);
    if (indice === undefined) {
      indice = grupos.length;
      indicePorNome.set(nomeGrupo, indice);
      grupos.push({ nome: nomeGrupo, itens: [] });
    }
    grupos[indice].itens.push(atividade);
  }

  return grupos;
}

export function contarConcluidas(itens: AtividadeResolvida[]): { concluidas: number; total: number } {
  return {
    concluidas: itens.filter((a) => a.status === 'concluido').length,
    total: itens.length,
  };
}
