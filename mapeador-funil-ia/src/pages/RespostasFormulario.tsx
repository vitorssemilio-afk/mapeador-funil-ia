import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { perguntaVisivel, type BlocoFormulario } from '../data/formSchema';
import { formatValorPergunta } from '../data/formatRespostas';
import { carregarFormSchema } from '../lib/formSchemaService';
import { supabase } from '../lib/supabaseClient';
import type { Mapeamento } from '../types/database';
import './RespostasFormulario.css';

export function RespostasFormulario() {
  const { id } = useParams<{ id: string }>();
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [blocos, setBlocos] = useState<BlocoFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setError(null);

      const { data: mapeamentoData, error: mapeamentoError } = await supabase
        .from('mapeamentos')
        .select('*')
        .eq('id', id as string)
        .single();

      if (cancelled) return;

      if (mapeamentoError || !mapeamentoData) {
        setError('Mapeamento não encontrado.');
        setLoading(false);
        return;
      }

      try {
        const blocosData = await carregarFormSchema(mapeamentoData.tipo);
        if (!cancelled) setBlocos(blocosData);
      } catch (schemaError) {
        if (!cancelled) {
          setError(schemaError instanceof Error ? schemaError.message : 'Falha ao carregar o formulário.');
        }
      }

      setMapeamento(mapeamentoData);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const blocosComRespostas = blocos
    .map((bloco) => ({
      ...bloco,
      perguntas: bloco.perguntas.filter((p) => perguntaVisivel(p, mapeamento.respostas)),
    }))
    .filter((bloco) => bloco.perguntas.length > 0);

  return (
    <div className="respostas-viewport">
      <div className="respostas-toolbar no-print">
        <Link to={`/mapeamento/${mapeamento.id}`} className="btn btn-secondary">
          ← Voltar ao mapeamento
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF
        </button>
      </div>

      <div className="respostas-documento">
        <header className="respostas-cabecalho">
          <span className="respostas-tag">Formulário de Diagnóstico Comercial</span>
          <h1>{mapeamento.nome_negocio}</h1>
          <p className="respostas-data">Respostas em {new Date().toLocaleDateString('pt-BR')}</p>
        </header>

        {blocosComRespostas.length === 0 && (
          <p className="respostas-vazio">Nenhuma resposta registrada ainda.</p>
        )}

        {blocosComRespostas.map((bloco, index) => (
          <section key={`${index}-${bloco.titulo}`} className="respostas-bloco">
            <h2>{bloco.titulo}</h2>
            <dl className="respostas-lista">
              {bloco.perguntas.map((pergunta) => (
                <div key={pergunta.id} className="respostas-item">
                  <dt>{pergunta.label}</dt>
                  <dd>{formatValorPergunta(pergunta, mapeamento.respostas)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
