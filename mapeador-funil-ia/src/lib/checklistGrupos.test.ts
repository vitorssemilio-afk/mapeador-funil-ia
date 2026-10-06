// Testes do redesign da tela de checklist — agrupamento de atividades por
// `categoria` (coluna já existente em atividades_cronograma, nunca lida
// antes). Cobre o caso mais importante: nada categorizado ainda não pode
// virar uma tela pior que a de hoje (grupo único, sem "Outras atividades"
// redundante).
import { describe, expect, it } from 'vitest';
import { agruparAtividades, contarConcluidas } from './checklistGrupos';
import type { AtividadeResolvida } from './atividadesCronograma';

function atividadeFixture(overrides: Partial<AtividadeResolvida> = {}): AtividadeResolvida {
  return {
    id: 'a1',
    nome: 'Atividade',
    ciclo: 'Ciclo 1 — Setup e Treinamento',
    responsavel: null,
    dependenciaLabel: null,
    prazoDias: null,
    dataLiberacao: null,
    dataPlanejada: null,
    dataReal: null,
    agendadoPara: null,
    atrasoDias: 0,
    status: 'em_andamento',
    bloqueadoPeloCliente: false,
    diaDesdeKickoff: null,
    foraDaJanelaDoCiclo: false,
    diasAcimaDaJanela: 0,
    deslocamentoDias: null,
    ...overrides,
  };
}

describe('agruparAtividades', () => {
  it('sem nenhuma categoria definida, cai tudo num único grupo "Atividades do ciclo"', () => {
    const grupos = agruparAtividades([
      { atividade: atividadeFixture({ id: 'a1', nome: 'Pipeline criado' }), categoria: null },
      { atividade: atividadeFixture({ id: 'a2', nome: 'Etapas criadas' }), categoria: null },
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe('Atividades do ciclo');
    expect(grupos[0].itens).toHaveLength(2);
  });

  it('separa por categoria, preservando a ordem de primeira aparição dos grupos', () => {
    const grupos = agruparAtividades([
      { atividade: atividadeFixture({ id: 'a1', nome: 'E-mail confirmado' }), categoria: 'Pré-requisitos e Acessos' },
      { atividade: atividadeFixture({ id: 'a2', nome: 'Pipeline criado' }), categoria: 'Estruturação do CRM' },
      { atividade: atividadeFixture({ id: 'a3', nome: 'WhatsApp confirmado' }), categoria: 'Pré-requisitos e Acessos' },
    ]);

    expect(grupos.map((g) => g.nome)).toEqual(['Pré-requisitos e Acessos', 'Estruturação do CRM']);
    expect(grupos[0].itens.map((a) => a.nome)).toEqual(['E-mail confirmado', 'WhatsApp confirmado']);
  });

  it('categorias em branco/só espaço caem no grupo padrão, não viram grupo vazio', () => {
    const grupos = agruparAtividades([{ atividade: atividadeFixture(), categoria: '   ' }]);
    expect(grupos[0].nome).toBe('Atividades do ciclo');
  });
});

describe('contarConcluidas', () => {
  it('conta só status concluido, sobre o total do grupo', () => {
    const { concluidas, total } = contarConcluidas([
      atividadeFixture({ status: 'concluido' }),
      atividadeFixture({ status: 'em_andamento' }),
      atividadeFixture({ status: 'concluido' }),
    ]);
    expect(concluidas).toBe(2);
    expect(total).toBe(3);
  });
});
