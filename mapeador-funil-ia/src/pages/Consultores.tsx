import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Consultor } from '../types/database';

type FormConsultor = {
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  avatar_url: string;
  ativo: boolean;
  google_calendar_id: string;
};

const FORM_VAZIO: FormConsultor = {
  nome: '',
  email: '',
  telefone: '',
  cargo: '',
  avatar_url: '',
  ativo: true,
  google_calendar_id: '',
};

function paraForm(consultor: Consultor): FormConsultor {
  return {
    nome: consultor.nome,
    email: consultor.email,
    telefone: consultor.telefone ?? '',
    cargo: consultor.cargo ?? '',
    avatar_url: consultor.avatar_url ?? '',
    ativo: consultor.ativo,
    google_calendar_id: consultor.google_calendar_id ?? '',
  };
}

// CRUD do time de consultores — quem aparece nos seletores de "Consultor
// responsável"/"Consultor de apoio" na implementação de CRM. Excluir um
// consultor já vinculado a alguma implementação é barrado pelo próprio banco
// (FK sem "on delete"), então o caminho normal pra tirar alguém de circulação
// é desativar, não excluir.
export function Consultores() {
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormConsultor>(FORM_VAZIO);

  // E-mail da conta de serviço usada pra ler o Google Calendar de cada
  // consultor — não é segredo (é só o que se compartilha com qualquer app),
  // só a chave privada é sensível e nunca chega no front-end.
  const [emailContaServico, setEmailContaServico] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions
      .invoke<{ email?: string; error?: string }>('google-calendar-service-account-email')
      .then(({ data }) => {
        if (data?.email) setEmailContaServico(data.email);
      })
      .catch(() => {
        // Instrução de compartilhamento fica sem o e-mail pré-preenchido; não é bloqueante.
      });
  }, []);

  async function carregar() {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('consultores')
      .select('*')
      .order('nome', { ascending: true });

    if (fetchError) setError(fetchError.message);
    else setConsultores(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setMostrarForm(true);
  }

  function abrirEdicao(consultor: Consultor) {
    setEditandoId(consultor.id);
    setForm(paraForm(consultor));
    setMostrarForm(true);
  }

  function fecharForm() {
    setMostrarForm(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
  }

  async function handleSalvar(e: FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim()) return;

    setSalvando(true);
    setError(null);

    const payload = {
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim() || null,
      cargo: form.cargo.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      ativo: form.ativo,
      google_calendar_id: form.google_calendar_id.trim() || null,
    };

    const { error: saveError } = editandoId
      ? await supabase.from('consultores').update(payload).eq('id', editandoId)
      : await supabase.from('consultores').insert(payload);

    setSalvando(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharForm();
    carregar();
  }

  async function handleAlternarAtivo(consultor: Consultor) {
    setError(null);
    const { error: updateError } = await supabase
      .from('consultores')
      .update({ ativo: !consultor.ativo })
      .eq('id', consultor.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    carregar();
  }

  async function handleExcluir(consultor: Consultor) {
    if (!window.confirm(`Excluir o consultor "${consultor.nome}"?`)) return;

    setError(null);
    const { error: deleteError } = await supabase.from('consultores').delete().eq('id', consultor.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    carregar();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Consultores</h1>
          <p className="field-hint">
            Time que aparece nos seletores de consultor responsável/apoio das implementações. Um
            consultor já vinculado a alguma implementação não pode ser excluído (o banco recusa a
            exclusão) — use "Desativar" para tirá-lo de circulação sem perder o histórico.
          </p>
        </div>
        {!mostrarForm && (
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            + Novo consultor
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mostrarForm && (
        <form onSubmit={handleSalvar} className="card form-card">
          <h2>{editandoId ? 'Editar consultor' : 'Novo consultor'}</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nome</span>
              <input
                type="text"
                required
                autoFocus
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Telefone (opcional)</span>
              <input
                type="text"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Cargo/função (opcional)</span>
              <input
                type="text"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                placeholder="Ex: Consultor de implementação"
              />
            </label>
            <label className="field">
              <span>URL do avatar (opcional)</span>
              <input
                type="url"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field">
              <span>ID do Google Calendar (opcional)</span>
              <input
                type="text"
                value={form.google_calendar_id}
                onChange={(e) => setForm({ ...form, google_calendar_id: e.target.value })}
                placeholder="nome@gmail.com"
              />
              <span className="field-hint">
                Normalmente é o próprio e-mail da conta Google do consultor. Antes de preencher, ele
                precisa compartilhar esse calendário com{' '}
                {emailContaServico ? <code>{emailContaServico}</code> : 'a conta de serviço do sistema'} —
                em Configurações do Google Calendar → Compartilhar com pessoas específicas → "Ver todos
                os detalhes do evento". Sem isso, as reuniões desse consultor não são sincronizadas.
              </span>
            </label>
          </div>
          <label className="option-checkbox">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            <span>Ativo (aparece nos seletores de consultor)</span>
          </label>
          <div className="wizard-actions">
            <button type="button" className="btn btn-secondary" onClick={fecharForm}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && consultores.length === 0 && !mostrarForm && (
        <div className="empty-state">
          <p>Nenhum consultor cadastrado ainda.</p>
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            Cadastrar o primeiro consultor
          </button>
        </div>
      )}

      {!loading && consultores.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Cargo</th>
                <th>Google Calendar</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {consultores.map((c) => (
                <tr key={c.id} className={c.ativo ? undefined : 'checklist-grupo-travado'}>
                  <td>
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{c.nome}</td>
                  <td>{c.email}</td>
                  <td>{c.telefone ?? '—'}</td>
                  <td>{c.cargo ?? '—'}</td>
                  <td>
                    {c.google_calendar_id ? (
                      <span className="status-badge status-tone-success" title={c.google_calendar_id}>
                        Conectado
                        {c.google_calendar_sincronizado_em &&
                          ` · sinc. ${new Date(c.google_calendar_sincronizado_em).toLocaleString('pt-BR')}`}
                      </span>
                    ) : (
                      <span className="status-badge status-tone-warning">Não conectado</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge status-tone-${c.ativo ? 'success' : 'danger'}`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => abrirEdicao(c)}>
                      Editar
                    </button>{' '}
                    <button type="button" className="btn btn-ghost" onClick={() => handleAlternarAtivo(c)}>
                      {c.ativo ? 'Desativar' : 'Ativar'}
                    </button>{' '}
                    <button type="button" className="btn btn-ghost" onClick={() => handleExcluir(c)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
