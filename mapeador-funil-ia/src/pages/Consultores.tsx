import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Consultor, PapelConsultor } from '../types/database';

const PAPEL_LABELS: Record<PapelConsultor, string> = {
  administrador: 'Administrador',
  consultor: 'Consultor',
  consultor_apoio: 'Consultor de apoio',
};

type FormConsultor = {
  nome: string;
  email: string;
  telefone: string;
  cargo: string;
  avatar_url: string;
  ativo: boolean;
  role: PapelConsultor;
};

const FORM_VAZIO: FormConsultor = {
  nome: '',
  email: '',
  telefone: '',
  cargo: '',
  avatar_url: '',
  ativo: true,
  role: 'consultor',
};

function paraForm(consultor: Consultor): FormConsultor {
  return {
    nome: consultor.nome,
    email: consultor.email,
    telefone: consultor.telefone ?? '',
    cargo: consultor.cargo ?? '',
    avatar_url: consultor.avatar_url ?? '',
    ativo: consultor.ativo,
    role: consultor.role,
  };
}

// CRUD do time de consultores — quem aparece nos seletores de "Consultor
// responsável"/"Consultor adicional" na implementação de CRM. Excluir um
// consultor já vinculado a alguma implementação é barrado pelo próprio banco
// (FK sem "on delete"), então o caminho normal pra tirar alguém de circulação
// é desativar, não excluir.
export function Consultores() {
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormConsultor>(FORM_VAZIO);

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
    // Só o backend (RLS) de fato barra quem não é administrador — isso aqui
    // só decide o que mostrar na tela, pra não confundir alguém com um erro
    // de permissão ao tentar salvar.
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
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
      role: form.role,
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
            {!souAdministrador && ' Gerenciar o time (criar, editar, desativar, excluir e definir papel) é restrito a administradores.'}
          </p>
        </div>
        {!mostrarForm && souAdministrador && (
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
              <span>Papel</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as PapelConsultor })}
              >
                {Object.entries(PAPEL_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
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
          {souAdministrador && (
            <button type="button" className="btn btn-primary" onClick={abrirNovo}>
              Cadastrar o primeiro consultor
            </button>
          )}
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
                <th>Papel</th>
                <th>Status</th>
                {souAdministrador && <th />}
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
                  <td>{PAPEL_LABELS[c.role]}</td>
                  <td>
                    <span className={`status-badge status-tone-${c.ativo ? 'success' : 'danger'}`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {souAdministrador && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
