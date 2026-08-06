import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { itensDaAgenda, type ItemAgenda } from '../lib/agendaImplementacao';
import { supabase } from '../lib/supabaseClient';
import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
} from '../types/database';

const STATUS_ATIVOS = ['pre_requisito', 'semana_1', 'semana_2', 'semana_3', 'semana_4'] as const;

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
  const [grupos, setGrupos] = useState<ChecklistGrupoImplementacao[]>([]);
  const [itens, setItens] = useState<ChecklistItemImplementacao[]>([]);
  const [marcadosPorImplementacao, setMarcadosPorImplementacao] = useState<Map<string, Set<string>>>(new Map());
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
      setGrupos([]);
      setItens([]);
      setMarcadosPorImplementacao(new Map());
      setHistorico([]);
      setLoading(false);
      return;
    }

    const ids = implementacoesAtivas.map((i) => i.id);

    const [
      { data: gruposData, error: gruposError },
      { data: itensData, error: itensError },
      { data: marcadosData, error: marcadosError },
      { data: historicoData, error: historicoError },
    ] = await Promise.all([
      supabase.from('checklist_grupos_implementacao').select('*'),
      supabase
        .from('checklist_itens_implementacao')
        .select('*')
        .or(`implementacao_id.is.null,implementacao_id.in.(${ids.join(',')})`)
        .not('dia_semana', 'is', null),
      supabase
        .from('implementacao_checklist_marcado')
        .select('implementacao_id, item_id, marcado')
        .in('implementacao_id', ids)
        .eq('marcado', true),
      supabase.from('implementacao_status_historico').select('*').in('implementacao_id', ids),
    ]);

    if (gruposError || itensError || marcadosError || historicoError) {
      setError(
        (gruposError ?? itensError ?? marcadosError ?? historicoError)?.message ?? 'Erro ao carregar a agenda.',
      );
      setLoading(false);
      return;
    }

    setGrupos(gruposData ?? []);
    setItens(itensData ?? []);
    setHistorico(historicoData ?? []);

    const mapa = new Map<string, Set<string>>();
    for (const marcado of marcadosData ?? []) {
      if (!mapa.has(marcado.implementacao_id)) mapa.set(marcado.implementacao_id, new Set());
      mapa.get(marcado.implementacao_id)!.add(marcado.item_id);
    }
    setMarcadosPorImplementacao(mapa);

    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const itensAgenda = useMemo(
    () =>
      itensDaAgenda({
        implementacoes,
        grupos,
        itens,
        marcadosPorImplementacao,
        historico,
        diaSelecionado,
        hoje: inicioDoDia(new Date()),
      }),
    [implementacoes, grupos, itens, marcadosPorImplementacao, historico, diaSelecionado],
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
    setMarcando(entrada.item.id);
    const { error: upsertError } = await supabase.from('implementacao_checklist_marcado').upsert(
      {
        implementacao_id: entrada.implementacao.id,
        item_id: entrada.item.id,
        marcado: true,
        marcado_em: new Date().toISOString(),
      },
      { onConflict: 'implementacao_id,item_id' },
    );
    setMarcando(null);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setMarcadosPorImplementacao((prev) => {
      const novo = new Map(prev);
      const marcados = new Set(novo.get(entrada.implementacao.id) ?? []);
      marcados.add(entrada.item.id);
      novo.set(entrada.implementacao.id, marcados);
      return novo;
    });
  }

  const ehHoje = diaSelecionado.getTime() === inicioDoDia(new Date()).getTime();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Agenda</h1>
          <p className="field-hint">
            Tarefas de implementação de CRM pendentes por cliente, com base no checklist e no dia em
            que cada cliente entrou na semana atual. Só considera itens do checklist com prazo
            definido (aba "Editar checklist").
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
              ? 'Nenhuma tarefa pendente com prazo para hoje.'
              : 'Nenhuma tarefa com prazo para este dia.'}
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
                  <label key={entrada.item.id} className="option-checkbox agenda-item">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={marcando === entrada.item.id}
                      onChange={() => handleMarcarItem(entrada)}
                    />
                    <span>
                      {entrada.item.texto}
                      <span className="field-hint"> · {entrada.grupoTitulo}</span>
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
