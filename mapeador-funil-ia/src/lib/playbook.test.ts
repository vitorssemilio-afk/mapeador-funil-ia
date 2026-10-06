// Testes do Playbook Final de Implementação — cobrem os cenários mais
// importantes do pedido: cliente sem pós-venda (seção oculta, nunca
// mostrada como falha), ocultar/reordenar seções, e status de cada seção
// (Completa/Sem dados/Oculta) sem inventar dado que não existe.
import { describe, expect, it } from 'vitest';
import {
  construirSnapshotPlaybook,
  ordemPlaybook,
  statusSecaoPlaybook,
  textoEditavelInicial,
  type PlaybookTextoEditavel,
} from './playbook';
import type { Cliente, Consultor, EntregaAceite, EntregaRessalva, ImplementacaoCrm } from '../types/database';

function implementacaoFixture(overrides: Partial<ImplementacaoCrm> = {}): ImplementacaoCrm {
  return {
    id: 'impl-1',
    mapeamento_id: 'map-1',
    cliente_id: 'cli-1',
    user_id: 'user-1',
    nome_cliente: 'Empresa Exemplo',
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

function consultorFixture(overrides: Partial<Consultor> = {}): Consultor {
  return {
    id: 'cons-1',
    nome: 'Vítor Emílio',
    email: 'vitor@v4company.com',
    telefone: null,
    cargo: null,
    avatar_url: null,
    ativo: true,
    user_id: 'auth-1',
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

const INPUT_BASE = {
  implementacao: implementacaoFixture(),
  cliente: null as Cliente | null,
  consultores: [consultorFixture()],
  versaoFunilVendasAprovada: null,
  funisVendas: [],
  versaoFunilPosVendaAprovada: null,
  funisPosVenda: [],
  reunioes: [],
  criterios: [],
  criteriosStatus: [],
  ressalvas: [] as EntregaRessalva[],
  aceite: null as EntregaAceite | null,
  checkpointAdocao: null,
};

describe('construirSnapshotPlaybook', () => {
  it('cliente sem pós-venda: funilPosVenda fica null, nunca um objeto vazio inventado', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    expect(snapshot.funilPosVenda).toBeNull();
    expect(snapshot.visaoGeral.find((v) => v.componente === 'Funil de pós-venda')?.status).toBe('Não aplicável');
  });

  it('usuários vinculados: só o responsável quando não há apoio', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    expect(snapshot.usuarios).toEqual([{ nome: 'Vítor Emílio', papel: 'Consultor responsável' }]);
  });

  it('nunca inventa data de kickoff quando o cliente não tem uma', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    expect(snapshot.capa.kickoffEmIso).toBeNull();
  });
});

describe('ordemPlaybook', () => {
  it('sem ordem salva, usa a ordem padrão do manifesto', () => {
    const ordem = ordemPlaybook(null);
    expect(ordem[0]).toBe('sobre');
    expect(ordem).toHaveLength(23);
  });

  it('respeita a ordem salva e acrescenta seções novas do manifesto no fim', () => {
    const textoEditavel: PlaybookTextoEditavel = {
      ordem: ['aceite', 'sobre'],
      ocultas: [],
      overrides: {},
    };
    const ordem = ordemPlaybook(textoEditavel);
    expect(ordem[0]).toBe('aceite');
    expect(ordem[1]).toBe('sobre');
    expect(ordem).toHaveLength(23);
  });
});

describe('statusSecaoPlaybook', () => {
  it('seção oculta sempre reporta Oculta, mesmo com dado disponível', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    const textoEditavel: PlaybookTextoEditavel = { ...textoEditavelInicial(), ocultas: ['usuarios'] };
    expect(statusSecaoPlaybook('usuarios', snapshot, textoEditavel)).toBe('Oculta');
  });

  it('seção automática sem dado nenhum reporta Sem dados, não Completa', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    const textoEditavel = textoEditavelInicial();
    expect(statusSecaoPlaybook('funilVendas', snapshot, textoEditavel)).toBe('Sem dados');
  });

  it('seção manual com texto sugerido preenchido reporta Completa', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    const textoEditavel = textoEditavelInicial();
    expect(statusSecaoPlaybook('boasPraticas', snapshot, textoEditavel)).toBe('Completa');
  });

  it('seção manual sem texto nenhum reporta Sem dados', () => {
    const snapshot = construirSnapshotPlaybook(INPUT_BASE);
    const textoEditavel: PlaybookTextoEditavel = { ...textoEditavelInicial(), overrides: {} };
    expect(statusSecaoPlaybook('objetivos', snapshot, textoEditavel)).toBe('Sem dados');
  });
});
