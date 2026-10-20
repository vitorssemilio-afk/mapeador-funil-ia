import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import {
  construirResumoClientes,
  diaCicloLabel,
  estaAtrasado,
  prazoLabelDe,
  SAUDE_LABELS,
  SAUDE_TONE,
  type ClienteResumo,
  type SaudeCliente,
} from '../lib/operacaoResumo';
import { supabase } from '../lib/supabaseClient';
import { STATUS_TRIAL_LABELS, STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ConfiguracaoImplementacao,
  Consultor,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatusHistorico,
  Mapeamento,
  Reuniao,
} from '../types/database';

const SAUDE_ORDEM: SaudeCliente[] = ['critico', 'atencao', 'aguardando_cliente', 'normal', 'concluido', 'cancelado'];

// Página completa de clientes (seção 19 do redesenho da Home) — a Home
// mostra só "Minha carteira" (top prioritários); esta página tem a tabela
// inteira, busca e filtros, exatamente como funcionava antes dentro da
// própria Home.
export function Clientes() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);

  const [busca, setBusca] = useState('');
  const [filtroFase, setFiltroFase] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroSaude, setFiltroSaude] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [soMeusClientes, setSoMeusClientes] = useState(false);
  // Drawer de filtros mobile (Prompt 58, seção 9) — a busca continua fora
  // do drawer e sempre visível; só fase/consultor/saúde/checkboxes entram
  // nele. Não é um estado de rascunho: os filtros já se aplicam ao vivo
  // (resumosFiltrados abaixo), o drawer só decide se essa área aparece
  // expandida ou não no celular.
  const [filtrosDrawerAberta, setFiltrosDrawerAberta] = useState(false);

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

  const consultoresDisponiveis = useMemo(() => {
    const nomes = new Set(resumos.map((r) => r.consultor).filter((c): c is string => !!c?.trim()));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [resumos]);

  const fasesDisponiveis = useMemo(() => {
    const nomes = new Set(resumos.map((r) => r.faseAtual));
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [resumos]);

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

  // Contagem só do que mora dentro do drawer mobile (sem a busca, que
  // fica fora dele e sempre visível) — mostrada no botão "Filtros (N)".
  const quantidadeFiltrosDrawer = [!!filtroFase, !!filtroConsultor, !!filtroSaude, soAtrasados, soMeusClientes].filter(
    Boolean,
  ).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p className="field-hint">Todos os clientes, com busca e filtros completos.</p>
        </div>
        <Link to="/clientes/novo" className="btn btn-primary">
          + Novo cliente
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && (
        <section className="ops-section">
          <div className="ops-section-head">
            <h2>Todos os clientes</h2>
            <span className="ops-section-count">{resumosFiltrados.length}</span>
          </div>

          <div className="ops-search-row">
            <input
              type="text"
              className="ops-search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa, contato ou segmento"
            />
            <button
              type="button"
              className="btn btn-secondary mobile-filtros-trigger"
              onClick={() => setFiltrosDrawerAberta(true)}
            >
              Filtros{quantidadeFiltrosDrawer > 0 ? ` (${quantidadeFiltrosDrawer})` : ''}
            </button>
          </div>

          {filtrosDrawerAberta && (
            <button
              type="button"
              className="mobile-filtros-drawer-backdrop"
              aria-label="Fechar filtros"
              onClick={() => setFiltrosDrawerAberta(false)}
            />
          )}

          <div className={`ops-filters-bar${filtrosDrawerAberta ? ' mobile-filtros-drawer-aberta' : ''}`}>
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
              <input type="checkbox" checked={soMeusClientes} onChange={(e) => setSoMeusClientes(e.target.checked)} />
              Meus clientes
            </label>
            {filtrosAtivos && (
              <button type="button" className="btn btn-ghost" onClick={limparFiltros}>
                Limpar filtros
              </button>
            )}
            {filtrosDrawerAberta && (
              <div className="mobile-filtros-drawer-acoes">
                <button type="button" className="btn btn-primary" onClick={() => setFiltrosDrawerAberta(false)}>
                  Aplicar filtros
                </button>
              </div>
            )}
          </div>

          {resumosFiltrados.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum cliente encontrado com esses filtros.</p>
              {filtrosAtivos && (
                <button type="button" className="btn btn-secondary" onClick={limparFiltros}>
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <>
            <div className="responsive-table-wrap table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table ops-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Fase atual</th>
                    <th>Saúde</th>
                    <th>Dia/Ciclo</th>
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

            <div className="responsive-card-list">
              {resumosFiltrados.map((r) => (
                <CardCliente key={r.cliente.id} resumo={r} />
              ))}
            </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// Card mobile (Prompt 58, seção 8) — mesmo resumo já calculado por
// construirResumoClientes, nenhum dado novo nem segunda consulta; só
// prioriza o essencial (igual a tabela, sem coluna nenhuma escondida de
// propósito) num cartão tocável que abre a ficha do cliente.
function CardCliente({ resumo }: { resumo: ClienteResumo }) {
  const { cliente, faseAtual, saude, trial, proximaAcao, consultor } = resumo;
  const prazoLabel = prazoLabelDe(resumo);
  const prazoAtrasado = estaAtrasado(resumo);

  return (
    <Link to={`/clientes/${cliente.id}`} className="card entity-card">
      <div className="entity-card-header">
        <span className="entity-card-title">{cliente.nome_empresa}</span>
        {(cliente.nome_contato || cliente.segmento) && (
          <span className="entity-card-subtitle">
            {[cliente.nome_contato, cliente.segmento].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      <div className="entity-card-badges">
        <span className={`status-badge status-tone-${SAUDE_TONE[saude]}`}>{SAUDE_LABELS[saude]}</span>
        {trial && (
          <span
            className={`status-badge status-tone-${STATUS_TRIAL_TONE[trial.status]}`}
            title={STATUS_TRIAL_LABELS[trial.status]}
          >
            Trial: {trial.diasRestantes}d
          </span>
        )}
      </div>

      <div className="entity-card-rows">
        <div className="entity-card-row">
          <span className="entity-card-row-label">Fase</span>
          <span className="entity-card-row-value">{faseAtual}</span>
        </div>
        <div className="entity-card-row">
          <span className="entity-card-row-label">Dia/Ciclo</span>
          <span className="entity-card-row-value">{diaCicloLabel(resumo)}</span>
        </div>
        <div className="entity-card-row">
          <span className="entity-card-row-label">Próxima ação</span>
          <span className="entity-card-row-value">{proximaAcao}</span>
        </div>
        <div className="entity-card-row">
          <span className="entity-card-row-label">Prazo</span>
          <span className={`entity-card-row-value${prazoAtrasado ? ' ops-prazo-atrasado' : ''}`}>
            {prazoLabel ?? '—'}
          </span>
        </div>
        <div className="entity-card-row">
          <span className="entity-card-row-label">Consultor</span>
          <span className="entity-card-row-value">{consultor ?? '—'}</span>
        </div>
      </div>

      <div className="entity-card-actions">
        <span className="btn btn-secondary">Abrir cliente</span>
      </div>
    </Link>
  );
}

function LinhaCliente({
  resumo,
  navigate,
}: {
  resumo: ClienteResumo;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { cliente, faseAtual, saude, trial, proximaAcao, consultor } = resumo;
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
      <td>{diaCicloLabel(resumo)}</td>
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
