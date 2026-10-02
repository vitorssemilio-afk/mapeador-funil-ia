// Módulo de Templates de Implementação — modal mostrado no momento de
// iniciar uma implementação nova (seção 17 do pedido). Só lista templates
// com status 'ativo' (os únicos aplicáveis) e mostra um resumo antes de
// confirmar. Aplicar é sempre uma escolha explícita — "Continuar sem
// template" segue o fluxo de sempre, sem nenhuma mudança de comportamento.
import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabaseClient';
import type { TemplateImplementacao } from '../types/database';

type Props = {
  implementacaoId: string;
  onConcluido: () => void;
};

type TemplateComContagens = TemplateImplementacao & {
  qtdAtividades: number;
  qtdReunioes: number;
  qtdCriterios: number;
};

export function AplicarTemplateModal({ implementacaoId, onConcluido }: Props) {
  const { mostrarToast } = useToast();
  const [templates, setTemplates] = useState<TemplateComContagens[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateSelecionadoId, setTemplateSelecionadoId] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      const { data: ativos } = await supabase
        .from('templates_implementacao')
        .select('*')
        .eq('status', 'ativo')
        .order('nome', { ascending: true });

      const lista = ativos ?? [];
      const ids = lista.map((t) => t.id);

      const [{ data: atividades }, { data: reunioes }, { data: criterios }] = await Promise.all([
        ids.length
          ? supabase.from('template_atividades').select('template_id').in('template_id', ids)
          : Promise.resolve({ data: [] as { template_id: string }[] }),
        ids.length
          ? supabase.from('template_reunioes').select('template_id').in('template_id', ids)
          : Promise.resolve({ data: [] as { template_id: string }[] }),
        ids.length
          ? supabase.from('template_criterios').select('template_id').in('template_id', ids)
          : Promise.resolve({ data: [] as { template_id: string }[] }),
      ]);

      function contar(rows: { template_id: string }[] | null, id: string): number {
        return (rows ?? []).filter((r) => r.template_id === id).length;
      }

      setTemplates(
        lista.map((t) => ({
          ...t,
          qtdAtividades: contar(atividades, t.id),
          qtdReunioes: contar(reunioes, t.id),
          qtdCriterios: contar(criterios, t.id),
        })),
      );
      setLoading(false);
    }
    carregar();
  }, []);

  const templateSelecionado = templates.find((t) => t.id === templateSelecionadoId) ?? null;

  async function handleAplicar() {
    if (!templateSelecionadoId) {
      onConcluido();
      return;
    }

    setAplicando(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('aplicar_template_implementacao', {
      p_implementacao_id: implementacaoId,
      p_template_id: templateSelecionadoId,
    });

    setAplicando(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    mostrarToast('Template aplicado.');
    onConcluido();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Template de implementação">
      <div className="card modal-card">
        <h2>Template de implementação</h2>
        <p className="field-hint">
          Opcional — só acelera a estrutura operacional (checklist, reuniões esperadas, critérios). O funil de
          vendas deste cliente continua sendo o que foi gerado por IA a partir do formulário, sem nenhuma relação
          com o template.
        </p>

        {loading ? (
          <p className="page-loading">Carregando templates…</p>
        ) : (
          <label className="field">
            <span>Escolha um template</span>
            <select value={templateSelecionadoId} onChange={(e) => setTemplateSelecionadoId(e.target.value)}>
              <option value="">Nenhum template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} (v{t.versao}){t.categoria ? ` — ${t.categoria}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {templateSelecionado && (
          <div className="card" style={{ background: 'var(--color-surface-raised)' }}>
            {templateSelecionado.descricao && <p className="field-hint">{templateSelecionado.descricao}</p>}
            <p className="field-hint">
              Inclui: {templateSelecionado.qtdAtividades} atividade(s) de checklist ·{' '}
              {templateSelecionado.qtdReunioes} reunião(ões) esperada(s) · {templateSelecionado.qtdCriterios}{' '}
              critério(s)
            </p>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={onConcluido} disabled={aplicando}>
            Continuar sem template
          </button>
          <button type="button" className="btn btn-primary" onClick={handleAplicar} disabled={aplicando || loading}>
            {aplicando ? 'Aplicando…' : templateSelecionadoId ? 'Aplicar template' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
