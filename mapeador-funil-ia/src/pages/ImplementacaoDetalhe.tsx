import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { supabase } from '../lib/supabaseClient';
import type {
  ChecklistGrupoImplementacao,
  ChecklistItemImplementacao,
  CredencialCrmListada,
  ImplementacaoCrm,
  ImplementacaoStatus,
} from '../types/database';

type FormGeral = {
  nome_cliente: string;
  consultor_responsavel: string;
  stakeholder_decisor: string;
  status: ImplementacaoStatus;
  conta_criada_via_v4: boolean;
  email_conta_kommo: string;
  whatsapp_corporativo_confirmado: boolean;
  acesso_facebook_confirmado: boolean;
  plano_contratado: string;
  periodo_contratado: string;
  data_decisao_plano: string;
  observacoes: string;
};

type FormCredencial = {
  id: string | null;
  login: string;
  senha: string;
  observacoes: string;
};

const FORM_CREDENCIAL_VAZIO: FormCredencial = { id: null, login: '', senha: '', observacoes: '' };

function paraFormGeral(impl: ImplementacaoCrm): FormGeral {
  return {
    nome_cliente: impl.nome_cliente,
    consultor_responsavel: impl.consultor_responsavel ?? '',
    stakeholder_decisor: impl.stakeholder_decisor ?? '',
    status: impl.status,
    conta_criada_via_v4: impl.conta_criada_via_v4,
    email_conta_kommo: impl.email_conta_kommo ?? '',
    whatsapp_corporativo_confirmado: impl.whatsapp_corporativo_confirmado,
    acesso_facebook_confirmado: impl.acesso_facebook_confirmado,
    plano_contratado: impl.plano_contratado ?? '',
    periodo_contratado: impl.periodo_contratado ?? '',
    data_decisao_plano: impl.data_decisao_plano ?? '',
    observacoes: impl.observacoes ?? '',
  };
}

