// Dashboard Gerencial ("Gestão") — "como está performando a operação?",
// complementar à Home operacional ("o que eu preciso fazer agora?"). Toda
// agregação vem de src/lib/dashboardGerencial.ts, que por sua vez só
// reaproveita as fontes oficiais já existentes (operacaoResumo.ts,
// atividadesCronograma.ts, trialKommo.ts, reunioes.ts, criteriosEntrega.ts,
// diagnosticoAdocao.ts) — nenhuma fórmula nova de saúde/prazo/trial/adoção
// é criada aqui.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  aplicarFiltrosGestao,
  construirCausasAtraso,
  construirDesempenhoCiclos,
  construirDesempenhoConsultores,
  construirDistribuicaoSaude,
  construirIndicadoresPrincipais,
  construirResumoAdocao,
  construirResumoEntrega,
  construirResumoFunilVendas,
  construirResumoPosVenda,
  construirResumoReunioes,
  construirResumoTrialGestao,
  construirTemposProcesso,
  FILTROS_GESTAO_PADRAO,
  type FiltrosGestao,
} from '../lib/dashboardGerencial';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { CICLOS_OPERACIONAIS } from '../lib/atividadesCronograma';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import { construirResumoClientes, SAUDE_LABELS, type SaudeCliente } from '../lib/operacaoResumo';
import { funilValidado } from '../lib/statusFluxo';
import { supabase } from '../lib/supabaseClient';
import { STATUS_DIAGNOSTICO_LABELS, STATUS_DIAGNOSTICO_TONE } from '../lib/diagnosticoAdocao';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  CheckpointAdocao,
  Cliente,
  ClienteOcorrencia,
  ConfiguracaoImplementacao,
  Consultor,
  CriterioEntrega,
  CriterioEntregaStatus,
  FunilVersao,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatusHistorico,
  Mapeamento,
  Reuniao,
  ReuniaoRemarcacao,
} from '../types/database';

type PainelDrillDown = { titulo: string; clientes: Cliente[] } | null;

function Barra({ percentual, tone = 'normal' }: { percentual: number | null; tone?: 'normal' | 'complete' }) {
  if (percentual == null) return <span className="field-hint">—</span>;
  return (
    <span className="checklist-progress-bar">
      <span
        className={`checklist-progress-bar-fill${tone === 'complete' ? ' complete' : ''}`}
        style={{ width: `${Math.min(100, Math.max(0, percentual))}%` }}
      />
    </span>
  );
}

function CardIndicador({
  titulo,
  valor,
  tone,
  ativo,
  onClick,
}: {
  titulo: string;
  valor: string | number;
  tone?: 'warning' | 'success' | 'info' | 'danger';
  ativo?: boolean;
  onClick?: () => void;
}) {
  const classe = `stat-card${tone ? ` stat-card-${tone}` : ''}${ativo ? ' stat-card-active' : ''}`;
  if (!onClick) {
    return (
      <div className={classe}>
        <span className="stat-value">{valor}</span>
        <span className="stat-label">{titulo}</span>
      </div>
    );
  }
  return (
    <button type="button" className={classe} onClick={onClick}>
      <span className="stat-value">{valor}</span>
      <span className="stat-label">{titulo}</span>
    </button>
  );
}

