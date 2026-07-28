import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { supabase } from '../lib/supabaseClient';
import type { ImplementacaoCrm } from '../types/database';

export function ImplementacoesCrm() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('implementacoes_crm')
        .select('*')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (fetchError) setError(fetchError.message);
      else setImplementacoes(data ?? []);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Implementações de CRM</h1>
          <p className="field-hint">
            Acompanhamento do POP de implementação (4 semanas) de cada cliente. Pra iniciar uma
            nova, abra um mapeamento concluído e clique em "Iniciar implementação de CRM".
          </p>
        </div>
        <Link to="/implementacoes/checklist" className="btn btn-secondary">
          Editar checklist
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && implementacoes.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma implementação iniciada ainda.</p>
          <Link to="/" className="btn btn-primary">
            Ver mapeamentos
          </Link>
        </div>
      )}

      {!loading && implementacoes.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Consultor</th>
                <th>Status</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {implementacoes.map((impl) => (
                <tr key={impl.id}>
                  <td>{impl.nome_cliente}</td>
                  <td>{impl.consultor_responsavel || '—'}</td>
                  <td>
                    <ImplementacaoStatusBadge status={impl.status} />
                  </td>
                  <td>{new Date(impl.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="table-actions">
                    <Link to={`/implementacoes/${impl.id}`} className="btn btn-secondary">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
