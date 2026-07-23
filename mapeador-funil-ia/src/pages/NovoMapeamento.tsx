import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function NovoMapeamento() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        nome_negocio: nomeNegocio,
        status: 'em_preenchimento',
        respostas: {},
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/mapeamento/${data.id}`);
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>Novo mapeamento</h1>
      </div>

      <form onSubmit={handleSubmit} className="card form-card">
        <label className="field">
          <span>Nome do negócio</span>
          <input
            type="text"
            required
            placeholder="Ex: Clínica Dr. Giullianno"
            value={nomeNegocio}
            onChange={(e) => setNomeNegocio(e.target.value)}
            autoFocus
          />
        </label>

        <p className="field-hint">
          O formulário de mapeamento do processo comercial será preenchido na próxima etapa.
        </p>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Criando…' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
