import { describe, expect, it } from 'vitest';
import { resolverCriterioEfetivo, resolverResumoCriteriosEntrega } from './criteriosEntrega';
import type { AtividadeCronograma, AtividadeStatusRow, Cliente, CriterioEntrega, CriterioEntregaStatus } from '../types/database';

// Prompt 64, Bloco 4 (seções 23-29): "Prontidão para Entrega" reaproveita o
// que o checklist já comprovou (com evidência) em vez de pedir pro
// consultor preencher tudo de novo — sem nunca considerar automaticamente
// concluída uma validação que exige teste real sem ninguém ter feito esse
// teste.
function criterioFixture(overrides: Partial<CriterioEntrega> = {}): CriterioEntrega {
  return {
    id: 'crit-1',
    chave: 'bot_funcionando',
    nome: 'Bot de qualificação funcionando',
    ordem: 1,
    obrigatorio: true,
    atividade_chave_fonte: 'bot_funcionando',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function atividadeFixture(overrides: Partial<AtividadeCronograma> = {}): AtividadeCronograma {
  return {
    id: 'ativ-1',
    chave: 'bot_funcionando',
    nome: 'Bot de qualificação ativo e testado em uma conversa real',
    ciclo: 'Ciclo 4 — Finalização e Entrega',
    ordem: 100,
    responsavel_padrao: null,
    depende_de: null,
    prazo_dias: null,
    requer_evidencia: true,
    reuniao_tipo: null,
    implementacao_id: null,
    descricao: null,
    categoria: null,
    obrigatorio: true,
    origem_template_id: null,
    origem_template_atividade_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function statusAtividadeFixture(overrides: Partial<AtividadeStatusRow> = {}): AtividadeStatusRow {
  return {
    id: 'status-ativ-1',
    implementacao_id: 'impl-1',
    atividade_id: 'ativ-1',
    data_real: null,
    agendado_para: null,
    bloqueado_pelo_cliente: false,
    evidencia: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function clienteFixture(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cli-1',
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
    whatsapp_tipo: null,
    whatsapp_numero: null,
    whatsapp_responsavel: null,
    whatsapp_situacao: null,
    whatsapp_observacoes: null,
    instagram_perfil: null,
    instagram_responsavel: null,
    instagram_observacoes: null,
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

const IMPL_ID = 'impl-1';

describe('resolverCriterioEfetivo', () => {
  it('sem decisão manual, atividade-fonte concluída com evidência: comprova automaticamente', () => {
    const criterio = criterioFixture();
    const atividade = atividadeFixture();
    const statusAtividade = statusAtividadeFixture({ data_real: '2026-02-01T10:00:00Z', evidencia: 'Testado com a Maria, respondeu certinho' });

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente: clienteFixture(),
      atividadesTemplate: [atividade],
      atividadesStatus: [statusAtividade],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).toBe('concluido');
    expect(efetivo.origem).toBe('automatico');
    expect(efetivo.evidencia).toBe('Testado com a Maria, respondeu certinho');
    expect(efetivo.temDecisaoManual).toBe(false);
  });

  it('sem decisão manual, atividade-fonte ainda não concluída: pendente, nunca "concluído" fictício', () => {
    const criterio = criterioFixture();
    const atividade = atividadeFixture();
    const statusAtividade = statusAtividadeFixture({ data_real: null });

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente: clienteFixture(),
      atividadesTemplate: [atividade],
      atividadesStatus: [statusAtividade],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).toBe('pendente');
    expect(efetivo.origem).toBe('manual');
  });

  it('decisão manual já registrada sempre vence, mesmo com fonte automática concluída', () => {
    const criterio = criterioFixture();
    const atividade = atividadeFixture();
    const statusAtividade = statusAtividadeFixture({ data_real: '2026-02-01T10:00:00Z', evidencia: 'ok' });
    const statusRow: CriterioEntregaStatus = {
      id: 'crit-status-1',
      implementacao_id: IMPL_ID,
      criterio_id: criterio.id,
      status: 'em_validacao',
      evidencia: 'Ainda conferindo',
      observacao: null,
      justificativa_nao_aplica: null,
      data_validacao: null,
      responsavel_validacao_id: 'cons-1',
      created_at: '2026-02-02T00:00:00Z',
      updated_at: '2026-02-02T00:00:00Z',
    };

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow,
      cliente: clienteFixture(),
      atividadesTemplate: [atividade],
      atividadesStatus: [statusAtividade],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).toBe('em_validacao');
    expect(efetivo.origem).toBe('manual');
    expect(efetivo.temDecisaoManual).toBe(true);
  });

  it('fonte "marco:" lê direto do cliente (ex: treinamento realizado)', () => {
    const criterio = criterioFixture({ chave: 'equipe_treinada', atividade_chave_fonte: 'marco:treinamento_realizado_em' });

    const semTreinamento = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente: clienteFixture({ treinamento_realizado_em: null }),
      atividadesTemplate: [],
      atividadesStatus: [],
      implementacaoId: IMPL_ID,
    });
    expect(semTreinamento.status).toBe('pendente');

    const comTreinamento = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente: clienteFixture({ treinamento_realizado_em: '2026-02-05T00:00:00Z' }),
      atividadesTemplate: [],
      atividadesStatus: [],
      implementacaoId: IMPL_ID,
    });
    expect(comTreinamento.status).toBe('concluido');
    expect(comTreinamento.origem).toBe('automatico');
  });

  it('canais_funcionando: não aplicável quando WhatsApp e Instagram estão os dois fora do escopo', () => {
    const criterio = criterioFixture({ chave: 'canais_funcionando', atividade_chave_fonte: 'canais_funcionando' });
    const cliente = clienteFixture({ canal_whatsapp_business: false, canal_instagram: false });

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente,
      atividadesTemplate: [],
      atividadesStatus: [],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).toBe('nao_se_aplica');
    expect(efetivo.origem).toBe('nao_aplicavel_condicional');
  });

  it('canais_funcionando: aplicável quando pelo menos um canal está no escopo', () => {
    const criterio = criterioFixture({ chave: 'canais_funcionando', atividade_chave_fonte: 'canais_funcionando' });
    const cliente = clienteFixture({ canal_whatsapp_business: true, canal_instagram: false });

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente,
      atividadesTemplate: [atividadeFixture({ chave: 'canais_funcionando' })],
      atividadesStatus: [],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).not.toBe('nao_se_aplica');
  });

  it('canais_funcionando: cliente antigo sem decisão de canal (null nos dois) continua aplicável', () => {
    const criterio = criterioFixture({ chave: 'canais_funcionando', atividade_chave_fonte: 'canais_funcionando' });
    const cliente = clienteFixture({ canal_whatsapp_business: null, canal_instagram: null });

    const efetivo = resolverCriterioEfetivo({
      criterio,
      statusRow: null,
      cliente,
      atividadesTemplate: [atividadeFixture({ chave: 'canais_funcionando' })],
      atividadesStatus: [],
      implementacaoId: IMPL_ID,
    });

    expect(efetivo.status).not.toBe('nao_se_aplica');
  });
});

