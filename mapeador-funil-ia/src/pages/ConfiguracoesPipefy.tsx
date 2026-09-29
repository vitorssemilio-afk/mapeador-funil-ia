import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { ConfiguracaoPipefy } from '../types/database';

type FormPipefy = {
  url_criacao_conta: string;
  url_extensao_14: string;
  url_extensao_7: string;
  url_contratacao_definitiva: string;
};

function paraForm(config: ConfiguracaoPipefy): FormPipefy {
  return {
    url_criacao_conta: config.url_criacao_conta ?? '',
    url_extensao_14: config.url_extensao_14 ?? '',
    url_extensao_7: config.url_extensao_7 ?? '',
    url_contratacao_definitiva: config.url_contratacao_definitiva ?? '',
  };
}

// Configuração global (uma linha só, sempre id = true) — não é por cliente.
// As URLs cadastradas aqui aparecem como CTA na seção Trial Kommo de toda
// implementação, sem precisar recadastrar pra cada cliente.
export function ConfiguracoesPipefy() {
  const [form, setForm] = useState<FormPipefy | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('configuracoes_pipefy')
        .select('*')
        .eq('id', true)
        .single();

      if (fetchError) setError(fetchError.message);
      else if (data) setForm(paraForm(data));
      setLoading(false);
    }
    carregar();
  }, []);

  async function handleSalvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;

    setSalvando(true);
    setSalvo(false);
    setError(null);

    const { error: updateError } = await supabase
      .from('configuracoes_pipefy')
      .update({
        url_criacao_conta: form.url_criacao_conta.trim() || null,
        url_extensao_14: form.url_extensao_14.trim() || null,
        url_extensao_7: form.url_extensao_7.trim() || null,
        url_contratacao_definitiva: form.url_contratacao_definitiva.trim() || null,
      })
      .eq('id', true);

    setSalvando(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Links do Pipefy</h1>
          <p className="field-hint">
            Cadastradas uma vez aqui, essas URLs aparecem como botão de ação na seção Trial Kommo de
            toda implementação — sem integração com a API do Pipefy nesta versão, só o link direto.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && form && (
        <form onSubmit={handleSalvar} className="card form-card">
          <label className="field">
            <span>URL de solicitação da criação da conta Kommo</span>
            <input
              type="url"
              value={form.url_criacao_conta}
              onChange={(e) => setForm({ ...form, url_criacao_conta: e.target.value })}
              placeholder="https://app.pipefy.com/..."
            />
          </label>
          <label className="field">
            <span>URL de solicitação de +14 dias</span>
            <input
              type="url"
              value={form.url_extensao_14}
              onChange={(e) => setForm({ ...form, url_extensao_14: e.target.value })}
              placeholder="https://app.pipefy.com/..."
            />
          </label>
          <label className="field">
            <span>URL de solicitação de +7 dias</span>
            <input
              type="url"
              value={form.url_extensao_7}
              onChange={(e) => setForm({ ...form, url_extensao_7: e.target.value })}
              placeholder="https://app.pipefy.com/..."
            />
          </label>
          <label className="field">
            <span>URL de contratação definitiva</span>
            <input
              type="url"
              value={form.url_contratacao_definitiva}
              onChange={(e) => setForm({ ...form, url_contratacao_definitiva: e.target.value })}
              placeholder="https://app.pipefy.com/..."
            />
          </label>
          <div className="wizard-actions">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
