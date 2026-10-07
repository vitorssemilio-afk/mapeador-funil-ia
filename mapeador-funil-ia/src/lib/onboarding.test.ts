// Cobre a regra que decide se o onboarding abre sozinho — o bug relatado
// (reabrir a cada F5) vinha de "Refazer onboarding" zerar
// onboarding_concluido_em/onboarding_pulado; estes testes travam a regra
// pura que decide a abertura automática independente de como ela é
// chamada no componente.
import { describe, expect, it } from 'vitest';
import { deveAbrirOnboardingAutomaticamente, estadoOnboarding } from './onboarding';
import type { Consultor } from '../types/database';

function consultorFixture(overrides: Partial<Consultor> = {}): Pick<
  Consultor,
  'onboarding_concluido_em' | 'onboarding_pulado' | 'onboarding_iniciado_em'
> {
  return {
    onboarding_concluido_em: null,
    onboarding_pulado: false,
    onboarding_iniciado_em: null,
    ...overrides,
  };
}

describe('deveAbrirOnboardingAutomaticamente', () => {
  it('usuário novo (nunca iniciou/concluiu/pulou): abre', () => {
    expect(deveAbrirOnboardingAutomaticamente(consultorFixture())).toBe(true);
  });

  it('consultor ainda não carregado: não abre (evita flash antes do perfil chegar)', () => {
    expect(deveAbrirOnboardingAutomaticamente(null)).toBe(false);
  });

  it('já concluiu: não abre, mesmo em todo reload', () => {
    expect(
      deveAbrirOnboardingAutomaticamente(consultorFixture({ onboarding_concluido_em: '2026-01-01T00:00:00Z' })),
    ).toBe(false);
  });

  it('pulou ("Pular por enquanto"): não abre de novo automaticamente', () => {
    expect(deveAbrirOnboardingAutomaticamente(consultorFixture({ onboarding_pulado: true }))).toBe(false);
  });

  it('usuário antigo marcado como concluído pela migration: não abre', () => {
    expect(
      deveAbrirOnboardingAutomaticamente(consultorFixture({ onboarding_concluido_em: '2026-01-01T00:00:00Z' })),
    ).toBe(false);
  });
});

describe('estadoOnboarding', () => {
  it('consultor ainda não carregado: nao_iniciado', () => {
    expect(estadoOnboarding(null)).toBe('nao_iniciado');
  });

  it('nenhum campo preenchido: nao_iniciado', () => {
    expect(estadoOnboarding(consultorFixture())).toBe('nao_iniciado');
  });

  it('só iniciado (abriu mas não avançou o suficiente pra pular/concluir): em_andamento', () => {
    expect(estadoOnboarding(consultorFixture({ onboarding_iniciado_em: '2026-01-01T00:00:00Z' }))).toBe(
      'em_andamento',
    );
  });

  it('pulado: pulado', () => {
    expect(
      estadoOnboarding(
        consultorFixture({ onboarding_iniciado_em: '2026-01-01T00:00:00Z', onboarding_pulado: true }),
      ),
    ).toBe('pulado');
  });

  it('concluído vence mesmo se onboarding_pulado também estiver true de uma passagem anterior', () => {
    expect(
      estadoOnboarding(
        consultorFixture({
          onboarding_iniciado_em: '2026-01-01T00:00:00Z',
          onboarding_pulado: true,
          onboarding_concluido_em: '2026-01-02T00:00:00Z',
        }),
      ),
    ).toBe('concluido');
  });
});
