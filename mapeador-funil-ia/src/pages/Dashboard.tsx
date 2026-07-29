import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { Mapeamento } from '../types/database';

type Filtro =
  | 'aguardando'
  | 'respondeu'
  | 'gerando'
  | 'esclarecimento'
  | 'concluido'
  | 'erro';

function pertenceAoFiltro(m: Mapeamento, filtro: Filtro): boolean {
  switch (filtro) {
    case 'aguardando':
      return m.status === 'em_preenchimento' && !m.enviado_pelo_cliente;
    case 'respondeu':
      return m.status === 'em_preenchimento' && m.enviado_pelo_cliente;
    case 'gerando':
      return m.status === 'processando_ia';
    case 'esclarecimento':
      return m.status === 'aguardando_esclarecimento';
    case 'concluido':
      return m.status === 'concluido';
    case 'erro':
      return m.status === 'erro';
    default:
      return true;
  }
}

export function Dashboard() {
  const { user } = useAuth();
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('mapeamentos')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setMapeamentos(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo(
    () => ({
      total: mapeamentos.length,
      aguardando: mapeamentos.filter((m) => pertenceAoFiltro(m, 'aguardando')).length,
      respondeu: mapeamentos.filter((m) => pertenceAoFiltro(m, 'respondeu')).length,
      gerando: mapeamentos.filter((m) => pertenceAoFiltro(m, 'gerando')).length,
      esclarecimento: mapeamentos.filter((m) => pertenceAoFiltro(m, 'esclarecimento')).length,
      concluido: mapeamentos.filter((m) => pertenceAoFiltro(m, 'concluido')).length,
      erro: mapeamentos.filter((m) => pertenceAoFiltro(m, 'erro')).length,
    }),
    [mapeamentos],
  );

  const mapeamentosFiltrados = filtro
    ? mapeamentos.filter((m) => pertenceAoFiltro(m, filtro))
    : mapeamentos;

  function toggleFiltro(novoFiltro: Filtro) {
    setFiltro((atual) => (atual === novoFiltro ? null : novoFiltro));
  }

  async function handleExcluir(m: Mapeamento) {
    if (
      !window.confirm(
        `Excluir o mapeamento "${m.nome_negocio}"? Essa ação não pode ser desfeita e também apaga os funis gerados a partir dele.`,
      )
    ) {
      return;
    }

    setExcluindoId(m.id);
    const { error: deleteError } = await supabase.from('mapeamentos').delete().eq('id', m.id);
    setExcluindoId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMapeamentos((prev) => prev.filter((item) => item.id !== m.id));
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Mapeamentos</h1>
        <Link to="/novo" className="btn btn-primary">
          + Novo mapeamento
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && mapeamentos.length === 0 && (
        <div className="empty-state">
          <p>Você ainda não criou nenhum mapeamento de processo.</p>
          <Link to="/novo" className="btn btn-primary">
            Criar o primeiro mapeamento
          </Link>
        </div>
      )}

      {!loading && mapeamentos.length > 0 && (
        <>
          <div className="stats-grid">
            <button
              type="button"
              className={`stat-card${filtro === null ? ' stat-card-active' : ''}`}
              onClick={() => setFiltro(null)}
            >
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total</span>
            </button>
            <button
              type="button"
              className={`stat-card stat-card-warning${filtro === 'aguardando' ? ' stat-card-active' : ''}`}
              onClick={() => toggleFiltro('aguardando')}
            >
              <span className="stat-value">{stats.aguardando}</span>
              <span className="stat-label">Aguardando preenchimento</span>
            </button>
            <button
              type="button"
              className={`stat-card stat-card-success${filtro === 'respondeu' ? ' stat-card-active' : ''}`}
              onClick={() => toggleFiltro('respondeu')}
            >
              <span className="stat-value">{stats.respondeu}</span>
              <span className="stat-label">Cliente respondeu</span>
            </button>
            <button
              type="button"
              className={`stat-card stat-card-info${filtro === 'gerando' ? ' stat-card-active' : ''}`}
              onClick={() => toggleFiltro('gerando')}
            >
              <span className="stat-value">{stats.gerando}</span>
              <span className="stat-label">Gerando funil</span>
            </button>
            {stats.esclarecimento > 0 && (
              <button
                type="button"
                className={`stat-card stat-card-warning${filtro === 'esclarecimento' ? ' stat-card-active' : ''}`}
                onClick={() => toggleFiltro('esclarecimento')}
              >
                <span className="stat-value">{stats.esclarecimento}</span>
                <span className="stat-label">IA pediu esclarecimento</span>
              </button>
            )}
            <button
              type="button"
              className={`stat-card stat-card-success${filtro === 'concluido' ? ' stat-card-active' : ''}`}
              onClick={() => toggleFiltro('concluido')}
            >
              <span className="stat-value">{stats.concluido}</span>
              <span className="stat-label">Funil gerado</span>
            </button>
            {stats.erro > 0 && (
              <button
                type="button"
                className={`stat-card stat-card-danger${filtro === 'erro' ? ' stat-card-active' : ''}`}
                onClick={() => toggleFiltro('erro')}
              >
                <span className="stat-value">{stats.erro}</span>
                <span className="stat-label">Erro</span>
              </button>
            )}
          </div>

          {mapeamentosFiltrados.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum mapeamento nessa situação.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Negócio</th>
                    <th>Status</th>
                    <th>Criado em</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mapeamentosFiltrados.map((m) => (
                    <tr key={m.id}>
                      <td>{m.nome_negocio}</td>
                      <td>
                        <StatusBadge status={m.status} enviadoPeloCliente={m.enviado_pelo_cliente} />
                      </td>
                      <td>{new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="table-actions">
                        <Link to={`/mapeamento/${m.id}`} className="btn btn-secondary">
                          Ver
                        </Link>{' '}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleExcluir(m)}
                          disabled={excluindoId === m.id}
                        >
                          {excluindoId === m.id ? 'Excluindo…' : 'Excluir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
