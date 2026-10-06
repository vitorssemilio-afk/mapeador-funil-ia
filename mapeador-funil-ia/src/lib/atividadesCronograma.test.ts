// Testes do Prompt 51, seções 25-38/48 — "Conta Kommo criada" concluída
// nunca pode deixar "Conta Kommo solicitada" aparecendo como "aguardando
// etapa anterior": a criação só é possível se a solicitação já aconteceu,
// mesmo que a data exata da solicitação não tenha sido informada. Cobre os
// 3 estados que o produto precisa diferenciar (seção 55): não aconteceu /
// aconteceu com data / aconteceu sem data conhecida.
import { describe, expect, it } from 'vitest';
import { resolverMarcoSimples } from './atividadesCronograma';

describe('resolverMarcoSimples — concluído sem data', () => {
  it('não aconteceu: sem valor próprio e sem prova posterior -> aguardando etapa anterior', () => {
    const resolvido = resolverMarcoSimples({
      nome: 'Conta Kommo solicitada',
      ciclo: 'Ciclo 1',
      valorIso: null,
      kickoffRealizadoEm: '2026-09-01T10:00:00Z',
      provaDeConclusaoPosteriorIso: null,
    });

    expect(resolvido.status).toBe('aguardando_etapa_anterior');
    expect(resolvido.dataReal).toBeNull();
  });

  it('aconteceu com data conhecida: concluído, com a data real preenchida', () => {
    const resolvido = resolverMarcoSimples({
      nome: 'Conta Kommo solicitada',
      ciclo: 'Ciclo 1',
      valorIso: '2026-09-20T09:00:00Z',
      kickoffRealizadoEm: '2026-09-01T10:00:00Z',
      provaDeConclusaoPosteriorIso: '2026-09-28T09:00:00Z',
    });

    expect(resolvido.status).toBe('concluido');
    expect(resolvido.dataReal?.toISOString()).toBe('2026-09-20T09:00:00.000Z');
  });

  it('aconteceu sem data conhecida: etapa posterior já concluída prova que esta também ocorreu', () => {
    const resolvido = resolverMarcoSimples({
      nome: 'Conta Kommo solicitada',
      ciclo: 'Ciclo 1',
      valorIso: null,
      kickoffRealizadoEm: '2026-09-01T10:00:00Z',
      // "Conta Kommo criada" já tem data -> prova que a solicitação
      // necessariamente aconteceu antes, mesmo sem data própria registrada.
      provaDeConclusaoPosteriorIso: '2026-09-28T09:00:00Z',
    });

    expect(resolvido.status).toBe('concluido');
    // Nunca inventa a data da solicitação — fica null até alguém informar.
    expect(resolvido.dataReal).toBeNull();
  });

  it('sem prova posterior nenhuma: continua aguardando etapa anterior (não assume nada)', () => {
    const resolvido = resolverMarcoSimples({
      nome: 'Conta Kommo criada',
      ciclo: 'Ciclo 1',
      valorIso: null,
      kickoffRealizadoEm: '2026-09-01T10:00:00Z',
      provaDeConclusaoPosteriorIso: null,
    });

    expect(resolvido.status).toBe('aguardando_etapa_anterior');
    expect(resolvido.dataReal).toBeNull();
  });
});
