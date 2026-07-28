import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { Mapeamento } from '../types/database';

export function Dashboard() {
  const { user } = useAuth();
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              {mapeamentos.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome_negocio}</td>
                  <td>
                    <StatusBadge status={m.status} enviadoPeloCliente={m.enviado_pelo_cliente} />
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="table-actions">
                    <Link to={`/mapeamento/${m.id}`} className="btn btn-secondary">
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
