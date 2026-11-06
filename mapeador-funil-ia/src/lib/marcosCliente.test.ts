import { describe, expect, it } from 'vitest';
import { resolverPatchMarcoReuniao } from './marcosCliente';

// Prompt 64, Bloco 2 (seção 13: "agendar não é realizar" / "remarcação não
// reinicia o prazo") — a regra mais sensível da jornada operacional.
const SEM_MARCOS = {
  kickoff_realizado_em: null,
  kickoff_agendado_para: null,
  treinamento_realizado_em: null,
  treinamento_agendado_para: null,
};

describe('resolverPatchMarcoReuniao', () => {
  it('reunião de kickoff agendada (ainda não realizada): só atualiza a data agendada', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'kickoff', status: 'agendada', data_hora: '2026-11-10T14:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch).toEqual({ kickoff_agendado_para: '2026-11-10T14:00:00Z' });
  });

  it('reunião de kickoff realizada: inicia kickoff_realizado_em e atualiza a agendada', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'kickoff', status: 'realizada', data_hora: '2026-11-10T14:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch).toEqual({
      kickoff_realizado_em: '2026-11-10T14:00:00Z',
      kickoff_agendado_para: '2026-11-10T14:00:00Z',
    });
  });

  it('remarcação DEPOIS do kickoff original realizado: nunca sobrescreve kickoff_realizado_em', () => {
    const clienteComKickoffJaRealizado = { ...SEM_MARCOS, kickoff_realizado_em: '2026-10-01T10:00:00Z' };
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'kickoff', status: 'remarcada', data_hora: '2026-11-15T14:00:00Z' },
      clienteComKickoffJaRealizado,
    );
    expect(patch.kickoff_realizado_em).toBeUndefined();
    // A data agendada pode continuar acompanhando a reunião em aberto (ex:
    // uma reunião de follow-up remarcada), só o marco de "realizado" é fixo.
    expect(patch.kickoff_agendado_para).toBe('2026-11-15T14:00:00Z');
  });

  it('não comparecimento do cliente: não inicia o prazo', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'kickoff', status: 'cliente_nao_compareceu', data_hora: '2026-11-10T14:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch.kickoff_realizado_em).toBeUndefined();
  });

  it('cancelamento: não atualiza nenhuma das duas datas', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'kickoff', status: 'cancelada', data_hora: '2026-11-10T14:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch).toEqual({});
  });

  it('reunião que não é kickoff nem treinamento: nunca mexe em nada', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'checkin_1', status: 'realizada', data_hora: '2026-11-10T14:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch).toEqual({});
  });

  it('treinamento realizado usa o par de campos certo (não mistura com kickoff)', () => {
    const patch = resolverPatchMarcoReuniao(
      { tipo: 'treinamento', status: 'realizada', data_hora: '2026-11-20T09:00:00Z' },
      SEM_MARCOS,
    );
    expect(patch).toEqual({
      treinamento_realizado_em: '2026-11-20T09:00:00Z',
      treinamento_agendado_para: '2026-11-20T09:00:00Z',
    });
    expect(patch).not.toHaveProperty('kickoff_realizado_em');
  });

  it('sem data_hora: nada a sincronizar', () => {
    const patch = resolverPatchMarcoReuniao({ tipo: 'kickoff', status: 'realizada', data_hora: null }, SEM_MARCOS);
    expect(patch).toEqual({});
  });
});
