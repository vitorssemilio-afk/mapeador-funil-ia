import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FunilDetalhado } from '../components/funil/FunilDetalhado';
import { StatusBadge } from '../components/StatusBadge';
import { MapeamentoWizard } from '../components/wizard/MapeamentoWizard';
import { ResumoWizard } from '../components/wizard/ResumoWizard';
import { useAuth } from '../contexts/AuthContext';
import type { BlocoFormulario } from '../data/formSchema';
import { exportarFunisParaExcel } from '../lib/exportXlsx';
import { carregarFormSchema } from '../lib/formSchemaService';
import { supabase } from '../lib/supabaseClient';
import type {
  EtapaFunil,
  FunilGerado,
  GeracaoMeta,
  ImplementacaoCrm,
  Mapeamento as MapeamentoType,
} from '../types/database';

const NIVEL_COMPLEXIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export function Mapeamento() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mapeamento, setMapeamento] = useState<MapeamentoType | null>(null);
  const [funis, setFunis] = useState<FunilGerado[]>([]);
  const [geracaoMeta, setGeracaoMeta] = useState<GeracaoMeta | null>(null);
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
  const [implementacaoExistente, setImplementacaoExistente] = useState<ImplementacaoCrm | null>(null);
  const [iniciandoImplementacao, setIniciandoImplementacao] = useState(false);
  const [blocosFormulario, setBlocosFormulario] = useState<BlocoFormulario[]>([]);
  const [mostrarRespostas, setMostrarRespostas] = useState(false);
  const [posVendaExistente, setPosVendaExistente] = useState<MapeamentoType | null>(null);
  const [criandoPosVenda, setCriandoPosVenda] = useState(false);

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
      setGeracaoMeta(null);
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

    const { data: metaData } = await supabase
      .from('geracoes_meta')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', alvo)
      .maybeSingle();

    setGeracaoMeta(metaData ?? null);
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

      if (
        mapeamentoData.status === 'concluido' ||
        mapeamentoData.status === 'erro' ||
        mapeamentoData.status === 'aguardando_esclarecimento'
      ) {
        await carregarFunis(mapeamentoId);
      }

      const { data: implementacaoData } = await supabase
        .from('implementacoes_crm')
        .select('*')
        .eq('mapeamento_id', mapeamentoId)
        .maybeSingle();

      if (!cancelled) setImplementacaoExistente(implementacaoData ?? null);

      if (mapeamentoData.tipo === 'vendas') {
        const { data: posVendaData } = await supabase
          .from('mapeamentos')
          .select('*')
          .eq('mapeamento_origem_id', mapeamentoId)
          .eq('tipo', 'pos_venda')
          .maybeSingle();

        if (!cancelled) setPosVendaExistente(posVendaData ?? null);
      }

      if (mapeamentoData.status === 'concluido') {
        try {
          const blocos = await carregarFormSchema(mapeamentoData.tipo);
          if (!cancelled) setBlocosFormulario(blocos);
        } catch {
          // se não der pra carregar o schema, a seção de respostas simplesmente não aparece
        }
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

  async function handleIniciarImplementacao() {
    if (!mapeamento || !user) return;
    setIniciandoImplementacao(true);

    const { data, error: insertError } = await supabase
      .from('implementacoes_crm')
      .insert({
        mapeamento_id: mapeamento.id,
        user_id: user.id,
        nome_cliente: mapeamento.nome_negocio,
        status: 'pre_requisito',
      })
      .select()
      .single();

    setIniciandoImplementacao(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/implementacoes/${data.id}`);
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
        tipo: mapeamento.tipo,
        mapeamento_origem_id: mapeamento.mapeamento_origem_id,
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

  async function handleGerarPosVenda() {
    if (!mapeamento || !user) return;
    setCriandoPosVenda(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        nome_negocio: mapeamento.nome_negocio,
        status: 'em_preenchimento',
        respostas: {},
        tipo: 'pos_venda',
        mapeamento_origem_id: mapeamento.id,
      })
      .select()
      .single();

    setCriandoPosVenda(false);

    if (insertError) {
      setError(insertError.message);
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
    } else if (atualizado.status === 'aguardando_esclarecimento') {
      setInstrucoesExtras('');
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
  const perguntasIA = Array.isArray(mapeamento.respostas?._perguntas_ia)
    ? (mapeamento.respostas._perguntas_ia as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{mapeamento.nome_negocio}</h1>
          <StatusBadge status={mapeamento.status} enviadoPeloCliente={mapeamento.enviado_pelo_cliente} />
          {mapeamento.tipo === 'pos_venda' && mapeamento.mapeamento_origem_id && (
            <p className="field-hint">
              Formulário de pós-venda —{' '}
              <Link to={`/mapeamento/${mapeamento.mapeamento_origem_id}`}>ver mapeamento de vendas</Link>
            </p>
          )}
        </div>
        <div className="page-header-actions">
          {mapeamento.tipo === 'vendas' &&
            mapeamento.status === 'concluido' &&
            (posVendaExistente ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/mapeamento/${posVendaExistente.id}`)}
              >
                Ver formulário de pós-venda
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGerarPosVenda}
                disabled={criandoPosVenda}
              >
                {criandoPosVenda ? 'Gerando…' : 'Gerar formulário de pós-venda'}
              </button>
            ))}
          {funis.length > 0 && (
            <Link
              to={`/mapeamento/${mapeamento.id}/relatorio`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Ver relatório (PDF/PPTX)
            </Link>
          )}
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
          {mapeamento.tipo === 'vendas' &&
            mapeamento.status === 'concluido' &&
            (implementacaoExistente ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/implementacoes/${implementacaoExistente.id}`)}
              >
                Ver implementação de CRM
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIniciarImplementacao}
                disabled={iniciandoImplementacao}
              >
                {iniciandoImplementacao ? 'Iniciando…' : 'Iniciar implementação de CRM'}
              </button>
            ))}
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

      {mapeamento.status === 'aguardando_esclarecimento' && (
        <section className="card form-card">
          <h2>A IA precisa de mais informações</h2>
          <p className="field-hint">
            Antes de gerar o funil, responda as perguntas abaixo (ou repasse pro cliente) e envie
            como instruções extras.
          </p>
          <ul className="perguntas-ia-lista">
            {perguntasIA.map((pergunta, i) => (
              <li key={i}>{pergunta}</li>
            ))}
          </ul>
          <label className="field">
            <span>Suas respostas</span>
            <textarea
              rows={4}
              value={instrucoesExtras}
              onChange={(e) => setInstrucoesExtras(e.target.value)}
              placeholder="Responda as perguntas acima com o que você sabe sobre o negócio"
              autoFocus
            />
          </label>
          {regenerando && <p className="field-hint">Gerando funil, isso pode levar até 1 minuto…</p>}
          {regenerarError && <p className="form-error">{regenerarError}</p>}
          <button
            type="button"
            className="btn btn-primary btn-auto"
            onClick={handleRegenerar}
            disabled={regenerando || !instrucoesExtras.trim()}
          >
            {regenerando ? 'Gerando…' : 'Gerar funil'}
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

          {geracaoMeta &&
            (geracaoMeta.pontos_para_validar.length > 0 ||
              geracaoMeta.transicoes_entre_funis.length > 0 ||
              geracaoMeta.indicadores_dashboard.length > 0 ||
              geracaoMeta.nivel_complexidade) && (
              <section className="card geracao-meta-card">
                {geracaoMeta.nivel_complexidade && (
                  <div className="estimativa-badge">
                    <span className={`estimativa-nivel estimativa-nivel-${geracaoMeta.nivel_complexidade}`}>
                      Complexidade {NIVEL_COMPLEXIDADE_LABELS[geracaoMeta.nivel_complexidade]}
                    </span>
                    {geracaoMeta.semanas_estimadas != null && (
                      <span className="estimativa-semanas">
                        ~{geracaoMeta.semanas_estimadas}{' '}
                        {geracaoMeta.semanas_estimadas === 1 ? 'semana' : 'semanas'} de implementação
                      </span>
                    )}
                    {geracaoMeta.observacao_estimativa && (
                      <p className="field-hint">{geracaoMeta.observacao_estimativa}</p>
                    )}
                  </div>
                )}

                {geracaoMeta.transicoes_entre_funis.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Transições entre funis</h3>
                    <ul className="transicoes-lista">
                      {geracaoMeta.transicoes_entre_funis.map((t, i) => (
                        <li key={i}>
                          <strong>{t.de_funil}</strong> → <strong>{t.para_funil}</strong>: {t.condicao}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {geracaoMeta.pontos_para_validar.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Pontos para validar com o cliente</h3>
                    <ul className="perguntas-ia-lista">
                      {geracaoMeta.pontos_para_validar.map((ponto, i) => (
                        <li key={i}>{ponto}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {geracaoMeta.indicadores_dashboard.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Indicadores sugeridos para o dashboard no CRM</h3>
                    <ul className="perguntas-ia-lista">
                      {geracaoMeta.indicadores_dashboard.map((indicador, i) => (
                        <li key={i}>{indicador}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
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

      {mapeamento.status === 'concluido' && blocosFormulario.length > 0 && (
        <section className="card form-card">
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => setMostrarRespostas((v) => !v)}
            >
              {mostrarRespostas ? 'Ocultar respostas do formulário' : 'Ver respostas do formulário'}
            </button>
            <Link
              to={`/mapeamento/${mapeamento.id}/respostas`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Baixar respostas em PDF
            </Link>
          </div>
          {mostrarRespostas && (
            <ResumoWizard
              blocos={blocosFormulario}
              respostas={mapeamento.respostas}
              titulo="Respostas do formulário"
              mensagem="Essas foram as respostas usadas para gerar o funil."
            />
          )}
        </section>
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
