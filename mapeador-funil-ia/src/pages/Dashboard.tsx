import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { bucketDeItem, construirAgendaOperacional } from '../lib/agendaOperacional';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import {
  construirAlertas,
  construirResumoClientes,
  estaAtrasado,
  nomeConsultor,
  prazoLabelDe,
  SAUDE_LABELS,
  SAUDE_TONE,
  type AlertaOperacao,
  type ClienteResumo,
  type SaudeCliente,
} from '../lib/operacaoResumo';
import { TIPO_REUNIAO_LABELS } from '../lib/reunioes';
import { supabase } from '../lib/supabaseClient';
import { STATUS_TRIAL_LABELS, STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type {
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

  const [busca, setBusca] = useState('');
  const [filtroFase, setFiltroFase] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroSaude, setFiltroSaude] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [soMeusClientes, setSoMeusClientes] = useState(false);

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

  const alertas = useMemo(
    () => construirAlertas(resumos, hoje, ocorrenciasAbertas),
    [resumos, hoje, ocorrenciasAbertas],
  );

  // P1-A6: mesma fonte de agenda usada na página Agenda — nunca uma segunda
  // regra paralela pra "o que precisa ser feito hoje" (a antiga
  // atividadesDaAgenda, de agendaImplementacao.ts, ignorava pendências sem
  // data e itens que não fossem atividade de cronograma).
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

  const itensHoje = useMemo(
    () => agendaOperacional.filter((item) => bucketDeItem(item, hoje) === 'atrasados' || bucketDeItem(item, hoje) === 'hoje'),
    [agendaOperacional, hoje],
  );

  // P2-M9: antes esta seção era um texto fixo dizendo que não havia
  // integração de agenda, mesmo quando já existiam reuniões cadastradas
  // manualmente (módulo de Reuniões) — agora lista as próximas de verdade.
  const proximasReunioes = useMemo(
    () =>
      reunioes
        .filter((r) => r.status === 'agendada' && r.data_hora && new Date(r.data_hora).getTime() >= hoje.getTime())
        .sort((a, b) => new Date(a.data_hora!).getTime() - new Date(b.data_hora!).getTime())
        .slice(0, 6),
    [reunioes, hoje],
  );

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
            Acompanhamento das implementações de CRM em andamento — status, prazos e próximas ações
            por cliente.
          </p>
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
          <div className="ops-kpi-grid">
            <div className="ops-kpi-card">
              <span className="ops-kpi-value">{kpis.clientesAtivos}</span>
              <span className="ops-kpi-label">Clientes ativos</span>
            </div>
            <div className="ops-kpi-card">
              <span className="ops-kpi-value">{kpis.implementacoesEmAndamento}</span>
              <span className="ops-kpi-label">Implementações em andamento</span>
            </div>
            <div className={`ops-kpi-card${kpis.clientesEmRisco > 0 ? ' ops-kpi-card-risco' : ''}`}>
              <span className="ops-kpi-value">{kpis.clientesEmRisco}</span>
              <span className="ops-kpi-label">Clientes em risco</span>
            </div>
            <div className="ops-kpi-card">
              <span className="ops-kpi-value">{kpis.acoesHoje}</span>
              <span className="ops-kpi-label">Ações para hoje</span>
            </div>
          </div>

          <div className="ops-grid-2">
            <section className="ops-section">
              <div className="ops-section-head">
                <h2>Atenção necessária</h2>
                <span className="ops-section-count">{alertas.length}</span>
              </div>
              {alertas.length === 0 ? (
                <p className="ops-empty-hint">Nenhum cliente precisando de atenção agora. 🎉</p>
              ) : (
                <ul className="ops-alert-list">
                  {alertas.map((a) => (
                    <AlertaCard key={`${a.clienteId}-${a.motivo}`} alerta={a} navigate={navigate} />
                  ))}
                </ul>
              )}
            </section>

            <section className="ops-section">
              <div className="ops-section-head">
                <h2>Próximos compromissos</h2>
              </div>
              {proximasReunioes.length === 0 ? (
                <div className="ops-meetings-empty">
                  <p>
                    Nenhuma reunião agendada no módulo de Reuniões. Sem integração com Google
                    Calendar ainda — o que estiver cadastrado ali (kickoffs, treinamentos, check-ins
                    e reuniões finais) aparece aqui.
                  </p>
                </div>
              ) : (
                <ul className="ops-meetings-list">
                  {proximasReunioes.map((r) => {
                    const cliente = clientes.find((c) => c.id === r.cliente_id);
                    return (
                      <li key={r.id}>
                        <Link to={`/clientes/${r.cliente_id}`}>{cliente?.nome_empresa ?? 'Cliente'}</Link>
                        <span className="field-hint">
                          {' '}
                          — {TIPO_REUNIAO_LABELS[r.tipo]} em{' '}
                          {new Date(r.data_hora!).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {r.consultor_responsavel_id
                            ? ` · ${nomeConsultor(r.consultor_responsavel_id, consultores)}`
                            : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="ops-section">
            <div className="ops-section-head">
              <h2>Clientes</h2>
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
  return (
    <li className={`ops-alert-card ops-alert-${alerta.severidade}`}>
      <span className="ops-alert-dot" aria-hidden="true" />
      <div className="ops-alert-body">
        <div className="ops-alert-top">
          <span className="ops-alert-cliente">{alerta.clienteNome}</span>
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
        onClick={() => navigate(`/clientes/${alerta.clienteId}`)}
      >
        Abrir
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
