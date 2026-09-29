import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImplementacaoStatusBadge } from '../components/ImplementacaoStatusBadge';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { calcularMetricas, MARCOS_ORDENADOS, type CampoMarco } from '../lib/marcosCliente';
import { funilValidado } from '../lib/statusFluxo';
import { IMPACTO_RESPONSAVEL_LABELS } from '../lib/atividadesCronograma';
import { CATEGORIA_OCORRENCIA_LABELS } from '../lib/ocorrencias';
import { nomeConsultor } from '../lib/operacaoResumo';
import { STATUS_REUNIAO_LABELS, STATUS_REUNIAO_TONE, TIPO_REUNIAO_LABELS } from '../lib/reunioes';
import { resolverResumoTrialKommo, STATUS_TRIAL_LABELS, STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  CategoriaOcorrencia,
  Cliente,
  ClienteArquivo,
  ClienteContato,
  ClienteObservacao,
  ClienteOcorrencia,
  Consultor,
  ImpactoResponsavel,
  ImplementacaoCrm,
  Mapeamento,
  MarcoRemarcacao,
  Reuniao,
  StatusOcorrencia,
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

type FormInfoCliente = {
  nome_fantasia: string;
  razao_social: string;
  cnpj: string;
  site: string;
  cidade: string;
  uf: string;
};

function paraFormInfo(cliente: Cliente): FormInfoCliente {
  return {
    nome_fantasia: cliente.nome_fantasia ?? '',
    razao_social: cliente.razao_social ?? '',
    cnpj: cliente.cnpj ?? '',
    site: cliente.site ?? '',
    cidade: cliente.cidade ?? '',
    uf: cliente.uf ?? '',
  };
}

type FormContato = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  whatsapp: string;
  papel_projeto: string;
  principal: boolean;
};

const FORM_CONTATO_VAZIO: FormContato = {
  nome: '',
  cargo: '',
  email: '',
  telefone: '',
  whatsapp: '',
  papel_projeto: '',
  principal: false,
};

function paraFormContato(contato: ClienteContato): FormContato {
  return {
    nome: contato.nome,
    cargo: contato.cargo ?? '',
    email: contato.email ?? '',
    telefone: contato.telefone ?? '',
    whatsapp: contato.whatsapp ?? '',
    papel_projeto: contato.papel_projeto ?? '',
    principal: contato.principal,
  };
}

type FormOcorrencia = {
  categoria: CategoriaOcorrencia;
  descricao: string;
  responsavel_impacto: ImpactoResponsavel;
  data_ocorrencia: string;
  impacta_cronograma: boolean;
  dias_impacto: string;
};

function formOcorrenciaVazio(): FormOcorrencia {
  return {
    categoria: 'outro',
    descricao: '',
    responsavel_impacto: 'cliente',
    data_ocorrencia: isoParaInput(new Date().toISOString(), false),
    impacta_cronograma: false,
    dias_impacto: '',
  };
}

type ItemHistorico = {
  data: Date;
  tipo: string;
  descricao: string;
  usuario: string | null;
};

