import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bucketDeItem,
  construirAgendaOperacional,
  BUCKET_AGENDA_LABELS,
  TIPO_ITEM_AGENDA_LABELS,
  TIPO_ITEM_AGENDA_TONE,
  type BucketAgenda,
  type ItemAgendaOperacional,
} from '../lib/agendaOperacional';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import { supabase } from '../lib/supabaseClient';
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

const BUCKETS_ORDENADOS: BucketAgenda[] = ['atrasados', 'hoje', 'amanha', 'proximos7', 'sem_data'];

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function formatarData(item: ItemAgendaOperacional): string {
  if (!item.data) return '—';
  const temHora = item.data.getHours() !== 0 || item.data.getMinutes() !== 0;
  return temHora
    ? item.data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : item.data.toLocaleDateString('pt-BR');
}

// Central operacional da implementação: reúne reuniões, tarefas, prazos de
// Trial, pendências (do cliente e internas) e alertas de todos os clientes
// ativos num lugar só, organizados por urgência — não por um único dia
// selecionado como antes.
export function Agenda() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentosVendas, setMapeamentosVendas] = useState<Mapeamento[]>([]);
  const [mapeamentosPosVenda, setMapeamentosPosVenda] = useState<Mapeamento[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<ClienteOcorrencia[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  // Abas de período mobile (Prompt 59, seção 18) — só decide qual seção já
  // renderizada fica visível nessa largura (CSS); desktop continua
  // mostrando todos os buckets empilhados, sem nenhuma consulta nova.
  const [bucketMobileAtivo, setBucketMobileAtivo] = useState<BucketAgenda>('atrasados');

  async function carregar() {
    setLoading(true);
    setError(null);

    const [
      { data: clientesData, error: clientesError },
      { data: mapeamentosData, error: mapeamentosError },
      { data: mapeamentosPosVendaData },
      { data: implementacoesData, error: implementacoesError },
      { data: atividadesData, error: atividadesError },
      { data: statusRowsData, error: statusRowsError },
      { data: historicoData, error: historicoError },
      { data: consultoresData },
      { data: ocorrenciasData },
      { data: reunioesData },
      { data: configGlobalData },
      { data: snapshotsData },
    ] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('mapeamentos').select('*').eq('tipo', 'vendas').order('created_at', { ascending: false }),
      supabase.from('mapeamentos').select('*').eq('tipo', 'pos_venda').order('created_at', { ascending: false }),
      supabase.from('implementacoes_crm').select('*'),
      supabase.from('atividades_cronograma').select('*'),
      supabase.from('atividades_status').select('*'),
      supabase.from('implementacao_status_historico').select('*'),
      supabase.from('consultores').select('*'),
      supabase.from('cliente_ocorrencias').select('*').eq('status', 'aberta'),
      supabase.from('reunioes').select('*'),
      supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
      supabase.from('implementacao_settings_snapshot').select('*'),
    ]);

    const primeiroErro =
      clientesError ?? mapeamentosError ?? implementacoesError ?? atividadesError ?? statusRowsError ?? historicoError;
    if (primeiroErro) {
      setError(primeiroErro.message);
      setLoading(false);
      return;
    }

    setClientes(clientesData ?? []);
    setMapeamentosVendas(mapeamentosData ?? []);
    setMapeamentosPosVenda(mapeamentosPosVendaData ?? []);
    setImplementacoes(implementacoesData ?? []);
    setAtividades(atividadesData ?? []);
    setStatusRows(statusRowsData ?? []);
    setHistorico(historicoData ?? []);
    setConsultores(consultoresData ?? []);
    setOcorrenciasAbertas(ocorrenciasData ?? []);
    setReunioes(reunioesData ?? []);
    setConfigGlobal(configGlobalData ?? null);
    setSnapshots(snapshotsData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const configuracoesPorCliente = useMemo(
    () => construirMapaConfiguracoes(clientes.map((c) => c.id), snapshots, configGlobal),
    [clientes, snapshots, configGlobal],
  );

  const itens = useMemo(
    () =>
      construirAgendaOperacional({
        clientes,
        mapeamentosVendas,
        mapeamentosPosVenda,
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
      mapeamentosVendas,
      mapeamentosPosVenda,
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
    for (const item of itens) {
      const bucket = bucketDeItem(item, hoje);
      if (!mapa.has(bucket)) mapa.set(bucket, []);
      mapa.get(bucket)!.push(item);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0));
    }
    return mapa;
  }, [itens, hoje]);

  // Primeira aba com algo relevante (Atrasados → Hoje → Amanhã → ...) —
  // só decide o padrão inicial da aba mobile, uma única vez que os dados
  // chegam (nunca de novo depois, senão marcar uma tarefa como concluída
  // recalcularia os buckets e puxaria o usuário de volta pra outra aba).
  const abaInicialEscolhidaRef = useRef(false);
  useEffect(() => {
    if (loading || abaInicialEscolhidaRef.current) return;
    abaInicialEscolhidaRef.current = true;
    const primeiraComItens = BUCKETS_ORDENADOS.find((b) => (itensPorBucket.get(b) ?? []).length > 0);
    if (primeiraComItens) setBucketMobileAtivo(primeiraComItens);
  }, [loading, itensPorBucket]);

  async function handleMarcarConcluida(item: ItemAgendaOperacional) {
    if (!item.atividadeId || !item.implementacaoId) return;

    setMarcando(item.atividadeId);
    const { error: upsertError } = await supabase.from('atividades_status').upsert(
      {
        implementacao_id: item.implementacaoId,
        atividade_id: item.atividadeId,
        data_real: new Date().toISOString(),
      },
      { onConflict: 'implementacao_id,atividade_id' },
    );
    setMarcando(null);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setStatusRows((prev) => {
      const idx = prev.findIndex(
        (s) => s.implementacao_id === item.implementacaoId && s.atividade_id === item.atividadeId,
      );
      const dataReal = new Date().toISOString();
      if (idx === -1) {
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            implementacao_id: item.implementacaoId!,
            atividade_id: item.atividadeId!,
            data_real: dataReal,
            agendado_para: null,
            bloqueado_pelo_cliente: false,
            evidencia: null,
            created_at: dataReal,
            updated_at: dataReal,
          },
        ];
      }
      const copia = [...prev];
      copia[idx] = { ...copia[idx], data_real: dataReal };
      return copia;
    });
  }

  const totalItens = itens.length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Agenda</h1>
          <p className="field-hint">
            Central operacional da implementação: reuniões, tarefas, prazos de Trial, pendências (do
            cliente e internas) e alertas de todos os clientes ativos, organizados por urgência.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && totalItens === 0 && (
        <div className="empty-state">
          <p>Nenhuma pendência no momento. Tudo em dia.</p>
        </div>
      )}

      {/* Abas de período (seção 18) — só aparecem no mobile (CSS); desktop
          continua mostrando todos os buckets empilhados, igual sempre foi. */}
      {!loading && totalItens > 0 && (
        <div className="agenda-abas-mobile" role="tablist" aria-label="Período da agenda">
          {BUCKETS_ORDENADOS.filter((b) => (itensPorBucket.get(b) ?? []).length > 0 || b === bucketMobileAtivo).map(
            (bucket) => (
              <button
                key={bucket}
                type="button"
                role="tab"
                aria-selected={bucketMobileAtivo === bucket}
                className={`agenda-aba-botao${bucketMobileAtivo === bucket ? ' agenda-aba-ativa' : ''}`}
                onClick={() => setBucketMobileAtivo(bucket)}
              >
                {BUCKET_AGENDA_LABELS[bucket]} ({(itensPorBucket.get(bucket) ?? []).length})
              </button>
            ),
          )}
        </div>
      )}

      {!loading &&
        totalItens > 0 &&
        (itensPorBucket.get(bucketMobileAtivo) ?? []).length === 0 && (
          <p className="ops-empty-hint agenda-aba-vazia-mobile">
            Nenhuma atividade prevista para {BUCKET_AGENDA_LABELS[bucketMobileAtivo].toLowerCase()}.
          </p>
        )}

      {!loading &&
        BUCKETS_ORDENADOS.map((bucket) => {
          const lista = itensPorBucket.get(bucket) ?? [];
          if (lista.length === 0) return null;

          return (
            <section
              key={bucket}
              id={bucket}
              className={`card form-card${bucket === bucketMobileAtivo ? '' : ' agenda-secao-oculta-mobile'}`}
            >
              <h2>
                {BUCKET_AGENDA_LABELS[bucket]}
                <span className="field-hint"> ({lista.length})</span>
              </h2>
              <div className="responsive-table-wrap table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Item</th>
                      <th>Responsável</th>
                      <th>Data</th>
                      <th>Status</th>
                      <th>Ação recomendada</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Cliente">
                          <Link to={`/clientes/${item.clienteId}`}>{item.clienteNome}</Link>
                        </td>
                        <td data-label="Tipo">
                          <span className={`status-badge status-tone-${TIPO_ITEM_AGENDA_TONE[item.tipo]}`}>
                            {TIPO_ITEM_AGENDA_LABELS[item.tipo]}
                          </span>
                        </td>
                        <td data-label="Item">
                          {item.titulo}
                          {item.implementacaoId && (
                            <>
                              {' '}
                              <Link to={`/implementacoes/${item.implementacaoId}`} className="field-hint">
                                (ver implementação)
                              </Link>
                            </>
                          )}
                        </td>
                        <td data-label="Responsável">{item.responsavel ?? '—'}</td>
                        <td data-label="Data">{formatarData(item)}</td>
                        <td data-label="Status" className={item.atrasado ? 'ops-prazo-atrasado' : undefined}>
                          {item.aguardando ? `Aguardando ${item.aguardando}` : item.status}
                        </td>
                        <td data-label="Ação recomendada">{item.acaoRecomendada}</td>
                        <td data-label="">
                          {item.atividadeId && (
                            <label className="agenda-card-concluir">
                              <input
                                type="checkbox"
                                checked={false}
                                disabled={marcando === item.atividadeId}
                                onChange={() => handleMarcarConcluida(item)}
                                title="Marcar como concluída"
                              />
                              <span className="agenda-card-concluir-label">Marcar como concluída</span>
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="responsive-card-list">
                {lista.map((item) => (
                  <div key={item.id} className="card entity-card">
                    <div className="entity-card-header">
                      <span className="entity-card-title">{item.titulo}</span>
                      <span className="entity-card-subtitle">{item.clienteNome}</span>
                    </div>

                    <div className="entity-card-badges">
                      <span className={`status-badge status-tone-${TIPO_ITEM_AGENDA_TONE[item.tipo]}`}>
                        {TIPO_ITEM_AGENDA_LABELS[item.tipo]}
                      </span>
                    </div>

                    <div className="entity-card-rows">
                      <div className="entity-card-row">
                        <span className="entity-card-row-label">Data</span>
                        <span className="entity-card-row-value">{formatarData(item)}</span>
                      </div>
                      <div className="entity-card-row">
                        <span className="entity-card-row-label">Status</span>
                        <span className={`entity-card-row-value${item.atrasado ? ' ops-prazo-atrasado' : ''}`}>
                          {item.aguardando ? `Aguardando ${item.aguardando}` : item.status}
                        </span>
                      </div>
                      {item.responsavel && (
                        <div className="entity-card-row">
                          <span className="entity-card-row-label">Responsável</span>
                          <span className="entity-card-row-value">{item.responsavel}</span>
                        </div>
                      )}
                    </div>

                    <div className="entity-card-actions">
                      <Link to={`/clientes/${item.clienteId}`} className="btn btn-secondary">
                        {item.acaoRecomendada}
                      </Link>
                      {item.implementacaoId && (
                        <Link to={`/implementacoes/${item.implementacaoId}`} className="btn btn-ghost">
                          Ver implementação
                        </Link>
                      )}
                    </div>

                    {item.atividadeId && (
                      <label className="agenda-card-concluir">
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={marcando === item.atividadeId}
                          onChange={() => handleMarcarConcluida(item)}
                        />
                        <span className="agenda-card-concluir-label">Marcar como concluída</span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
