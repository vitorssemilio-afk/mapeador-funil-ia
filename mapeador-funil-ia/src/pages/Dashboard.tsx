import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { inicioDoDia } from '../lib/agendaImplementacao';
import {
  bucketDeItem,
  construirAgendaOperacional,
  TIPO_ITEM_AGENDA_LABELS,
  type BucketAgenda,
  type ItemAgendaOperacional,
  type TipoItemAgenda,
} from '../lib/agendaOperacional';
import { STATUS_ATA_LABELS } from '../lib/atasIntegracao';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import {
  construirAlertas,
  construirResumoClientes,
  estaAtrasado,
  prazoLabelDe,
  SAUDE_LABELS,
  SAUDE_TONE,
  type AlertaOperacao,
  type ClienteResumo,
  type SaudeCliente,
} from '../lib/operacaoResumo';
import { supabase } from '../lib/supabaseClient';
import { STATUS_TRIAL_LABELS, STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type { AbaCliente } from './ClienteDetalhe';
import type {
  AtaReuniao,
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ClienteOcorrencia,
  ConfiguracaoImplementacao,
  Consultor,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatusHistorico,
  Mapeamento,
  Reuniao,
} from '../types/database';

const SAUDE_ORDEM: SaudeCliente[] = ['critico', 'atencao', 'aguardando_cliente', 'normal', 'concluido'];

const PESO_SAUDE: Record<SaudeCliente, number> = {
  critico: 0,
  atencao: 1,
  aguardando_cliente: 2,
  normal: 3,
  concluido: 4,
};

const MAX_ATENCAO_VISIVEL = 5;
const MAX_CARTEIRA_VISIVEL = 9;

type AcaoContextual = { aba: AbaCliente; label: string };

// Deriva, do texto já produzido por construirAlertas (nenhuma regra nova —
// só leitura do motivo), qual aba da ficha do cliente resolve aquele alerta
// e um rótulo de botão melhor que um genérico "Abrir". Mesmo mecanismo de
// ?aba= já usado pela Central de Notificações.
function acaoContextualDoAlerta(alerta: AlertaOperacao): AcaoContextual {
  const m = alerta.motivo.toLowerCase();
  if (m.includes('trial kommo')) return { aba: 'trial', label: 'Ver Trial Kommo' };
  if (m.includes('ocorrência aberta')) return { aba: 'resumo', label: 'Ver pendências' };
  if (m.includes('reunião')) return { aba: 'reunioes', label: 'Ver reuniões' };
  if (m.includes('funil de vendas') || m.includes('mapeamento de vendas') || m.includes('formulário de vendas')) {
    return { aba: 'mapeamento', label: 'Ver mapeamento' };
  }
  if (m.includes('pós-venda')) return { aba: 'mapeamento', label: 'Ver pós-venda' };
  if (m.includes('prazo geral') || m.includes('atividade')) return { aba: 'implementacao', label: 'Ver checklist' };
  return { aba: 'resumo', label: 'Abrir' };
}

function compararPrioridadeCarteira(a: ClienteResumo, b: ClienteResumo): number {
  const pa = PESO_SAUDE[a.saude];
  const pb = PESO_SAUDE[b.saude];
  if (pa !== pb) return pa - pb;

  const aAtrasado = estaAtrasado(a);
  const bAtrasado = estaAtrasado(b);
  if (aAtrasado !== bAtrasado) return aAtrasado ? -1 : 1;

  const diasA = a.trial?.diasRestantes ?? Infinity;
  const diasB = b.trial?.diasRestantes ?? Infinity;
  if (diasA !== diasB) return diasA - diasB;

  return a.cliente.nome_empresa.localeCompare(b.cliente.nome_empresa, 'pt-BR');
}

function saudacaoPorHorario(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function contarPorTipo(itens: ItemAgendaOperacional[]): Partial<Record<TipoItemAgenda, number>> {
  const contagem: Partial<Record<TipoItemAgenda, number>> = {};
  for (const item of itens) {
    contagem[item.tipo] = (contagem[item.tipo] ?? 0) + 1;
  }
  return contagem;
}

// Rótulos curtos pro resumo de "Amanhã"/"Próximos 7 dias" (spec pede
// "2 reuniões · 1 pendência vence", não a lista de TIPO_ITEM_AGENDA_LABELS
// inteira). trial usa "Trial(s) próximo(s)" em vez do rótulo padrão
// "Trial Kommo" só nesse resumo condensado.
function resumoContagemPorTipo(itens: ItemAgendaOperacional[]): string[] {
  const contagem = contarPorTipo(itens);
  const partes: string[] = [];
  if (contagem.reuniao) partes.push(`${contagem.reuniao} reunião(ões)`);
  if (contagem.trial) partes.push(`${contagem.trial} Trial(s) próximo(s)`);
  const pendencias = (contagem.pendencia_cliente ?? 0) + (contagem.pendencia_interna ?? 0);
  if (pendencias) partes.push(`${pendencias} pendência(s)`);
  if (contagem.tarefa) partes.push(`${contagem.tarefa} atividade(s)`);
  if (contagem.alerta) partes.push(`${contagem.alerta} alerta(s)`);
  return partes;
}

type ItemDecisao = {
  id: string;
  clienteId: string;
  clienteNome: string;
  implementacaoId: string | null;
  motivo: string;
};

// Formato da linha de ata_acoes_identificadas quando embeda atas_reuniao
// via FK (select com `atas_reuniao(...)` do PostgREST).
type AcaoPendenteComAta = {
  ata_id: string;
  atas_reuniao: { cliente_id: string | null; implementacao_id: string | null; titulo: string | null } | null;
};

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<ClienteOcorrencia[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);
  const [atasPendentes, setAtasPendentes] = useState<AtaReuniao[]>([]);

  const [busca, setBusca] = useState('');
  const [filtroFase, setFiltroFase] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroSaude, setFiltroSaude] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [soMeusClientes, setSoMeusClientes] = useState(false);
  const [mostrarTodaAtencao, setMostrarTodaAtencao] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      const [
        { data: clientesData, error: clientesError },
        { data: mapeamentosData },
        { data: implementacoesData },
        { data: historicoData },
        { data: atividadesData },
        { data: statusRowsData },
        { data: consultoresData },
        { data: ocorrenciasData },
        { data: reunioesData },
        { data: configGlobalData },
        { data: snapshotsData },
        { data: atasData },
      ] = await Promise.all([
        supabase.from('clientes').select('*'),
        supabase.from('mapeamentos').select('*'),
        supabase.from('implementacoes_crm').select('*'),
        supabase.from('implementacao_status_historico').select('*'),
        supabase.from('atividades_cronograma').select('*'),
        supabase.from('atividades_status').select('*'),
        supabase.from('consultores').select('*').order('nome', { ascending: true }),
        supabase.from('cliente_ocorrencias').select('*').eq('status', 'aberta'),
        supabase.from('reunioes').select('*'),
        supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
        supabase.from('implementacao_settings_snapshot').select('*'),
        // "Precisa da sua decisão" (seção 11) — mesma tabela/status já usados
        // na seção "Ata" da implementação (ImplementacaoDetalhe), só filtrados
        // aqui pra quem exige alguma decisão do consultor.
        supabase.from('atas_reuniao').select('*').in('status', ['requer_revisao', 'erro_vinculo']),
      ]);

      if (cancelled) return;

      if (clientesError) {
        setError(clientesError.message);
        setLoading(false);
        return;
      }

      setClientes(clientesData ?? []);
      setMapeamentos(mapeamentosData ?? []);
      setImplementacoes(implementacoesData ?? []);
      setHistorico(historicoData ?? []);
      setAtividades(atividadesData ?? []);
      setStatusRows(statusRowsData ?? []);
      setConsultores(consultoresData ?? []);
      setOcorrenciasAbertas(ocorrenciasData ?? []);
      setReunioes(reunioesData ?? []);
      setConfigGlobal(configGlobalData ?? null);
      setSnapshots(snapshotsData ?? []);
      setAtasPendentes(atasData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Configurações (Fase 1): regras vigentes por cliente — snapshot do
  // Kickoff se já existir, senão a configuração global. Nunca recalcula
  // implementação em andamento com uma config diferente da que valia
  // quando o Kickoff dela aconteceu.
  const configuracoesPorCliente = useMemo(
    () => construirMapaConfiguracoes(clientes.map((c) => c.id), snapshots, configGlobal),
    [clientes, snapshots, configGlobal],
  );

  const resumos = useMemo(
    () =>
      construirResumoClientes({
        clientes,
        mapeamentos,
        implementacoes,
        historico,
        atividades,
        statusRows,
        consultores,
        reunioes,
        hoje,
        configuracoesPorCliente,
      }),
    [clientes, mapeamentos, implementacoes, historico, atividades, statusRows, consultores, reunioes, hoje, configuracoesPorCliente],
  );

  // Fonte oficial de "atenção necessária" — mesma usada antes, já vem
  // ordenada por severidade (crítico primeiro). Nenhuma regra nova aqui.
  const alertas = useMemo(
    () => construirAlertas(resumos, hoje, ocorrenciasAbertas),
    [resumos, hoje, ocorrenciasAbertas],
  );

  const alertasVisiveis = mostrarTodaAtencao ? alertas : alertas.slice(0, MAX_ATENCAO_VISIVEL);

  // P1-A6: mesma fonte de agenda usada na página Agenda — nunca uma segunda
  // regra paralela pra "o que precisa ser feito hoje".
  const agendaOperacional = useMemo(
    () =>
      construirAgendaOperacional({
        clientes,
        mapeamentosVendas: mapeamentos.filter((m) => m.tipo === 'vendas'),
        mapeamentosPosVenda: mapeamentos.filter((m) => m.tipo === 'pos_venda'),
        implementacoes,
        atividades,
        atividadesStatus: statusRows,
        historico,
        consultores,
        ocorrenciasAbertas,
        reunioes,
        hoje,
        configuracoesPorCliente,
      }),
    [
      clientes,
      mapeamentos,
      implementacoes,
      atividades,
      statusRows,
      historico,
      consultores,
      ocorrenciasAbertas,
      reunioes,
      hoje,
      configuracoesPorCliente,
    ],
  );

  const itensPorBucket = useMemo(() => {
    const mapa = new Map<BucketAgenda, ItemAgendaOperacional[]>();
    for (const item of agendaOperacional) {
      const bucket = bucketDeItem(item, hoje);
      if (!mapa.has(bucket)) mapa.set(bucket, []);
      mapa.get(bucket)!.push(item);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0));
    }
    return mapa;
  }, [agendaOperacional, hoje]);

  const itensHoje = useMemo(
    () => [...(itensPorBucket.get('atrasados') ?? []), ...(itensPorBucket.get('hoje') ?? [])],
    [itensPorBucket],
  );
  const itensAmanha = itensPorBucket.get('amanha') ?? [];
  const itensProximos7 = itensPorBucket.get('proximos7') ?? [];

  // "Precisa da sua decisão" (seção 11) — atas aguardando vínculo manual
  // (já filtradas na query) mais atas já vinculadas com ações ainda não
  // revisadas. Mesmas fontes/estados da seção "Ata" em ImplementacaoDetalhe,
  // só agregadas aqui por cliente.
  const [acoesPendentesComAta, setAcoesPendentesComAta] = useState<AcaoPendenteComAta[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function carregarAcoesPendentes() {
      const { data } = await supabase
        .from('ata_acoes_identificadas')
        .select('ata_id, atas_reuniao(cliente_id, implementacao_id, titulo)')
        .eq('status', 'pendente_revisao');
      if (cancelled) return;
      setAcoesPendentesComAta((data as unknown as AcaoPendenteComAta[]) ?? []);
    }

    carregarAcoesPendentes();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const itensDecisao = useMemo(() => {
    const itens: ItemDecisao[] = [];

    for (const ata of atasPendentes) {
      if (!ata.cliente_id) continue;
      const cliente = clientes.find((c) => c.id === ata.cliente_id);
      if (!cliente) continue;
      itens.push({
        id: `vinculo:${ata.id}`,
        clienteId: cliente.id,
        clienteNome: cliente.nome_empresa,
        implementacaoId: ata.implementacao_id,
        motivo: `Ata "${ata.titulo ?? 'sem título'}" — ${STATUS_ATA_LABELS[ata.status]}, precisa ser vinculada manualmente`,
      });
    }

    const contagemPorCliente = new Map<string, { implementacaoId: string | null; quantidade: number }>();
    for (const row of acoesPendentesComAta) {
      const ataInfo = row.atas_reuniao;
      if (!ataInfo?.cliente_id) continue;
      const atual = contagemPorCliente.get(ataInfo.cliente_id);
      contagemPorCliente.set(ataInfo.cliente_id, {
        implementacaoId: ataInfo.implementacao_id,
        quantidade: (atual?.quantidade ?? 0) + 1,
      });
    }
    for (const [clienteId, info] of contagemPorCliente) {
      const cliente = clientes.find((c) => c.id === clienteId);
      if (!cliente) continue;
      itens.push({
        id: `revisao:${clienteId}`,
        clienteId,
        clienteNome: cliente.nome_empresa,
        implementacaoId: info.implementacaoId,
        motivo: `${info.quantidade} ação(ões) de ata aguardando revisão`,
      });
    }

    return itens;
  }, [atasPendentes, acoesPendentesComAta, clientes]);

  // P2-M9: antes esta seção era um texto fixo dizendo que não havia
  // integração de agenda, mesmo quando já existiam reuniões cadastradas
  // manualmente (módulo de Reuniões) — mantido como fonte das próximas
  // reuniões, agora dentro de "Hoje" (que já inclui reunião como tipo).
  const consultoresDisponiveis = useMemo(() => {
    const nomes = new Set(resumos.map((r) => r.consultor).filter((c): c is string => !!c?.trim()));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [resumos]);

  const fasesDisponiveis = useMemo(() => {
    const nomes = new Set(resumos.map((r) => r.faseAtual));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [resumos]);

  const kpis = useMemo(
    () => ({
      clientesAtivos: resumos.filter((r) => r.saude !== 'concluido').length,
      implementacoesEmAndamento: implementacoes.filter((i) => !['concluida', 'cancelada'].includes(i.status)).length,
      clientesEmRisco: resumos.filter((r) => r.saude === 'atencao' || r.saude === 'critico').length,
      acoesHoje: itensHoje.length,
    }),
    [resumos, implementacoes, itensHoje],
  );

  const meuEmail = (user?.email ?? '').toLowerCase();

  const meuConsultor = useMemo(
    () => consultores.find((c) => c.user_id === user?.id) ?? null,
    [consultores, user],
  );

  const resumosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const filtrados = resumos.filter((r) => {
      if (termo) {
        const alvo = `${r.cliente.nome_empresa} ${r.cliente.nome_contato ?? ''} ${r.cliente.segmento ?? ''}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (filtroFase && r.faseAtual !== filtroFase) return false;
      if (filtroConsultor && r.consultor !== filtroConsultor) return false;
      if (filtroSaude && r.saude !== filtroSaude) return false;
      if (soAtrasados && !estaAtrasado(r)) return false;
      if (soMeusClientes && (r.consultorEmail ?? '').toLowerCase() !== meuEmail) return false;
      return true;
    });

    return [...filtrados].sort((a, b) => a.cliente.nome_empresa.localeCompare(b.cliente.nome_empresa, 'pt-BR'));
  }, [resumos, busca, filtroFase, filtroConsultor, filtroSaude, soAtrasados, soMeusClientes, meuEmail]);

  // "Minha carteira" (seção 14) — os clientes mais relevantes primeiro
  // (risco → atraso → Trial perto de vencer), não a ordem alfabética da
  // tabela completa logo abaixo.
  const carteiraResumida = useMemo(
    () => [...resumos].sort(compararPrioridadeCarteira).slice(0, MAX_CARTEIRA_VISIVEL),
    [resumos],
  );

  function limparFiltros() {
    setBusca('');
    setFiltroFase('');
    setFiltroConsultor('');
    setFiltroSaude('');
    setSoAtrasados(false);
    setSoMeusClientes(false);
  }

  const filtrosAtivos =
    !!busca || !!filtroFase || !!filtroConsultor || !!filtroSaude || soAtrasados || soMeusClientes;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Operação CRM</h1>
          <p className="field-hint">
            Acompanhe o que exige atenção, os próximos compromissos e as ações prioritárias da sua
            carteira.
          </p>
          {meuConsultor && (
            <p className="field-hint ops-saudacao">
              {saudacaoPorHorario(new Date().getHours())}, {meuConsultor.nome.split(' ')[0]}.
            </p>
          )}
        </div>
        <Link to="/clientes/novo" className="btn btn-primary">
          + Novo cliente
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && clientes.length === 0 && (
        <div className="empty-state">
          <p>Você ainda não cadastrou nenhum cliente.</p>
          <Link to="/clientes/novo" className="btn btn-primary">
            Cadastrar o primeiro cliente
          </Link>
        </div>
      )}

      {!loading && clientes.length > 0 && (
        <>
          <div className="ops-kpi-grid ops-kpi-grid-compact">
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.clientesAtivos}</span>
              <span className="ops-kpi-label">Clientes ativos</span>
            </div>
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.implementacoesEmAndamento}</span>
              <span className="ops-kpi-label">Em implementação</span>
            </div>
            <div className={`ops-kpi-card ops-kpi-card-compact${kpis.clientesEmRisco > 0 ? ' ops-kpi-card-risco' : ''}`}>
              <span className="ops-kpi-value">{kpis.clientesEmRisco}</span>
              <span className="ops-kpi-label">Em risco</span>
            </div>
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.acoesHoje}</span>
              <span className="ops-kpi-label">Ações para hoje</span>
            </div>
          </div>

          <div className="ops-cockpit-grid">
            <section className="ops-section ops-attention-section">
              <div className="ops-section-head">
                <h2>Precisa da sua atenção</h2>
                <span className="ops-section-count">{alertas.length}</span>
              </div>
              {alertas.length === 0 ? (
                <p className="ops-empty-hint">Tudo sob controle por enquanto.</p>
              ) : (
                <>
                  <ul className="ops-alert-list ops-alert-list-static">
                    {alertasVisiveis.map((a) => (
                      <AlertaCard key={`${a.clienteId}-${a.motivo}`} alerta={a} navigate={navigate} />
                    ))}
                  </ul>
                  {!mostrarTodaAtencao && alertas.length > MAX_ATENCAO_VISIVEL && (
                    <button type="button" className="btn btn-ghost btn-auto" onClick={() => setMostrarTodaAtencao(true)}>
                      Ver todos os {alertas.length} itens
                    </button>
                  )}
                </>
              )}
            </section>

            <aside className="ops-side-column">
              {itensDecisao.length > 0 && (
                <section className="ops-section ops-decision-section">
                  <div className="ops-section-head">
                    <h2>Precisa da sua decisão</h2>
                    <span className="ops-section-count">{itensDecisao.length}</span>
                  </div>
                  <ul className="ops-decision-list">
                    {itensDecisao.map((d) => (
                      <li key={d.id} className="ops-decision-item">
                        <Link to={`/clientes/${d.clienteId}`}>{d.clienteNome}</Link>
                        <p className="field-hint">{d.motivo}</p>
                        <Link
                          to={
                            d.implementacaoId
                              ? `/implementacoes/${d.implementacaoId}?aba=reunioes`
                              : `/clientes/${d.clienteId}?aba=reunioes`
                          }
                          className="btn btn-secondary btn-auto"
                        >
                          Revisar
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="ops-section ops-today-section">
                <div className="ops-section-head">
                  <h2>Hoje</h2>
                  <span className="ops-section-count">{itensHoje.length}</span>
                </div>
                {itensHoje.length === 0 ? (
                  <p className="ops-empty-hint">Nenhuma ação para hoje.</p>
                ) : (
                  <ul className="ops-today-list">
                    {itensHoje.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <Link to={`/clientes/${item.clienteId}`}>{item.clienteNome}</Link>
                        <span className="field-hint"> — {TIPO_ITEM_AGENDA_LABELS[item.tipo]}: {item.titulo}</span>
                        {item.atrasado && <span className="ops-prazo-atrasado"> · atrasado</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {itensHoje.length > 6 && (
                  <Link to="/agenda#hoje" className="btn btn-ghost btn-auto">
                    Ver todos na Agenda
                  </Link>
                )}
              </section>

              {itensAmanha.length > 0 && (
                <section className="ops-section ops-summary-section">
                  <div className="ops-section-head">
                    <h2>Amanhã</h2>
                  </div>
                  <p className="ops-summary-line">{resumoContagemPorTipo(itensAmanha).join(' · ')}</p>
                  <Link to="/agenda#amanha" className="btn btn-ghost btn-auto">
                    Ver na Agenda
                  </Link>
                </section>
              )}

              <section className="ops-section ops-summary-section">
                <div className="ops-section-head">
                  <h2>Próximos 7 dias</h2>
                </div>
                {itensProximos7.length === 0 ? (
                  <p className="ops-empty-hint">Nada previsto por enquanto.</p>
                ) : (
                  <p className="ops-summary-line">{resumoContagemPorTipo(itensProximos7).join(' · ')}</p>
                )}
                <Link to="/agenda#proximos7" className="btn btn-ghost btn-auto">
                  Ver na Agenda
                </Link>
              </section>
            </aside>
          </div>

          <section className="ops-section">
            <div className="ops-section-head">
              <h2>Minha carteira</h2>
              <a href="#carteira-completa" className="btn btn-ghost btn-auto">
                Ver todos os clientes
              </a>
            </div>

            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table ops-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Fase atual</th>
                    <th>Saúde</th>
                    <th>Progresso</th>
                    <th>Trial</th>
                    <th>Próxima ação</th>
                    <th>Prazo</th>
                    <th>Consultor</th>
                  </tr>
                </thead>
                <tbody>
                  {carteiraResumida.map((r) => (
                    <LinhaCliente key={r.cliente.id} resumo={r} navigate={navigate} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ops-section" id="carteira-completa">
            <div className="ops-section-head">
              <h2>Todos os clientes</h2>
              <span className="ops-section-count">{resumosFiltrados.length}</span>
            </div>

            <div className="ops-filters-bar">
              <input
                type="text"
                className="ops-search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por empresa, contato ou segmento"
              />
              <select value={filtroFase} onChange={(e) => setFiltroFase(e.target.value)}>
                <option value="">Todas as fases</option>
                {fasesDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select value={filtroConsultor} onChange={(e) => setFiltroConsultor(e.target.value)}>
                <option value="">Todos os consultores</option>
                {consultoresDisponiveis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select value={filtroSaude} onChange={(e) => setFiltroSaude(e.target.value)}>
                <option value="">Toda saúde</option>
                {SAUDE_ORDEM.map((s) => (
                  <option key={s} value={s}>
                    {SAUDE_LABELS[s]}
                  </option>
                ))}
              </select>
              <label className="ops-filter-chip">
                <input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} />
                Só atrasados
              </label>
              <label className="ops-filter-chip">
                <input
                  type="checkbox"
                  checked={soMeusClientes}
                  onChange={(e) => setSoMeusClientes(e.target.checked)}
                />
                Meus clientes
              </label>
              {filtrosAtivos && (
                <button type="button" className="btn btn-ghost" onClick={limparFiltros}>
                  Limpar filtros
                </button>
              )}
            </div>

            {resumosFiltrados.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum cliente encontrado com esses filtros.</p>
              </div>
            ) : (
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="data-table ops-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Fase atual</th>
                      <th>Saúde</th>
                      <th>Progresso</th>
                      <th>Trial</th>
                      <th>Próxima ação</th>
                      <th>Prazo</th>
                      <th>Consultor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumosFiltrados.map((r) => (
                      <LinhaCliente key={r.cliente.id} resumo={r} navigate={navigate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AlertaCard({
  alerta,
  navigate,
}: {
  alerta: AlertaOperacao;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const acao = acaoContextualDoAlerta(alerta);
  return (
    <li className={`ops-alert-card ops-alert-${alerta.severidade}`}>
      <span className="ops-alert-dot" aria-hidden="true" />
      <div className="ops-alert-body">
        <div className="ops-alert-top">
          <span className="ops-alert-cliente">{alerta.clienteNome}</span>
          <span className={`status-badge status-tone-${alerta.severidade === 'critico' ? 'danger' : 'warning'}`}>
            {alerta.severidade === 'critico' ? 'Crítico' : 'Atenção'}
          </span>
          {alerta.prazoLabel && <span className="ops-alert-prazo">{alerta.prazoLabel}</span>}
        </div>
        <p className="ops-alert-motivo">{alerta.motivo}</p>
        <p className="ops-alert-meta">
          Próxima ação: <strong>{alerta.proximaAcao}</strong>
          {alerta.consultor && ` · ${alerta.consultor}`}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-secondary ops-alert-btn"
        onClick={() => navigate(`/clientes/${alerta.clienteId}?aba=${acao.aba}`)}
      >
        {acao.label}
      </button>
    </li>
  );
}

function LinhaCliente({
  resumo,
  navigate,
}: {
  resumo: ClienteResumo;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { cliente, faseAtual, saude, progresso, trial, proximaAcao, consultor } = resumo;
  const prazoLabel = prazoLabelDe(resumo);
  const prazoAtrasado = estaAtrasado(resumo);

  return (
    <tr className="ops-table-row" onClick={() => navigate(`/clientes/${cliente.id}`)}>
      <td>
        <Link to={`/clientes/${cliente.id}`} className="row-name-link">
          {cliente.nome_empresa}
        </Link>
        {(cliente.nome_contato || cliente.segmento) && (
          <span className="mapeamento-card-data" style={{ display: 'block' }}>
            {[cliente.nome_contato, cliente.segmento].filter(Boolean).join(' · ')}
          </span>
        )}
      </td>
      <td>{faseAtual}</td>
      <td>
        <span className={`status-badge status-tone-${SAUDE_TONE[saude]}`}>{SAUDE_LABELS[saude]}</span>
      </td>
      <td>
        {progresso == null ? (
          <span className="dash">—</span>
        ) : (
          <span className="ops-progress" title={`${progresso}%`}>
            <span className="ops-progress-track">
              <span className="ops-progress-fill" style={{ width: `${progresso}%` }} />
            </span>
            <span className="ops-progress-value">{progresso}%</span>
          </span>
        )}
      </td>
      <td>
        {trial ? (
          <span
            className={`status-badge status-tone-${STATUS_TRIAL_TONE[trial.status]}`}
            title={STATUS_TRIAL_LABELS[trial.status]}
          >
            {trial.diasRestantes}d
          </span>
        ) : (
          <span className="dash" title="Sem Trial Kommo iniciado">
            —
          </span>
        )}
      </td>
      <td>{proximaAcao}</td>
      <td>
        {prazoLabel ? (
          <span className={prazoAtrasado ? 'ops-prazo-atrasado' : 'ops-prazo-ok'}>{prazoLabel}</span>
        ) : (
          <span className="dash">—</span>
        )}
      </td>
      <td>{consultor ?? <span className="dash">—</span>}</td>
    </tr>
  );
}
