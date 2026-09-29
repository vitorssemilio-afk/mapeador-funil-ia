import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { atividadesDaAgenda, type ItemAgenda } from '../lib/agendaImplementacao';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
} from '../types/database';

const STATUS_ATIVOS = [
  'preparacao_crm',
  'crm_em_configuracao',
  'treinamento_agendado',
  'automacoes',
  'entrega',
] as const;

function formatarDia(data: Date): string {
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function adicionarDias(data: Date, dias: number): Date {
  const copia = new Date(data);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function Agenda() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(() => inicioDoDia(new Date()));
  const [marcando, setMarcando] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const { data: implData, error: implError } = await supabase
      .from('implementacoes_crm')
      .select('*')
      .in('status', STATUS_ATIVOS);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    const implementacoesAtivas = implData ?? [];
    setImplementacoes(implementacoesAtivas);

    if (implementacoesAtivas.length === 0) {
      setAtividades([]);
      setStatusRows([]);
      setClientes([]);
      setHistorico([]);
      setLoading(false);
      return;
    }

    const ids = implementacoesAtivas.map((i) => i.id);
    const clienteIds = implementacoesAtivas
      .map((i) => i.cliente_id)
      .filter((id): id is string => id !== null);

    const [
      { data: atividadesData, error: atividadesError },
      { data: statusRowsData, error: statusRowsError },
      { data: clientesData, error: clientesError },
      { data: historicoData, error: historicoError },
    ] = await Promise.all([
      supabase
        .from('atividades_cronograma')
        .select('*')
        .or(`implementacao_id.is.null,implementacao_id.in.(${ids.join(',')})`),
      supabase.from('atividades_status').select('*').in('implementacao_id', ids),
      clienteIds.length > 0
        ? supabase.from('clientes').select('*').in('id', clienteIds)
        : Promise.resolve({ data: [] as Cliente[], error: null }),
      supabase.from('implementacao_status_historico').select('*').in('implementacao_id', ids),
    ]);

    if (atividadesError || statusRowsError || clientesError || historicoError) {
      setError(
        (atividadesError ?? statusRowsError ?? clientesError ?? historicoError)?.message ??
          'Erro ao carregar a agenda.',
      );
      setLoading(false);
      return;
    }

    setAtividades(atividadesData ?? []);
    setStatusRows(statusRowsData ?? []);
    setClientes(clientesData ?? []);
    setHistorico(historicoData ?? []);

    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const itensAgenda = useMemo(
    () =>
      atividadesDaAgenda({
        entradas: implementacoes.map((implementacao) => ({
          implementacao,
          atividades,
          statusRows: statusRows.filter((s) => s.implementacao_id === implementacao.id),
          cliente: clientes.find((c) => c.id === implementacao.cliente_id) ?? null,
          historico: historico.filter((h) => h.implementacao_id === implementacao.id),
        })),
        diaSelecionado,
        hoje: inicioDoDia(new Date()),
      }),
    [implementacoes, atividades, statusRows, clientes, historico, diaSelecionado],
  );

  const agrupadoPorCliente = useMemo(() => {
    const grupos = new Map<string, ItemAgenda[]>();
    for (const entrada of itensAgenda) {
      const chave = entrada.implementacao.id;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(entrada);
    }
    return grupos;
  }, [itensAgenda]);

  async function handleMarcarItem(entrada: ItemAgenda) {
    if (entrada.atividade.id === null) return; // Trial Kommo é virtual, não tem o que marcar aqui.

    setMarcando(entrada.atividade.id);
    const { error: upsertError } = await supabase.from('atividades_status').upsert(
      {
        implementacao_id: entrada.implementacao.id,
        atividade_id: entrada.atividade.id,
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
        (s) => s.implementacao_id === entrada.implementacao.id && s.atividade_id === entrada.atividade.id,
      );
      const dataReal = new Date().toISOString();
      if (idx === -1) {
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            implementacao_id: entrada.implementacao.id,
            atividade_id: entrada.atividade.id!,
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

  const ehHoje = diaSelecionado.getTime() === inicioDoDia(new Date()).getTime();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Agenda</h1>
          <p className="field-hint">
            Atividades de implementação de CRM pendentes por cliente, com base no cronograma de
            dependências de cada implementação.
          </p>
        </div>
      </div>

      <div className="agenda-navegacao">
        <button type="button" className="btn btn-ghost" onClick={() => setDiaSelecionado((d) => adicionarDias(d, -1))}>
          ← Anterior
        </button>
        <div className="agenda-dia-atual">
          <strong>{formatarDia(diaSelecionado)}</strong>
          {!ehHoje && (
            <button type="button" className="btn btn-ghost btn-auto" onClick={() => setDiaSelecionado(inicioDoDia(new Date()))}>
              Voltar para hoje
            </button>
          )}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setDiaSelecionado((d) => adicionarDias(d, 1))}>
          Próximo →
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && agrupadoPorCliente.size === 0 && (
        <div className="empty-state">
          <p>
            {ehHoje
              ? 'Nenhuma atividade pendente com prazo para hoje.'
              : 'Nenhuma atividade com prazo para este dia.'}
          </p>
        </div>
      )}

      {!loading &&
        Array.from(agrupadoPorCliente.entries()).map(([implementacaoId, entradas]) => {
          const implementacao = entradas[0].implementacao;
          return (
            <section key={implementacaoId} className="card form-card">
              <div className="page-header">
                <h2 style={{ marginBottom: 0 }}>
                  <Link to={`/implementacoes/${implementacao.id}`}>{implementacao.nome_cliente}</Link>
                </h2>
                <ImplementacaoStatusBadge status={implementacao.status} />
              </div>
              <div className="options-list">
                {entradas.map((entrada) => (
                  <label
                    key={entrada.atividade.id ?? 'trial-kommo'}
                    className="option-checkbox agenda-item"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={marcando === entrada.atividade.id || entrada.atividade.id === null}
                      onChange={() => handleMarcarItem(entrada)}
                    />
                    <span>
                      {entrada.atividade.nome}
                      <span className="field-hint"> · {entrada.atividade.ciclo}</span>
                      {entrada.diasAtraso > 0 && (
                        <span className="agenda-atraso-badge">
                          {' '}
                          · atrasado há {entrada.diasAtraso} dia{entrada.diasAtraso > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
