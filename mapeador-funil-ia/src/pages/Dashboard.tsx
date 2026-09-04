import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { Mapeamento, MapeamentoStatus } from '../types/database';

type Filtro =
  | 'aguardando'
  | 'respondeu'
  | 'gerando'
  | 'esclarecimento'
  | 'concluido'
  | 'erro';

type PosVendaResumo = {
  mapeamento_origem_id: string;
  status: MapeamentoStatus;
  enviado_pelo_cliente: boolean;
};

type ImplementacaoSemPosVenda = {
  id: string;
  mapeamento_id: string;
  nome_cliente: string;
};

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

function labelPosVenda(pv: PosVendaResumo | undefined): { texto: string; classe: string } {
  if (!pv) return { texto: 'Pós-venda: não enviado', classe: 'status-em_preenchimento' };
  if (pv.status === 'em_preenchimento') {
    return pv.enviado_pelo_cliente
      ? { texto: 'Pós-venda: cliente respondeu', classe: 'status-concluido' }
      : { texto: 'Pós-venda: aguardando cliente', classe: 'status-em_preenchimento' };
  }
  if (pv.status === 'processando_ia') return { texto: 'Pós-venda: gerando funil', classe: 'status-processando_ia' };
  if (pv.status === 'aguardando_esclarecimento') {
    return { texto: 'Pós-venda: IA pediu esclarecimento', classe: 'status-aguardando_esclarecimento' };
  }
  if (pv.status === 'concluido') return { texto: 'Pós-venda: concluído', classe: 'status-concluido' };
  return { texto: 'Pós-venda: erro', classe: 'status-erro' };
}

export function Dashboard() {
  const { user } = useAuth();
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [posVendaPorOrigem, setPosVendaPorOrigem] = useState<Map<string, PosVendaResumo>>(new Map());
  const [implementacoesSemPosVenda, setImplementacoesSemPosVenda] = useState<ImplementacaoSemPosVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const [
        { data, error: fetchError },
        { data: posVendaData },
        { data: implementacoesData },
      ] = await Promise.all([
        supabase
          .from('mapeamentos')
          .select('*')
          .eq('tipo', 'vendas')
          .order('created_at', { ascending: false }),
        supabase
          .from('mapeamentos')
          .select('mapeamento_origem_id, status, enviado_pelo_cliente')
          .eq('tipo', 'pos_venda'),
        supabase
          .from('implementacoes_crm')
          .select('id, mapeamento_id, nome_cliente')
          .in('status', ['semana_3', 'semana_4', 'concluida']),
      ]);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setMapeamentos(data ?? []);
      }

      const mapaPosVenda = new Map<string, PosVendaResumo>(
        (posVendaData ?? [])
          .filter((pv): pv is PosVendaResumo => pv.mapeamento_origem_id !== null)
          .map((pv) => [pv.mapeamento_origem_id, pv]),
      );
      setPosVendaPorOrigem(mapaPosVenda);
      setImplementacoesSemPosVenda(
        (implementacoesData ?? []).filter((impl) => !mapaPosVenda.has(impl.mapeamento_id)),
      );

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

      {!loading && implementacoesSemPosVenda.length > 0 && (
        <div className="form-info form-info-com-acao">
          <span>
            {implementacoesSemPosVenda.length} cliente
            {implementacoesSemPosVenda.length === 1 ? '' : 's'} na Semana 3 ou mais da implementação
            sem formulário de pós-venda enviado:{' '}
            {implementacoesSemPosVenda.map((impl, i) => (
              <span key={impl.id}>
                {i > 0 && ', '}
                <Link to={`/implementacoes/${impl.id}`}>{impl.nome_cliente}</Link>
              </span>
            ))}
          </span>
        </div>
      )}

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
            <div className="mapeamentos-grid">
              {mapeamentosFiltrados.map((m) => {
                const posVenda = m.status === 'concluido' ? labelPosVenda(posVendaPorOrigem.get(m.id)) : null;
                return (
                  <Link key={m.id} to={`/mapeamento/${m.id}`} className="mapeamento-card">
                    <StatusBadge status={m.status} enviadoPeloCliente={m.enviado_pelo_cliente} />
                    <span className="mapeamento-card-nome">{m.nome_negocio}</span>
                    <span className="mapeamento-card-data">
                      Criado em {new Date(m.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    {posVenda && <span className={`status-badge ${posVenda.classe}`}>{posVenda.texto}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
