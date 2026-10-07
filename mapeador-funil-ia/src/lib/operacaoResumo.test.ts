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
