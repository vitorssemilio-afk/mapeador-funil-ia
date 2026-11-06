// Cobre o bug relatado na ficha do cliente: transferir o consultor
// responsável ANTES de existir implementação (ClienteDetalhe.tsx,
// "Transferir") atualizava clientes.consultor_responsavel_id de verdade,
// mas o resumo continuava mostrando "—" porque só olhava pro responsável
// da implementação, nunca pro do próprio cliente.
import { describe, expect, it } from 'vitest';
import { construirResumoClientes } from './operacaoResumo';
import type { Cliente, Consultor, ImplementacaoCrm } from '../types/database';

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

function clienteFixture(overrides: Partial<Cliente> = {}): Cliente {
  return {
    ...MARCOS_VAZIOS,
    id: 'cli-1',
    nome_empresa: 'BV Pneus',
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
    ...overrides,
  } as Cliente;
}

function consultorFixture(overrides: Partial<Consultor> = {}): Consultor {
  return {
    id: 'cons-1',
    nome: 'Raissa Martins',
    email: 'raissa.martins@v4company.com',
    telefone: null,
    cargo: null,
    avatar_url: null,
    ativo: true,
    user_id: null,
    role: 'consultor',
    onboarding_iniciado_em: null,
    onboarding_concluido_em: null,
    onboarding_pulado: false,
    onboarding_etapa: 0,
    primeiros_passos_concluidos: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function implementacaoFixture(overrides: Partial<ImplementacaoCrm> = {}): ImplementacaoCrm {
  return {
    id: 'impl-1',
    mapeamento_id: 'map-1',
    cliente_id: 'cli-1',
    user_id: 'user-1',
    nome_cliente: 'BV Pneus',
    consultor_responsavel_texto_legado: null,
    consultor_responsavel_id: 'cons-1',
    consultor_adicional_id: null,
    stakeholder_decisor: null,
    status: 'automacoes',
    conta_criada_via_v4: true,
    email_conta_kommo: null,
    whatsapp_corporativo_confirmado: false,
    acesso_facebook_confirmado: false,
    plano_contratado: null,
    periodo_contratado: null,
    data_decisao_plano: null,
    status_contratacao_kommo: 'nao_solicitada',
    observacoes: null,
    codigo_checkpoint: 'abc123',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  } as ImplementacaoCrm;
}

describe('construirResumoClientes — consultor responsável', () => {
  it('cliente sem implementação: usa o responsável do próprio cliente', () => {
    const consultor = consultorFixture();
    const cliente = clienteFixture({ consultor_responsavel_id: consultor.id });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [consultor],
      hoje: new Date('2026-10-07T00:00:00Z'),
    });

    expect(resumo.consultor).toBe('Raissa Martins');
  });

  it('cliente sem responsável nenhum (nem cliente, nem implementação): null, nunca "—" inventado', () => {
    const cliente = clienteFixture();

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-10-07T00:00:00Z'),
    });

    expect(resumo.consultor).toBeNull();
  });

  it('implementação já com responsável próprio vence o do cliente', () => {
    const consultorCliente = consultorFixture({ id: 'cons-1', nome: 'Raissa Martins' });
    const consultorImplementacao = consultorFixture({ id: 'cons-2', nome: 'Vitor Emilio' });
    const cliente = clienteFixture({ consultor_responsavel_id: consultorCliente.id });
    const implementacao = implementacaoFixture({ consultor_responsavel_id: consultorImplementacao.id });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [consultorCliente, consultorImplementacao],
      hoje: new Date('2026-10-07T00:00:00Z'),
    });

    expect(resumo.consultor).toBe('Vitor Emilio');
  });
});

