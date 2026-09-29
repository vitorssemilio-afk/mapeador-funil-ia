import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  bucketDeItem,
  construirAgendaOperacional,
  BUCKET_AGENDA_LABELS,
  TIPO_ITEM_AGENDA_LABELS,
  type BucketAgenda,
  type ItemAgendaOperacional,
} from '../lib/agendaOperacional';
import { TIPO_REUNIAO_LABELS } from '../lib/reunioes';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ClienteOcorrencia,
  Consultor,
  GoogleCalendarEventoPendente,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
  Mapeamento,
  Reuniao,
  TipoReuniao,
} from '../types/database';

const TIPOS_REUNIAO_VINCULAVEIS: TipoReuniao[] = [
  'kickoff',
  'treinamento',
  'checkin_1',
  'checkin_2',
  'tira_duvidas',
  'reuniao_final',
  'extraordinaria',
];

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
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [eventosPendentes, setEventosPendentes] = useState<GoogleCalendarEventoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [vinculandoEventoId, setVinculandoEventoId] = useState<string | null>(null);
  const [formVinculo, setFormVinculo] = useState({ cliente_id: '', implementacao_id: '', tipo: 'extraordinaria' as TipoReuniao });
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

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
      { data: reunioesData },
      { data: eventosPendentesData },
    ] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('mapeamentos').select('*').eq('tipo', 'vendas').order('created_at', { ascending: false }),
      supabase.from('implementacoes_crm').select('*'),
      supabase.from('atividades_cronograma').select('*'),
      supabase.from('atividades_status').select('*'),
      supabase.from('implementacao_status_historico').select('*'),
      supabase.from('consultores').select('*'),
      supabase.from('cliente_ocorrencias').select('*').eq('status', 'aberta'),
      supabase.from('reunioes').select('*'),
      supabase
        .from('google_calendar_eventos_pendentes')
        .select('*')
        .is('reuniao_id', null)
        .eq('status_google', 'confirmed')
        .order('data_inicio', { ascending: true }),
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
    setReunioes(reunioesData ?? []);
    setEventosPendentes(eventosPendentesData ?? []);
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
        reunioes,
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
      reunioes,
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

  function implementacoesDoCliente(clienteId: string): ImplementacaoCrm[] {
    return implementacoes.filter((i) => i.cliente_id === clienteId);
  }

  function abrirVinculo(evento: GoogleCalendarEventoPendente) {
    const clienteId = evento.sugestao_cliente_id ?? '';
    const implementacoesSugeridas = clienteId ? implementacoesDoCliente(clienteId) : [];
    setVinculandoEventoId(evento.id);
    setFormVinculo({
      cliente_id: clienteId,
      implementacao_id: implementacoesSugeridas.length === 1 ? implementacoesSugeridas[0].id : '',
      tipo: evento.sugestao_tipo ?? 'extraordinaria',
    });
  }

  function fecharVinculo() {
    setVinculandoEventoId(null);
  }

  // Vincular nunca cria uma reunião do nada quando já existe um placeholder
  // manual esperando esse mesmo tipo/implementação — reaproveita, só troca a
  // origem pra "google_calendar" e passa a ser a fonte da data.
  async function handleConfirmarVinculo(e: FormEvent, evento: GoogleCalendarEventoPendente) {
    e.preventDefault();
    if (!formVinculo.cliente_id || !formVinculo.implementacao_id) return;

    setSalvandoVinculo(true);
    setError(null);

    const reuniaoExistente = reunioes.find(
      (r) =>
        r.cliente_id === formVinculo.cliente_id &&
        r.implementacao_id === formVinculo.implementacao_id &&
        r.tipo === formVinculo.tipo &&
        !r.google_event_id &&
        (r.status === 'nao_agendada' || r.status === 'agendada'),
    );

    const payload = {
      cliente_id: formVinculo.cliente_id,
      implementacao_id: formVinculo.implementacao_id,
      tipo: formVinculo.tipo,
      titulo: evento.titulo || TIPO_REUNIAO_LABELS[formVinculo.tipo],
      data_hora: evento.data_inicio,
      status: 'agendada' as const,
      origem: 'google_calendar' as const,
      google_event_id: evento.google_event_id,
      google_calendar_id: evento.google_calendar_id,
      google_meet_link: evento.meet_link,
      google_status: 'confirmed' as const,
      consultor_responsavel_id: evento.consultor_id,
    };

    const { data, error: saveError } = reuniaoExistente
      ? await supabase.from('reunioes').update(payload).eq('id', reuniaoExistente.id).select().single()
      : await supabase.from('reunioes').insert(payload).select().single();

    if (saveError) {
      setSalvandoVinculo(false);
      setError(saveError.message);
      return;
    }

    const { error: updateEventoError } = await supabase
      .from('google_calendar_eventos_pendentes')
      .update({ reuniao_id: data.id })
      .eq('id', evento.id);

    if (updateEventoError) {
      setSalvandoVinculo(false);
      setError(updateEventoError.message);
      return;
    }

    setReunioes((prev) => {
      const idx = prev.findIndex((r) => r.id === data.id);
      if (idx === -1) return [...prev, data];
      const copia = [...prev];
      copia[idx] = data;
      return copia;
    });
    setEventosPendentes((prev) => prev.filter((ev) => ev.id !== evento.id));
    setSalvandoVinculo(false);
    setVinculandoEventoId(null);
  }

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

      {!loading && eventosPendentes.length > 0 && (
        <section className="card form-card">
          <h2>
            Eventos do Google Calendar aguardando vínculo
            <span className="field-hint"> ({eventosPendentes.length})</span>
          </h2>
          <p className="field-hint">
            Sincronizados dos calendários dos consultores. O Google não decide sozinho de quem é a
            reunião nem qual o cliente — confirme (ou ajuste) a sugestão abaixo antes de vincular.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Google Meet</th>
                  <th>Sugestão de cliente</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {eventosPendentes.map((evento) => (
                  <Fragment key={evento.id}>
                    <tr>
                      <td>
                        {evento.data_inicio
                          ? new Date(evento.data_inicio).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td>{evento.titulo || '(sem título)'}</td>
                      <td>
                        {evento.meet_link ? (
                          <a href={evento.meet_link} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {evento.sugestao_cliente_id
                          ? (clientes.find((c) => c.id === evento.sugestao_cliente_id)?.nome_empresa ?? '—')
                          : 'Nenhuma — selecione manualmente'}
                      </td>
                      <td>
                        <button type="button" className="btn btn-secondary" onClick={() => abrirVinculo(evento)}>
                          Vincular
                        </button>
                      </td>
                    </tr>
                    {vinculandoEventoId === evento.id && (
                      <tr>
                        <td colSpan={5}>
                          <form onSubmit={(e) => handleConfirmarVinculo(e, evento)} className="form-grid">
                            <label className="field">
                              <span>Cliente</span>
                              <select
                                required
                                value={formVinculo.cliente_id}
                                onChange={(e) =>
                                  setFormVinculo({ ...formVinculo, cliente_id: e.target.value, implementacao_id: '' })
                                }
                              >
                                <option value="">Selecione…</option>
                                {clientes.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome_empresa}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Implementação</span>
                              <select
                                required
                                value={formVinculo.implementacao_id}
                                disabled={!formVinculo.cliente_id}
                                onChange={(e) => setFormVinculo({ ...formVinculo, implementacao_id: e.target.value })}
                              >
                                <option value="">Selecione…</option>
                                {implementacoesDoCliente(formVinculo.cliente_id).map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.nome_cliente}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Tipo de reunião</span>
                              <select
                                value={formVinculo.tipo}
                                onChange={(e) =>
                                  setFormVinculo({ ...formVinculo, tipo: e.target.value as TipoReuniao })
                                }
                              >
                                {TIPOS_REUNIAO_VINCULAVEIS.map((tipo) => (
                                  <option key={tipo} value={tipo}>
                                    {TIPO_REUNIAO_LABELS[tipo]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="wizard-actions">
                              <button type="button" className="btn btn-secondary" onClick={fecharVinculo}>
                                Cancelar
                              </button>
                              <button type="submit" className="btn btn-primary" disabled={salvandoVinculo}>
                                {salvandoVinculo ? 'Vinculando…' : 'Confirmar vínculo'}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