export function GestaoDashboard() {
  const { user } = useAuth();
  const meuEmail = (user?.email ?? '').toLowerCase();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [remarcacoes, setRemarcacoes] = useState<ReuniaoRemarcacao[]>([]);
  const [ocorrencias, setOcorrencias] = useState<ClienteOcorrencia[]>([]);
  const [criterios, setCriterios] = useState<CriterioEntrega[]>([]);
  const [criteriosStatus, setCriteriosStatus] = useState<CriterioEntregaStatus[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointAdocao[]>([]);
  const [funilVersoes, setFunilVersoes] = useState<FunilVersao[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosGestao>(FILTROS_GESTAO_PADRAO);
  const [painel, setPainel] = useState<PainelDrillDown>(null);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setError(null);

      const [
        { data: clientesData, error: clientesError },
        { data: mapeamentosData },
        { data: implementacoesData },
        { data: historicoData },
        { data: atividadesData },
        { data: statusRowsData },
        { data: consultoresData },
        { data: reunioesData },
        { data: remarcacoesData },
        { data: ocorrenciasData },
        { data: criteriosData },
        { data: criteriosStatusData },
        { data: checkpointsData },
        { data: funilVersoesData },
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
        supabase.from('reuniao_remarcacoes').select('*'),
        supabase.from('cliente_ocorrencias').select('*'),
        supabase.from('criterios_entrega').select('*'),
        supabase.from('criterios_entrega_status').select('*'),
        supabase.from('checkpoints_adocao').select('*'),
        supabase.from('funil_versoes').select('*'),
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
      setRemarcacoes(remarcacoesData ?? []);
      setOcorrencias(ocorrenciasData ?? []);
      setCriterios(criteriosData ?? []);
      setCriteriosStatus(criteriosStatusData ?? []);
      setCheckpoints(checkpointsData ?? []);
      setFunilVersoes(funilVersoesData ?? []);
      setConfigGlobal(configGlobalData ?? null);
      setSnapshots(snapshotsData ?? []);
      setLoading(false);
    }

    carregar();
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

  const resumosFiltrados = useMemo(
    () => aplicarFiltrosGestao(resumos, filtros, meuEmail, hoje),
    [resumos, filtros, meuEmail, hoje],
  );

  const clientesFiltradosIds = useMemo(() => new Set(resumosFiltrados.map((r) => r.cliente.id)), [resumosFiltrados]);
  const clientesPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const implementacoesFiltradas = useMemo(
    () => implementacoes.filter((i) => i.cliente_id && clientesFiltradosIds.has(i.cliente_id)),
    [implementacoes, clientesFiltradosIds],
  );
  const ocorrenciasFiltradas = useMemo(
    () => ocorrencias.filter((o) => clientesFiltradosIds.has(o.cliente_id)),
    [ocorrencias, clientesFiltradosIds],
  );
  const ocorrenciasAbertasFiltradas = useMemo(
    () => ocorrenciasFiltradas.filter((o) => o.status === 'aberta'),
    [ocorrenciasFiltradas],
  );
  const checkpointsFiltrados = useMemo(() => {
    const implIds = new Set(implementacoesFiltradas.map((i) => i.id));
    return checkpoints.filter((c) => implIds.has(c.implementacao_id));
  }, [checkpoints, implementacoesFiltradas]);
  const mapeamentosVendasFiltrados = useMemo(
    () => mapeamentos.filter((m) => m.tipo === 'vendas' && m.cliente_id && clientesFiltradosIds.has(m.cliente_id)),
    [mapeamentos, clientesFiltradosIds],
  );
  const mapeamentosPosVendaFiltrados = useMemo(
    () => mapeamentos.filter((m) => m.tipo === 'pos_venda' && m.cliente_id && clientesFiltradosIds.has(m.cliente_id)),
    [mapeamentos, clientesFiltradosIds],
  );
  const clientesFiltrados = useMemo(() => resumosFiltrados.map((r) => r.cliente), [resumosFiltrados]);

  const indicadores = useMemo(() => {
    const resumoAdocaoPrevia = construirResumoAdocao({ checkpoints: checkpointsFiltrados, resumos: resumosFiltrados });
    return construirIndicadoresPrincipais(resumosFiltrados, resumoAdocaoPrevia.diagnosticosPorImplementacao);
  }, [resumosFiltrados, checkpointsFiltrados]);

  const tempos = useMemo(() => construirTemposProcesso(clientesFiltrados), [clientesFiltrados]);

  const ciclos = useMemo(
    () =>
      construirDesempenhoCiclos({
        implementacoes: implementacoesFiltradas,
        clientesPorId,
        atividades,
        statusRows,
        reunioes,
        hoje,
        historico,
        configuracoesPorCliente,
      }),
    [implementacoesFiltradas, clientesPorId, atividades, statusRows, reunioes, hoje, historico, configuracoesPorCliente],
  );

  const causas = useMemo(() => construirCausasAtraso(ocorrenciasFiltradas), [ocorrenciasFiltradas]);

  const consultoresDesempenho = useMemo(
    () =>
      construirDesempenhoConsultores({
        consultores,
        resumos: resumosFiltrados,
        ocorrenciasAbertas: ocorrenciasAbertasFiltradas,
        reunioes,
        hoje,
      }),
    [consultores, resumosFiltrados, ocorrenciasAbertasFiltradas, reunioes, hoje],
  );

  const trial = useMemo(() => construirResumoTrialGestao(resumosFiltrados), [resumosFiltrados]);

  const reunioesResumo = useMemo(
    () =>
      construirResumoReunioes({
        clientes: clientesFiltrados,
        reunioes: reunioes.filter((r) => clientesFiltradosIds.has(r.cliente_id)),
        remarcacoes,
        hoje,
        configuracoesPorCliente,
      }),
    [clientesFiltrados, reunioes, clientesFiltradosIds, remarcacoes, hoje, configuracoesPorCliente],
  );

  const funilVendas = useMemo(
    () => construirResumoFunilVendas(mapeamentosVendasFiltrados, clientesPorId),
    [mapeamentosVendasFiltrados, clientesPorId],
  );

  const clientesElegiveisPosVenda = useMemo(
    () => clientesFiltrados.filter((c) => mapeamentosVendasFiltrados.some((m) => m.cliente_id === c.id && funilValidado(m.status))),
    [clientesFiltrados, mapeamentosVendasFiltrados],
  );
  const posVenda = useMemo(
    () =>
      construirResumoPosVenda({
        clientesElegiveis: clientesElegiveisPosVenda,
        mapeamentosPosVenda: mapeamentosPosVendaFiltrados,
        funilVersoes,
      }),
    [clientesElegiveisPosVenda, mapeamentosPosVendaFiltrados, funilVersoes],
  );

  const entrega = useMemo(
    () => construirResumoEntrega({ resumos: resumosFiltrados, criterios, criteriosStatus }),
    [resumosFiltrados, criterios, criteriosStatus],
  );

  const adocao = useMemo(
    () => construirResumoAdocao({ checkpoints: checkpointsFiltrados, resumos: resumosFiltrados }),
    [checkpointsFiltrados, resumosFiltrados],
  );

  const saude = useMemo(() => construirDistribuicaoSaude(resumosFiltrados), [resumosFiltrados]);

  function abrirPainel(titulo: string, clientesDoPainel: Cliente[]) {
    setPainel({ titulo, clientes: clientesDoPainel });
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard Gerencial</h1>
          <p className="field-hint">
            Como está performando a operação de implementação de CRM — volume, prazo, saúde, consultores e
            adoção. Para "o que eu preciso fazer agora", use a Home.
          </p>
        </div>
      </div>

      {/* 2. Filtros */}
      <section className="card form-card">
        <div className="form-grid">
          <label className="field">
            <span>Consultor</span>
            <select value={filtros.consultor} onChange={(e) => setFiltros({ ...filtros, consultor: e.target.value })}>
              <option value="todos">Todos os consultores</option>
              <option value="meus">Meus clientes</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cliente</span>
            <select value={filtros.clienteId} onChange={(e) => setFiltros({ ...filtros, clienteId: e.target.value })}>
              <option value="">Todos</option>
              {clientes
                .slice()
                .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_empresa}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value as FiltrosGestao['status'] })}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativo</option>
              <option value="concluidos">Concluído</option>
            </select>
          </label>
          <label className="field">
            <span>Saúde</span>
            <select
              value={filtros.saude}
              onChange={(e) => setFiltros({ ...filtros, saude: e.target.value as FiltrosGestao['saude'] })}
            >
              <option value="">Todas</option>
              {(Object.keys(SAUDE_LABELS) as SaudeCliente[]).map((s) => (
                <option key={s} value={s}>
                  {SAUDE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ciclo</span>
            <select
              value={filtros.ciclo}
              onChange={(e) =>
                setFiltros({ ...filtros, ciclo: e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4) : '' })
              }
            >
              <option value="">Todos</option>
              {CICLOS_OPERACIONAIS.map((c, i) => (
                <option key={c.nome} value={i + 1}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Período (dias desde a contratação)</span>
            <select
              value={filtros.periodoDias}
              onChange={(e) => setFiltros({ ...filtros, periodoDias: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Todo o período</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="180">Últimos 180 dias</option>
            </select>
          </label>
        </div>
        {(filtros.consultor !== 'todos' || filtros.clienteId || filtros.status !== 'todos' || filtros.saude || filtros.ciclo || filtros.periodoDias) && (
          <button type="button" className="btn btn-ghost btn-auto" onClick={() => setFiltros(FILTROS_GESTAO_PADRAO)}>
            Limpar filtros
          </button>
        )}
      </section>

      {painel && (
        <section className="card">
          <div className="page-header">
            <h2 style={{ marginBottom: 0 }}>{painel.titulo}</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setPainel(null)}>
              Fechar
            </button>
          </div>
          {painel.clientes.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum cliente nesta lista.</p>
            </div>
          ) : (
            <ul className="historico-status-lista">
              {painel.clientes.map((c) => (
                <li key={c.id} className="historico-status-item">
                  <Link to={`/clientes/${c.id}`}>{c.nome_empresa}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 3. Indicadores principais */}
      <section className="card">
        <h2>Indicadores principais</h2>
        <div className="stats-grid">
          <CardIndicador
            titulo="Implementações ativas"
            valor={indicadores.implementacoesAtivas.valor}
            onClick={() => abrirPainel('Implementações ativas', indicadores.implementacoesAtivas.clientes)}
          />
          <CardIndicador
            titulo="Implementações concluídas"
            valor={indicadores.implementacoesConcluidas.valor}
            tone="success"
            onClick={() => abrirPainel('Implementações concluídas', indicadores.implementacoesConcluidas.clientes)}
          />
          <CardIndicador
            titulo="Dentro do prazo"
            valor={indicadores.dentroDoPrazo.valor}
            tone="success"
            onClick={() => abrirPainel('Dentro do prazo', indicadores.dentroDoPrazo.clientes)}
          />
          <CardIndicador
            titulo="Em atenção"
            valor={indicadores.emAtencao.valor}
            tone="warning"
            onClick={() => abrirPainel('Em atenção', indicadores.emAtencao.clientes)}
          />
          <CardIndicador
            titulo="Críticas"
            valor={indicadores.criticas.valor}
            tone="danger"
            onClick={() => abrirPainel('Críticas', indicadores.criticas.clientes)}
          />
          <CardIndicador
            titulo="Tempo médio de implementação"
            valor={indicadores.tempoMedioImplementacaoDias != null ? `${indicadores.tempoMedioImplementacaoDias}d` : '—'}
          />
          <CardIndicador
            titulo="Concluído dentro do prazo configurado"
            valor={indicadores.percentualConcluidoEm40Dias != null ? `${indicadores.percentualConcluidoEm40Dias}%` : '—'}
          />
          <CardIndicador
            titulo="Clientes com Trial ativo"
            valor={indicadores.clientesComTrialAtivo.valor}
            onClick={() => abrirPainel('Clientes com Trial ativo', indicadores.clientesComTrialAtivo.clientes)}
          />
          <CardIndicador
            titulo="Trials próximos do vencimento"
            valor={indicadores.trialsProximosDoVencimento.valor}
            tone="warning"
            onClick={() => abrirPainel('Trials próximos do vencimento', indicadores.trialsProximosDoVencimento.clientes)}
          />
          <CardIndicador
            titulo="Adoção saudável"
            valor={indicadores.adocaoSaudavel.valor}
            tone="success"
            onClick={() => abrirPainel('Adoção saudável', indicadores.adocaoSaudavel.clientes)}
          />
          <CardIndicador
            titulo="Adoção em atenção"
            valor={indicadores.adocaoAtencao.valor}
            tone="warning"
            onClick={() => abrirPainel('Adoção em atenção', indicadores.adocaoAtencao.clientes)}
          />
          <CardIndicador
            titulo="Adoção crítica"
            valor={indicadores.adocaoCritica.valor}
            tone="danger"
            onClick={() => abrirPainel('Adoção crítica', indicadores.adocaoCritica.clientes)}
          />
        </div>
      </section>

      {/* 4. Tempos do processo */}
      <section className="card">
        <h2>Tempos do processo</h2>
        <p className="field-hint">Só considera marcos realmente registrados — nunca estima data inexistente.</p>
        {tempos.every((t) => t.amostras === 0) ? (
          <div className="empty-state">
            <p>Nenhum marco suficiente para calcular tempos ainda.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table-cards-mobile">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Média</th>
                  <th>Mediana</th>
                  <th>Amostras</th>
                </tr>
              </thead>
              <tbody>
                {tempos.map((t) => (
                  <tr key={t.label}>
                    <td data-label="Etapa">{t.label}</td>
                    <td data-label="Média">{t.mediaDias != null ? `${t.mediaDias}d` : '—'}</td>
                    <td data-label="Mediana">{t.medianaDias != null ? `${t.medianaDias}d` : '—'}</td>
                    <td data-label="Amostras">{t.amostras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint">
          "Treinamento → primeira automação" não é mostrado: não existe hoje uma data isolada de "primeira
          automação concluída" no produto.
        </p>
      </section>

      {/* 5. Ciclos */}
      <section className="card">
        <h2>Desempenho por ciclo</h2>
        <div className="table-wrap">
          <table className="data-table data-table-cards-mobile">
            <thead>
              <tr>
                <th>Ciclo</th>
                <th>Concluído no prazo</th>
                <th>Em atraso agora</th>
                <th>Principais atividades atrasadas</th>
                <th>Dia médio de conclusão</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.map((c) => (
                <tr key={c.numero}>
                  <td data-label="Ciclo">{c.nome}</td>
                  <td data-label="Concluído no prazo">
                    <span className="table-cell-com-barra">
                      <Barra percentual={c.percentualNoPrazo} tone="complete" />
                      {c.percentualNoPrazo != null ? `${c.percentualNoPrazo}%` : '—'} ({c.concluidasNoPrazo}/{c.concluidasTotal})
                    </span>
                  </td>
                  <td data-label="Em atraso agora">{c.emAtraso}</td>
                  <td data-label="Principais atividades atrasadas">
                    {c.principaisAtividadesAtrasadas.length === 0
                      ? '—'
                      : c.principaisAtividadesAtrasadas.map((a) => `${a.nome} (${a.quantidade})`).join(', ')}
                  </td>
                  <td data-label="Dia médio de conclusão">
                    {c.diaMedioConclusao != null ? `Dia ${c.diaMedioConclusao} do ciclo` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Causas de atraso */}
      <section className="card">
        <h2>Principais causas de atraso</h2>
        {causas.porResponsavel.every((c) => c.quantidade === 0) ? (
          <div className="empty-state">
            <p>Nenhuma ocorrência registrada no período filtrado.</p>
          </div>
        ) : (
          <>
            <ul className="historico-status-lista">
              {causas.porResponsavel.map((c) => (
                <li key={c.responsavel} className="historico-status-item">
                  <span style={{ minWidth: 140, display: 'inline-block' }}>{c.label}</span>
                  <Barra percentual={c.percentual} />
                  <span>
                    {c.percentual != null ? `${c.percentual}%` : '0%'} ({c.quantidade})
                  </span>
                </li>
              ))}
            </ul>
            <h3>Motivos mais frequentes</h3>
            <ul className="historico-status-lista">
              {causas.motivosFrequentes.map((m) => (
                <li key={m.categoria} className="historico-status-item">
                  <span>{m.categoria}</span>
                  <span>{m.quantidade}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 7. Consultor — gestão de capacidade, não ranking. */}
      <section className="card">
        <h2>Por consultor</h2>
        <p className="field-hint">
          Visão de capacidade e carga de trabalho — não é um ranking de desempenho entre consultores.
        </p>
        <div className="table-wrap">
          <table className="data-table data-table-cards-mobile">
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Ativos</th>
                <th>Concluídas</th>
                <th>Atenção</th>
                <th>Críticos</th>
                <th>Tempo médio</th>
                <th>Pendências</th>
                <th>Próximas reuniões</th>
              </tr>
            </thead>
            <tbody>
              {consultoresDesempenho.map((c) => (
                <tr key={c.consultorId}>
                  <td data-label="Consultor">{c.nome}</td>
                  <td data-label="Ativos">{c.clientesAtivos}</td>
                  <td data-label="Concluídas">{c.implementacoesConcluidas}</td>
                  <td data-label="Atenção">{c.clientesEmAtencao}</td>
                  <td data-label="Críticos">{c.clientesCriticos}</td>
                  <td data-label="Tempo médio">{c.tempoMedioImplementacaoDias != null ? `${c.tempoMedioImplementacaoDias}d` : '—'}</td>
                  <td data-label="Pendências">{c.pendenciasAbertas}</td>
                  <td data-label="Próximas reuniões">{c.proximasReunioes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 8. Trial Kommo */}
      <section className="card">
        <h2>Trial Kommo</h2>
        <div className="stats-grid">
          <CardIndicador
            titulo="Trials ativos"
            valor={trial.ativos.valor}
            onClick={() => abrirPainel('Trials ativos', trial.ativos.clientes)}
          />
          <CardIndicador
            titulo="Trial inicial (até 14d)"
            valor={trial.trialInicial.valor}
            onClick={() => abrirPainel('Trial inicial', trial.trialInicial.clientes)}
          />
          <CardIndicador
            titulo="Em +14 dias"
            valor={trial.em14Dias.valor}
            onClick={() => abrirPainel('Em +14 dias', trial.em14Dias.clientes)}
          />
          <CardIndicador
            titulo="Em +7 dias"
            valor={trial.em7Dias.valor}
            onClick={() => abrirPainel('Em +7 dias', trial.em7Dias.clientes)}
          />
          <CardIndicador
            titulo="Próximos do vencimento"
            valor={trial.proximosVencimento.valor}
            tone="warning"
            onClick={() => abrirPainel('Próximos do vencimento', trial.proximosVencimento.clientes)}
          />
          <CardIndicador
            titulo="Extensão pendente"
            valor={trial.extensaoPendente.valor}
            tone="danger"
            onClick={() => abrirPainel('Extensão pendente', trial.extensaoPendente.clientes)}
          />
          <CardIndicador titulo="Média de dias utilizados" valor={trial.mediaDiasUtilizados != null ? `${trial.mediaDiasUtilizados}d` : '—'} />
          <CardIndicador
            titulo="Usou 1ª extensão"
            valor={trial.percentualUsouPrimeiraExtensao != null ? `${trial.percentualUsouPrimeiraExtensao}%` : '—'}
          />
          <CardIndicador
            titulo="Usou 2ª extensão"
            valor={trial.percentualUsouSegundaExtensao != null ? `${trial.percentualUsouSegundaExtensao}%` : '—'}
          />
        </div>
      </section>

      {/* 9. Reuniões */}
      <section className="card">
        <h2>Reuniões</h2>
        <div className="stats-grid">
          <CardIndicador titulo="Kickoffs realizados" valor={reunioesResumo.kickoffsRealizados} />
          <CardIndicador titulo="Treinamentos no prazo (≤10d)" valor={reunioesResumo.treinamentosNoPrazo} tone="success" />
          <CardIndicador titulo="Treinamentos fora do prazo" valor={reunioesResumo.treinamentosForaDoPrazo} tone="warning" />
          <CardIndicador titulo="Check-in 1 realizados" valor={reunioesResumo.checkin1Realizados} />
          <CardIndicador titulo="Check-in 2 realizados" valor={reunioesResumo.checkin2Realizados} />
          <CardIndicador titulo="Reuniões finais" valor={reunioesResumo.reunioesFinais} />
          <CardIndicador titulo="Remarcadas" valor={reunioesResumo.remarcadas} />
          <CardIndicador titulo="No-show do cliente" valor={reunioesResumo.noShowCliente} tone="danger" />
          <CardIndicador titulo="No-show interno" valor={reunioesResumo.noShowConsultor} tone="danger" />
          {reunioesResumo.obrigatoriasNaoAgendadas.valor > 0 && (
            <CardIndicador
              titulo="Reuniões obrigatórias ainda não agendadas"
              valor={reunioesResumo.obrigatoriasNaoAgendadas.valor}
              tone="warning"
              onClick={() => abrirPainel('Reuniões obrigatórias ainda não agendadas', reunioesResumo.obrigatoriasNaoAgendadas.clientes)}
            />
          )}
        </div>
      </section>

      {/* 10. Funil de vendas */}
      <section className="card">
        <h2>Funil de vendas (mapeamento)</h2>
        <div className="stats-grid">
          <CardIndicador titulo="Formulários enviados" valor={funilVendas.formulariosEnviados} />
          <CardIndicador titulo="Formulários respondidos" valor={funilVendas.formulariosRespondidos} />
          <CardIndicador titulo="Funis gerados" valor={funilVendas.funisGerados} />
          <CardIndicador titulo="Funis em revisão" valor={funilVendas.funisEmRevisao} />
          <CardIndicador titulo="Funis validados" valor={funilVendas.funisValidados} tone="success" />
          <CardIndicador
            titulo="Tempo médio resposta → validação"
            valor={funilVendas.tempoMedioRespostaValidacaoDias != null ? `${funilVendas.tempoMedioRespostaValidacaoDias}d` : '—'}
          />
        </div>
      </section>

      {/* 11. Pós-venda */}
      <section className="card">
        <h2>Pós-venda</h2>
        <div className="stats-grid">
          <CardIndicador titulo="Não iniciado" valor={posVenda.naoIniciado} />
          <CardIndicador titulo="Enviado (aguardando resposta)" valor={posVenda.enviado} />
          <CardIndicador titulo="Respondido" valor={posVenda.respondido} />
          <CardIndicador titulo="Funil gerado" valor={posVenda.funilGerado} />
          <CardIndicador titulo="Funil validado" valor={posVenda.funilValidado} tone="success" />
          <CardIndicador
            titulo="% de clientes com pós-venda implementado"
            valor={posVenda.percentualImplementado != null ? `${posVenda.percentualImplementado}%` : '—'}
          />
          <CardIndicador
            titulo="Tempo médio de resposta"
            valor={posVenda.tempoMedioRespostaDias != null ? `${posVenda.tempoMedioRespostaDias}d` : '—'}
          />
          <CardIndicador
            titulo="Tempo médio resposta → validação"
            valor={posVenda.tempoMedioRespostaValidacaoDias != null ? `${posVenda.tempoMedioRespostaValidacaoDias}d` : '—'}
          />
        </div>
        <p className="field-hint">
          "Em configuração" e "concluído" não aparecem como estágios próprios do pós-venda: não existe hoje um
          status de mapeamento distinto para essas duas fases (ver relatório final).
        </p>
      </section>

      {/* 12. Entrega — nunca misturado com adoção. */}
      <section className="card">
        <h2>Entrega</h2>
        <div className="stats-grid">
          <CardIndicador
            titulo="Critérios concluídos"
            valor={entrega.criteriosTotal > 0 ? `${entrega.criteriosConcluidos}/${entrega.criteriosTotal}` : '—'}
          />
          <CardIndicador
            titulo="Clientes com critérios pendentes"
            valor={entrega.clientesComCriteriosPendentes.valor}
            tone="warning"
            onClick={() => abrirPainel('Clientes com critérios pendentes', entrega.clientesComCriteriosPendentes.clientes)}
          />
          <CardIndicador titulo="Implementações concluídas" valor={entrega.implementacoesConcluidas} tone="success" />
          <CardIndicador
            titulo="Implementações acima do prazo configurado"
            valor={entrega.implementacoesAcimaDe40Dias.valor}
            tone="danger"
            onClick={() => abrirPainel('Implementações acima do prazo configurado', entrega.implementacoesAcimaDe40Dias.clientes)}
          />
        </div>
      </section>

      {/* 13. Adoção — Checkpoint de 30 dias. */}
      <section className="card">
        <h2>Adoção (Checkpoint de 30 dias)</h2>
        <div className="stats-grid">
          <CardIndicador
            titulo={STATUS_DIAGNOSTICO_LABELS.saudavel}
            valor={adocao.saudavel.valor}
            tone={STATUS_DIAGNOSTICO_TONE.saudavel}
            onClick={() => abrirPainel(STATUS_DIAGNOSTICO_LABELS.saudavel, adocao.saudavel.clientes)}
          />
          <CardIndicador
            titulo={STATUS_DIAGNOSTICO_LABELS.atencao}
            valor={adocao.atencao.valor}
            tone={STATUS_DIAGNOSTICO_TONE.atencao}
            onClick={() => abrirPainel(STATUS_DIAGNOSTICO_LABELS.atencao, adocao.atencao.clientes)}
          />
          <CardIndicador
            titulo={STATUS_DIAGNOSTICO_LABELS.critico}
            valor={adocao.critica.valor}
            tone={STATUS_DIAGNOSTICO_TONE.critico}
            onClick={() => abrirPainel(STATUS_DIAGNOSTICO_LABELS.critico, adocao.critica.clientes)}
          />
        </div>
        {adocao.distribuicaoPercentualProcesso.length > 0 && (
          <>
            <h3>Percentual do processo operando no Kommo</h3>
            <ul className="historico-status-lista">
              {adocao.distribuicaoPercentualProcesso.map((d) => (
                <li key={d.label} className="historico-status-item">
                  <span>{d.label}</span>
                  <span>{d.quantidade}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {adocao.principaisDificuldades.length > 0 && (
          <>
            <h3>Principais dificuldades relatadas (mais recentes)</h3>
            <ul className="historico-status-lista">
              {adocao.principaisDificuldades.map((d, i) => (
                <li key={i} className="historico-status-item">
                  {d}
                </li>
              ))}
            </ul>
          </>
        )}
        {checkpointsFiltrados.length === 0 && (
          <div className="empty-state">
            <p>Nenhum Checkpoint de adoção respondido ainda neste filtro.</p>
          </div>
        )}
      </section>

      {/* 14. Saúde da implementação — mesma fonte oficial de Home/Dashboard. */}
      <section className="card">
        <h2>Saúde da implementação</h2>
        <div className="stats-grid">
          {saude.map((s) => (
            <CardIndicador
              key={s.saude}
              titulo={SAUDE_LABELS[s.saude]}
              valor={s.valor}
              tone={
                s.saude === 'critico'
                  ? 'danger'
                  : s.saude === 'atencao'
                    ? 'warning'
                    : s.saude === 'aguardando_cliente'
                      ? 'info'
                      : 'success'
              }
              onClick={() => abrirPainel(SAUDE_LABELS[s.saude], s.clientes)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
