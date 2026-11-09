import { describe, expect, it } from 'vitest';
import { ehOperacaoV4 } from './RelatorioFunil';

describe('ehOperacaoV4', () => {
  it('reconhece o valor real cadastrado em Configurações ("V4 Company")', () => {
    expect(ehOperacaoV4('V4 Company')).toBe(true);
  });

  it('reconhece "V4" sozinho e variações de caixa/acento', () => {
    expect(ehOperacaoV4('V4')).toBe(true);
    expect(ehOperacaoV4('v4 company')).toBe(true);
    expect(ehOperacaoV4('  V4 Company  ')).toBe(true);
  });

  it('não reconhece o nome de outra operação', () => {
    expect(ehOperacaoV4('Outra Empresa')).toBe(false);
    expect(ehOperacaoV4('')).toBe(false);
  });
});