describe('resolverResumoCriteriosEntrega — com contexto automático', () => {
  it('conta critério comprovado automaticamente como concluído no resumo', () => {
    const criterios = [criterioFixture()];
    const atividade = atividadeFixture();
    const statusAtividade = statusAtividadeFixture({ data_real: '2026-02-01T10:00:00Z' });

    const resumo = resolverResumoCriteriosEntrega(criterios, [], IMPL_ID, {
      cliente: clienteFixture(),
      atividadesTemplate: [atividade],
      atividadesStatus: [statusAtividade],
    });

    expect(resumo.concluidos).toBe(1);
    expect(resumo.total).toBe(1);
    expect(resumo.todosObrigatoriosAtendidos).toBe(true);
  });

  it('critério não aplicável condicionalmente não entra no denominador', () => {
    const criterios = [criterioFixture({ chave: 'canais_funcionando', atividade_chave_fonte: 'canais_funcionando', obrigatorio: true })];
    const cliente = clienteFixture({ canal_whatsapp_business: false, canal_instagram: false });

    const resumo = resolverResumoCriteriosEntrega(criterios, [], IMPL_ID, {
      cliente,
      atividadesTemplate: [],
      atividadesStatus: [],
    });

    expect(resumo.total).toBe(0);
    expect(resumo.todosObrigatoriosAtendidos).toBe(true);
  });

  it('sem contexto (compatibilidade retroativa): comporta-se como antes, só decisão manual conta', () => {
    const criterios = [criterioFixture()];
    const atividade = atividadeFixture();
    const statusAtividade = statusAtividadeFixture({ data_real: '2026-02-01T10:00:00Z' });

    // Mesmos dados do primeiro teste, mas SEM passar o contexto — a
    // comprovação automática não deve ser considerada.
    const resumo = resolverResumoCriteriosEntrega(criterios, [], IMPL_ID);

    expect(resumo.concluidos).toBe(0);
    expect(resumo.todosObrigatoriosAtendidos).toBe(false);
    // (atividade/statusAtividade não usados neste cenário de propósito)
    expect([atividade.id, statusAtividade.atividade_id]).toHaveLength(2);
  });
});