// Implementação cancelada (pedido do Vitor) — sem congelar o relógio no
// momento do cancelamento, "dia X do ciclo"/atraso continuava subindo
// pra sempre contra a data real, mesmo num cliente que não está mais em
// andamento.
describe('construirResumoClientes — implementação cancelada', () => {
  it('congela diaCiclo/atrasado em cancelada_em, não na data de hoje', () => {
    const cliente = clienteFixture({ kickoff_realizado_em: '2026-01-01T00:00:00Z' });
    // Kickoff em 01/01, cancelada em 05/01 (dia 5) — se o relógio não
    // tivesse congelado, "hoje" (bem mais tarde) daria um dia bem maior.
    const implementacao = implementacaoFixture({
      status: 'cancelada',
      cancelada_em: '2026-01-05T00:00:00Z',
      motivo_cancelamento: 'Cliente desistiu do projeto',
    });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-10-07T00:00:00Z'),
    });

    expect(resumo.diaCiclo?.dia).toBe(5);
  });

  it('usa saúde "cancelado" própria, nunca "normal" (daria a entender que está tudo bem)', () => {
    const cliente = clienteFixture({ kickoff_realizado_em: '2026-01-01T00:00:00Z' });
    const implementacao = implementacaoFixture({
      status: 'cancelada',
      cancelada_em: '2026-01-05T00:00:00Z',
    });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-10-07T00:00:00Z'),
    });

    expect(resumo.saude).toBe('cancelado');
  });

  it('implementação em andamento (não cancelada) continua usando a data de hoje normalmente', () => {
    const cliente = clienteFixture({ kickoff_realizado_em: '2026-01-01T00:00:00Z' });
    const implementacao = implementacaoFixture({ status: 'automacoes' });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-01-10T00:00:00Z'),
    });

    expect(resumo.diaCiclo?.dia).toBe(10);
  });
});

function mapeamentoFixture(overrides: Partial<import('../types/database').Mapeamento> = {}): import('../types/database').Mapeamento {
  return {
    id: 'map-1',
    user_id: 'user-1',
    cliente_id: 'cli-1',
    nome_negocio: 'BV Pneus',
    status: 'funil_validado',
    respostas: {},
    enviado_pelo_cliente: true,
    codigo_curto: 'abc123',
    tipo: 'vendas',
    mapeamento_origem_id: null,
    enviado_em: '2026-01-01T00:00:00Z',
    revisado_por_email: null,
    revisado_em: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// Prompt 64, Bloco 3 (seções 17/21): a exigência de credenciais do Facebook
// foi removida de vez, e o WhatsApp Corporativo só é pré-requisito pra
// avançar pro CRM em configuração quando o canal está de fato no escopo
// deste cliente — cliente que não quer WhatsApp não trava mais aqui.
describe('construirResumoClientes — pré-requisito de preparacao_crm (canais)', () => {
  it('cliente sem WhatsApp no escopo: não bloqueia por WhatsApp não confirmado', () => {
    const cliente = clienteFixture({ canal_whatsapp_business: false });
    const implementacao = implementacaoFixture({
      status: 'preparacao_crm',
      email_conta_kommo: 'cliente@exemplo.com',
      whatsapp_corporativo_confirmado: false,
    });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [mapeamentoFixture()],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-01-10T00:00:00Z'),
    });

    expect(resumo.proximaAcao).not.toBe('Confirmar pré-requisitos (acessos)');
  });

  it('cliente com WhatsApp no escopo e ainda não confirmado: continua bloqueando', () => {
    const cliente = clienteFixture({ canal_whatsapp_business: true });
    const implementacao = implementacaoFixture({
      status: 'preparacao_crm',
      email_conta_kommo: 'cliente@exemplo.com',
      whatsapp_corporativo_confirmado: false,
    });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [mapeamentoFixture()],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-01-10T00:00:00Z'),
    });

    expect(resumo.proximaAcao).toBe('Confirmar pré-requisitos (acessos)');
  });

  it('cliente com WhatsApp no escopo e já confirmado: não bloqueia mais', () => {
    const cliente = clienteFixture({ canal_whatsapp_business: true });
    const implementacao = implementacaoFixture({
      status: 'preparacao_crm',
      email_conta_kommo: 'cliente@exemplo.com',
      whatsapp_corporativo_confirmado: true,
    });

    const [resumo] = construirResumoClientes({
      clientes: [cliente],
      mapeamentos: [mapeamentoFixture()],
      implementacoes: [implementacao],
      historico: [],
      atividades: [],
      statusRows: [],
      consultores: [],
      hoje: new Date('2026-01-10T00:00:00Z'),
    });

    expect(resumo.proximaAcao).not.toBe('Confirmar pré-requisitos (acessos)');
  });
});
