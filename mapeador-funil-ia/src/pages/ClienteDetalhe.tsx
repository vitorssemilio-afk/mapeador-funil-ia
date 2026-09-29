import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { calcularMetricas, MARCOS_ORDENADOS, type CampoMarco } from '../lib/marcosCliente';
import { funilValidado } from '../lib/statusFluxo';
import { IMPACTO_RESPONSAVEL_LABELS } from '../lib/atividadesCronograma';
import { resolverResumoTrialKommo, STATUS_TRIAL_LABELS, STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type {
  Cliente,
  ClienteArquivo,
  ClienteObservacao,
  ImpactoResponsavel,
  ImplementacaoCrm,
  Mapeamento,
  MarcoRemarcacao,
} from '../types/database';

// Só esses dois marcos têm a ação dedicada de "Remarcar" — os únicos com par
// agendado/realizado que o cliente citou como reagendáveis (ver
// atividadesCronograma.ts).
const CAMPOS_REMARCAVEIS = ['kickoff_agendado_para', 'treinamento_agendado_para'] as const;
type CampoRemarcavel = (typeof CAMPOS_REMARCAVEIS)[number];
const CAMPO_REALIZADO_DO_AGENDADO: Record<CampoRemarcavel, CampoMarco> = {
  kickoff_agendado_para: 'kickoff_realizado_em',
  treinamento_agendado_para: 'treinamento_realizado_em',
};

function ehCampoRemarcavel(campo: CampoMarco): campo is CampoRemarcavel {
  return (CAMPOS_REMARCAVEIS as readonly string[]).includes(campo);
}

const BUCKET_ANEXOS = 'cliente-anexos';

function isoParaInput(iso: string | null, apenasData: boolean): string {
  if (!iso) return '';
  const data = new Date(iso);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return apenasData ? local.toISOString().slice(0, 10) : local.toISOString().slice(0, 16);
}

function inputParaIso(valor: string, apenasData: boolean): string | null {
  if (!valor) return null;
  return apenasData ? valor : new Date(valor).toISOString();
}

type FormMarcos = Record<CampoMarco, string>;

function paraFormMarcos(cliente: Cliente): FormMarcos {
  const form = {} as FormMarcos;
  for (const { campo, apenasData } of MARCOS_ORDENADOS) {
    form[campo] = isoParaInput(cliente[campo], apenasData);
  }
  return form;
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarTamanho(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const [arquivos, setArquivos] = useState<ClienteArquivo[]>([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [baixandoArquivoId, setBaixandoArquivoId] = useState<string | null>(null);
  const [excluindoArquivoId, setExcluindoArquivoId] = useState<string | null>(null);

  const [editandoMarcos, setEditandoMarcos] = useState(false);
  const [formMarcos, setFormMarcos] = useState<FormMarcos | null>(null);
  const [salvandoMarcos, setSalvandoMarcos] = useState(false);
  const [checkpointRespondidoEm, setCheckpointRespondidoEm] = useState<string | null>(null);

  const [remarcacoes, setRemarcacoes] = useState<MarcoRemarcacao[]>([]);
  const [remarcandoCampo, setRemarcandoCampo] = useState<CampoRemarcavel | null>(null);
  const [formRemarcacao, setFormRemarcacao] = useState({
    data_nova: '',
    motivo: '',
    responsavel_impacto: 'cliente' as ImpactoResponsavel,
  });
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);

  async function carregar(clienteId: string) {
    setLoading(true);
    setError(null);

    const [
      { data: clienteData, error: clienteError },
      { data: vendasData },
      { data: posVendaData },
      { data: implementacaoData },
      { data: observacoesData },
      { data: arquivosData },
      { data: remarcacoesData },
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
      supabase
        .from('cliente_arquivos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false }),
      supabase
        .from('marco_remarcacoes')
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
    setFormMarcos(paraFormMarcos(clienteData));
    setMapeamentoVendas(vendasData ?? null);
    setMapeamentoPosVenda(posVendaData ?? null);
    setImplementacao(implementacaoData ?? null);
    setObservacoes(observacoesData ?? []);
    setArquivos(arquivosData ?? []);
    setRemarcacoes(remarcacoesData ?? []);

    if (implementacaoData) {
      const { data: checkpointData } = await supabase
        .from('checkpoints_adocao')
        .select('respondido_em')
        .eq('implementacao_id', implementacaoData.id)
        .maybeSingle();
      setCheckpointRespondidoEm(checkpointData?.respondido_em ?? null);
    } else {
      setCheckpointRespondidoEm(null);
    }

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

  async function handleSalvarMarcos(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !formMarcos) return;

    setSalvandoMarcos(true);
    const atualizacao: Partial<Pick<Cliente, CampoMarco>> = Object.fromEntries(
      MARCOS_ORDENADOS.map(({ campo, apenasData }) => [campo, inputParaIso(formMarcos[campo], apenasData)]),
    );

    const { data, error: updateError } = await supabase
      .from('clientes')
      .update(atualizacao)
      .eq('id', cliente.id)
      .select()
      .single();
    setSalvandoMarcos(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setFormMarcos(paraFormMarcos(data));
    setEditandoMarcos(false);
  }

  function abrirRemarcacao(campo: CampoRemarcavel) {
    setRemarcandoCampo(campo);
    setFormRemarcacao({ data_nova: '', motivo: '', responsavel_impacto: 'cliente' });
  }

  function fecharRemarcacao() {
    setRemarcandoCampo(null);
  }

  // Ação distinta de editar o marco pelo formulário genérico: preserva a
  // data anterior (nunca perdida — vai pro log de auditoria), exige motivo e
  // responsável pelo impacto, e nunca mexe num marco já realizado.
  async function handleConfirmarRemarcacao(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !remarcandoCampo) return;
    if (!formRemarcacao.data_nova || !formRemarcacao.motivo.trim()) return;

    setSalvandoRemarcacao(true);

    const { error: insertError } = await supabase.from('marco_remarcacoes').insert({
      cliente_id: cliente.id,
      campo_marco: remarcandoCampo,
      data_anterior: cliente[remarcandoCampo],
      data_nova: formRemarcacao.data_nova,
      motivo: formRemarcacao.motivo.trim(),
      responsavel_impacto: formRemarcacao.responsavel_impacto,
    });

    if (insertError) {
      setSalvandoRemarcacao(false);
      setError(insertError.message);
      return;
    }

    const atualizacao: Partial<Pick<Cliente, CampoRemarcavel>> = {
      [remarcandoCampo]: formRemarcacao.data_nova,
    };
    const { data, error: updateError } = await supabase
      .from('clientes')
      .update(atualizacao)
      .eq('id', cliente.id)
      .select()
      .single();

    setSalvandoRemarcacao(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setFormMarcos(paraFormMarcos(data));
    setRemarcandoCampo(null);
    if (id) await carregar(id);
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
        status: 'preparacao_crm',
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

  async function handleUploadArquivos(e: ChangeEvent<HTMLInputElement>) {
    const arquivosSelecionados = e.target.files;
    if (!cliente || !user || !arquivosSelecionados || arquivosSelecionados.length === 0) return;

    setEnviandoArquivo(true);
    setError(null);

    for (const arquivo of Array.from(arquivosSelecionados)) {
      const nomeSanitizado = arquivo.name.replace(/[^\w.-]+/g, '_');
      const caminho = `${cliente.id}/${Date.now()}-${nomeSanitizado}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .upload(caminho, arquivo, { contentType: arquivo.type || undefined });

      if (uploadError) {
        setError(uploadError.message);
        continue;
      }

      const { data, error: insertError } = await supabase
        .from('cliente_arquivos')
        .insert({
          cliente_id: cliente.id,
          nome_arquivo: arquivo.name,
          caminho_storage: caminho,
          tipo_mime: arquivo.type || null,
          tamanho_bytes: arquivo.size,
          user_id: user.id,
          autor_email: user.email ?? null,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        continue;
      }

      setArquivos((prev) => [data, ...prev]);
    }

    setEnviandoArquivo(false);
    e.target.value = '';
  }

  async function handleBaixarArquivo(arquivo: ClienteArquivo) {
    setBaixandoArquivoId(arquivo.id);
    const { data, error: signedUrlError } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .createSignedUrl(arquivo.caminho_storage, 60);
    setBaixandoArquivoId(null);

    if (signedUrlError || !data) {
      setError(signedUrlError?.message ?? 'Não foi possível gerar o link do arquivo.');
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleExcluirArquivo(arquivo: ClienteArquivo) {
    if (!window.confirm(`Excluir o arquivo "${arquivo.nome_arquivo}"?`)) return;

    setExcluindoArquivoId(arquivo.id);
    const { error: storageError } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .remove([arquivo.caminho_storage]);

    if (storageError) {
      setExcluindoArquivoId(null);
      setError(storageError.message);
      return;
    }

    const { error: deleteError } = await supabase.from('cliente_arquivos').delete().eq('id', arquivo.id);
    setExcluindoArquivoId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setArquivos((prev) => prev.filter((a) => a.id !== arquivo.id));
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
          <h2 style={{ marginBottom: 0 }}>Marcos e linha do tempo</h2>
          {!editandoMarcos && (
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => {
                setFormMarcos(paraFormMarcos(cliente));
                setEditandoMarcos(true);
              }}
            >
              Editar marcos
            </button>
          )}
        </div>

        {editandoMarcos && formMarcos ? (
          <form onSubmit={handleSalvarMarcos}>
            <div className="form-grid">
              {MARCOS_ORDENADOS.map(({ campo, label, apenasData }) => (
                <label key={campo} className="field">
                  <span>{label}</span>
                  <input
                    type={apenasData ? 'date' : 'datetime-local'}
                    value={formMarcos[campo]}
                    onChange={(e) => setFormMarcos({ ...formMarcos, [campo]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <div className="wizard-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFormMarcos(paraFormMarcos(cliente));
                  setEditandoMarcos(false);
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoMarcos}>
                {salvandoMarcos ? 'Salvando…' : 'Salvar marcos'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="field-hint">
              O prazo dos 40 dias da implementação começa a contar a partir do Kickoff realizado — não da
              contratação, do envio/resposta do formulário, ou da criação da conta Kommo.
            </p>
            <ol className="timeline-marcos">
              {MARCOS_ORDENADOS.filter(({ campo }) => cliente[campo]).map(({ campo, label, apenasData }) => {
                const remarcavel = ehCampoRemarcavel(campo);
                const jaRealizado = remarcavel ? Boolean(cliente[CAMPO_REALIZADO_DO_AGENDADO[campo]]) : false;
                const remarcacoesDoCampo = remarcavel
                  ? remarcacoes.filter((r) => r.campo_marco === campo)
                  : [];
                const maisRecente = remarcacoesDoCampo[0] ?? null;
                // A mais antiga (created_at menor) traz a data original de
                // verdade, pra calcular o deslocamento total (não só o da
                // última remarcação).
                const maisAntiga =
                  remarcacoesDoCampo.length > 0
                    ? [...remarcacoesDoCampo].sort(
                        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                      )[0]
                    : null;
                const deslocamentoDias =
                  maisAntiga?.data_anterior && cliente[campo]
                    ? Math.round(
                        (new Date(`${cliente[campo]}T12:00:00`).getTime() -
                          new Date(`${maisAntiga.data_anterior}T12:00:00`).getTime()) /
                          (24 * 60 * 60 * 1000),
                      )
                    : null;

                return (
                  <li key={campo}>
                    <span className="timeline-marco-label">{label}</span>
                    <span className="timeline-marco-data">
                      {apenasData
                        ? new Date(`${cliente[campo]}T12:00:00`).toLocaleDateString('pt-BR')
                        : formatarDataHora(cliente[campo]!)}
                      {maisRecente && (
                        <span className="field-hint">
                          {' '}
                          · remarcado
                          {deslocamentoDias != null ? ` em ${deslocamentoDias >= 0 ? '+' : ''}${deslocamentoDias} dias` : ''}{' '}
                          (motivo: {maisRecente.motivo}, impacto:{' '}
                          {IMPACTO_RESPONSAVEL_LABELS[maisRecente.responsavel_impacto]})
                        </span>
                      )}
                      {remarcavel && !jaRealizado && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-auto"
                          onClick={() => abrirRemarcacao(campo)}
                        >
                          Remarcar
                        </button>
                      )}
                    </span>

                    {remarcandoCampo === campo && (
                      <form onSubmit={handleConfirmarRemarcacao} className="card form-card">
                        <label className="field">
                          <span>Nova data</span>
                          <input
                            type="date"
                            required
                            value={formRemarcacao.data_nova}
                            onChange={(e) =>
                              setFormRemarcacao({ ...formRemarcacao, data_nova: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Motivo</span>
                          <textarea
                            rows={2}
                            required
                            value={formRemarcacao.motivo}
                            onChange={(e) => setFormRemarcacao({ ...formRemarcacao, motivo: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Responsável pelo impacto</span>
                          <select
                            value={formRemarcacao.responsavel_impacto}
                            onChange={(e) =>
                              setFormRemarcacao({
                                ...formRemarcacao,
                                responsavel_impacto: e.target.value as ImpactoResponsavel,
                              })
                            }
                          >
                            {Object.entries(IMPACTO_RESPONSAVEL_LABELS).map(([valor, rotulo]) => (
                              <option key={valor} value={valor}>
                                {rotulo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="wizard-actions">
                          <button type="button" className="btn btn-secondary" onClick={fecharRemarcacao}>
                            Cancelar
                          </button>
                          <button type="submit" className="btn btn-primary" disabled={salvandoRemarcacao}>
                            {salvandoRemarcacao ? 'Salvando…' : 'Confirmar remarcação'}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
              {checkpointRespondidoEm && (
                <li>
                  <span className="timeline-marco-label">Checkpoint de 30 dias respondido</span>
                  <span className="timeline-marco-data">{formatarDataHora(checkpointRespondidoEm)}</span>
                </li>
              )}
              {MARCOS_ORDENADOS.every(({ campo }) => !cliente[campo]) && !checkpointRespondidoEm && (
                <p className="field-hint">Nenhum marco registrado ainda.</p>
              )}
            </ol>

            <h3>Métricas de duração</h3>
            <ul className="metricas-marcos">
              {calcularMetricas(cliente).map((metrica) => (
                <li key={metrica.label}>
                  <span>{metrica.label}</span>
                  <strong>{metrica.dias != null ? `${metrica.dias}d` : '—'}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

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

      {!!mapeamentoVendas && funilValidado(mapeamentoVendas.status) && (
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

      {!!mapeamentoVendas && funilValidado(mapeamentoVendas.status) && (
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

      {cliente &&
        (() => {
          const resumoTrial = resolverResumoTrialKommo(cliente, new Date());
          if (!resumoTrial) return null;
          return (
            <section className="card form-card">
              <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                <h2 style={{ marginBottom: 0 }}>Trial Kommo</h2>
                <span className={`status-badge status-tone-${STATUS_TRIAL_TONE[resumoTrial.status]}`}>
                  {STATUS_TRIAL_LABELS[resumoTrial.status]}
                </span>
              </div>
              <p className="field-hint">
                {resumoTrial.periodoAtual} — dia {resumoTrial.diaAtualPeriodo}/{resumoTrial.duracaoPeriodoAtual} ·
                uso total {resumoTrial.usoTotalDias}/{resumoTrial.usoTotalMaximo} · vence em{' '}
                {resumoTrial.vencimento.toLocaleDateString('pt-BR')}
              </p>
              {resumoTrial.precisaAlerta && (
                <p className="form-error">
                  Trial vence em {resumoTrial.diasRestantes}d e a extensão de {resumoTrial.proximaExtensao?.rotulo}{' '}
                  ainda não foi solicitada.{' '}
                  {implementacao && <Link to={`/implementacoes/${implementacao.id}`}>Registrar na implementação →</Link>}
                </p>
              )}
            </section>
          );
        })()}

      <section className="card form-card">
        <h2>Anexos</h2>
        <p className="field-hint">Contratos, prints, propostas — qualquer arquivo relevante desse cliente.</p>

        <label className="btn btn-secondary btn-auto" style={{ cursor: 'pointer' }}>
          {enviandoArquivo ? 'Enviando…' : '+ Adicionar arquivo'}
          <input
            type="file"
            multiple
            onChange={handleUploadArquivos}
            disabled={enviandoArquivo}
            style={{ display: 'none' }}
          />
        </label>

        {arquivos.length === 0 ? (
          <p className="field-hint">Nenhum arquivo anexado ainda.</p>
        ) : (
          <ul className="observacoes-lista">
            {arquivos.map((a) => (
              <li key={a.id} className="observacao-item">
                <div className="observacao-item-header">
                  <span className="observacao-item-meta">
                    <strong style={{ color: 'var(--color-text)' }}>{a.nome_arquivo}</strong>
                    {' · '}
                    {formatarTamanho(a.tamanho_bytes)} · {formatarDataHora(a.created_at)}
                    {a.autor_email ? ` · ${a.autor_email}` : ''}
                  </span>
                  <span className="table-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleBaixarArquivo(a)}
                      disabled={baixandoArquivoId === a.id}
                    >
                      {baixandoArquivoId === a.id ? 'Abrindo…' : 'Baixar'}
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleExcluirArquivo(a)}
                      disabled={excluindoArquivoId === a.id}
                    >
                      {excluindoArquivoId === a.id ? 'Excluindo…' : 'Excluir'}
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
