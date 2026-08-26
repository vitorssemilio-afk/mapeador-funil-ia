import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { WizardPublico } from '../components/wizard/WizardPublico';
import { supabase } from '../lib/supabaseClient';
import type { MapeamentoPublico } from '../types/database';

export function FormularioPublico() {
  const { id, codigo } = useParams<{ id?: string; codigo?: string }>();
  const [mapeamento, setMapeamento] = useState<MapeamentoPublico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const tituloFormulario =
    mapeamento?.tipo === 'pos_venda'
      ? 'Formulário de Pós-venda'
      : 'Formulário de Diagnóstico Comercial';

  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = tituloFormulario;
    return () => {
      document.title = tituloAnterior;
    };
  }, [tituloFormulario]);

  useEffect(() => {
    if (!id && !codigo) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = codigo
        ? await supabase.rpc('public_get_mapeamento_by_codigo', { p_codigo: codigo })
        : await supabase.rpc('public_get_mapeamento', { p_id: id as string });

      if (cancelled) return;

      if (fetchError || !data || data.length === 0) {
        setError('Não conseguimos encontrar este formulário. Verifique se o link está correto.');
        setLoading(false);
        return;
      }

      const registro = data[0];
      setMapeamento(registro);
      setEnviado(registro.enviado_pelo_cliente);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, codigo]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            V4
          </span>
          {tituloFormulario}
        </span>
      </header>
      <main className="app-main">
        <div className="page">
          {loading && <div className="page-loading">Carregando…</div>}
          {!loading && error && <p className="form-error">{error}</p>}

          {!loading && !error && mapeamento && enviado && (
            <section className="card">
              <h2>Obrigado!</h2>
              <p className="field-hint">
                Recebemos suas respostas. Nossa equipe vai analisar as informações e entrar em
                contato em breve.
              </p>
            </section>
          )}

          {!loading && !error && mapeamento && !enviado && (
            <>
              <div className="page-header">
                <div>
                  <h1>{mapeamento.nome_negocio}</h1>
                  <p className="field-hint">
                    {mapeamento.tipo === 'pos_venda'
                      ? 'Preencha as perguntas abaixo sobre o relacionamento com o cliente depois da venda.'
                      : 'Preencha as perguntas abaixo sobre o seu processo comercial.'}
                  </p>
                </div>
              </div>
              <WizardPublico mapeamento={mapeamento} onEnviado={() => setEnviado(true)} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
