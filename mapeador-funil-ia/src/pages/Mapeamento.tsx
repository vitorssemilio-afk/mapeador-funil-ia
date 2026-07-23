import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { supabase } from '../lib/supabaseClient';
import type { FunilGerado, Mapeamento as MapeamentoType } from '../types/database';

export function Mapeamento() {
  const { id } = useParams<{ id: string }>();
  const [mapeamento, setMapeamento] = useState<MapeamentoType | null>(null);
  const [funis, setFunis] = useState<FunilGerado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const mapeamentoId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: mapeamentoData, error: mapeamentoError } = await supabase
        .from('mapeamentos')
        .select('*')
        .eq('id', mapeamentoId)
        .single();

      if (cancelled) return;

      if (mapeamentoError) {
        setError(mapeamentoError.message);
        setLoading(false);
        return;
      }

      setMapeamento(mapeamentoData);

      if (mapeamentoData.status === 'concluido') {
        const { data: funisData, error: funisError } = await supabase
          .from('funis_gerados')
          .select('*')
          .eq('mapeamento_id', mapeamentoId)
          .order('ordem', { ascending: true });

        if (!cancelled) {
          if (funisError) setError(funisError.message);
          else setFunis(funisData ?? []);
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const respostasPreenchidas = Object.keys(mapeamento.respostas ?? {}).length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{mapeamento.nome_negocio}</h1>
          <StatusBadge status={mapeamento.status} />
        </div>
      </div>

      <section className="card">
        <h2>Respostas do mapeamento</h2>
        {respostasPreenchidas ? (
          <pre className="respostas-preview">{JSON.stringify(mapeamento.respostas, null, 2)}</pre>
        ) : (
          <p className="field-hint">
            O formulário de mapeamento ainda não foi preenchido nesta versão.
          </p>
        )}
      </section>

      {mapeamento.status === 'concluido' && (
        <section className="card">
          <h2>Funis gerados</h2>
          {funis.length === 0 ? (
            <p className="field-hint">Nenhum funil encontrado para este mapeamento.</p>
          ) : (
            <div className="funis-grid">
              {funis.map((funil) => (
                <div key={funil.id} className="funil-card">
                  <h3>{funil.nome_funil}</h3>
                  <span className="tipo-funil-badge">{funil.tipo_funil}</span>
                  {funil.justificativa && <p className="field-hint">{funil.justificativa}</p>}
                  <p className="field-hint">{funil.etapas.length} etapa(s)</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {mapeamento.status !== 'concluido' && (
        <section className="card">
          <button type="button" className="btn btn-primary" disabled>
            Gerar funil (IA)
          </button>
          <p className="field-hint">
            A geração automática de funis pela IA será habilitada em uma próxima fase.
          </p>
        </section>
      )}
    </div>
  );
}