export function ImplementacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [implementacao, setImplementacao] = useState<ImplementacaoCrm | null>(null);
  const [grupos, setGrupos] = useState<ChecklistGrupoImplementacao[]>([]);
  const [itens, setItens] = useState<ChecklistItemImplementacao[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [credenciais, setCredenciais] = useState<CredencialCrmListada[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formGeral, setFormGeral] = useState<FormGeral | null>(null);
  const [salvandoGeral, setSalvandoGeral] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);

  const [formCredencial, setFormCredencial] = useState<FormCredencial | null>(null);
  const [salvandoCredencial, setSalvandoCredencial] = useState(false);
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [revelando, setRevelando] = useState<string | null>(null);

  const [excluindo, setExcluindo] = useState(false);

  async function carregar(implementacaoId: string) {
    setLoading(true);
    setError(null);

    const [
      { data: implData, error: implError },
      { data: gruposData, error: gruposError },
      { data: itensData, error: itensError },
      { data: marcadosData, error: marcadosError },
      { data: credenciaisData, error: credenciaisError },
    ] = await Promise.all([
      supabase.from('implementacoes_crm').select('*').eq('id', implementacaoId).single(),
      supabase.from('checklist_grupos_implementacao').select('*').order('ordem', { ascending: true }),
      supabase.from('checklist_itens_implementacao').select('*').order('ordem', { ascending: true }),
      supabase
        .from('implementacao_checklist_marcado')
        .select('item_id, marcado')
        .eq('implementacao_id', implementacaoId),
      supabase.rpc('listar_credenciais_crm', { p_implementacao_id: implementacaoId }),
    ]);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setImplementacao(implData);
    setFormGeral(paraFormGeral(implData));
    if (!gruposError) setGrupos(gruposData ?? []);
    if (!itensError) setItens(itensData ?? []);
    if (!marcadosError) {
      setMarcados(new Set((marcadosData ?? []).filter((m) => m.marcado).map((m) => m.item_id)));
    }
    if (!credenciaisError) setCredenciais(credenciaisData ?? []);

    setLoading(false);
  }

  useEffect(() => {
    if (id) carregar(id);
  }, [id]);

  function itensDoGrupo(grupoId: string): ChecklistItemImplementacao[] {
    return itens.filter((item) => item.grupo_id === grupoId).sort((a, b) => a.ordem - b.ordem);
  }

  async function handleToggleItem(itemId: string) {
    if (!implementacao) return;
    const jaMarcado = marcados.has(itemId);

    if (jaMarcado) {
      setMarcados((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      await supabase
        .from('implementacao_checklist_marcado')
        .delete()
        .eq('implementacao_id', implementacao.id)
        .eq('item_id', itemId);
    } else {
      setMarcados((prev) => new Set(prev).add(itemId));
      await supabase
        .from('implementacao_checklist_marcado')
        .upsert(
          { implementacao_id: implementacao.id, item_id: itemId, marcado: true, marcado_em: new Date().toISOString() },
          { onConflict: 'implementacao_id,item_id' },
        );
    }
  }

  async function handleSalvarGeral(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formGeral) return;

    setSalvandoGeral(true);
    setSalvoRecentemente(false);

    const { data, error: updateError } = await supabase
      .from('implementacoes_crm')
      .update({
        nome_cliente: formGeral.nome_cliente.trim(),
        consultor_responsavel: formGeral.consultor_responsavel.trim() || null,
        stakeholder_decisor: formGeral.stakeholder_decisor.trim() || null,
        status: formGeral.status,
        conta_criada_via_v4: formGeral.conta_criada_via_v4,
        email_conta_kommo: formGeral.email_conta_kommo.trim() || null,
        whatsapp_corporativo_confirmado: formGeral.whatsapp_corporativo_confirmado,
        acesso_facebook_confirmado: formGeral.acesso_facebook_confirmado,
        plano_contratado: formGeral.plano_contratado || null,
        periodo_contratado: formGeral.periodo_contratado.trim() || null,
        data_decisao_plano: formGeral.data_decisao_plano || null,
        observacoes: formGeral.observacoes.trim() || null,
      })
      .eq('id', implementacao.id)
      .select()
      .single();

    setSalvandoGeral(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setImplementacao(data);
    setSalvoRecentemente(true);
    setTimeout(() => setSalvoRecentemente(false), 2000);
  }

  async function handleExcluirImplementacao() {
    if (!implementacao) return;
    if (
      !window.confirm(
        `Excluir a implementação de "${implementacao.nome_cliente}"? Isso também apaga as credenciais salvas. Essa ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setExcluindo(true);
    const { error: deleteError } = await supabase
      .from('implementacoes_crm')
      .delete()
      .eq('id', implementacao.id);
    setExcluindo(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/implementacoes');
  }

  function abrirNovaCredencial() {
    setFormCredencial(FORM_CREDENCIAL_VAZIO);
  }

  async function abrirEdicaoCredencial(credencial: CredencialCrmListada) {
    const { data, error: revelarError } = await supabase.rpc('revelar_credencial_crm', {
      p_id: credencial.id,
    });

    if (revelarError || !data || data.length === 0) {
      setError(revelarError?.message ?? 'Não foi possível carregar a credencial.');
      return;
    }

    const revelada = data[0];
    setFormCredencial({
      id: credencial.id,
      login: revelada.login,
      senha: revelada.senha,
      observacoes: revelada.observacoes ?? '',
    });
  }

  function fecharFormCredencial() {
    setFormCredencial(null);
  }

  async function handleSalvarCredencial(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formCredencial) return;
    if (!formCredencial.login.trim() || !formCredencial.senha.trim()) return;

    setSalvandoCredencial(true);

    const { error: saveError } = formCredencial.id
      ? await supabase.rpc('atualizar_credencial_crm', {
          p_id: formCredencial.id,
          p_login: formCredencial.login.trim(),
          p_senha: formCredencial.senha,
          p_observacoes: formCredencial.observacoes.trim() || null,
        })
      : await supabase.rpc('salvar_credencial_crm', {
          p_implementacao_id: implementacao.id,
          p_login: formCredencial.login.trim(),
          p_senha: formCredencial.senha,
          p_observacoes: formCredencial.observacoes.trim() || null,
        });

    setSalvandoCredencial(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormCredencial();
    carregar(implementacao.id);
  }

  async function handleRevelarSenha(credencialId: string) {
    setRevelando(credencialId);
    const { data, error: revelarError } = await supabase.rpc('revelar_credencial_crm', {
      p_id: credencialId,
    });
    setRevelando(null);

    if (revelarError || !data || data.length === 0) {
      setError(revelarError?.message ?? 'Não foi possível revelar a senha.');
      return;
    }

    setReveladas((prev) => ({ ...prev, [credencialId]: data[0].senha }));
  }

  function handleEsconderSenha(credencialId: string) {
    setReveladas((prev) => {
      const next = { ...prev };
      delete next[credencialId];
      return next;
    });
  }

  async function handleExcluirCredencial(credencial: CredencialCrmListada) {
    if (!window.confirm(`Excluir a credencial "${credencial.login}"?`)) return;

    const { error: deleteError } = await supabase.from('credenciais_crm').delete().eq('id', credencial.id);
    if (deleteError) setError(deleteError.message);
    else setCredenciais((prev) => prev.filter((c) => c.id !== credencial.id));
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !implementacao) return <p className="form-error">{error}</p>;
  if (!implementacao || !formGeral) return <p className="form-error">Implementação não encontrada.</p>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{implementacao.nome_cliente}</h1>
          <p className="field-hint">
            <Link to={`/mapeamento/${implementacao.mapeamento_id}`}>Ver mapeamento de origem</Link>
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExcluirImplementacao} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir implementação'}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSalvarGeral} className="card form-card">
        <h2>Dados gerais</h2>

        <label className="field">
          <span>Nome do cliente</span>
          <input
            type="text"
            required
            value={formGeral.nome_cliente}
            onChange={(e) => setFormGeral({ ...formGeral, nome_cliente: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Status</span>
          <select
            value={formGeral.status}
            onChange={(e) =>
              setFormGeral({ ...formGeral, status: e.target.value as ImplementacaoStatus })
            }
          >
            {Object.entries(IMPLEMENTACAO_STATUS_LABELS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Consultor responsável</span>
          <input
            type="text"
            value={formGeral.consultor_responsavel}
            onChange={(e) => setFormGeral({ ...formGeral, consultor_responsavel: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Stakeholder decisor</span>
          <input
            type="text"
            value={formGeral.stakeholder_decisor}
            onChange={(e) => setFormGeral({ ...formGeral, stakeholder_decisor: e.target.value })}
          />
        </label>

        <h3>Acessos</h3>

        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={formGeral.conta_criada_via_v4}
            onChange={(e) => setFormGeral({ ...formGeral, conta_criada_via_v4: e.target.checked })}
          />
          <span>Conta Kommo criada via V4 Company</span>
        </label>

        <label className="field">
          <span>E-mail da conta Kommo</span>
          <input
            type="email"
            value={formGeral.email_conta_kommo}
            onChange={(e) => setFormGeral({ ...formGeral, email_conta_kommo: e.target.value })}
          />
        </label>

        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={formGeral.whatsapp_corporativo_confirmado}
            onChange={(e) =>
              setFormGeral({ ...formGeral, whatsapp_corporativo_confirmado: e.target.checked })
            }
          />
          <span>WhatsApp Corporativo (business) confirmado</span>
        </label>

        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={formGeral.acesso_facebook_confirmado}
            onChange={(e) => setFormGeral({ ...formGeral, acesso_facebook_confirmado: e.target.checked })}
          />
          <span>Acesso às credenciais do Facebook confirmado</span>
        </label>

        <label className="field">
          <span>Plano contratado</span>
          <select
            value={formGeral.plano_contratado}
            onChange={(e) => setFormGeral({ ...formGeral, plano_contratado: e.target.value })}
          >
            <option value="">— Ainda não decidido —</option>
            <option value="Kommo Basic">Kommo Basic</option>
            <option value="Kommo PRO">Kommo PRO</option>
          </select>
        </label>

        <label className="field">
          <span>Período contratado</span>
          <input
            type="text"
            placeholder="Ex: Mensal, Anual, 12x"
            value={formGeral.periodo_contratado}
            onChange={(e) => setFormGeral({ ...formGeral, periodo_contratado: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Data da decisão do plano</span>
          <input
            type="date"
            value={formGeral.data_decisao_plano}
            onChange={(e) => setFormGeral({ ...formGeral, data_decisao_plano: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Observações</span>
          <textarea
            rows={3}
            value={formGeral.observacoes}
            onChange={(e) => setFormGeral({ ...formGeral, observacoes: e.target.value })}
          />
        </label>

        <div className="wizard-actions">
          <span className="field-hint">{salvoRecentemente ? 'Alterações salvas.' : ''}</span>
          <button type="submit" className="btn btn-primary" disabled={salvandoGeral}>
            {salvandoGeral ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      {grupos.map((grupo) => (
        <section key={grupo.id} className="card form-card">
          <h2>{grupo.titulo}</h2>
          <div className="options-list">
            {itensDoGrupo(grupo.id).map((item) => (
              <label key={item.id} className="option-checkbox">
                <input
                  type="checkbox"
                  checked={marcados.has(item.id)}
                  onChange={() => handleToggleItem(item.id)}
                />
                <span>{item.texto}</span>
              </label>
            ))}
            {itensDoGrupo(grupo.id).length === 0 && (
              <p className="field-hint">Nenhum item cadastrado neste grupo.</p>
            )}
          </div>
        </section>
      ))}

      <section className="card form-card">
        <div className="page-header">
          <h2 style={{ marginBottom: 0 }}>Credenciais de acesso do cliente no CRM</h2>
          {!formCredencial && (
            <button type="button" className="btn btn-primary" onClick={abrirNovaCredencial}>
              + Nova credencial
            </button>
          )}
        </div>
        <p className="field-hint">
          As senhas ficam criptografadas no banco — só aparecem em texto quando você clica em
          "Revelar".
        </p>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Login</th>
                <th>Senha</th>
                <th>Observações</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {credenciais.map((credencial) => (
                <tr key={credencial.id}>
                  <td>{credencial.login}</td>
                  <td>
                    {reveladas[credencial.id] ? (
                      <code>{reveladas[credencial.id]}</code>
                    ) : (
                      '••••••••'
                    )}
                  </td>
                  <td>{credencial.observacoes || '—'}</td>
                  <td className="table-actions">
                    {reveladas[credencial.id] ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleEsconderSenha(credencial.id)}
                      >
                        Esconder
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleRevelarSenha(credencial.id)}
                        disabled={revelando === credencial.id}
                      >
                        {revelando === credencial.id ? 'Revelando…' : 'Revelar'}
                      </button>
                    )}{' '}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => abrirEdicaoCredencial(credencial)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleExcluirCredencial(credencial)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {credenciais.length === 0 && !formCredencial && (
                <tr>
                  <td colSpan={4} className="field-hint">
                    Nenhuma credencial cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {formCredencial && (
          <form onSubmit={handleSalvarCredencial} className="card form-card">
            <h3>{formCredencial.id ? 'Editar credencial' : 'Nova credencial'}</h3>

            <label className="field">
              <span>Login / e-mail</span>
              <input
                type="text"
                required
                value={formCredencial.login}
                onChange={(e) => setFormCredencial({ ...formCredencial, login: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Senha</span>
              <input
                type="text"
                required
                value={formCredencial.senha}
                onChange={(e) => setFormCredencial({ ...formCredencial, senha: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Observações (opcional)</span>
              <input
                type="text"
                value={formCredencial.observacoes}
                onChange={(e) => setFormCredencial({ ...formCredencial, observacoes: e.target.value })}
              />
            </label>

            <div className="wizard-actions">
              <button type="button" className="btn btn-secondary" onClick={fecharFormCredencial}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoCredencial}>
                {salvandoCredencial ? 'Salvando…' : 'Salvar credencial'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
