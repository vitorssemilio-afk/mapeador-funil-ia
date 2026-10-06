// Testes da seção 19 do Prompt 48 — métricas temporais do Dashboard
// Gerencial não podem silenciosamente tratar uma ordem cronológica
// impossível (data final antes da inicial) como se fosse uma duração
// negativa real. Cobre exatamente os 3 cenários pedidos (válido, igual,
// inválido) + os casos de amostra única e zero amostras que a UI também
// precisa diferenciar (seções 8/9).
import { describe, expect, it } from 'vitest';
import { construirTemposProcesso, diasEntre } from './dashboardGerencial';
import type { Cliente } from '../types/database';

const MARCOS_VAZIOS = {
  contratado_em: null,
  formulario_enviado_em: null,
  formulario_respondido_em: null,
  funil_gerado_em: null,
  funil_revisado_em: null,
  funil_validado_em: null,
  kickoff_agendado_para: null,
  kickoff_realizado_em: null,
  conta_kommo_solicitada_em: null,
  conta_kommo_criada_em: null,
  treinamento_agendado_para: null,
  treinamento_realizado_em: null,
  extensao_14_solicitada_em: null,
  extensao_14_aprovada_em: null,
  extensao_7_solicitada_em: null,
  extensao_7_aprovada_em: null,
  contratacao_kommo_solicitada_em: null,
  implementacao_concluida_em: null,
};

let proximoId = 1;
function clienteFixture(overrides: Partial<Cliente> = {}): Cliente {
  const id = String(proximoId++);
  return {
    ...MARCOS_VAZIOS,
    id,
    nome_empresa: `Cliente ${id}`,
    nome_contato: null,
    telefone: null,
    email: null,
    segmento: null,
    nome_fantasia: null,
    razao_social: null,
    cnpj: null,
    site: null,
    cidade: null,
    uf: null,
    consultor_responsavel_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const LABEL = 'Geração do funil → Kickoff';

describe('diasEntre', () => {
  it('cenário válido: B depois de A retorna a diferença em dias', () => {
    expect(diasEntre('2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z')).toBe(4);
  });

  it('cenário igual: A = B retorna 0', () => {
    expect(diasEntre('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(0);
  });

  it('cenário inválido: B antes de A retorna um número negativo (não é escondido aqui)', () => {
    expect(diasEntre('2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(-4);
  });

  it('retorna null quando falta uma das datas', () => {
    expect(diasEntre(null, '2026-10-01T00:00:00Z')).toBeNull();
    expect(diasEntre('2026-10-01T00:00:00Z', null)).toBeNull();
  });
});

describe('construirTemposProcesso — amostra inválida nunca entra na média/mediana', () => {
  it('cliente com ordem cronológica correta conta como amostra normal', () => {
    const clientes = [
      clienteFixture({ funil_gerado_em: '2026-10-01T00:00:00Z', kickoff_realizado_em: '2026-10-05T00:00:00Z' }),
    ];
    const metrica = construirTemposProcesso(clientes).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(1);
    expect(metrica.amostrasInconsistentes).toBe(0);
    expect(metrica.mediaDias).toBe(4);
    expect(metrica.medianaDias).toBe(4);
  });

  it('cliente com A = B conta como amostra válida de 0 dias (não é descartado)', () => {
    const clientes = [
      clienteFixture({ funil_gerado_em: '2026-10-01T00:00:00Z', kickoff_realizado_em: '2026-10-01T00:00:00Z' }),
    ];
    const metrica = construirTemposProcesso(clientes).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(1);
    expect(metrica.amostrasInconsistentes).toBe(0);
    expect(metrica.mediaDias).toBe(0);
  });

  it('cliente com kickoff antes do funil ser gerado: não entra na média, conta como inconsistente', () => {
    const clientes = [
      clienteFixture({ funil_gerado_em: '2026-10-05T00:00:00Z', kickoff_realizado_em: '2026-10-01T00:00:00Z' }),
    ];
    const metrica = construirTemposProcesso(clientes).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(0);
    expect(metrica.amostrasInconsistentes).toBe(1);
    expect(metrica.mediaDias).toBeNull();
    expect(metrica.medianaDias).toBeNull();
  });

  it('mistura: amostra inconsistente não contamina a média das amostras válidas', () => {
    const clientes = [
      clienteFixture({ funil_gerado_em: '2026-10-01T00:00:00Z', kickoff_realizado_em: '2026-10-05T00:00:00Z' }), // +4d, válida
      clienteFixture({ funil_gerado_em: '2026-10-01T00:00:00Z', kickoff_realizado_em: '2026-10-11T00:00:00Z' }), // +10d, válida
      clienteFixture({ funil_gerado_em: '2026-10-05T00:00:00Z', kickoff_realizado_em: '2026-10-01T00:00:00Z' }), // -4d, inconsistente
    ];
    const metrica = construirTemposProcesso(clientes).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(2);
    expect(metrica.amostrasInconsistentes).toBe(1);
    expect(metrica.mediaDias).toBe(7); // (4 + 10) / 2, o -4 nunca entra na conta
  });

  it('zero amostras: média/mediana null, sem marcar como base baixa', () => {
    const metrica = construirTemposProcesso([clienteFixture()]).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(0);
    expect(metrica.mediaDias).toBeNull();
    expect(metrica.medianaDias).toBeNull();
    expect(metrica.baseBaixa).toBe(false);
  });

  it('exatamente 1 amostra válida: calcula o valor mas sinaliza base baixa', () => {
    const clientes = [
      clienteFixture({ funil_gerado_em: '2026-10-01T00:00:00Z', kickoff_realizado_em: '2026-10-05T00:00:00Z' }),
    ];
    const metrica = construirTemposProcesso(clientes).find((t) => t.label === LABEL)!;
    expect(metrica.amostras).toBe(1);
    expect(metrica.baseBaixa).toBe(true);
  });
});
