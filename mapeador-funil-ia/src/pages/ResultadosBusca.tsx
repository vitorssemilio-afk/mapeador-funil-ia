// Página "Resultados da busca" (Fase 2 da Busca Global) — usada quando o
// termo tem resultado demais pra caber na Command Palette. Busca em si
// continua inteiramente nas RPCs busca_* (migrations 0075/0076); esta
// tela só busca com limite maior por categoria e deixa filtrar o que já
// veio (tipo, cliente, consultor, período) sem reinventar outra régua de
// permissão — o que chega aqui já passou pela RLS de cada tabela.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  buscarCategoria,
  CATEGORIA_LABELS,
  CATEGORIAS_ORDEM,
  registrarAberturaViaBusca,
  registrarRecente,
  type CategoriaBusca,
  type ResultadoBusca,
} from '../lib/buscaGlobal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

const LIMITE_POR_CATEGORIA = 50;

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function ResultadosBusca() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const termoUrl = searchParams.get('q') ?? '';

  const [termo, setTermo] = useState(termoUrl);
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [loading, setLoading] = useState(false);

  const [tiposSelecionados, setTiposSelecionados] = useState<Set<CategoriaBusca>>(new Set(CATEGORIAS_ORDEM));
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [consultorFiltro, setConsultorFiltro] = useState('');
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');

  const [clientesDisponiveis, setClientesDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [consultoresDisponiveis, setConsultoresDisponiveis] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    supabase
      .from('clientes')
      .select('id, nome_fantasia, nome_empresa')
      .order('nome_fantasia', { ascending: true })
      .then(({ data }) => {
        setClientesDisponiveis((data ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia ?? c.nome_empresa })));
      });
    supabase
      .from('consultores')
      .select('id, nome')
      .order('nome', { ascending: true })
      .then(({ data }) => {
        setConsultoresDisponiveis((data ?? []).map((c) => ({ id: c.id, nome: c.nome })));
      });
  }, []);

  async function buscar(termoAtual: string) {
    if (!termoAtual.trim()) {
      setResultados([]);
      return;
    }
    setLoading(true);
    const resultadosPorCategoria = await Promise.all(
      CATEGORIAS_ORDEM.map((categoria) => buscarCategoria(categoria, termoAtual, LIMITE_POR_CATEGORIA, 0)),
    );
    setResultados(resultadosPorCategoria.flat());
    setLoading(false);
  }

  useEffect(() => {
    buscar(termoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termoUrl]);

  function handleSubmitBusca(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams(termo.trim() ? { q: termo.trim() } : {});
  }

  function toggleTipo(categoria: CategoriaBusca) {
    setTiposSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  const resultadosFiltrados = useMemo(() => {
    const de = periodoDe ? new Date(periodoDe) : null;
    const ate = periodoAte ? new Date(periodoAte) : null;

    return resultados.filter((r) => {
      if (!tiposSelecionados.has(r.categoria)) return false;
      if (clienteFiltro && r.cliente_id !== clienteFiltro) return false;
      if (consultorFiltro && r.consultor_id !== consultorFiltro) return false;
      if ((de || ate) && !r.data_referencia) return false;
      if (de && r.data_referencia && new Date(r.data_referencia) < de) return false;
      if (ate && r.data_referencia && new Date(r.data_referencia) > ate) return false;
      return true;
    });
  }, [resultados, tiposSelecionados, clienteFiltro, consultorFiltro, periodoDe, periodoAte]);

  const grupos = useMemo(() => {
    const porCategoria = new Map<CategoriaBusca, ResultadoBusca[]>();
    for (const r of resultadosFiltrados) {
      if (!porCategoria.has(r.categoria)) porCategoria.set(r.categoria, []);
      porCategoria.get(r.categoria)!.push(r);
    }
    return CATEGORIAS_ORDEM.filter((c) => porCategoria.has(c)).map((categoria) => ({
      categoria,
      itens: porCategoria.get(categoria)!,
    }));
  }, [resultadosFiltrados]);

  function handleAbrir(item: ResultadoBusca) {
    if (user) registrarRecente(user.id, item);
    registrarAberturaViaBusca(item);
    navigate(item.rota);
  }

  function limparFiltros() {
    setTiposSelecionados(new Set(CATEGORIAS_ORDEM));
    setClienteFiltro('');
    setConsultorFiltro('');
    setPeriodoDe('');
    setPeriodoAte('');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Resultados da busca</h1>
          <p className="field-hint">
            {resultadosFiltrados.length} resultado{resultadosFiltrados.length === 1 ? '' : 's'}
            {termoUrl && <> para "{termoUrl}"</>}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmitBusca} className="card" style={{ marginBottom: 16 }}>
        <label className="field">
          <span>Termo</span>
          <input
            type="text"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar clientes, reuniões, funis, pendências…"
          />
        </label>
        <div className="wizard-actions">
          <button type="submit" className="btn btn-primary">
            Buscar
          </button>
        </div>
      </form>

      <div className="resultados-busca-layout">
        <aside className="card resultados-busca-filtros">
          <div className="resultados-busca-filtros-header">
            <h2>Filtros</h2>
            <button type="button" className="link-button" onClick={limparFiltros}>
              Limpar
            </button>
          </div>

          <div className="field">
            <span>Tipo</span>
            {CATEGORIAS_ORDEM.map((categoria) => (
              <label key={categoria} className="resultados-busca-checkbox">
                <input
                  type="checkbox"
                  checked={tiposSelecionados.has(categoria)}
                  onChange={() => toggleTipo(categoria)}
                />
                {CATEGORIA_LABELS[categoria]}
              </label>
            ))}
          </div>

          <label className="field">
            <span>Cliente</span>
            <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
              <option value="">Todos</option>
              {clientesDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Consultor</span>
            <select value={consultorFiltro} onChange={(e) => setConsultorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {consultoresDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Período — de</span>
              <input type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} />
            </label>
            <label className="field">
              <span>Período — até</span>
              <input type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} />
            </label>
          </div>
          <p className="field-hint">
            O período filtra pela data mais relevante de cada tipo (ex.: data da reunião, prazo da pendência) —
            consultores e critérios sem data registrada não aparecem quando esse filtro está ativo.
          </p>
        </aside>

        <section className="resultados-busca-lista">
          {loading && <p className="page-loading">Buscando…</p>}

          {!loading && termoUrl && grupos.length === 0 && (
            <div className="empty-state">
              <p>Nenhum resultado encontrado.</p>
            </div>
          )}

          {!loading &&
            grupos.map((grupo) => (
              <div className="card" key={grupo.categoria} style={{ marginBottom: 16 }}>
                <h2>
                  {CATEGORIA_LABELS[grupo.categoria]} <span className="field-hint">({grupo.itens.length})</span>
                </h2>
                <div className="table-wrap">
                  <table className="data-table data-table-cards-mobile">
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Detalhe</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.itens.map((item) => (
                        <tr
                          key={item.entidade_id}
                          onClick={() => handleAbrir(item)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td data-label="Título">{item.titulo}</td>
                          <td data-label="Detalhe">
                            {item.subtitulo}
                            {item.data_referencia && (
                              <span className="field-hint"> · {formatarData(item.data_referencia)}</span>
                            )}
                          </td>
                          <td data-label="Status">{item.badge ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
