import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, ClienteObservacao, ImplementacaoCrm, Mapeamento } from '../types/database';

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type FormCliente = {
  nome_empresa: string;
  nome_contato: string;
  telefone: string;
  email: string;
  segmento: string;
};

function paraForm(cliente: Cliente): FormCliente {
  return {
    nome_empresa: cliente.nome_empresa,
    nome_contato: cliente.nome_contato ?? '',
    telefone: cliente.telefone ?? '',
    email: cliente.email ?? '',
    segmento: cliente.segmento ?? '',
  };
}

export function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [mapeamentoVendas, setMapeamentoVendas] = useState<Mapeamento | null>(null);
  const [mapeamentoPosVenda, setMapeamentoPosVenda] = useState<Mapeamento | null>(null);
  const [implementacao, setImplementacao] = useState<ImplementacaoCrm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormCliente | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [criandoVendas, setCriandoVendas] = useState(false);
  const [criandoPosVenda, setCriandoPosVenda] = useState(false);
  const [iniciandoImplementacao, setIniciandoImplementacao] = useState(false);

  const [observacoes, setObservacoes] = useState<ClienteObservacao[]>([]);
  const [novaObservacao, setNovaObservacao] = useState('');
  const [enviandoObservacao, setEnviandoObservacao] = useState(false);
  const [excluindoObservacaoId, setExcluindoObservacaoId] = useState<string | null>(null);

  async function carregar(clienteId: string) {
    setLoading(true);
    setError(null);

    const [
      { data: clienteData, error: clienteError },
      { data: vendasData },
      { data: posVendaData },
      { data: implementacaoData },
      { data: observacoesData },
    ] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', clienteId).single(),
      supabase
        .from('mapeamentos')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('tipo', 'vendas')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('mapeamentos')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('tipo', 'pos_venda')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('implementacoes_crm')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('cliente_observacoes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false }),
    ]);

    if (clienteError || !clienteData) {
      setError('Cliente não encontrado.');
      setLoading(false);
      return;
    }

    setCliente(clienteData);
    setForm(paraForm(clienteData));
    setMapeamentoVendas(vendasData ?? null);
    setMapeamentoPosVenda(posVendaData ?? null);
    setImplementacao(implementacaoData ?? null);
    setObservacoes(observacoesData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (id) carregar(id);
  }, [id]);

  async function handleSalvarCliente(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !form || !form.nome_empresa.trim()) return;

    setSalvando(true);
    const { data, error: updateError } = await supabase
      .from('clientes')
      .update({
        nome_empresa: form.nome_empresa.trim(),
        nome_contato: form.nome_contato.trim() || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        segmento: form.segmento.trim() || null,
      })
      .eq('id', cliente.id)
      .select()
      .single();
    setSalvando(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setEditando(false);
  }

  async function handleCriarMapeamentoVendas() {
    if (!cliente || !user) return;
    setCriandoVendas(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        cliente_id: cliente.id,
        nome_negocio: cliente.nome_empresa,
        status: 'em_preenchimento',
        respostas: {},
        tipo: 'vendas',
      })
      .select()
      .single();

    setCriandoVendas(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/mapeamento/${data.id}`);
  }

  async function handleGerarPosVenda() {
    if (!cliente || !user || !mapeamentoVendas) return;
    setCriandoPosVenda(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        cliente_id: cliente.id,
        nome_negocio: cliente.nome_empresa,
        status: 'em_preenchimento',
        respostas: {},
        tipo: 'pos_venda',
        mapeamento_origem_id: mapeamentoVendas.id,
      })
      .select()
      .single();

    setCriandoPosVenda(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/mapeamento/${data.id}`);
  }

  async function handleIniciarImplementacao() {
    if (!cliente || !user || !mapeamentoVendas) return;
    setIniciandoImplementacao(true);

    const { data, error: insertError } = await supabase
      .from('implementacoes_crm')
      .insert({
        mapeamento_id: mapeamentoVendas.id,
        cliente_id: cliente.id,
        user_id: user.id,
        nome_cliente: cliente.nome_empresa,
        status: 'pre_requisito',
      })
      .select()
      .single();

    setIniciandoImplementacao(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/implementacoes/${data.id}`);
  }

  async function handleAdicionarObservacao(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !user || !novaObservacao.trim()) return;

    setEnviandoObservacao(true);
    const { data, error: insertError } = await supabase
      .from('cliente_observacoes')
      .insert({
        cliente_id: cliente.id,
        user_id: user.id,
        autor_email: user.email ?? null,
        texto: novaObservacao.trim(),
      })
      .select()
      .single();
    setEnviandoObservacao(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setObservacoes((prev) => [data, ...prev]);
    setNovaObservacao('');
  }

  async function handleExcluirObservacao(observacaoId: string) {
    if (!window.confirm('Excluir esta observação?')) return;

    setExcluindoObservacaoId(observacaoId);
    const { error: deleteError } = await supabase
      .from('cliente_observacoes')
      .delete()
      .eq('id', observacaoId);
    setExcluindoObservacaoId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setObservacoes((prev) => prev.filter((o) => o.id !== observacaoId));
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !cliente) return <p className="form-error">{error}</p>;
  if (!cliente || !form) return <p className="form-error">Cliente não encontrado.</p>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{cliente.nome_empresa}</h1>
          {(cliente.nome_contato || cliente.segmento) && (
            <p className="field-hint">{[cliente.nome_contato, cliente.segmento].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        {!editando && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditando(true)}>
            Editar dados
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {editando ? (
        <form onSubmit={handleSalvarCliente} className="card form-card">
          <h2>Dados do cliente</h2>
          <label className="field">
            <span>Nome da empresa</span>
            <input
              type="text"
              required
              value={form.nome_empresa}
              onChange={(e) => setForm({ ...form, nome_empresa: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Nome do contato</span>
              <input
                type="text"
                value={form.nome_contato}
                onChange={(e) => setForm({ ...form, nome_contato: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Telefone/WhatsApp</span>
              <input
                type="text"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Segmento/nicho</span>
              <input
                type="text"
                value={form.segmento}
                onChange={(e) => setForm({ ...form, segmento: e.target.value })}
              />
            </label>
          </div>
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setForm(paraForm(cliente));
                setEditando(false);
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      ) : (
        (cliente.telefone || cliente.email) && (
          <div className="card form-card">
            {cliente.telefone && (
              <p>
                <strong>Telefone/WhatsApp:</strong> {cliente.telefone}
              </p>
            )}
            {cliente.email && (
              <p>
                <strong>E-mail:</strong> {cliente.email}
              </p>
            )}
          </div>
        )
      )}

      <section className="card form-card">
        <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
          <h2 style={{ marginBottom: 0 }}>Mapeamento de vendas</h2>
          {mapeamentoVendas && (
            <StatusBadge
              status={mapeamentoVendas.status}
              enviadoPeloCliente={mapeamentoVendas.enviado_pelo_cliente}
            />
          )}
        </div>
        {mapeamentoVendas ? (
          <Link to={`/mapeamento/${mapeamentoVendas.id}`} className="btn btn-primary btn-auto">
            Ver mapeamento de vendas
          </Link>
        ) : (
          <>
            <p className="field-hint">Ainda não existe um mapeamento de vendas para este cliente.</p>
            <button
              type="button"
              className="btn btn-primary btn-auto"
              onClick={handleCriarMapeamentoVendas}
              disabled={criandoVendas}
            >
              {criandoVendas ? 'Criando…' : 'Criar mapeamento de vendas'}
            </button>
          </>
        )}
      </section>

      {mapeamentoVendas?.status === 'concluido' && (
        <section className="card form-card">
          <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
            <h2 style={{ marginBottom: 0 }}>Mapeamento de pós-venda</h2>
            {mapeamentoPosVenda && (
              <StatusBadge
                status={mapeamentoPosVenda.status}
                enviadoPeloCliente={mapeamentoPosVenda.enviado_pelo_cliente}
              />
            )}
          </div>
          {mapeamentoPosVenda ? (
            <Link to={`/mapeamento/${mapeamentoPosVenda.id}`} className="btn btn-primary btn-auto">
              Ver mapeamento de pós-venda
            </Link>
          ) : (
            <>
              <p className="field-hint">Ainda não existe um mapeamento de pós-venda para este cliente.</p>
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={handleGerarPosVenda}
                disabled={criandoPosVenda}
              >
                {criandoPosVenda ? 'Gerando…' : 'Gerar formulário de pós-venda'}
              </button>
            </>
          )}
        </section>
      )}

      {mapeamentoVendas?.status === 'concluido' && (
        <section className="card form-card">
          <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
            <h2 style={{ marginBottom: 0 }}>Implementação de CRM</h2>
            {implementacao && <ImplementacaoStatusBadge status={implementacao.status} />}
          </div>
          {implementacao ? (
            <Link to={`/implementacoes/${implementacao.id}`} className="btn btn-primary btn-auto">
              Ver implementação de CRM
            </Link>
          ) : (
            <>
              <p className="field-hint">Ainda não existe uma implementação de CRM para este cliente.</p>
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={handleIniciarImplementacao}
                disabled={iniciandoImplementacao}
              >
                {iniciandoImplementacao ? 'Iniciando…' : 'Iniciar implementação de CRM'}
              </button>
            </>
          )}
        </section>
      )}

      <section className="card form-card">
        <h2>Observações</h2>
        <p className="field-hint">
          Histórico livre de contato com o cliente — reuniões marcadas/desmarcadas, combinados,
          qualquer coisa que valha registrar.
        </p>

        <form onSubmit={handleAdicionarObservacao}>
          <label className="field">
            <span>Nova observação</span>
            <textarea
              rows={3}
              value={novaObservacao}
              onChange={(e) => setNovaObservacao(e.target.value)}
              placeholder="Ex: Tentei marcar reunião pro dia 20/09, cliente pediu pra remarcar."
            />
          </label>
          <div className="wizard-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={enviandoObservacao || !novaObservacao.trim()}
            >
              {enviandoObservacao ? 'Salvando…' : 'Adicionar observação'}
            </button>
          </div>
        </form>

        {observacoes.length === 0 ? (
          <p className="field-hint">Nenhuma observação registrada ainda.</p>
        ) : (
          <ul className="observacoes-lista">
            {observacoes.map((o) => (
              <li key={o.id} className="observacao-item">
                <div className="observacao-item-header">
                  <span className="observacao-item-meta">
                    {formatarDataHora(o.created_at)}
                    {o.autor_email ? ` · ${o.autor_email}` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => handleExcluirObservacao(o.id)}
                    disabled={excluindoObservacaoId === o.id}
                  >
                    {excluindoObservacaoId === o.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                </div>
                <p className="observacao-item-texto">{o.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
