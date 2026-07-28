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
  const [versoesDisponiveis, setVersoesDisponiveis] = useState<number[]>([]);
  const [versaoSelecionada, setVersaoSelecionada] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retomando, setRetomando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [mostrarRegenerar, setMostrarRegenerar] = useState(false);
  const [instrucoesExtras, setInstrucoesExtras] = useState('');
  const [regenerando, setRegenerando] = useState(false);
  const [regenerarError, setRegenerarError] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  async function carregarFunis(mapeamentoId: string, versaoAlvo?: number) {
    const { data: versoesData, error: versoesError } = await supabase
      .from('funis_gerados')
      .select('versao')
      .eq('mapeamento_id', mapeamentoId)
      .order('versao', { ascending: false });

    if (versoesError) {
      setError(versoesError.message);
      return;
    }

    const versoes = Array.from(new Set((versoesData ?? []).map((v) => v.versao)));
    setVersoesDisponiveis(versoes);

    const alvo = versaoAlvo ?? versoes[0];
    setVersaoSelecionada(alvo ?? null);

    if (alvo === undefined) {
      setFunis([]);
      return;
    }

    const { data: funisData, error: funisError } = await supabase
      .from('funis_gerados')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', alvo)
      .order('ordem', { ascending: true });

    if (funisError) setError(funisError.message);
    else setFunis(funisData ?? []);
  }

  useEffect(() => {
    if (!id) return;
    const mapeamentoId = id;
    let cancelled = false;
    setRetomando(false);
    setMostrarRegenerar(false);
    setInstrucoesExtras('');
    setRegenerarError(null);

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

      if (mapeamentoData.status === 'concluido' || mapeamentoData.status === 'erro') {
        await carregarFunis(mapeamentoId);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleStatusChange(atualizado: MapeamentoType) {
    setMapeamento(atualizado);

    if (atualizado.status === 'concluido') {
      await carregarFunis(atualizado.id);
    }
  }

  function handleVerVersao(versao: number) {
    if (!mapeamento) return;
    carregarFunis(mapeamento.id, versao);
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
    const link = `${window.location.origin}/f/${mapeamento.codigo_curto}`;
    await navigator.clipboard.writeText(link);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  async function handleExcluir() {
    if (!mapeamento) return;
    if (
      !window.confirm(
        `Excluir o mapeamento "${mapeamento.nome_negocio}"? Essa ação não pode ser desfeita e também apaga os funis gerados a partir dele.`,
      )
    ) {
      return;
    }

    setExcluindo(true);
    const { error: deleteError } = await supabase.from('mapeamentos').delete().eq('id', mapeamento.id);
    setExcluindo(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/');
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

  async function handleRegenerar() {
    if (!mapeamento || !instrucoesExtras.trim()) return;
    setRegenerando(true);
    setRegenerarError(null);

    const { error: fnError } = await supabase.functions.invoke('gerar-funil', {
      body: { mapeamento_id: mapeamento.id, instrucoes_extras: instrucoesExtras.trim() },
    });

    if (fnError) {
      setRegenerando(false);
      setRegenerarError('Não foi possível gerar uma nova versão. Tente novamente em instantes.');
      return;
    }

    const { data: atualizado, error: refetchError } = await supabase
      .from('mapeamentos')
      .select('*')
      .eq('id', mapeamento.id)
      .single();

    if (refetchError || !atualizado) {
      setRegenerando(false);
      setRegenerarError('A nova versão foi gerada, mas não deu pra atualizar a tela. Recarregue a página.');
      return;
    }

    setMapeamento(atualizado);
    await carregarFunis(atualizado.id);

    if (atualizado.status === 'erro') {
      setRegenerarError('A IA não conseguiu gerar a nova versão. Tente novamente.');
    } else {
      setMostrarRegenerar(false);
      setInstrucoesExtras('');
    }

    setRegenerando(false);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const podeRetomar = mapeamento.status === 'em_preenchimento' || mapeamento.status === 'erro';
  const versaoMaisRecente = versoesDisponiveis[0];
  const temRespostas = Object.values(mapeamento.respostas ?? {}).some((valor) => {
    if (Array.isArray(valor)) return valor.length > 0;
    if (typeof valor === 'string') return valor.trim().length > 0;
    if (typeof valor === 'number') return true;
    return false;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{mapeamento.nome_negocio}</h1>
          <StatusBadge status={mapeamento.status} enviadoPeloCliente={mapeamento.enviado_pelo_cliente} />
        </div>
        <div className="page-header-actions">
          {!mapeamento.enviado_pelo_cliente && (
            <button type="button" className="btn btn-secondary" onClick={handleCopiarLink}>
              {linkCopiado ? 'Link copiado!' : 'Copiar link para o cliente'}
            </button>
          )}
          {funis.length > 0 && (
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
          <button type="button" className="btn btn-ghost" onClick={handleExcluir} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir mapeamento'}
          </button>
        </div>
      </div>

      {mapeamento.status === 'em_preenchimento' && !retomando && (
        <section className="card form-card">
          {mapeamento.enviado_pelo_cliente ? (
            <>
              <h2>Continue seu mapeamento</h2>
              <p className="field-hint">O cliente já respondeu. Revise as respostas e gere o funil.</p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
                Revisar e gerar funil
              </button>
            </>
          ) : temRespostas ? (
            <>
              <h2>Continue seu mapeamento</h2>
              <p className="field-hint">
                Você já começou a responder o formulário. Retome de onde parou para gerar o funil.
              </p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
                Retomar formulário
              </button>
            </>
          ) : (
            <>
              <h2>Aguardando o cliente</h2>
              <p className="field-hint">
                Copie o link acima e envie para o cliente responder o formulário. Assim que ele
                enviar as respostas, volte aqui para gerar o funil.
              </p>
              <button type="button" className="btn btn-ghost btn-auto" onClick={() => setRetomando(true)}>
                Preencher manualmente
              </button>
            </>
          )}
        </section>
      )}

      {mapeamento.status === 'erro' && !retomando && (
        <section className="card form-card">
          <h2>Não foi possível gerar o funil</h2>
          <p className="field-hint">Revise as respostas e tente novamente.</p>
          <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
            Revisar e tentar novamente
          </button>
        </section>
      )}

      {podeRetomar && retomando && (
        <MapeamentoWizard mapeamento={mapeamento} onStatusChange={handleStatusChange} iniciarNoResumo />
      )}

      {mapeamento.status === 'processando_ia' && (
        <section className="card processando-card">
          <div className="spinner" aria-hidden="true" />
          <p>Analisando as respostas e montando seu funil...</p>
        </section>
      )}

      {mapeamento.status === 'concluido' && funis.length === 0 && (
        <section className="card">
          <p className="field-hint">Nenhum funil encontrado para este mapeamento.</p>
        </section>
      )}

      {funis.length > 0 && (
        <>
          {versoesDisponiveis.length > 1 && (
            <div className="page-header-actions">
              <span className="field-hint">Versão:</span>
              {versoesDisponiveis.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={v === versaoSelecionada ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => handleVerVersao(v)}
                >
                  {v === versaoMaisRecente ? `Versão ${v} (atual)` : `Versão ${v}`}
                </button>
              ))}
            </div>
          )}

          {funis.map((funil) => (
            <FunilDetalhado
              key={funil.id}
              funil={funil}
              onChange={handleEtapasChange}
              somenteLeitura={versaoSelecionada !== versaoMaisRecente}
            />
          ))}
        </>
      )}

      {mapeamento.status === 'concluido' && funis.length > 0 && (
        <section className="card form-card">
          {!mostrarRegenerar ? (
            <>
              <h2>Regenerar com instruções extras</h2>
              <p className="field-hint">
                Peça pra IA gerar de novo considerando algo específico — ex: "trate convênio e
                particular como funis separados". A versão atual não é perdida, fica guardada no
                histórico.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={() => setMostrarRegenerar(true)}
              >
                Regenerar com instruções extras
              </button>
            </>
          ) : (
            <>
              <h2>Instruções extras</h2>
              <label className="field">
                <span>O que a IA deve considerar nessa nova versão?</span>
                <textarea
                  rows={3}
                  value={instrucoesExtras}
                  onChange={(e) => setInstrucoesExtras(e.target.value)}
                  placeholder="Ex: trate convênio e particular como funis separados"
                  autoFocus
                />
              </label>
              {regenerando && (
                <p className="field-hint">Gerando nova versão, isso pode levar até 1 minuto…</p>
              )}
              {regenerarError && <p className="form-error">{regenerarError}</p>}
              <div className="wizard-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setMostrarRegenerar(false);
                    setInstrucoesExtras('');
                    setRegenerarError(null);
                  }}
                  disabled={regenerando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRegenerar}
                  disabled={regenerando || !instrucoesExtras.trim()}
                >
                  {regenerando ? 'Gerando…' : 'Gerar nova versão'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
