import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { nomeConsultor } from '../lib/operacaoResumo';
import { supabase } from '../lib/supabaseClient';
import type { Consultor, ImplementacaoCrm } from '../types/database';

export function ImplementacoesCrm() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      const [{ data, error: fetchError }, { data: consultoresData }] = await Promise.all([
        supabase.from('implementacoes_crm').select('*'),
        supabase.from('consultores').select('*'),
      ]);

      if (cancelled) return;

      if (fetchError) setError(fetchError.message);
      // Ordem alfabética pelo nome do cliente (A → Z, sem acento/caixa
      // importar) — nunca por data de criação/status/ID. A ordenação só
      // acontece dentro do que a RLS já devolveu (toda a operação pro
      // admin, só a própria carteira pro consultor): o .select('*') acima
      // não tem nenhum filtro de escopo porque esse filtro já é automático
      // no banco (ver supabase/migrations/0084_isolamento_carteira_consultor.sql).
      else {
        const ordenadas = [...(data ?? [])].sort((a, b) =>
          a.nome_cliente.localeCompare(b.nome_cliente, 'pt-BR', { sensitivity: 'base' }),
        );
        setImplementacoes(ordenadas);
      }
      setConsultores(consultoresData ?? []);
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
        <div className="page-header-actions">
          <Link to="/configuracoes/pipefy" className="btn btn-secondary">
            Links do Pipefy
          </Link>
          <Link to="/implementacoes/checklist" className="btn btn-secondary">
            Editar checklist
          </Link>
        </div>
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
                  <td>{nomeConsultor(impl.consultor_responsavel_id, consultores) || '—'}</td>
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