const CICLOS_AUTOMACAO = ['Ciclo 2 — Automações I e Check-in 1', 'Ciclo 3 — Automações II e Check-in 2'];

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
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);

  const [editandoInfo, setEditandoInfo] = useState(false);
  const [formInfo, setFormInfo] = useState<FormInfoCliente | null>(null);
  const [salvandoInfo, setSalvandoInfo] = useState(false);

  const [contatos, setContatos] = useState<ClienteContato[]>([]);
  const [formContato, setFormContato] = useState<FormContato | null>(null);
  const [editandoContatoId, setEditandoContatoId] = useState<string | null>(null);
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [excluindoContatoId, setExcluindoContatoId] = useState<string | null>(null);

  const [atividadesAutomacao, setAtividadesAutomacao] = useState<AtividadeCronograma[]>([]);
  const [statusAutomacao, setStatusAutomacao] = useState<AtividadeStatusRow[]>([]);

  const [ocorrencias, setOcorrencias] = useState<ClienteOcorrencia[]>([]);
  const [formOcorrencia, setFormOcorrencia] = useState<FormOcorrencia | null>(null);
  const [salvandoOcorrencia, setSalvandoOcorrencia] = useState(false);
  const [resolvendoOcorrenciaId, setResolvendoOcorrenciaId] = useState<string | null>(null);

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
      { data: contatosData },
      { data: ocorrenciasData },
      { data: reunioesData },
      { data: consultoresData },
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
      supabase
        .from('cliente_contatos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('principal', { ascending: false }),
      supabase
        .from('cliente_ocorrencias')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('data_ocorrencia', { ascending: false }),
      supabase
        .from('reunioes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('data_hora', { ascending: true }),
      supabase.from('consultores').select('*').order('nome', { ascending: true }),
    ]);

    if (clienteError || !clienteData) {
      setError('Cliente não encontrado.');
      setLoading(false);
      return;
    }

    setCliente(clienteData);
    setForm(paraForm(clienteData));
    setFormMarcos(paraFormMarcos(clienteData));
    setFormInfo(paraFormInfo(clienteData));
    setMapeamentoVendas(vendasData ?? null);
    setMapeamentoPosVenda(posVendaData ?? null);
    setImplementacao(implementacaoData ?? null);
    setObservacoes(observacoesData ?? []);
    setArquivos(arquivosData ?? []);
    setRemarcacoes(remarcacoesData ?? []);
    setContatos(contatosData ?? []);
    setOcorrencias(ocorrenciasData ?? []);
    setReunioes(reunioesData ?? []);
    setConsultores(consultoresData ?? []);

    if (implementacaoData) {
      const { data: checkpointData } = await supabase
        .from('checkpoints_adocao')
        .select('respondido_em')
        .eq('implementacao_id', implementacaoData.id)
        .maybeSingle();
      setCheckpointRespondidoEm(checkpointData?.respondido_em ?? null);

      const [{ data: atividadesData }, { data: statusData }] = await Promise.all([
        supabase
          .from('atividades_cronograma')
          .select('*')
          .or(`implementacao_id.is.null,implementacao_id.eq.${implementacaoData.id}`)
          .in('ciclo', CICLOS_AUTOMACAO),
        supabase.from('atividades_status').select('*').eq('implementacao_id', implementacaoData.id),
      ]);
      setAtividadesAutomacao(atividadesData ?? []);
      setStatusAutomacao(statusData ?? []);
    } else {
      setCheckpointRespondidoEm(null);
      setAtividadesAutomacao([]);
      setStatusAutomacao([]);
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

  async function handleSalvarInfo(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !formInfo) return;

    setSalvandoInfo(true);
    const { data, error: updateError } = await supabase
      .from('clientes')
      .update({
        nome_fantasia: formInfo.nome_fantasia.trim() || null,
        razao_social: formInfo.razao_social.trim() || null,
        cnpj: formInfo.cnpj.trim() || null,
        site: formInfo.site.trim() || null,
        cidade: formInfo.cidade.trim() || null,
        uf: formInfo.uf.trim() || null,
      })
      .eq('id', cliente.id)
      .select()
      .single();
    setSalvandoInfo(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setFormInfo(paraFormInfo(data));
    setEditandoInfo(false);
  }

  function abrirNovoContato() {
    setEditandoContatoId(null);
    setFormContato(FORM_CONTATO_VAZIO);
  }

  function abrirEdicaoContato(contato: ClienteContato) {
    setEditandoContatoId(contato.id);
    setFormContato(paraFormContato(contato));
  }

  function fecharFormContato() {
    setFormContato(null);
    setEditandoContatoId(null);
  }

  async function handleSalvarContato(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !formContato || !formContato.nome.trim()) return;

    setSalvandoContato(true);
    setError(null);

    // Só um contato principal por cliente — sem trigger no banco pra isso,
    // então desmarca os outros antes de gravar este como principal.
    if (formContato.principal) {
      const { error: unsetError } = await supabase
        .from('cliente_contatos')
        .update({ principal: false })
        .eq('cliente_id', cliente.id)
        .neq('id', editandoContatoId ?? '00000000-0000-0000-0000-000000000000');
      if (unsetError) {
        setSalvandoContato(false);
        setError(unsetError.message);
        return;
      }
    }

    const payload = {
      nome: formContato.nome.trim(),
      cargo: formContato.cargo.trim() || null,
      email: formContato.email.trim() || null,
      telefone: formContato.telefone.trim() || null,
      whatsapp: formContato.whatsapp.trim() || null,
      papel_projeto: formContato.papel_projeto.trim() || null,
      principal: formContato.principal,
    };

    const { error: saveError } = editandoContatoId
      ? await supabase.from('cliente_contatos').update(payload).eq('id', editandoContatoId)
      : await supabase.from('cliente_contatos').insert({ ...payload, cliente_id: cliente.id });

    setSalvandoContato(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormContato();
    if (id) carregar(id);
  }

  async function handleExcluirContato(contato: ClienteContato) {
    if (!window.confirm(`Excluir o contato "${contato.nome}"?`)) return;

    setExcluindoContatoId(contato.id);
    const { error: deleteError } = await supabase.from('cliente_contatos').delete().eq('id', contato.id);
    setExcluindoContatoId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setContatos((prev) => prev.filter((c) => c.id !== contato.id));
  }

  function abrirNovaOcorrencia() {
    setFormOcorrencia(formOcorrenciaVazio());
  }

  function fecharFormOcorrencia() {
    setFormOcorrencia(null);
  }

  async function handleSalvarOcorrencia(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !user || !formOcorrencia || !formOcorrencia.descricao.trim()) return;

    setSalvandoOcorrencia(true);
    const { data, error: insertError } = await supabase
      .from('cliente_ocorrencias')
      .insert({
        cliente_id: cliente.id,
        categoria: formOcorrencia.categoria,
        descricao: formOcorrencia.descricao.trim(),
        responsavel_impacto: formOcorrencia.responsavel_impacto,
        data_ocorrencia: inputParaIso(formOcorrencia.data_ocorrencia, false) ?? new Date().toISOString(),
        impacta_cronograma: formOcorrencia.impacta_cronograma,
        dias_impacto: formOcorrencia.impacta_cronograma && formOcorrencia.dias_impacto
          ? Number(formOcorrencia.dias_impacto)
          : null,
        status: 'aberta',
        autor_email: user.email ?? null,
      })
      .select()
      .single();
    setSalvandoOcorrencia(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOcorrencias((prev) => [data, ...prev]);
    setFormOcorrencia(null);
  }

  async function handleResolverOcorrencia(ocorrencia: ClienteOcorrencia) {
    setResolvendoOcorrenciaId(ocorrencia.id);
    const { data, error: updateError } = await supabase
      .from('cliente_ocorrencias')
      .update({ status: 'resolvida' as StatusOcorrencia, resolvida_em: new Date().toISOString() })
      .eq('id', ocorrencia.id)
      .select()
      .single();
    setResolvendoOcorrenciaId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setOcorrencias((prev) => prev.map((o) => (o.id === ocorrencia.id ? data : o)));
  }

  const ocorrenciasOrdenadas = useMemo(() => {
    return [...ocorrencias].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'aberta' ? -1 : 1;
      return new Date(b.data_ocorrencia).getTime() - new Date(a.data_ocorrencia).getTime();
    });
  }, [ocorrencias]);

  const contatosOrdenados = useMemo(() => {
    return [...contatos].sort((a, b) => {
      if (a.principal !== b.principal) return a.principal ? -1 : 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [contatos]);

  // Linha do tempo automática — combina marcos do cliente, remarcações de
  // Kickoff/Treinamento e conclusões de atividades de automação, sem criar
  // tabela de eventos própria. Só leitura: cada fonte já tem seu próprio
  // formulário de edição em outra seção desta página.
  const historicoTimeline = useMemo<ItemHistorico[]>(() => {
    if (!cliente) return [];

    const itens: ItemHistorico[] = [];

    for (const { campo, label, apenasData } of MARCOS_ORDENADOS) {
      const valor = cliente[campo];
      if (!valor) continue;
      itens.push({
        data: apenasData ? new Date(`${valor}T12:00:00`) : new Date(valor),
        tipo: label,
        descricao: label,
        usuario: null,
      });
    }

    for (const remarcacao of remarcacoes) {
      const tipo = remarcacao.campo_marco === 'kickoff_agendado_para' ? 'Kickoff remarcado' : 'Treinamento remarcado';
      const dataAnteriorTexto = remarcacao.data_anterior ? formatarDataHora(remarcacao.data_anterior) : '—';
      itens.push({
        data: new Date(remarcacao.created_at),
        tipo,
        descricao: `de ${dataAnteriorTexto} para ${formatarDataHora(remarcacao.data_nova)} — motivo: ${remarcacao.motivo} (impacto: ${IMPACTO_RESPONSAVEL_LABELS[remarcacao.responsavel_impacto]})`,
        usuario: null,
      });
    }

    if (implementacao) {
      for (const atividade of atividadesAutomacao) {
        const statusRow = statusAutomacao.find(
          (s) => s.atividade_id === atividade.id && s.implementacao_id === implementacao.id,
        );
        if (!statusRow?.data_real) continue;
        itens.push({
          data: new Date(statusRow.data_real),
          tipo: 'Automação concluída',
          descricao: atividade.nome,
          usuario: null,
        });
      }
    }

    // Kickoff/Treinamento já entram acima via MARCOS_ORDENADOS — não
    // duplicar aqui. Os outros 5 tipos de reunião não têm marco equivalente,
    // então entram só a partir do módulo de Reuniões.
    for (const reuniao of reunioes) {
      if (reuniao.tipo === 'kickoff' || reuniao.tipo === 'treinamento') continue;
      if (reuniao.status !== 'realizada' || !reuniao.data_hora) continue;
      itens.push({
        data: new Date(reuniao.data_hora),
        tipo: `${TIPO_REUNIAO_LABELS[reuniao.tipo]} realizado(a)`,
        descricao: reuniao.resumo || reuniao.titulo || TIPO_REUNIAO_LABELS[reuniao.tipo],
        usuario: null,
      });
    }

    return itens.sort((a, b) => b.data.getTime() - a.data.getTime());
  }, [cliente, remarcacoes, implementacao, atividadesAutomacao, statusAutomacao, reunioes]);

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
          <h2 style={{ marginBottom: 0 }}>Informações do cliente</h2>
          {!editandoInfo && (
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => {
                setFormInfo(paraFormInfo(cliente));
                setEditandoInfo(true);
              }}
            >
              Editar informações
            </button>
          )}
        </div>

        {editandoInfo && formInfo ? (
          <form onSubmit={handleSalvarInfo}>
            <div className="form-grid">
              <label className="field">
                <span>Nome fantasia</span>
                <input
                  type="text"
                  value={formInfo.nome_fantasia}
                  onChange={(e) => setFormInfo({ ...formInfo, nome_fantasia: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Razão social</span>
                <input
                  type="text"
                  value={formInfo.razao_social}
                  onChange={(e) => setFormInfo({ ...formInfo, razao_social: e.target.value })}
                />
              </label>
              <label className="field">
                <span>CNPJ</span>
                <input
                  type="text"
                  value={formInfo.cnpj}
                  onChange={(e) => setFormInfo({ ...formInfo, cnpj: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Site</span>
                <input
                  type="url"
                  value={formInfo.site}
                  onChange={(e) => setFormInfo({ ...formInfo, site: e.target.value })}
                  placeholder="https://..."
                />
              </label>
              <label className="field">
                <span>Cidade</span>
                <input
                  type="text"
                  value={formInfo.cidade}
                  onChange={(e) => setFormInfo({ ...formInfo, cidade: e.target.value })}
                />
              </label>
              <label className="field">
                <span>UF</span>
                <input
                  type="text"
                  maxLength={2}
                  value={formInfo.uf}
                  onChange={(e) => setFormInfo({ ...formInfo, uf: e.target.value.toUpperCase() })}
                />
              </label>
            </div>
            <div className="wizard-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFormInfo(paraFormInfo(cliente));
                  setEditandoInfo(false);
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoInfo}>
                {salvandoInfo ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        ) : (
          <div className="form-grid">
            <p>
              <strong>Nome fantasia:</strong> {cliente.nome_fantasia ?? '—'}
            </p>
            <p>
              <strong>Razão social:</strong> {cliente.razao_social ?? '—'}
            </p>
            <p>
              <strong>CNPJ:</strong> {cliente.cnpj ?? '—'}
            </p>
            <p>
              <strong>Site:</strong> {cliente.site ?? '—'}
            </p>
            <p>
              <strong>Cidade:</strong> {cliente.cidade ?? '—'}
            </p>
            <p>
              <strong>UF:</strong> {cliente.uf ?? '—'}
            </p>
          </div>
        )}
      </section>

      <section className="card form-card">
        <h2>Contatos</h2>
        <p className="field-hint">Pessoas envolvidas no projeto por parte do cliente — pode haver mais de uma.</p>

        {contatosOrdenados.length === 0 ? (
          <p className="field-hint">Nenhum contato cadastrado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cargo</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>WhatsApp</th>
                  <th>Papel no projeto</th>
                  <th></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contatosOrdenados.map((contato) => (
                  <tr key={contato.id}>
                    <td>{contato.nome}</td>
                    <td>{contato.cargo ?? '—'}</td>
                    <td>{contato.email ?? '—'}</td>
                    <td>{contato.telefone ?? '—'}</td>
                    <td>{contato.whatsapp ?? '—'}</td>
                    <td>{contato.papel_projeto ?? '—'}</td>
                    <td>
                      {contato.principal && <span className="status-badge status-tone-info">Principal</span>}
                    </td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => abrirEdicaoContato(contato)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleExcluirContato(contato)}
                        disabled={excluindoContatoId === contato.id}
                      >
                        {excluindoContatoId === contato.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {formContato ? (
          <form onSubmit={handleSalvarContato} className="card form-card">
            <h3>{editandoContatoId ? 'Editar contato' : 'Novo contato'}</h3>
            <div className="form-grid">
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formContato.nome}
                  onChange={(e) => setFormContato({ ...formContato, nome: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Cargo</span>
                <input
                  type="text"
                  value={formContato.cargo}
                  onChange={(e) => setFormContato({ ...formContato, cargo: e.target.value })}
                />
              </label>
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={formContato.email}
                  onChange={(e) => setFormContato({ ...formContato, email: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input
                  type="text"
                  value={formContato.telefone}
                  onChange={(e) => setFormContato({ ...formContato, telefone: e.target.value })}
                />
              </label>
              <label className="field">
                <span>WhatsApp</span>
                <input
                  type="text"
                  value={formContato.whatsapp}
                  onChange={(e) => setFormContato({ ...formContato, whatsapp: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Papel no projeto</span>
                <input
                  type="text"
                  value={formContato.papel_projeto}
                  onChange={(e) => setFormContato({ ...formContato, papel_projeto: e.target.value })}
                  placeholder="Ex: Decisor, usuário do CRM"
                />
              </label>
            </div>
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formContato.principal}
                onChange={(e) => setFormContato({ ...formContato, principal: e.target.checked })}
              />
              <span>Contato principal (marca este e desmarca qualquer outro contato principal)</span>
            </label>
            <div className="wizard-actions">
              <button type="button" className="btn btn-secondary" onClick={fecharFormContato}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoContato}>
                {salvandoContato ? 'Salvando…' : 'Salvar contato'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovoContato}>
            + Adicionar contato
          </button>
        )}
      </section>

      <section className="card form-card">
        <h2>Histórico</h2>
        <p className="field-hint">
          Linha do tempo automática, montada a partir dos marcos, remarcações e atividades já
          registradas neste cliente — não editável diretamente aqui.
        </p>
        {historicoTimeline.length === 0 ? (
          <p className="field-hint">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="timeline-marcos">
            {historicoTimeline.map((item, index) => (
              <li key={index}>
                <span className="timeline-marco-label">{item.tipo}</span>
                <span className="timeline-marco-data">
                  {formatarDataHora(item.data.toISOString())} — {item.descricao}
                  {item.usuario ? ` — usuário: ${item.usuario}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card form-card">
        <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
          <h2 style={{ marginBottom: 0 }}>Ocorrências</h2>
          {!formOcorrencia && (
            <button type="button" className="btn btn-secondary btn-auto" onClick={abrirNovaOcorrencia}>
              + Registrar ocorrência
            </button>
          )}
        </div>
        <p className="field-hint">
          Incidentes que afetam o andamento do projeto — reunião cancelada, acesso pendente, mudança
          de escopo etc.
        </p>

        {formOcorrencia && (
          <form onSubmit={handleSalvarOcorrencia} className="card form-card">
            <h3>Nova ocorrência</h3>
            <div className="form-grid">
              <label className="field">
                <span>Categoria</span>
                <select
                  required
                  value={formOcorrencia.categoria}
                  onChange={(e) =>
                    setFormOcorrencia({ ...formOcorrencia, categoria: e.target.value as CategoriaOcorrencia })
                  }
                >
                  {Object.entries(CATEGORIA_OCORRENCIA_LABELS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Responsável pelo impacto</span>
                <select
                  required
                  value={formOcorrencia.responsavel_impacto}
                  onChange={(e) =>
                    setFormOcorrencia({
                      ...formOcorrencia,
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
              <label className="field">
                <span>Data</span>
                <input
                  type="datetime-local"
                  required
                  value={formOcorrencia.data_ocorrencia}
                  onChange={(e) => setFormOcorrencia({ ...formOcorrencia, data_ocorrencia: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>Descrição</span>
              <textarea
                rows={3}
                required
                value={formOcorrencia.descricao}
                onChange={(e) => setFormOcorrencia({ ...formOcorrencia, descricao: e.target.value })}
              />
            </label>
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formOcorrencia.impacta_cronograma}
                onChange={(e) =>
                  setFormOcorrencia({
                    ...formOcorrencia,
                    impacta_cronograma: e.target.checked,
                    dias_impacto: e.target.checked ? formOcorrencia.dias_impacto : '',
                  })
                }
              />
              <span>Impacta o cronograma</span>
            </label>
            <label className="field">
              <span>Dias de impacto</span>
              <input
                type="number"
                min={0}
                disabled={!formOcorrencia.impacta_cronograma}
                value={formOcorrencia.dias_impacto}
                onChange={(e) => setFormOcorrencia({ ...formOcorrencia, dias_impacto: e.target.value })}
              />
            </label>
            <div className="wizard-actions">
              <button type="button" className="btn btn-secondary" onClick={fecharFormOcorrencia}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoOcorrencia}>
                {salvandoOcorrencia ? 'Salvando…' : 'Salvar ocorrência'}
              </button>
            </div>
          </form>
        )}

        {ocorrenciasOrdenadas.length === 0 ? (
          <p className="field-hint">Nenhuma ocorrência registrada ainda.</p>
        ) : (
          <ul className="observacoes-lista">
            {ocorrenciasOrdenadas.map((o) => (
              <li key={o.id} className="observacao-item" style={o.status === 'aberta' ? { borderLeft: '3px solid var(--color-danger)' } : undefined}>
                <div className="observacao-item-header">
                  <span className="observacao-item-meta">
                    <span className={`status-badge status-tone-${o.status === 'aberta' ? 'danger' : 'success'}`}>
                      {o.status === 'aberta' ? 'Aberta' : 'Resolvida'}
                    </span>{' '}
                    <strong style={{ color: 'var(--color-text)' }}>{CATEGORIA_OCORRENCIA_LABELS[o.categoria]}</strong>
                    {' · '}
                    {formatarDataHora(o.data_ocorrencia)} · impacto: {IMPACTO_RESPONSAVEL_LABELS[o.responsavel_impacto]}
                    {o.impacta_cronograma ? ` · impacta cronograma (${o.dias_impacto ?? 0}d)` : ''}
                    {o.autor_email ? ` · ${o.autor_email}` : ''}
                  </span>
                  {o.status === 'aberta' ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleResolverOcorrencia(o)}
                      disabled={resolvendoOcorrenciaId === o.id}
                    >
                      {resolvendoOcorrenciaId === o.id ? 'Salvando…' : 'Marcar como resolvida'}
                    </button>
                  ) : (
                    <span className="field-hint">Resolvida em {formatarDataHora(o.resolvida_em!)}</span>
                  )}
                </div>
                <p className="observacao-item-texto">{o.descricao}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                        (new Date(cliente[campo]!).getTime() - new Date(maisAntiga.data_anterior).getTime()) /
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
                        <span className="field-hint">
                          {' '}
                          ·{' '}
                          {implementacao ? (
                            <Link to={`/implementacoes/${implementacao.id}`}>Gerenciar em Reuniões →</Link>
                          ) : (
                            'Gerencie pelo módulo de Reuniões, dentro da implementação'
                          )}
                        </span>
                      )}
                    </span>
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
          <h2 style={{ marginBottom: 0 }}>Reuniões</h2>
          {implementacao && (
            <Link to={`/implementacoes/${implementacao.id}`} className="btn btn-secondary btn-auto">
              Gerenciar reuniões
            </Link>
          )}
        </div>
        <p className="field-hint">
          Só leitura aqui — agendar, editar e remarcar reuniões acontece na aba "Reuniões" da
          implementação.
        </p>
        {reunioes.length === 0 ? (
          <p className="field-hint">Nenhuma reunião registrada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Título</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Consultor responsável</th>
                </tr>
              </thead>
              <tbody>
                {reunioes.map((r) => (
                  <tr key={r.id}>
                    <td>{TIPO_REUNIAO_LABELS[r.tipo]}</td>
                    <td>{r.titulo ?? '—'}</td>
                    <td>{r.data_hora ? formatarDataHora(r.data_hora) : 'Não agendada'}</td>
                    <td>
                      <span className={`status-badge status-tone-${STATUS_REUNIAO_TONE[r.status]}`}>
                        {STATUS_REUNIAO_LABELS[r.status]}
                      </span>
                    </td>
                    <td>{nomeConsultor(r.consultor_responsavel_id, consultores) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
