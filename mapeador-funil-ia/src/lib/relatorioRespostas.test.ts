import { describe, expect, it } from 'vitest';
import type { Pergunta } from '../data/formSchema';
import type { MapeamentoRespostaFlat } from '../types/database';
import { LIMITE_BASE_BAIXA, resumirEscolha, resumirNumero } from './relatorioRespostas';

function linhaFixture(overrides: Partial<MapeamentoRespostaFlat>): MapeamentoRespostaFlat {
  return {
    mapeamento_id: 'map-1',
    nome_negocio: 'Cliente Teste',
    mapeamento_status: 'funil_gerado',
    enviado_pelo_cliente: true,
    mapeamento_criado_em: '2026-01-01T00:00:00Z',
    bloco_titulo: 'Bloco 1',
    pergunta_id: 'p1',
    pergunta_label: 'Pergunta',
    pergunta_tipo: 'escolha_unica',
    resposta_bruta: null,
    resposta_texto: null,
    ...overrides,
  };
}

const perguntaEscolhaUnica: Pergunta = {
  id: 'p1',
  tipo: 'escolha_unica',
  label: 'Qual canal você mais usa?',
  opcoes: [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'instagram', label: 'Instagram' },
  ],
};

const perguntaNumero: Pergunta = { id: 'p2', tipo: 'numero', label: 'Quantos vendedores?' };

describe('resumirEscolha', () => {
  it('conta cada valor selecionado (escolha única)', () => {
    const linhas = [
      linhaFixture({ resposta_bruta: 'whatsapp' }),
      linhaFixture({ resposta_bruta: 'whatsapp' }),
      linhaFixture({ resposta_bruta: 'instagram' }),
    ];
    const resumo = resumirEscolha(perguntaEscolhaUnica, linhas);
    expect(resumo.totalRespondentes).toBe(3);
    expect(resumo.itens).toEqual([
      { valor: 'whatsapp', label: 'WhatsApp', contagem: 2 },
      { valor: 'instagram', label: 'Instagram', contagem: 1 },
    ]);
    expect(resumo.baseBaixa).toBe(false);
  });

  it('conta cada valor de um array (escolha múltipla), sem contar a linha duas vezes pro mesmo valor', () => {
    const linhas = [
      linhaFixture({ resposta_bruta: ['whatsapp', 'instagram'] }),
      linhaFixture({ resposta_bruta: ['whatsapp'] }),
    ];
    const resumo = resumirEscolha(perguntaEscolhaUnica, linhas);
    expect(resumo.totalRespondentes).toBe(2);
    expect(resumo.itens.find((i) => i.valor === 'whatsapp')?.contagem).toBe(2);
    expect(resumo.itens.find((i) => i.valor === 'instagram')?.contagem).toBe(1);
  });

  it('ignora valores vazios/falsy sem contá-los como uma opção', () => {
    const linhas = [linhaFixture({ resposta_bruta: ['whatsapp', ''] }), linhaFixture({ resposta_bruta: null })];
    const resumo = resumirEscolha(perguntaEscolhaUnica, linhas);
    expect(resumo.itens).toHaveLength(2);
    expect(resumo.itens.find((i) => i.valor === 'whatsapp')?.contagem).toBe(1);
    // resposta_bruta null vira String(null) = "null" — não deveria existir
    // opção com esse valor na pergunta, mas a contagem ainda é 1 item.
    expect(resumo.itens.find((i) => i.valor === 'null')).toBeTruthy();
  });

  it('usa o value como label quando a opção não existe mais no schema', () => {
    const linhas = [linhaFixture({ resposta_bruta: 'opcao_removida' })];
    const resumo = resumirEscolha(perguntaEscolhaUnica, linhas);
    expect(resumo.itens[0]).toEqual({ valor: 'opcao_removida', label: 'opcao_removida', contagem: 1 });
  });

  it(`marca baseBaixa quando totalRespondentes <= ${LIMITE_BASE_BAIXA}`, () => {
    const umaLinha = [linhaFixture({ resposta_bruta: 'whatsapp' })];
    expect(resumirEscolha(perguntaEscolhaUnica, umaLinha).baseBaixa).toBe(true);

    const limiteLinhas = Array.from({ length: LIMITE_BASE_BAIXA }, () => linhaFixture({ resposta_bruta: 'whatsapp' }));
    expect(resumirEscolha(perguntaEscolhaUnica, limiteLinhas).baseBaixa).toBe(true);

    const acimaDoLimite = Array.from({ length: LIMITE_BASE_BAIXA + 1 }, () => linhaFixture({ resposta_bruta: 'whatsapp' }));
    expect(resumirEscolha(perguntaEscolhaUnica, acimaDoLimite).baseBaixa).toBe(false);
  });
});

describe('resumirNumero', () => {
  it('calcula média/mínimo/máximo só com valores numéricos válidos', () => {
    const linhas = [
      linhaFixture({ resposta_bruta: '2' }),
      linhaFixture({ resposta_bruta: '4' }),
      linhaFixture({ resposta_bruta: '6' }),
    ];
    const resumo = resumirNumero(perguntaNumero, linhas);
    expect(resumo).toMatchObject({ totalRespondentes: 3, media: 4, minimo: 2, maximo: 6, baseBaixa: false });
  });

  it('ignora respostas não numéricas (texto não numérico, null, string vazia)', () => {
    const linhas = [
      linhaFixture({ resposta_bruta: '10' }),
      linhaFixture({ resposta_bruta: 'não sei' }),
      linhaFixture({ resposta_bruta: null }),
      linhaFixture({ resposta_bruta: '' }),
    ];
    const resumo = resumirNumero(perguntaNumero, linhas);
    expect(resumo?.totalRespondentes).toBe(1);
    expect(resumo?.media).toBe(10);
  });

  it('não conta null como resposta "0" (Number(null) é 0, mas não respondido não é zero)', () => {
    const linhas = [linhaFixture({ resposta_bruta: '10' }), linhaFixture({ resposta_bruta: null })];
    const resumo = resumirNumero(perguntaNumero, linhas);
    expect(resumo?.totalRespondentes).toBe(1);
    expect(resumo?.media).toBe(10);
    expect(resumo?.minimo).toBe(10);
  });

  it('retorna null quando nenhuma resposta é numérica (evita NaN)', () => {
    const linhas = [linhaFixture({ resposta_bruta: 'não sei' }), linhaFixture({ resposta_bruta: null })];
    expect(resumirNumero(perguntaNumero, linhas)).toBeNull();
  });

  it(`marca baseBaixa quando totalRespondentes <= ${LIMITE_BASE_BAIXA}`, () => {
    const duasLinhas = [linhaFixture({ resposta_bruta: '5' }), linhaFixture({ resposta_bruta: '7' })];
    expect(resumirNumero(perguntaNumero, duasLinhas)?.baseBaixa).toBe(true);

    const tresLinhas = [...duasLinhas, linhaFixture({ resposta_bruta: '9' })];
    expect(resumirNumero(perguntaNumero, tresLinhas)?.baseBaixa).toBe(false);
  });
});
