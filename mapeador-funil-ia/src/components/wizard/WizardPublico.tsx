import { useEffect, useRef, useState } from 'react';
import { perguntaVisivel, type BlocoFormulario } from '../../data/formSchema';
import { carregarFormSchema } from '../../lib/formSchemaService';
import { supabase } from '../../lib/supabaseClient';
import type { MapeamentoPublico } from '../../types/database';
import { PerguntaField } from './PerguntaField';
import { ResumoWizard } from './ResumoWizard';

const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  mapeamento: MapeamentoPublico;
  onEnviado: () => void;
};

function temResposta(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'string') return valor.trim().length > 0;
  if (typeof valor === 'number') return true;
  return false;
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'saving':
      return 'Salvando…';
    case 'saved':
      return 'Alterações salvas';
    case 'error':
      return 'Não foi possível salvar';
    default:
      return '';
  }
}

export function WizardPublico({ mapeamento, onEnviado }: Props) {
  const [blocos, setBlocos] = useState<BlocoFormulario[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [respostas, setRespostas] = useState<Record<string, unknown>>(mapeamento.respostas ?? {});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const respostasRef = useRef(respostas);
  respostasRef.current = respostas;

  useEffect(() => {
    let cancelled = false;

    async function loadSchema() {
      setSchemaLoading(true);
      setSchemaError(null);
      try {
        const data = await carregarFormSchema(mapeamento.tipo);
        if (!cancelled) setBlocos(data);
      } catch {
        if (!cancelled) setSchemaError('Não foi possível carregar as perguntas do formulário.');
      } finally {
        if (!cancelled) setSchemaLoading(false);
      }
    }

    loadSchema();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        void persist(respostasRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(nextRespostas: Record<string, unknown>) {
    setSaveStatus('saving');
    const { error } = await supabase.rpc('public_save_respostas', {
      p_id: mapeamento.id,
      p_respostas: nextRespostas,
      p_finalizar: false,
    });
    setSaveStatus(error ? 'error' : 'saved');
  }

  function scheduleSave(nextRespostas: Record<string, unknown>) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null;
      persist(nextRespostas);
    }, AUTOSAVE_DELAY_MS);
  }

  function handleChange(id: string, value: unknown) {
    setRespostas((prev) => {
      const next = { ...prev, [id]: value };
      scheduleSave(next);
      return next;
    });
  }

  function flushSave() {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
      persist(respostasRef.current);
    }
  }

  function goNext() {
    flushSave();
    setStep((s) => Math.min(s + 1, blocos.length));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    flushSave();
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleEnviar() {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.rpc('public_save_respostas', {
      p_id: mapeamento.id,
      p_respostas: respostasRef.current,
      p_finalizar: true,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError('Não foi possível enviar suas respostas. Tente novamente em instantes.');
      return;
    }

    onEnviado();
  }

  if (schemaLoading) return <div className="page-loading">Carregando formulário…</div>;
  if (schemaError) return <p className="form-error">{schemaError}</p>;

  const totalSteps = blocos.length + 1;
  const resumoStep = blocos.length;
  const isResumo = step === resumoStep;
  const blocoAtual = isResumo ? null : blocos[step];
  const perguntasVisiveis = blocoAtual
    ? blocoAtual.perguntas.filter((p) => perguntaVisivel(p, respostas))
    : [];
  const podeAvancar = perguntasVisiveis.every((p) => !p.obrigatoria || temResposta(respostas[p.id]));

  return (
    <div className="wizard">
      <div className="wizard-progress-bar">
        <div
          className="wizard-progress-fill"
          style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
        />
      </div>
      <div className="wizard-progress-label">
        <span>{isResumo ? 'Resumo' : `Etapa ${step + 1} de ${blocos.length}`}</span>
        <span className="save-status">{saveStatusLabel(saveStatus)}</span>
      </div>

      <div className="card wizard-card">
        {isResumo ? (
          <ResumoWizard
            blocos={blocos}
            respostas={respostas}
            titulo="Revise suas respostas"
            mensagem="Confira tudo antes de enviar. Você pode voltar para ajustar qualquer bloco."
          />
        ) : (
          <>
            <h2>{blocoAtual!.titulo}</h2>
            <div className="wizard-questions">
              {perguntasVisiveis.map((p) => (
                <PerguntaField key={p.id} pergunta={p} respostas={respostas} onChange={handleChange} />
              ))}
            </div>
          </>
        )}

        {submitError && <p className="form-error">{submitError}</p>}

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={goBack} disabled={step === 0}>
            Voltar
          </button>
          {isResumo ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleEnviar}
              disabled={submitting}
            >
              {submitting ? 'Enviando…' : 'Enviar respostas'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={goNext} disabled={!podeAvancar}>
              Continuar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}