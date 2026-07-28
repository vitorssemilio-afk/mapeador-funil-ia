import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FunilDetalhado } from '../components/funil/FunilDetalhado';
import { StatusBadge } from '../components/StatusBadge';
import { MapeamentoWizard } from '../components/wizard/MapeamentoWizard';
import { useAuth } from '../contexts/AuthContext';
import { exportarFunisParaExcel } from '../lib/exportXlsx';
import { supabase } from '../lib/supabaseClient';
import type { EtapaFunil, FunilGerado, Mapeamento as MapeamentoType } from '../types/database';

export function Mapeamento() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mapeamento, setMapeamento] = useState<MapeamentoType | null>(null);
  const [funis, setFunis] = useState<FunilGerado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retomando, setRetomando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

  useEffect(() => {
    if (!id) return;
    const mapeamentoId = id;
    let cancelled = false;
    setRetomando(false);

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

  async function handleStatusChange(atualizado: MapeamentoType) {
    setMapeamento(atualizado);

    if (atualizado.status === 'concluido') {
      const { data: funisData, error: funisError } = await supabase
        .from('funis_gerados')
        .select('*')
        .eq('mapeamento_id', atualizado.id)
        .order('ordem', { ascending: true });

      if (funisError) setError(funisError.message);
      else setFunis(funisData ?? []);
    }
  }

  function handleEtapasChange(funilId: string, novasEtapas: EtapaFunil[]) {
    setFunis((prev) =>
      prev.map((funil) => (funil.id === funilId ? { ...funil, etapas: novasEtapas } : funil)),
    );
  }

  async function handleExportar() {
    if (!mapeamento) return;
    setExportando(true);
    try {
      await exportarFunisParaExcel(mapeamento.nome_negocio, funis);
    } finally {
      setExportando(false);
    }
  }

  async function handleCopiarLink() {
    if (!mapeamento) return;
    const link = `${window.location.origin}/formulario/${mapeamento.id}`;
    await navigator.clipboard.writeText(link);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  async function handleDuplicar() {
    if (!mapeamento || !user) return;
    setDuplicando(true);

    const { data, error: dupError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        nome_negocio: `${mapeamento.nome_negocio} (cópia)`,
        status: 'em_preenchimento',
        respostas: mapeamento.respostas,
      })
      .select()
      .single();

    setDuplicando(false);

    if (dupError) {
      setError(dupError.message);
      return;
    }

    navigate(`/mapeamento/${data.id}`);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const podeRetomar = mapeamento.status === 'em_preenchimento' || mapeamento.status === 'erro';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{mapeamento.nome_negocio}</h1>
          <StatusBadge status={mapeamento.status} />
          {mapeamento.enviado_pelo_cliente && (
            <span className="status-badge status-concluido">Cliente respondeu</span>
          )}
        </div>
        <div className="page-header-actions">
          {!mapeamento.enviado_pelo_cliente && (
            <button type="button" className="btn btn-secondary" onClick={handleCopiarLink}>
              {linkCopiado ? 'Link copiado!' : 'Copiar link para o cliente'}
            </button>
          )}
          {mapeamento.status === 'concluido' && funis.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportar}
              disabled={exportando}
            >
              {exportando ? 'Exportando…' : 'Exportar para Excel'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDuplicar}
            disabled={duplicando}
          >
            {duplicando ? 'Duplicando…' : 'Duplicar como novo mapeamento'}
          </button>
        </div>
      </div>

      {mapeamento.status === 'em_preenchimento' && !retomando && (
        <section className="card">
          <h2>Continue seu mapeamento</h2>
          <p className="field-hint">
            Você já começou a responder o formulário. Retome de onde parou para gerar o funil.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setRetomando(true)}>
            Retomar formulário
          </button>
        </section>
      )}

      {mapeamento.status === 'erro' && !retomando && (
        <section className="card">
          <h2>Não foi possível gerar o funil</h2>
          <p className="field-hint">Revise as respostas e tente novamente.</p>
          <button type="button" className="btn btn-primary" onClick={() => setRetomando(true)}>
            Revisar e tentar novamente
          </button>
        </section>
      )}

      {podeRetomar && retomando && (
        <MapeamentoWizard mapeamento={mapeamento} onStatusChange={handleStatusChange} />
      )}

      {mapeamento.status === 'processando_ia' && (
        <section className="card processando-card">
          <div className="spinner" aria-hidden="true" />
          <p>Analisando as respostas e montando seu funil...</p>
        </section>
      )}

      {mapeamento.status === 'concluido' &&
        (funis.length === 0 ? (
          <section className="card">
            <p className="field-hint">Nenhum funil encontrado para este mapeamento.</p>
          </section>
        ) : (
          funis.map((funil) => (
            <FunilDetalhado key={funil.id} funil={funil} onChange={handleEtapasChange} />
          ))
        ))}
    </div>
  );
}
