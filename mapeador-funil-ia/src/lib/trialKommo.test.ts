import { describe, expect, it } from 'vitest';
import type { Cliente } from '../types/database';
import { resolverResumoTrialKommo } from './trialKommo';

// Prompt 64, Bloco 1: resolverResumoTrialKommo não pode mais calcular trial
// pra quem já tem conta contratada, e precisa aceitar a data real de início
// de um trial pré-existente (não originado via V4) sem presumir "hoje".
function clienteFixture(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: '1',
    nome_empresa: 'Cliente teste',
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
    canal_whatsapp_business: null,
    canal_instagram: null,
    kommo_ja_possui: 'nao_confirmado',
    kommo_situacao_conta: null,
    kommo_dominio: null,
    kommo_email_admin: null,
    kommo_plano: null,
    kommo_trial_inicio_em: null,
    kommo_trial_vencimento_em: null,
    kommo_observacoes: null,
    consultor_responsavel_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
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
    ...overrides,
  };
}

const HOJE = new Date('2026-11-06T12:00:00Z');

describe('resolverResumoTrialKommo', () => {
  it('cliente sem nenhuma conta: null', () => {
    expect(resolverResumoTrialKommo(clienteFixture(), HOJE)).toBeNull();
  });

  it('cliente com conta ativa contratada: nunca calcula trial, mesmo com conta_kommo_criada_em preenchido', () => {
    const cliente = clienteFixture({
      kommo_ja_possui: 'sim',
      kommo_situacao_conta: 'ativa_contratada',
      conta_kommo_criada_em: '2026-01-01T00:00:00Z',
    });
    expect(resolverResumoTrialKommo(cliente, HOJE)).toBeNull();
  });

  it('conta criada via V4 (comportamento legado preservado): calcula normalmente', () => {
    const cliente = clienteFixture({ conta_kommo_criada_em: '2026-11-01T00:00:00Z' });
    const resumo = resolverResumoTrialKommo(cliente, HOJE);
    expect(resumo).not.toBeNull();
    expect(resumo!.periodoAtual).toBe('Trial inicial');
    expect(resumo!.diaAtualPeriodo).toBe(6);
  });

  it('conta pré-existente em trial com data real registrada: calcula a partir dela', () => {
    const cliente = clienteFixture({
      kommo_ja_possui: 'sim',
      kommo_situacao_conta: 'trial',
      kommo_trial_inicio_em: '2026-11-01T00:00:00Z',
    });
    const resumo = resolverResumoTrialKommo(cliente, HOJE);
    expect(resumo).not.toBeNull();
    expect(resumo!.diaAtualPeriodo).toBe(6);
  });

  it('conta pré-existente em trial SEM data de início registrada: não presume hoje, retorna null', () => {
    const cliente = clienteFixture({ kommo_ja_possui: 'sim', kommo_situacao_conta: 'trial' });
    expect(resolverResumoTrialKommo(cliente, HOJE)).toBeNull();
  });

  it('cliente que respondeu "não possui Kommo": null', () => {
    const cliente = clienteFixture({ kommo_ja_possui: 'nao' });
    expect(resolverResumoTrialKommo(cliente, HOJE)).toBeNull();
  });

  it('situação inativa/suspensa com conta criada via V4: ainda calcula (situação não é "ativa_contratada")', () => {
    const cliente = clienteFixture({
      kommo_ja_possui: 'sim',
      kommo_situacao_conta: 'inativa_suspensa',
      conta_kommo_criada_em: '2026-11-01T00:00:00Z',
    });
    expect(resolverResumoTrialKommo(cliente, HOJE)).not.toBeNull();
  });
});
