import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { CampoPadrao, EntidadeCampo, TipoCampo } from '../types/database';

const TIPO_LABELS: Record<TipoCampo, string> = {
  lista_suspensa: 'Lista suspensa',
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  data: 'Data',
  checkbox: 'Checkbox',
  telefone: 'Telefone',
};

const TIPOS_COM_OPCOES: TipoCampo[] = ['lista_suspensa', 'checkbox'];

type FormState = {
  id: string | null;
  entidade: EntidadeCampo;
  nome_campo: string;
  tipo: TipoCampo;
  opcoesTexto: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  entidade: 'LEAD',
  nome_campo: '',
  tipo: 'texto_curto',
  opcoesTexto: '',
};

export function CamposPadrao() {
  const [campos, setCampos] = useState<CampoPadrao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('campos_padrao')
      .select('*')
      .order('entidade', { ascending: true })
      .order('nome_campo', { ascending: true });

    if (fetchError) setError(fetchError.message);
    else setCampos(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setMostrarForm(true);
  }

  function abrirEdicao(campo: CampoPadrao) {
    setForm({
      id: campo.id,
      entidade: campo.entidade,
      nome_campo: campo.nome_campo,
      tipo: campo.tipo,
      opcoesTexto: (campo.opcoes ?? []).join('\n'),
    });
    setMostrarForm(true);
  }

  function fecharForm() {
    setMostrarForm(false);
    setForm(FORM_VAZIO);
  }

  async function handleSalvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setError(null);

    const opcoes = TIPOS_COM_OPCOES.includes(form.tipo)
      ? form.opcoesTexto
          .split('\n')
          .map((linha) => linha.trim())
          .filter(Boolean)
      : null;

    const payload = {
      entidade: form.entidade,
      nome_campo: form.nome_campo.trim(),
      tipo: form.tipo,
      opcoes,
    };

    const { error: saveError } = form.id
      ? await supabase.from('campos_padrao').update(payload).eq('id', form.id)
      : await supabase.from('campos_padrao').insert(payload);

    setSalvando(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharForm();
    carregar();
  }

  async function handleExcluir(campo: CampoPadrao) {
    if (!window.confirm(`Excluir o campo "${campo.nome_campo}"?`)) return;

    const { error: deleteError } = await supabase.from('campos_padrao').delete().eq('id', campo.id);

    if (deleteError) setError(deleteError.message);
    else carregar();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Campos Padrão</h1>
          <p className="field-hint">
            Biblioteca de vocabulário compartilhado. A IA usa esses nomes como referência para
            manter consistência entre os funis gerados.
          </p>
        </div>
        {!mostrarForm && (
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            + Novo campo
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mostrarForm && (
        <form onSubmit={handleSalvar} className="card form-card">
          <h2>{form.id ? 'Editar campo' : 'Novo campo'}</h2>

          <label className="field">
            <span>Entidade</span>
            <select
              value={form.entidade}
              onChange={(e) => setForm({ ...form, entidade: e.target.value as EntidadeCampo })}
            >
              <option value="LEAD">LEAD</option>
              <option value="CONTATO">CONTATO</option>
            </select>
          </label>

          <label className="field">
            <span>Nome do campo</span>
            <input
              type="text"
              required
              value={form.nome_campo}
              onChange={(e) => setForm({ ...form, nome_campo: e.target.value })}
              placeholder="Ex: Convênio, CPF, Origem do lead"
            />
          </label>

          <label className="field">
            <span>Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoCampo })}
            >
              {Object.entries(TIPO_LABELS).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {TIPOS_COM_OPCOES.includes(form.tipo) && (
            <label className="field">
              <span>Opções (uma por linha)</span>
              <textarea
                rows={4}
                value={form.opcoesTexto}
                onChange={(e) => setForm({ ...form, opcoesTexto: e.target.value })}
                placeholder={'Particular\nConvênio'}
              />
            </label>
          )}

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

      {!loading && campos.length === 0 && !mostrarForm && (
        <div className="empty-state">
          <p>Nenhum campo padrão cadastrado ainda.</p>
          <button type="button" className="btn btn-primary" onClick={abrirNovo}>
            Criar o primeiro campo
          </button>
        </div>
      )}

      {!loading && campos.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Entidade</th>
                <th>Nome do campo</th>
                <th>Tipo</th>
                <th>Opções</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => (
                <tr key={campo.id}>
                  <td>{campo.entidade}</td>
                  <td>{campo.nome_campo}</td>
                  <td>{TIPO_LABELS[campo.tipo]}</td>
                  <td>{campo.opcoes?.join(', ') || '—'}</td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => abrirEdicao(campo)}>
                      Editar
                    </button>{' '}
                    <button type="button" className="btn btn-ghost" onClick={() => handleExcluir(campo)}>
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
