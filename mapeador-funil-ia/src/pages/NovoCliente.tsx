import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export function NovoCliente() {
  const navigate = useNavigate();
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [segmento, setSegmento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nomeEmpresa.trim()) return;

    setSalvando(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('clientes')
      .insert({
        nome_empresa: nomeEmpresa.trim(),
        nome_contato: nomeContato.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        segmento: segmento.trim() || null,
      })
      .select()
      .single();

    setSalvando(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/clientes/${data.id}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Novo cliente</h1>
      </div>

      <form onSubmit={handleSubmit} className="card form-card">
        {error && <p className="form-error">{error}</p>}

        <label className="field">
          <span>Nome da empresa</span>
          <input
            type="text"
            required
            autoFocus
            value={nomeEmpresa}
            onChange={(e) => setNomeEmpresa(e.target.value)}
            placeholder="Ex: Colégio Ieprol"
          />
        </label>

        <div className="form-grid">
          <label className="field">
            <span>Nome do contato</span>
            <input
              type="text"
              value={nomeContato}
              onChange={(e) => setNomeContato(e.target.value)}
              placeholder="Quem você fala do lado do cliente"
            />
          </label>

          <label className="field">
            <span>Telefone/WhatsApp</span>
            <input
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Segmento/nicho</span>
            <input
              type="text"
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              placeholder="Ex: Educação, Varejo, Saúde"
            />
          </label>
        </div>

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nomeEmpresa.trim()}>
            {salvando ? 'Criando…' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
