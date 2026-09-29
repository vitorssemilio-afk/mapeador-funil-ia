import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  bucketDeItem,
  construirAgendaOperacional,
  BUCKET_AGENDA_LABELS,
  TIPO_ITEM_AGENDA_LABELS,
  type BucketAgenda,
  type ItemAgendaOperacional,
} from '../lib/agendaOperacional';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ClienteOcorrencia,
  Consultor,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
  Mapeamento,
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
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<ClienteOcorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [
      { data: clientesData, error: clientesError },
      { data: mapeamentosData, error: mapeamentosError },
      { data: implementacoesData, error: implementacoesError },
      { data: atividadesData, error: atividadesError },
      { data: statusRowsData, error: statusRowsError },
      { data: historicoData, error: historicoError },
      { data: consultoresData },
      { data: ocorrenciasData },
    ] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('mapeamentos').select('*').eq('tipo', 'vendas').order('created_at', { ascending: false }),
      supabase.from('implementacoes_crm').select('*'),
      supabase.from('atividades_cronograma').select('*'),
      supabase.from('atividades_status').select('*'),
      supabase.from('implementacao_status_historico').select('*'),
      supabase.from('consultores').select('*'),
      supabase.from('cliente_ocorrencias').select('*').eq('status', 'aberta'),
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
    setImplementacoes(implementacoesData ?? []);
    setAtividades(atividadesData ?? []);
    setStatusRows(statusRowsData ?? []);
    setHistorico(historicoData ?? []);
    setConsultores(consultoresData ?? []);
    setOcorrenciasAbertas(ocorrenciasData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const itens = useMemo(
    () =>
      construirAgendaOperacional({
        clientes,
        mapeamentosVendas,
        implementacoes,
        atividades,
        atividadesStatus: statusRows,
        historico,
        consultores,
        ocorrenciasAbertas,
        hoje,
      }),
    [
      clientes,
      mapeamentosVendas,
      implementacoes,
      atividades,
      statusRows,
      historico,
      consultores,
      ocorrenciasAbertas,
      hoje,
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

      {!loading &&
        BUCKETS_ORDENADOS.map((bucket) => {
          const lista = itensPorBucket.get(bucket) ?? [];
          if (lista.length === 0) return null;

          return (
            <section key={bucket} className="card form-card">
              <h2>
                {BUCKET_AGENDA_LABELS[bucket]}
                <span className="field-hint"> ({lista.length})</span>
              </h2>
              <div className="table-wrap">
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
                        <td>
                          <Link to={`/clientes/${item.clienteId}`}>{item.clienteNome}</Link>
                        </td>
                        <td>{TIPO_ITEM_AGENDA_LABELS[item.tipo]}</td>
                        <td>
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
                        <td>{item.responsavel ?? '—'}</td>
                        <td>{formatarData(item)}</td>
                        <td className={item.atrasado ? 'ops-prazo-atrasado' : undefined}>
                          {item.aguardando ? `Aguardando ${item.aguardando}` : item.status}
                        </td>
                        <td>{item.acaoRecomendada}</td>
                        <td>
                          {item.atividadeId && (
                            <input
                              type="checkbox"
                              checked={false}
                              disabled={marcando === item.atividadeId}
                              onChange={() => handleMarcarConcluida(item)}
                              title="Marcar como concluída"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </div>
  );
}
