import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GanttRuler } from '../components/GanttRuler';
import { ImplementacaoStatusBadge, IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { calcularDiaCiclo, type DiaCiclo } from '../lib/atividadesCronograma';
import { CONFIGURACAO_PADRAO, construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import {
  ALTURA_RAIA,
  PX_POR_DIA,
  calcularEscala,
  diaParaPx,
  empacotarFasesEmRaias,
  fasesImplementacao,
  type FaseCronograma,
} from '../lib/cronograma';
import { MARCOS_ORDENADOS } from '../lib/marcosCliente';
import { supabase } from '../lib/supabaseClient';
import type {
  Cliente,
  ConfiguracaoImplementacao,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
} from '../types/database';

// Abaixo disso o título não cabe legível dentro da barra — sai como um
// rótulo ao lado dela em vez de cortar o texto.
const LARGURA_MINIMA_TEXTO_INTERNO = 90;

function formatarMarcoMobile(valor: string, apenasData: boolean): string {
  return apenasData
    ? new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR')
    : new Date(valor).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

const CORES_FASE: Record<ImplementacaoStatus, string> = {
  preparacao_crm: '#fbbf24',
  crm_em_configuracao: '#5b9dff',
  treinamento_agendado: '#8b5cf6',
  automacoes: '#22d3ee',
  entrega: '#34d399',
  adocao: '#34d399',
  concluida: '#34d399',
  cancelada: '#f87171',
};

export function Cronograma() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Visão mobile (Prompt 59, seção 27) — seleção de cliente própria, só
  // pra decidir qual implementação mostrar na linha do tempo vertical;
  // nenhuma fonte de dado nova (mesmas `implementacoes`/`clientes` já
  // carregadas pro Gantt desktop, que a RLS já restringe à carteira de
  // quem está logado).
  const [clienteSelecionadoMobileId, setClienteSelecionadoMobileId] = useState('');
  const [cicloExpandidoIndex, setCicloExpandidoIndex] = useState<number | null>(null);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setError(null);

      const { data: implData, error: implError } = await supabase
        .from('implementacoes_crm')
        .select('*')
        .order('nome_cliente', { ascending: true });

      if (implError) {
        setError(implError.message);
        setLoading(false);
        return;
      }

      const implementacoesData = implData ?? [];
      setImplementacoes(implementacoesData);

      if (implementacoesData.length === 0) {
        setHistorico([]);
        setLoading(false);
        return;
      }

      const ids = implementacoesData.map((i) => i.id);
      const clienteIds = [...new Set(implementacoesData.map((i) => i.cliente_id).filter((id): id is string => !!id))];
      const [
        { data: historicoData, error: historicoError },
        { data: clientesData },
        { data: configGlobalData },
        { data: snapshotsData },
      ] = await Promise.all([
        supabase.from('implementacao_status_historico').select('*').in('implementacao_id', ids),
        clienteIds.length > 0
          ? supabase.from('clientes').select('*').in('id', clienteIds)
          : Promise.resolve({ data: [] as Cliente[] }),
        supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
        supabase.from('implementacao_settings_snapshot').select('*'),
      ]);

      if (historicoError) {
        setError(historicoError.message);
        setLoading(false);
        return;
      }

      setHistorico(historicoData ?? []);
      setClientes(clientesData ?? []);
      setConfigGlobal(configGlobalData ?? null);
      setSnapshots(snapshotsData ?? []);
      setLoading(false);
    }

    carregar();
  }, []);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const configuracoesPorCliente = useMemo(
    () => construirMapaConfiguracoes(clientes.map((c) => c.id), snapshots, configGlobal),
    [clientes, snapshots, configGlobal],
  );

  const fasesPorImplementacao = useMemo(() => {
    const mapa = new Map<string, FaseCronograma[]>();
    for (const implementacao of implementacoes) {
      mapa.set(implementacao.id, fasesImplementacao(implementacao, historico));
    }
    return mapa;
  }, [implementacoes, historico]);

  const escala = useMemo(() => {
    const datas = Array.from(fasesPorImplementacao.values())
      .flat()
      .flatMap((fase) => [fase.inicio, fase.fim ?? hoje]);
    return calcularEscala(datas, hoje);
  }, [fasesPorImplementacao, hoje]);

  const larguraTotal = escala.totalDias * PX_POR_DIA;
  const hojePx = diaParaPx(hoje, escala);

  // Mesma ordenação alfabética já usada no carregamento (seção 12/26 — não
  // criar uma ordenação independente pro seletor mobile).
  const implementacoesOrdenadasParaSelecao = useMemo(
    () => [...implementacoes].sort((a, b) => a.nome_cliente.localeCompare(b.nome_cliente, 'pt-BR', { sensitivity: 'base' })),
    [implementacoes],
  );

  const implementacaoSelecionadaMobile = useMemo(() => {
    if (!clienteSelecionadoMobileId) return null;
    const implementacao = implementacoes.find((i) => i.id === clienteSelecionadoMobileId);
    if (!implementacao) return null;
    const cliente = clientes.find((c) => c.id === implementacao.cliente_id) ?? null;
    const config = (cliente && configuracoesPorCliente.get(cliente.id)) || CONFIGURACAO_PADRAO;
    // Mesmo congelamento em cancelada_em já usado no Gantt desktop acima
    // (migration 0095) — implementação cancelada não segue contando dia/
    // ciclo contra a data real.
    const hojeEfetivo =
      implementacao.status === 'cancelada' && implementacao.cancelada_em
        ? new Date(implementacao.cancelada_em)
        : hoje;
    const diaCiclo: DiaCiclo | null = calcularDiaCiclo(cliente?.kickoff_realizado_em ?? null, hojeEfetivo, config.ciclos);
    const prazoRestante = diaCiclo ? config.duracaoTotalDias - diaCiclo.dia : null;
    const cicloAtualIndex = diaCiclo
      ? config.ciclos.findIndex((c) => diaCiclo.dia >= c.diaInicio && diaCiclo.dia <= c.diaFim)
      : -1;
    const marcos = cliente
      ? MARCOS_ORDENADOS.filter((m) => !!cliente[m.campo]).map((m) => ({
          label: m.label,
          valor: cliente[m.campo] as string,
          apenasData: m.apenasData,
        }))
      : [];
    return { implementacao, cliente, config, diaCiclo, prazoRestante, cicloAtualIndex, marcos };
  }, [clienteSelecionadoMobileId, implementacoes, clientes, configuracoesPorCliente, hoje]);

  // Ciclo aberto por padrão = o atual (seção 30); troca de cliente reabre
  // nesse mesmo ciclo, nunca mantém o índice de outro cliente selecionado antes.
  useEffect(() => {
    setCicloExpandidoIndex(implementacaoSelecionadaMobile?.cicloAtualIndex ?? null);
    // Só reage à troca de cliente — não ao recálculo do ciclo atual
    // (senão reabrir manualmente outro ciclo seria desfeito a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSelecionadoMobileId]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cronograma</h1>
          <p className="field-hint">
            Linha do tempo de todas as implementações — cada bloco é uma fase (Pré-requisito, Semana
            1-4) com a data real de início e fim. A fase em andamento aparece com a borda tracejada,
            indo até hoje.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && implementacoes.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma implementação cadastrada ainda.</p>
        </div>
      )}

      {!loading && implementacoes.length > 0 && (
        <>
          <div className="cronograma-mobile">
            <div className="field-row">
              <label htmlFor="cronograma-cliente-mobile">Cliente</label>
              <select
                id="cronograma-cliente-mobile"
                value={clienteSelecionadoMobileId}
                onChange={(e) => setClienteSelecionadoMobileId(e.target.value)}
              >
                <option value="">Selecione um cliente…</option>
                {implementacoesOrdenadasParaSelecao.map((implementacao) => (
                  <option key={implementacao.id} value={implementacao.id}>
                    {implementacao.nome_cliente}
                  </option>
                ))}
              </select>
            </div>

            {!implementacaoSelecionadaMobile && (
              <p className="field-hint">Escolha um cliente para ver o ciclo e os marcos da implementação.</p>
            )}

            {implementacaoSelecionadaMobile && (
              <>
                <div className="card cronograma-resumo-mobile">
                  <div className="entity-card-header">
                    <span className="entity-card-title">{implementacaoSelecionadaMobile.implementacao.nome_cliente}</span>
                  </div>
                  <div className="entity-card-badges">
                    <ImplementacaoStatusBadge status={implementacaoSelecionadaMobile.implementacao.status} />
                  </div>
                  <div className="entity-card-rows">
                    <div className="entity-card-row">
                      <span className="entity-card-row-label">Dia/Ciclo</span>
                      <span className="entity-card-row-value">
                        {implementacaoSelecionadaMobile.diaCiclo
                          ? `Dia ${implementacaoSelecionadaMobile.diaCiclo.dia}/${implementacaoSelecionadaMobile.config.duracaoTotalDias}${
                              implementacaoSelecionadaMobile.diaCiclo.ciclo ? ` · ${implementacaoSelecionadaMobile.diaCiclo.ciclo.nome}` : ''
                            }`
                          : 'Kickoff pendente'}
                      </span>
                    </div>
                    <div className="entity-card-row">
                      <span className="entity-card-row-label">Prazo</span>
                      <span className="entity-card-row-value">
                        {implementacaoSelecionadaMobile.prazoRestante === null
                          ? '—'
                          : implementacaoSelecionadaMobile.prazoRestante >= 0
                            ? `${implementacaoSelecionadaMobile.prazoRestante}d restantes`
                            : `${Math.abs(implementacaoSelecionadaMobile.prazoRestante)}d atrasada`}
                      </span>
                    </div>
                  </div>
                  <div className="entity-card-actions">
                    <Link to={`/implementacoes/${implementacaoSelecionadaMobile.implementacao.id}?aba=reunioes`} className="btn btn-secondary">
                      Ver check-ins e reuniões
                    </Link>
                    <Link to={`/implementacoes/${implementacaoSelecionadaMobile.implementacao.id}`} className="btn btn-secondary">
                      Ver implementação
                    </Link>
                  </div>
                </div>

                <div className="cronograma-ciclos-mobile">
                  {implementacaoSelecionadaMobile.config.ciclos.map((ciclo, index) => {
                    const ehAtual = index === implementacaoSelecionadaMobile.cicloAtualIndex;
                    const aberto = cicloExpandidoIndex === index;
                    return (
                      <div
                        key={ciclo.nome}
                        className={`cronograma-ciclo-item${ehAtual ? ' cronograma-ciclo-atual' : ''}`}
                      >
                        <button
                          type="button"
                          className="cronograma-ciclo-cabecalho"
                          aria-expanded={aberto}
                          onClick={() => setCicloExpandidoIndex(aberto ? null : index)}
                        >
                          <span>
                            {ciclo.nome}
                            {ehAtual && <span className="status-badge status-tone-info cronograma-ciclo-badge">Atual</span>}
                          </span>
                          <span className="cronograma-ciclo-dias">
                            Dia {ciclo.diaInicio}–{ciclo.diaFim}
                          </span>
                        </button>
                        {aberto && (
                          <p className="field-hint cronograma-ciclo-corpo">
                            {ehAtual && implementacaoSelecionadaMobile.diaCiclo
                              ? `Hoje é o dia ${implementacaoSelecionadaMobile.diaCiclo.dia} da implementação, dentro deste ciclo.`
                              : 'Consulte os marcos abaixo e a implementação para o detalhamento completo deste ciclo.'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="cronograma-marcos-mobile">
                  <h3 className="cronograma-marcos-titulo">Marcos</h3>
                  {implementacaoSelecionadaMobile.marcos.length === 0 && (
                    <p className="field-hint">Nenhum marco registrado ainda.</p>
                  )}
                  <ul className="cronograma-marcos-lista">
                    {implementacaoSelecionadaMobile.marcos.map((marco) => (
                      <li key={marco.label} className="cronograma-marco-item">
                        <span className="cronograma-marco-ponto" />
                        <div>
                          <p className="cronograma-marco-label">{marco.label}</p>
                          <p className="cronograma-marco-data">{formatarMarcoMobile(marco.valor, marco.apenasData)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="field-hint">
                    Check-ins, reuniões e remarcações completas ficam na{' '}
                    <Link to={`/implementacoes/${implementacaoSelecionadaMobile.implementacao.id}?aba=reunioes`}>
                      implementação
                    </Link>
                    .
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="cronograma-desktop">
            <div className="gantt-legenda">
              {(
                [
                  'preparacao_crm',
                  'crm_em_configuracao',
                  'treinamento_agendado',
                  'automacoes',
                  'entrega',
                ] as ImplementacaoStatus[]
              ).map(
                (status) => (
                  <span key={status} className="gantt-legenda-item">
                    <span className="gantt-legenda-cor" style={{ background: CORES_FASE[status] }} />
                    {IMPLEMENTACAO_STATUS_LABELS[status]}
                  </span>
                ),
              )}
            </div>

            <div className="gantt-scroll">
            <div className="gantt-inner" style={{ minWidth: larguraTotal + 200 }}>
              <div className="gantt-row gantt-row-ruler">
                <div className="gantt-row-label" />
                <div className="gantt-row-track" style={{ width: larguraTotal }}>
                  <GanttRuler escala={escala} />
                </div>
              </div>

              {implementacoes.map((implementacao) => {
                const fases = fasesPorImplementacao.get(implementacao.id) ?? [];
                const fasesComRaia = empacotarFasesEmRaias(fases, escala, hoje);
                const numRaias = Math.max(1, ...fasesComRaia.map((f) => f.raia + 1));
                const alturaTrack = numRaias * ALTURA_RAIA + 16;
                const cliente = clientes.find((c) => c.id === implementacao.cliente_id) ?? null;
                const config = (cliente && configuracoesPorCliente.get(cliente.id)) || CONFIGURACAO_PADRAO;
                // Implementação cancelada (pedido do Vitor) — congela em
                // cancelada_em em vez de seguir contando "Xd atrasada"
                // contra a data real, mesmo congelamento de
                // operacaoResumo.ts (migration 0095).
                const hojeEfetivo =
                  implementacao.status === 'cancelada' && implementacao.cancelada_em
                    ? new Date(implementacao.cancelada_em)
                    : hoje;
                const diaCiclo = calcularDiaCiclo(cliente?.kickoff_realizado_em ?? null, hojeEfetivo, config.ciclos);
                const duracaoTotalDias = config.duracaoTotalDias;
                const diasAtrasoGeral = diaCiclo && diaCiclo.dia > duracaoTotalDias ? diaCiclo.dia - duracaoTotalDias : 0;
                return (
                  <div key={implementacao.id} className="gantt-row">
                    <div className="gantt-row-label">
                      <Link to={`/implementacoes/${implementacao.id}`}>{implementacao.nome_cliente}</Link>
                      <ImplementacaoStatusBadge status={implementacao.status} />
                      {diasAtrasoGeral > 0 && (
                        <span className="badge-danger" title={`Passou do Dia ${duracaoTotalDias} dos ${duracaoTotalDias} dias da implementação`}>
                          {diasAtrasoGeral}d atrasada
                        </span>
                      )}
                    </div>
                    <div className="gantt-row-track" style={{ width: larguraTotal, minHeight: alturaTrack }}>
                      <div className="gantt-hoje-tick" style={{ left: hojePx }} />
                      {fasesComRaia.map(({ fase, raia, left, width }) => {
                        const legendaFora = width < LARGURA_MINIMA_TEXTO_INTERNO;
                        const titulo = `${fase.titulo}: ${fase.inicio.toLocaleDateString('pt-BR')} — ${
                          fase.fim ? fase.fim.toLocaleDateString('pt-BR') : 'em andamento'
                        }`;
                        const top = 8 + raia * ALTURA_RAIA;
                        return (
                          <Fragment key={fase.status}>
                            <div
                              className={`gantt-bar${fase.fim === null ? ' gantt-bar-andamento' : ''}`}
                              style={{ left, width, top, background: CORES_FASE[fase.status] }}
                              title={titulo}
                            >
                              {!legendaFora && fase.titulo}
                            </div>
                            {legendaFora && (
                              <span
                                className="gantt-bar-legenda-externa"
                                style={{ left: left + width + 6, top }}
                                title={titulo}
                              >
                                {fase.titulo}
                              </span>
                            )}
                          </Fragment>
                        );
                      })}
                      {fases.length === 0 && (
                        <span className="field-hint gantt-sem-fase">Sem histórico de fase ainda.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
