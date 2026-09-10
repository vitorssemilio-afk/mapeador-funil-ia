import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, ImplementacaoStatus, MapeamentoStatus } from '../types/database';

type MapeamentoResumo = {
  id: string;
  cliente_id: string | null;
  tipo: 'vendas' | 'pos_venda';
  status: MapeamentoStatus;
  enviado_pelo_cliente: boolean;
};

type ImplementacaoResumo = {
  id: string;
  cliente_id: string | null;
  status: ImplementacaoStatus;
};

type ImplementacaoSemPosVenda = {
  id: string;
  mapeamento_id: string;
  nome_cliente: string;
};

function labelStatusMapeamento(m: MapeamentoResumo | undefined): { texto: string; classe: string } | null {
  if (!m) return null;
  if (m.status === 'em_preenchimento') {
    return m.enviado_pelo_cliente
      ? { texto: 'Cliente respondeu', classe: 'status-concluido' }
      : { texto: 'Aguardando preenchimento', classe: 'status-em_preenchimento' };
  }
  if (m.status === 'processando_ia') return { texto: 'Gerando funil', classe: 'status-processando_ia' };
  if (m.status === 'aguardando_esclarecimento') {
    return { texto: 'IA pediu esclarecimento', classe: 'status-aguardando_esclarecimento' };
  }
  if (m.status === 'concluido') return { texto: 'Funil gerado', classe: 'status-concluido' };
  return { texto: 'Erro', classe: 'status-erro' };
}

export function Dashboard() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentosPorCliente, setMapeamentosPorCliente] = useState<Map<string, MapeamentoResumo[]>>(new Map());
  const [implementacoesPorCliente, setImplementacoesPorCliente] = useState<Map<string, ImplementacaoResumo>>(
    new Map(),
  );
  const [implementacoesSemPosVenda, setImplementacoesSemPosVenda] = useState<ImplementacaoSemPosVenda[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const [
        { data: clientesData, error: clientesError },
        { data: mapeamentosData },
        { data: implementacoesData },
      ] = await Promise.all([
        supabase.from('clientes').select('*').order('created_at', { ascending: false }),
        supabase.from('mapeamentos').select('id, cliente_id, tipo, status, enviado_pelo_cliente'),
        supabase.from('implementacoes_crm').select('id, cliente_id, mapeamento_id, nome_cliente, status'),
      ]);

      if (cancelled) return;

      if (clientesError) {
        setError(clientesError.message);
        setLoading(false);
        return;
      }

      setClientes(clientesData ?? []);

      const mapaMapeamentos = new Map<string, MapeamentoResumo[]>();
      for (const m of mapeamentosData ?? []) {
        if (!m.cliente_id) continue;
        const lista = mapaMapeamentos.get(m.cliente_id) ?? [];
        lista.push(m as MapeamentoResumo);
        mapaMapeamentos.set(m.cliente_id, lista);
      }
      setMapeamentosPorCliente(mapaMapeamentos);

      const mapaImplementacoes = new Map<string, ImplementacaoResumo>();
      for (const impl of implementacoesData ?? []) {
        if (impl.cliente_id) mapaImplementacoes.set(impl.cliente_id, impl as ImplementacaoResumo);
      }
      setImplementacoesPorCliente(mapaImplementacoes);

      setImplementacoesSemPosVenda(
        (implementacoesData ?? []).filter(
          (impl) =>
            ['semana_3', 'semana_4', 'concluida'].includes(impl.status) &&
            !(impl.cliente_id && mapaMapeamentos.get(impl.cliente_id)?.some((m) => m.tipo === 'pos_venda')),
        ),
      );

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        c.nome_empresa.toLowerCase().includes(termo) ||
        (c.nome_contato ?? '').toLowerCase().includes(termo) ||
        (c.segmento ?? '').toLowerCase().includes(termo),
    );
  }, [clientes, busca]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Clientes</h1>
        <Link to="/clientes/novo" className="btn btn-primary">
          + Novo cliente
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

      {!loading && !error && clientes.length === 0 && (
        <div className="empty-state">
          <p>Você ainda não cadastrou nenhum cliente.</p>
          <Link to="/clientes/novo" className="btn btn-primary">
            Cadastrar o primeiro cliente
          </Link>
        </div>
      )}

      {!loading && clientes.length > 0 && (
        <>
          <label className="field" style={{ maxWidth: 360 }}>
            <span>Buscar</span>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome da empresa, contato ou segmento"
            />
          </label>

          {clientesFiltrados.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum cliente encontrado.</p>
            </div>
          ) : (
            <div className="mapeamentos-grid">
              {clientesFiltrados.map((c) => {
                const mapeamentosDoCliente = mapeamentosPorCliente.get(c.id) ?? [];
                const vendas = mapeamentosDoCliente.find((m) => m.tipo === 'vendas');
                const posVenda = mapeamentosDoCliente.find((m) => m.tipo === 'pos_venda');
                const implementacao = implementacoesPorCliente.get(c.id);
                const statusVendas = labelStatusMapeamento(vendas);
                const statusPosVenda = labelStatusMapeamento(posVenda);

                return (
                  <Link key={c.id} to={`/clientes/${c.id}`} className="mapeamento-card">
                    <span className="mapeamento-card-nome">{c.nome_empresa}</span>
                    {(c.nome_contato || c.segmento) && (
                      <span className="mapeamento-card-data">
                        {[c.nome_contato, c.segmento].filter(Boolean).join(' · ')}
                      </span>
                    )}

                    {statusVendas ? (
                      <span className={`status-badge ${statusVendas.classe}`}>Vendas: {statusVendas.texto}</span>
                    ) : (
                      <span className="status-badge status-em_preenchimento">Sem mapeamento de vendas</span>
                    )}

                    {statusPosVenda && (
                      <span className={`status-badge ${statusPosVenda.classe}`}>
                        Pós-venda: {statusPosVenda.texto}
                      </span>
                    )}

                    {implementacao && (
                      <span className="mapeamento-card-implementacao">
                        Implementação: <ImplementacaoStatusBadge status={implementacao.status} />
                      </span>
                    )}
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
