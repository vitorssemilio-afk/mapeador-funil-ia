import { useEffect, useRef, useState } from 'react';
import { FORM_BLOCKS } from '../../data/formSchema';
import { supabase } from '../../lib/supabaseClient';
import type { Mapeamento } from '../../types/database';
import { PerguntaField } from './PerguntaField';
import { ResumoWizard } from './ResumoWizard';

const AUTOSAVE_DELAY_MS = 1000;
const TOTAL_STEPS = FORM_BLOCKS.length + 1;
const RESUMO_STEP = FORM_BLOCKS.length;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  mapeamento: Mapeamento;
  onStatusChange: (mapeamento: Mapeamento) => void;
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

export function MapeamentoWizard({ mapeamento, onStatusChange }: Props) {
  const [step, setStep] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, unknown>>(mapeamento.respostas ?? {});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const respostasRef = useRef(respostas);
  respostasRef.current = respostas;

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

    const nomeQ0 = nextRespostas.q0_nome_empresa;
    const nomeNegocio =
      typeof nomeQ0 === 'string' && nomeQ0.trim() ? nomeQ0.trim() : mapeamento.nome_negocio;

    const { error } = await supabase
      .from('mapeamentos')
      .update({ respostas: nextRespostas, nome_negocio: nomeNegocio })
      .eq('id', mapeamento.id);

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
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    flushSave();
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleGerarFunil() {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    setSubmitting(true);
    setSubmitError(null);

    await persist(respostasRef.current);

    const { error: fnError } = await supabase.functions.invoke('gerar-funil', {
      body: { mapeamento_id: mapeamento.id },
    });

    if (fnError) {
      setSubmitting(false);
      setSubmitError('Não foi possível gerar o funil. Tente novamente em instantes.');
      return;
    }

    const { data: atualizado, error: refetchError } = await supabase
      .from('mapeamentos')
      .select('*')
      .eq('id', mapeamento.id)
      .single();

    setSubmitting(false);

    if (refetchError || !atualizado) {
      setSubmitError('O funil foi gerado, mas não foi possível atualizar a tela. Recarregue a página.');
      return;
    }

    if (atualizado.status === 'erro') {
      setSubmitError('A IA não conseguiu gerar o funil. Tente novamente.');
    }

    onStatusChange(atualizado);
  }

  const isResumo = step === RESUMO_STEP;
  const blocoAtual = isResumo ? null : FORM_BLOCKS[step];
  const podeAvancar =
    !blocoAtual || blocoAtual.perguntas.every((p) => !p.obrigatoria || temResposta(respostas[p.id]));

  return (
    <div className="wizard">
      <div className="wizard-progress-bar">
        <div
          className="wizard-progress-fill"
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>
      <div className="wizard-progress-label">
        <span>{isResumo ? 'Resumo' : `Etapa ${step + 1} de ${FORM_BLOCKS.length}`}</span>
        <span className="save-status">{saveStatusLabel(saveStatus)}</span>
      </div>

      <div className="card wizard-card">
        {isResumo ? (
          <ResumoWizard respostas={respostas} />
        ) : (
          <>
            <h2>{blocoAtual!.titulo}</h2>
            <div className="wizard-questions">
              {blocoAtual!.perguntas.map((p) => (
                <PerguntaField key={p.id} pergunta={p} respostas={respostas} onChange={handleChange} />
              ))}
            </div>
          </>
        )}

        {isResumo && submitting && (
          <p className="field-hint">Gerando seu funil com IA, isso pode levar até 1 minuto…</p>
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
              onClick={handleGerarFunil}
              disabled={submitting}
            >
              {submitting ? 'Enviando…' : 'Gerar meu funil com IA'}
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
