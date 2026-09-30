import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FunilDetalhado } from '../components/funil/FunilDetalhado';
import { StatusBadge } from '../components/StatusBadge';
import { MapeamentoWizard } from '../components/wizard/MapeamentoWizard';
import { ResumoWizard } from '../components/wizard/ResumoWizard';
import { useAuth } from '../contexts/AuthContext';
import type { BlocoFormulario } from '../data/formSchema';
import { extrairMensagemErroEdgeFunction } from '../lib/edgeFunctionError';
import { exportarFunisParaExcel } from '../lib/exportXlsx';
import { carregarFormSchema } from '../lib/formSchemaService';
import {
  aprovarVersao,
  criarVersaoFunilParaEdicao,
  rotuloVersao,
  statusMapeamentoPorValidacao,
  VALIDACAO_FUNIL_KICKOFF_LABELS,
  type ValidacaoFunilKickoff,
} from '../lib/funilVersoes';
import { supabase } from '../lib/supabaseClient';
import {
  funilJaGerado,
  funilValidado,
  MAPEAMENTO_STATUS_LABELS,
  PROXIMOS_STATUS_MAPEAMENTO,
} from '../lib/statusFluxo';
import type {
  Cliente,
  EtapaFunil,
  FunilGerado,
  FunilVersao,
  GeracaoMeta,
  ImplementacaoCrm,
  Mapeamento as MapeamentoType,
  MapeamentoStatus,
} from '../types/database';

const NIVEL_COMPLEXIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export function Mapeamento() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mapeamento, setMapeamento] = useState<MapeamentoType | null>(null);
  const [funis, setFunis] = useState<FunilGerado[]>([]);
  const [geracaoMeta, setGeracaoMeta] = useState<GeracaoMeta | null>(null);
  const [versoesDisponiveis, setVersoesDisponiveis] = useState<number[]>([]);
  const [versaoSelecionada, setVersaoSelecionada] = useState<number | null>(null);
  const [funilVersoes, setFunilVersoes] = useState<FunilVersao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retomando, setRetomando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [mostrarRegenerar, setMostrarRegenerar] = useState(false);
  const [instrucoesExtras, setInstrucoesExtras] = useState('');
  const [regenerando, setRegenerando] = useState(false);
  const [regenerarDemorando, setRegenerarDemorando] = useState(false);
  const [regenerarError, setRegenerarError] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [implementacaoExistente, setImplementacaoExistente] = useState<ImplementacaoCrm | null>(null);
  const [iniciandoImplementacao, setIniciandoImplementacao] = useState(false);
  const [blocosFormulario, setBlocosFormulario] = useState<BlocoFormulario[]>([]);
  const [mostrarRespostas, setMostrarRespostas] = useState(false);
  const [posVendaExistente, setPosVendaExistente] = useState<MapeamentoType | null>(null);
  const [criandoPosVenda, setCriandoPosVenda] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [modo, setModo] = useState<'tecnica' | 'apresentacao'>('tecnica');
  const [marcandoRevisado, setMarcandoRevisado] = useState(false);
  const [criandoNovaVersao, setCriandoNovaVersao] = useState(false);

  // P1-A1/A2: validar o funil (avançar pra funil_validado/ajustes_solicitados
  // a partir de kickoff_agendado ou de ajustes_solicitados) deixou de ser um
  // botão genérico de status — exige escolher explicitamente a versão e,
  // quando o Kickoff ainda não foi formalmente registrado, também a data
  // real da reunião. Ver handleValidarFunil.
  const [validandoFunilAberto, setValidandoFunilAberto] = useState(false);
  const [versaoParaValidar, setVersaoParaValidar] = useState('');
  const [dataHoraKickoffReal, setDataHoraKickoffReal] = useState('');
  const [respostaValidacaoCliente, setRespostaValidacaoCliente] = useState<ValidacaoFunilKickoff | ''>('');
  const [salvandoValidacaoFunil, setSalvandoValidacaoFunil] = useState(false);
  // Erro próprio desse formulário — não usa o `error` da página, que tem um
  // early return que troca a página inteira por essa mensagem (ver render).
  const [erroValidacaoFunil, setErroValidacaoFunil] = useState<string | null>(null);
  const [clienteResumo, setClienteResumo] = useState<Pick<
    Cliente,
    'nome_empresa' | 'kickoff_agendado_para' | 'kickoff_realizado_em'
  > | null>(null);

  async function carregarFunis(mapeamentoId: string, versaoAlvo?: number) {
    const { data: versoesData, error: versoesError } = await supabase
      .from('funis_gerados')
      .select('versao')
      .eq('mapeamento_id', mapeamentoId)
      .order('versao', { ascending: false });

    if (versoesError) {
      setError(versoesError.message);
      return;
    }

    const versoes = Array.from(new Set((versoesData ?? []).map((v) => v.versao)));
    setVersoesDisponiveis(versoes);

    const alvo = versaoAlvo ?? versoes[0];
    setVersaoSelecionada(alvo ?? null);

    if (alvo === undefined) {
      setFunis([]);
      setGeracaoMeta(null);
      return;
    }

    const { data: funisData, error: funisError } = await supabase
      .from('funis_gerados')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', alvo)
      .order('ordem', { ascending: true });

    if (funisError) setError(funisError.message);
    else setFunis(funisData ?? []);

    const { data: metaData } = await supabase
      .from('geracoes_meta')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', alvo)
      .maybeSingle();

    setGeracaoMeta(metaData ?? null);

    const { data: funilVersoesData } = await supabase
      .from('funil_versoes')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .order('versao', { ascending: false });

    setFunilVersoes(funilVersoesData ?? []);
  }

  useEffect(() => {
    if (!id) return;
    const mapeamentoId = id;
    let cancelled = false;
    setRetomando(false);
    setMostrarRegenerar(false);
    setInstrucoesExtras('');
    setRegenerarError(null);

    async function load() {
      setLoading(true);
      setError(null);

      const { data: mapeamentoData, error: mapeamentoError } = await supabase
        .from('mapeamentos')
        .select('*')
        .eq('id', mapeamentoId)
        .single();

      if (cancelled) return;

      if (mapeamentoError) {
        setError(mapeamentoError.message);
        setLoading(false);
        return;
      }

      setMapeamento(mapeamentoData);

      if (
        funilJaGerado(mapeamentoData.status) ||
        mapeamentoData.status === 'erro' ||
        mapeamentoData.status === 'aguardando_esclarecimento'
      ) {
        await carregarFunis(mapeamentoId);
      }

      const { data: implementacaoData } = await supabase
        .from('implementacoes_crm')
        .select('*')
        .eq('mapeamento_id', mapeamentoId)
        .maybeSingle();

      if (!cancelled) setImplementacaoExistente(implementacaoData ?? null);

      if (mapeamentoData.cliente_id) {
        const { data: clienteData } = await supabase
          .from('clientes')
          .select('nome_empresa, kickoff_agendado_para, kickoff_realizado_em')
          .eq('id', mapeamentoData.cliente_id)
          .maybeSingle();
        if (!cancelled) setClienteResumo(clienteData ?? null);
      }

      if (mapeamentoData.tipo === 'vendas') {
        const { data: posVendaData } = await supabase
          .from('mapeamentos')
          .select('*')
          .eq('mapeamento_origem_id', mapeamentoId)
          .eq('tipo', 'pos_venda')
          .maybeSingle();

        if (!cancelled) setPosVendaExistente(posVendaData ?? null);
      }

      if (funilJaGerado(mapeamentoData.status)) {
        try {
          const blocos = await carregarFormSchema(mapeamentoData.tipo);
          if (!cancelled) setBlocosFormulario(blocos);
        } catch {
          // se não der pra carregar o schema, a seção de respostas simplesmente não aparece
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleStatusChange(atualizado: MapeamentoType) {
    setMapeamento(atualizado);

    if (funilJaGerado(atualizado.status)) {
      await carregarFunis(atualizado.id);
    }
  }

  // Transições genéricas de status que NÃO envolvem validar o funil (essa
  // tem fluxo próprio — ver handleValidarFunil, P1-A1/A2 da auditoria
  // funcional: aprovar um funil e/ou marcar o Kickoff como realizado nunca
  // pode ser um efeito colateral silencioso de um botão de status genérico).
  async function handleAvancarStatusMapeamento(novoStatus: MapeamentoStatus) {
    if (!mapeamento || novoStatus === 'funil_validado') return;
    setAlterandoStatus(true);
    setError(null);

    const { data, error: updateError } = await supabase
      .from('mapeamentos')
      .update({ status: novoStatus })
      .eq('id', mapeamento.id)
      .select()
      .single();

    setAlterandoStatus(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMapeamento(data);
  }

  function abrirValidarFunil() {
    setValidandoFunilAberto(true);
    setRespostaValidacaoCliente('');
    setVersaoParaValidar(versaoMaisRecente ? String(versaoMaisRecente) : '');
    setDataHoraKickoffReal('');
    setErroValidacaoFunil(null);
  }

  function fecharValidarFunil() {
    setValidandoFunilAberto(false);
    setRespostaValidacaoCliente('');
    setVersaoParaValidar('');
    setDataHoraKickoffReal('');
  }

  // Fluxo único de validação do funil no Kickoff (ou revalidação após
  // ajustes) — substitui o botão genérico "Funil validado":
  // - a versão aprovada é sempre uma escolha explícita e confirmada, nunca
  //   "a mais recente" por padrão (P1-A1);
  // - se o Kickoff desta implementação ainda não foi formalmente registrado
  //   (nenhuma reunião de Kickoff realizada pra este cliente), essa ação
  //   também cria essa reunião com a data real informada — o banco recusa
  //   marcar kickoff_realizado_em sem ela existir (trigger da migration
  //   0063), então os 40 dias nunca começam a contar sem uma reunião formal
  //   (P1-A2).
  async function handleValidarFunil() {
    if (!mapeamento) return;

    if (!respostaValidacaoCliente) {
      setErroValidacaoFunil('Selecione se o cliente validou o funil.');
      return;
    }

    const precisaRevisar = respostaValidacaoCliente === 'precisa_revisar';
    const kickoffJaRegistrado = Boolean(clienteResumo?.kickoff_realizado_em);

    if (!precisaRevisar && !versaoParaValidar) {
      setErroValidacaoFunil('Selecione qual versão do funil está sendo validada.');
      return;
    }
    if (!kickoffJaRegistrado && !dataHoraKickoffReal) {
      setErroValidacaoFunil('Informe a data/hora em que o Kickoff foi realizado.');
      return;
    }
    if (
      !precisaRevisar &&
      !window.confirm(`Você está aprovando a Versão ${versaoParaValidar} para implementação. Confirmar?`)
    ) {
      return;
    }

    setSalvandoValidacaoFunil(true);
    setErroValidacaoFunil(null);

    let reuniaoKickoffId: string | null = null;

    if (!kickoffJaRegistrado && mapeamento.cliente_id) {
      const dataHoraIso = new Date(dataHoraKickoffReal).toISOString();

      const { data: reuniaoData, error: reuniaoError } = await supabase
        .from('reunioes')
        .insert({
          cliente_id: mapeamento.cliente_id,
          tipo: 'kickoff',
          status: 'realizada',
          data_hora: dataHoraIso,
          titulo: 'Kickoff',
        })
        .select()
        .single();

      if (reuniaoError) {
        setSalvandoValidacaoFunil(false);
        setErroValidacaoFunil(reuniaoError.message);
        return;
      }
      reuniaoKickoffId = reuniaoData.id;

      const { error: clienteError } = await supabase
        .from('clientes')
        .update({ kickoff_realizado_em: dataHoraIso, kickoff_agendado_para: dataHoraIso })
        .eq('id', mapeamento.cliente_id)
        .is('kickoff_realizado_em', null);

      if (clienteError) {
        setSalvandoValidacaoFunil(false);
        setErroValidacaoFunil(clienteError.message);
        return;
      }

      setClienteResumo((prev) => (prev ? { ...prev, kickoff_realizado_em: dataHoraIso } : prev));
    }

    const novoStatus = statusMapeamentoPorValidacao(respostaValidacaoCliente);

    const { data: mapeamentoAtualizado, error: statusError } = await supabase
      .from('mapeamentos')
      .update({ status: novoStatus })
      .eq('id', mapeamento.id)
      .select()
      .single();

    if (statusError) {
      setSalvandoValidacaoFunil(false);
      setErroValidacaoFunil(statusError.message);
      return;
    }

    setMapeamento(mapeamentoAtualizado);

    if (novoStatus === 'funil_validado') {
      const { error: aprovacaoError } = await aprovarVersao(supabase, mapeamento.id, Number(versaoParaValidar), {
        aprovadoPorEmail: user?.email ?? null,
        kickoffReuniaoId: reuniaoKickoffId,
      });
      if (aprovacaoError) setErroValidacaoFunil(aprovacaoError);
    }

    await carregarFunis(mapeamento.id, versaoSelecionada ?? undefined);
    setSalvandoValidacaoFunil(false);
    fecharValidarFunil();
  }

  // Única forma de "editar" uma versão aprovada: duplica o conteúdo dela
  // numa versão nova em rascunho (o banco recusa update direto numa versão
  // aprovada — ver trigger em migration 0060). A versão aprovada original
  // continua intacta e acessível pelo seletor de versões.
  async function handleCriarNovaVersaoParaEdicao(versaoOrigem: number) {
    if (!mapeamento) return;
    setCriandoNovaVersao(true);
    setError(null);

    const { novaVersao, error: criarError } = await criarVersaoFunilParaEdicao(
      supabase,
      mapeamento.id,
      versaoOrigem,
    );

    setCriandoNovaVersao(false);

    if (criarError || novaVersao === null) {
      setError(criarError ?? 'Não foi possível criar uma nova versão para edição.');
      return;
    }

    await carregarFunis(mapeamento.id, novaVersao);
  }

  async function handleMarcarRevisado() {
    if (!mapeamento || !user?.email) return;
    setMarcandoRevisado(true);
    const { data, error: updateError } = await supabase
      .from('mapeamentos')
      .update({ revisado_por_email: user.email, revisado_em: new Date().toISOString() })
      .eq('id', mapeamento.id)
      .select()
      .single();
    setMarcandoRevisado(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMapeamento(data);
  }

  function handleVerVersao(versao: number) {
    if (!mapeamento) return;
    carregarFunis(mapeamento.id, versao);
  }

  function handleEtapasChange(funilId: string, novasEtapas: EtapaFunil[]) {
    setFunis((prev) =>
      prev.map((funil) => (funil.id === funilId ? { ...funil, etapas: novasEtapas } : funil)),
    );
  }

  async function handleExportar() {
    if (!mapeamento) return;
    setExportando(true);
    try {
      await exportarFunisParaExcel(mapeamento.nome_negocio, funis);
    } finally {
      setExportando(false);
    }
  }

  async function handleCopiarLink() {
    if (!mapeamento) return;
    const link = `${window.location.origin}/f/${mapeamento.codigo_curto}`;
    await navigator.clipboard.writeText(link);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);

    if (mapeamento.tipo === 'vendas' && mapeamento.cliente_id) {
      await supabase
        .from('clientes')
        .update({ formulario_enviado_em: new Date().toISOString() })
        .eq('id', mapeamento.cliente_id)
        .is('formulario_enviado_em', null);
    }
  }

  async function handleExcluir() {
    if (!mapeamento) return;
    if (
      !window.confirm(
        `Excluir o mapeamento "${mapeamento.nome_negocio}"? Essa ação não pode ser desfeita e também apaga os funis gerados a partir dele.`,
      )
    ) {
      return;
    }

    setExcluindo(true);
    const { error: deleteError } = await supabase.from('mapeamentos').delete().eq('id', mapeamento.id);
    setExcluindo(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate('/');
  }

  async function handleIniciarImplementacao() {
    if (!mapeamento || !user) return;
    setIniciandoImplementacao(true);

    const { data, error: insertError } = await supabase
      .from('implementacoes_crm')
      .insert({
        mapeamento_id: mapeamento.id,
        cliente_id: mapeamento.cliente_id,
        user_id: user.id,
        nome_cliente: mapeamento.nome_negocio,
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

  async function handleDuplicar() {
    if (!mapeamento || !user) return;
    setDuplicando(true);

    const { data, error: dupError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        cliente_id: mapeamento.cliente_id,
        nome_negocio: `${mapeamento.nome_negocio} (cópia)`,
        status: 'em_preenchimento',
        respostas: mapeamento.respostas,
        tipo: mapeamento.tipo,
        mapeamento_origem_id: mapeamento.mapeamento_origem_id,
      })
      .select()
      .single();

    setDuplicando(false);

    if (dupError) {
      setError(dupError.message);
      return;
    }

    navigate(`/mapeamento/${data.id}`);
  }

  async function handleGerarPosVenda() {
    if (!mapeamento || !user) return;
    setCriandoPosVenda(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        cliente_id: mapeamento.cliente_id,
        nome_negocio: mapeamento.nome_negocio,
        status: 'em_preenchimento',
        respostas: {},
        tipo: 'pos_venda',
        mapeamento_origem_id: mapeamento.id,
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

  async function handleRegenerar() {
    if (!mapeamento || !instrucoesExtras.trim()) return;
    setRegenerando(true);
    setRegenerarDemorando(false);
    setRegenerarError(null);
    const avisoDemoraId = setTimeout(() => setRegenerarDemorando(true), 20000);

    const { error: fnError } = await supabase.functions.invoke('gerar-funil', {
      body: { mapeamento_id: mapeamento.id, instrucoes_extras: instrucoesExtras.trim() },
    });

    if (fnError) {
      clearTimeout(avisoDemoraId);
      setRegenerando(false);
      setRegenerarDemorando(false);
      const mensagemDetalhada = await extrairMensagemErroEdgeFunction(fnError);
      setRegenerarError(mensagemDetalhada ?? 'Não foi possível gerar uma nova versão. Seus dados continuam salvos — tente novamente em instantes.');
      return;
    }

    const { data: atualizado, error: refetchError } = await supabase
      .from('mapeamentos')
      .select('*')
      .eq('id', mapeamento.id)
      .single();

    clearTimeout(avisoDemoraId);
    setRegenerarDemorando(false);

    if (refetchError || !atualizado) {
      setRegenerando(false);
      setRegenerarError('A nova versão foi gerada, mas não deu pra atualizar a tela. Recarregue a página.');
      return;
    }

    setMapeamento(atualizado);
    await carregarFunis(atualizado.id);

    if (atualizado.status === 'erro') {
      setRegenerarError('A IA não conseguiu gerar a nova versão. Tente novamente.');
    } else if (atualizado.status === 'aguardando_esclarecimento') {
      setInstrucoesExtras('');
    } else {
      setMostrarRegenerar(false);
      setInstrucoesExtras('');
    }

    setRegenerando(false);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const podeRetomar = mapeamento.status === 'em_preenchimento' || mapeamento.status === 'erro';
  const versaoMaisRecente = versoesDisponiveis[0];
  const versaoAtualInfo = funilVersoes.find((v) => v.versao === versaoSelecionada) ?? null;
  // A mais recente entre as aprovadas — é a que de fato está "em
  // implementação" no momento, mesmo que versões mais novas (em rascunho)
  // já existam por cima dela.
  const versaoEmImplementacao =
    [...funilVersoes].filter((v) => v.status === 'aprovada').sort((a, b) => b.versao - a.versao)[0] ?? null;
  const temRespostas = Object.values(mapeamento.respostas ?? {}).some((valor) => {
    if (Array.isArray(valor)) return valor.length > 0;
    if (typeof valor === 'string') return valor.trim().length > 0;
    if (typeof valor === 'number') return true;
    return false;
  });
  const perguntasIA = Array.isArray(mapeamento.respostas?._perguntas_ia)
    ? (mapeamento.respostas._perguntas_ia as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{mapeamento.nome_negocio}</h1>
          <StatusBadge status={mapeamento.status} enviadoPeloCliente={mapeamento.enviado_pelo_cliente} />
          {mapeamento.cliente_id && (
            <p className="field-hint">
              <Link to={`/clientes/${mapeamento.cliente_id}`}>← Ver cliente</Link>
            </p>
          )}
          {mapeamento.tipo === 'pos_venda' && mapeamento.mapeamento_origem_id && (
            <p className="field-hint">
              Formulário de pós-venda —{' '}
              <Link to={`/mapeamento/${mapeamento.mapeamento_origem_id}`}>ver mapeamento de vendas</Link>
            </p>
          )}
        </div>
        <div className="page-header-actions">
          {modo === 'tecnica' &&
            mapeamento.tipo === 'vendas' &&
            funilValidado(mapeamento.status) &&
            (posVendaExistente ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/mapeamento/${posVendaExistente.id}`)}
              >
                Ver formulário de pós-venda
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGerarPosVenda}
                disabled={criandoPosVenda}
              >
                {criandoPosVenda ? 'Gerando…' : 'Gerar formulário de pós-venda'}
              </button>
            ))}
          {funis.length > 0 && (
            <Link
              to={`/mapeamento/${mapeamento.id}/relatorio`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Gerar apresentação/relatório
            </Link>
          )}
          {modo === 'tecnica' && !mapeamento.enviado_pelo_cliente && (
            <button type="button" className="btn btn-secondary" onClick={handleCopiarLink}>
              {linkCopiado ? 'Link copiado!' : 'Copiar link para o cliente'}
            </button>
          )}
          {modo === 'tecnica' && funis.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportar}
              disabled={exportando}
            >
              {exportando ? 'Exportando…' : 'Exportar para Excel'}
            </button>
          )}
          {modo === 'tecnica' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDuplicar}
              disabled={duplicando}
            >
              {duplicando ? 'Duplicando…' : 'Duplicar como novo mapeamento'}
            </button>
          )}
          {mapeamento.tipo === 'vendas' &&
            funilValidado(mapeamento.status) &&
            (implementacaoExistente ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/implementacoes/${implementacaoExistente.id}`)}
              >
                Ver implementação de CRM
              </button>
            ) : (
              modo === 'tecnica' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleIniciarImplementacao}
                  disabled={iniciandoImplementacao}
                >
                  {iniciandoImplementacao ? 'Iniciando…' : 'Iniciar implementação de CRM'}
                </button>
              )
            ))}
          {modo === 'tecnica' && (
            <button type="button" className="btn btn-ghost" onClick={handleExcluir} disabled={excluindo}>
              {excluindo ? 'Excluindo…' : 'Excluir mapeamento'}
            </button>
          )}
        </div>
      </div>

      {funis.length > 0 && (
        <section className="card resumo-revisao-card">
          {versaoEmImplementacao && (
            <div className="resumo-revisao-aprovada-banner">
              Versão aprovada para implementação — Versão {versaoEmImplementacao.versao}
            </div>
          )}
          <div className="resumo-revisao-grid">
            {clienteResumo && (
              <div>
                <span className="etapa-card-label">Cliente</span>
                <p>{clienteResumo.nome_empresa}</p>
              </div>
            )}
            <div>
              <span className="etapa-card-label">Status do funil</span>
              <p>{MAPEAMENTO_STATUS_LABELS[mapeamento.status]}</p>
            </div>
            <div>
              <span className="etapa-card-label">Versão atual</span>
              <p>
                {versaoMaisRecente}
                {versaoEmImplementacao?.versao === versaoMaisRecente ? ' — Aprovada' : ''}
              </p>
            </div>
            <div>
              <span className="etapa-card-label">Última atualização</span>
              <p>
                {versaoAtualInfo ? new Date(versaoAtualInfo.created_at).toLocaleString('pt-BR') : '—'}
                {versaoAtualInfo?.gerado_por_email ? ` — ${versaoAtualInfo.gerado_por_email}` : ''}
              </p>
            </div>
            <div>
              <span className="etapa-card-label">Responsável pela revisão</span>
              <p>
                {mapeamento.revisado_por_email
                  ? `${mapeamento.revisado_por_email} em ${new Date(mapeamento.revisado_em!).toLocaleString('pt-BR')}`
                  : 'Ainda não revisado'}
              </p>
            </div>
            {(clienteResumo?.kickoff_realizado_em || clienteResumo?.kickoff_agendado_para) && (
              <div>
                <span className="etapa-card-label">Kickoff</span>
                <p>
                  {new Date(
                    clienteResumo.kickoff_realizado_em ?? clienteResumo.kickoff_agendado_para!,
                  ).toLocaleString('pt-BR')}
                  {clienteResumo.kickoff_realizado_em ? ' (realizado)' : ' (agendado)'}
                </p>
              </div>
            )}
          </div>

          <div className="page-header-actions">
            <div className="modo-visualizacao-toggle">
              <button
                type="button"
                className={modo === 'tecnica' ? 'btn btn-primary btn-auto' : 'btn btn-secondary btn-auto'}
                onClick={() => setModo('tecnica')}
              >
                Visão técnica
              </button>
              <button
                type="button"
                className={modo === 'apresentacao' ? 'btn btn-primary btn-auto' : 'btn btn-secondary btn-auto'}
                onClick={() => setModo('apresentacao')}
              >
                Visão de apresentação
              </button>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={handleMarcarRevisado}
              disabled={marcandoRevisado}
            >
              {marcandoRevisado ? 'Marcando…' : 'Marcar como revisado'}
            </button>
          </div>
        </section>
      )}

      {mapeamento.status === 'em_preenchimento' && !retomando && (
        <section className="card form-card">
          {mapeamento.enviado_pelo_cliente ? (
            <>
              <h2>Continue seu mapeamento</h2>
              <p className="field-hint">O cliente já respondeu. Revise as respostas e gere o funil.</p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
                Revisar e gerar funil
              </button>
            </>
          ) : temRespostas ? (
            <>
              <h2>Continue seu mapeamento</h2>
              <p className="field-hint">
                Você já começou a responder o formulário. Retome de onde parou para gerar o funil.
              </p>
              <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
                Retomar formulário
              </button>
            </>
          ) : (
            <>
              <h2>Aguardando o cliente</h2>
              <p className="field-hint">
                Copie o link acima e envie para o cliente responder o formulário. Assim que ele
                enviar as respostas, volte aqui para gerar o funil.
              </p>
              <button type="button" className="btn btn-ghost btn-auto" onClick={() => setRetomando(true)}>
                Preencher manualmente
              </button>
            </>
          )}
        </section>
      )}

      {mapeamento.status === 'erro' && !retomando && (
        <section className="card form-card">
          <h2>Não foi possível gerar o funil</h2>
          <p className="field-hint">Revise as respostas e tente novamente.</p>
          <button type="button" className="btn btn-primary btn-auto" onClick={() => setRetomando(true)}>
            Revisar e tentar novamente
          </button>
        </section>
      )}

      {mapeamento.status === 'aguardando_esclarecimento' && (
        <section className="card form-card">
          <h2>A IA precisa de mais informações</h2>
          <p className="field-hint">
            Antes de gerar o funil, responda as perguntas abaixo (ou repasse pro cliente) e envie
            como instruções extras.
          </p>
          <ul className="perguntas-ia-lista">
            {perguntasIA.map((pergunta, i) => (
              <li key={i}>{pergunta}</li>
            ))}
          </ul>
          <label className="field">
            <span>Suas respostas</span>
            <textarea
              rows={4}
              value={instrucoesExtras}
              onChange={(e) => setInstrucoesExtras(e.target.value)}
              placeholder="Responda as perguntas acima com o que você sabe sobre o negócio"
              autoFocus
            />
          </label>
          {regenerando && (
            <p className="field-hint">
              {regenerarDemorando
                ? 'A geração está demorando mais que o esperado. Continue aguardando — seus dados já estão salvos.'
                : 'Gerando funil, isso pode levar até 1 minuto…'}
            </p>
          )}
          {regenerarError && <p className="form-error">{regenerarError}</p>}
          <button
            type="button"
            className="btn btn-primary btn-auto"
            onClick={handleRegenerar}
            disabled={regenerando || !instrucoesExtras.trim()}
          >
            {regenerando ? 'Gerando…' : 'Gerar funil'}
          </button>
        </section>
      )}

      {podeRetomar && retomando && (
        <MapeamentoWizard mapeamento={mapeamento} onStatusChange={handleStatusChange} iniciarNoResumo />
      )}

      {mapeamento.status === 'processando_ia' && (
        <section className="card processando-card">
          <div className="spinner" aria-hidden="true" />
          <p>Analisando as respostas e montando seu funil...</p>
        </section>
      )}

      {modo === 'tecnica' &&
        funilJaGerado(mapeamento.status) &&
        (PROXIMOS_STATUS_MAPEAMENTO[mapeamento.status]?.length ?? 0) > 0 && (
          <section className="card">
            <h2>Fluxo do funil</h2>
            <p className="field-hint">
              Status atual: <strong>{MAPEAMENTO_STATUS_LABELS[mapeamento.status]}</strong>
            </p>
            <div className="page-header-actions">
              {PROXIMOS_STATUS_MAPEAMENTO[mapeamento.status]?.map((proximo) =>
                proximo === 'funil_validado' ? (
                  <button
                    key={proximo}
                    type="button"
                    className="btn btn-secondary btn-auto"
                    onClick={abrirValidarFunil}
                    disabled={alterandoStatus || validandoFunilAberto}
                  >
                    Validar funil
                  </button>
                ) : (
                  <button
                    key={proximo}
                    type="button"
                    className="btn btn-secondary btn-auto"
                    onClick={() => handleAvancarStatusMapeamento(proximo)}
                    disabled={alterandoStatus}
                  >
                    {MAPEAMENTO_STATUS_LABELS[proximo]}
                  </button>
                ),
              )}
            </div>

            {validandoFunilAberto && (
              <div className="card form-card" style={{ marginTop: 14 }}>
                <h3>Validar funil{mapeamento.status === 'kickoff_agendado' ? ' no Kickoff' : ''}</h3>
                {!clienteResumo?.kickoff_realizado_em && mapeamento.status === 'kickoff_agendado' && (
                  <>
                    <p className="field-hint">
                      Não existe uma reunião de Kickoff registrada para este cliente ainda — esta ação também vai
                      registrá-la.
                    </p>
                    <label className="field">
                      <span>Data/hora em que o Kickoff foi realizado</span>
                      <input
                        type="datetime-local"
                        value={dataHoraKickoffReal}
                        onChange={(e) => setDataHoraKickoffReal(e.target.value)}
                      />
                    </label>
                  </>
                )}

                <fieldset className="field">
                  <legend>O cliente validou o funil?</legend>
                  {(Object.entries(VALIDACAO_FUNIL_KICKOFF_LABELS) as [ValidacaoFunilKickoff, string][]).map(
                    ([valor, rotulo]) => (
                      <label key={valor} className="option-checkbox">
                        <input
                          type="radio"
                          name="validacao-funil-mapeamento"
                          checked={respostaValidacaoCliente === valor}
                          onChange={() => setRespostaValidacaoCliente(valor)}
                        />
                        <span>{rotulo}</span>
                      </label>
                    ),
                  )}
                </fieldset>

                {respostaValidacaoCliente && respostaValidacaoCliente !== 'precisa_revisar' && (
                  <label className="field">
                    <span>Qual versão do funil está sendo validada?</span>
                    <select value={versaoParaValidar} onChange={(e) => setVersaoParaValidar(e.target.value)}>
                      <option value="">Selecione…</option>
                      {funilVersoes.map((v) => (
                        <option key={v.versao} value={v.versao}>
                          Versão {v.versao}
                          {v.status === 'aprovada' ? ' — já aprovada' : ' — rascunho'}
                          {' · '}
                          {new Date(v.created_at).toLocaleDateString('pt-BR')}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Só essa versão será marcada como aprovada — outras versões em rascunho continuam como estão.
                    </span>
                  </label>
                )}

                {erroValidacaoFunil && <p className="form-error">{erroValidacaoFunil}</p>}

                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharValidarFunil}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleValidarFunil}
                    disabled={salvandoValidacaoFunil || !respostaValidacaoCliente}
                  >
                    {salvandoValidacaoFunil ? 'Salvando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

      {funilJaGerado(mapeamento.status) && funis.length === 0 && (
        <section className="card">
          <p className="field-hint">Nenhum funil encontrado para este mapeamento.</p>
        </section>
      )}

      {funis.length > 0 && (
        <>
          {modo === 'tecnica' && versaoAtualInfo && (
            <section className="card">
              <div className="page-header-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                <h2 style={{ marginBottom: 0 }}>
                  Versão {versaoAtualInfo.versao}
                  {versaoAtualInfo.versao !== versaoMaisRecente && ' (somente leitura)'}
                </h2>
                <span
                  className={`status-badge status-tone-${versaoAtualInfo.status === 'aprovada' ? 'success' : 'warning'}`}
                >
                  {versaoAtualInfo.status === 'aprovada' ? 'Aprovada para implementação' : 'Rascunho'}
                </span>
              </div>
              <p className="field-hint">
                Gerada em {new Date(versaoAtualInfo.created_at).toLocaleString('pt-BR')}
                {versaoAtualInfo.gerado_por_email ? ` por ${versaoAtualInfo.gerado_por_email}` : ''} — origem:{' '}
                {versaoAtualInfo.origem === 'ia' ? 'IA' : 'Manual'}.
              </p>
              {versaoAtualInfo.status === 'aprovada' && (
                <p className="field-hint">
                  Aprovada em{' '}
                  {versaoAtualInfo.aprovada_em ? new Date(versaoAtualInfo.aprovada_em).toLocaleString('pt-BR') : '—'}
                  {versaoAtualInfo.aprovada_por_email ? ` por ${versaoAtualInfo.aprovada_por_email}` : ''}
                  {versaoAtualInfo.kickoff_reuniao_id ? ' — validada no Kickoff' : ''}.
                </p>
              )}
              {versaoEmImplementacao && versaoEmImplementacao.versao !== versaoAtualInfo.versao && (
                <p className="field-hint">
                  A versão atualmente em implementação é a <strong>Versão {versaoEmImplementacao.versao}</strong>.
                </p>
              )}
            </section>
          )}

          {modo === 'tecnica' && versoesDisponiveis.length > 1 && (
            <div className="page-header-actions">
              <span className="field-hint">Versão:</span>
              {versoesDisponiveis.map((v) => {
                const info = funilVersoes.find((fv) => fv.versao === v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={v === versaoSelecionada ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => handleVerVersao(v)}
                  >
                    {info ? rotuloVersao(info, versaoMaisRecente) : `Versão ${v}`}
                  </button>
                );
              })}
            </div>
          )}

          {geracaoMeta &&
            (geracaoMeta.pontos_para_validar.length > 0 ||
              geracaoMeta.transicoes_entre_funis.length > 0 ||
              geracaoMeta.indicadores_dashboard.length > 0 ||
              geracaoMeta.nivel_complexidade) && (
              <section className="card geracao-meta-card">
                {modo === 'tecnica' && geracaoMeta.nivel_complexidade && (
                  <div className="estimativa-badge">
                    <span className={`estimativa-nivel estimativa-nivel-${geracaoMeta.nivel_complexidade}`}>
                      Complexidade {NIVEL_COMPLEXIDADE_LABELS[geracaoMeta.nivel_complexidade]}
                    </span>
                    {geracaoMeta.semanas_estimadas != null && (
                      <span className="estimativa-semanas">
                        ~{geracaoMeta.semanas_estimadas}{' '}
                        {geracaoMeta.semanas_estimadas === 1 ? 'semana' : 'semanas'} de implementação
                      </span>
                    )}
                    {geracaoMeta.observacao_estimativa && (
                      <p className="field-hint">{geracaoMeta.observacao_estimativa}</p>
                    )}
                  </div>
                )}

                {modo === 'tecnica' && geracaoMeta.transicoes_entre_funis.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Transições entre funis</h3>
                    <ul className="transicoes-lista">
                      {geracaoMeta.transicoes_entre_funis.map((t, i) => (
                        <li key={i}>
                          <strong>{t.de_funil}</strong> → <strong>{t.para_funil}</strong>: {t.condicao}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {geracaoMeta.pontos_para_validar.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Pontos para validar com o cliente</h3>
                    <ul className="perguntas-ia-lista">
                      {geracaoMeta.pontos_para_validar.map((ponto, i) => (
                        <li key={i}>{ponto}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {modo === 'tecnica' && geracaoMeta.indicadores_dashboard.length > 0 && (
                  <div className="geracao-meta-bloco">
                    <h3>Indicadores sugeridos para o dashboard no CRM</h3>
                    <ul className="perguntas-ia-lista">
                      {geracaoMeta.indicadores_dashboard.map((indicador, i) => (
                        <li key={i}>{indicador}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

          {funis.map((funil) => (
            <FunilDetalhado
              key={funil.id}
              funil={funil}
              onChange={handleEtapasChange}
              somenteLeitura={versaoSelecionada !== versaoMaisRecente || versaoAtualInfo?.status === 'aprovada'}
              versaoAprovada={versaoAtualInfo?.status === 'aprovada'}
              criandoNovaVersao={criandoNovaVersao}
              onSolicitarNovaVersaoParaEdicao={
                versaoAtualInfo ? () => handleCriarNovaVersaoParaEdicao(versaoAtualInfo.versao) : undefined
              }
              modo={modo}
            />
          ))}
        </>
      )}

      {funilJaGerado(mapeamento.status) && blocosFormulario.length > 0 && (
        <section className="card form-card">
          <div className="page-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => setMostrarRespostas((v) => !v)}
            >
              {mostrarRespostas ? 'Ocultar respostas do formulário' : 'Ver respostas do formulário'}
            </button>
            <Link
              to={`/mapeamento/${mapeamento.id}/respostas`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Baixar respostas em PDF
            </Link>
          </div>
          {mostrarRespostas && (
            <ResumoWizard
              blocos={blocosFormulario}
              respostas={mapeamento.respostas}
              titulo="Respostas do formulário"
              mensagem="Essas foram as respostas usadas para gerar o funil."
            />
          )}
        </section>
      )}

      {funilJaGerado(mapeamento.status) && funis.length > 0 && (
        <section className="card form-card">
          {!mostrarRegenerar ? (
            <>
              <h2>Regenerar com instruções extras</h2>
              <p className="field-hint">
                Peça pra IA gerar de novo considerando algo específico — ex: "trate convênio e
                particular como funis separados". A versão atual não é perdida, fica guardada no
                histórico.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={() => setMostrarRegenerar(true)}
              >
                Regenerar com instruções extras
              </button>
            </>
          ) : (
            <>
              <h2>Instruções extras</h2>
              <label className="field">
                <span>O que a IA deve considerar nessa nova versão?</span>
                <textarea
                  rows={3}
                  value={instrucoesExtras}
                  onChange={(e) => setInstrucoesExtras(e.target.value)}
                  placeholder="Ex: trate convênio e particular como funis separados"
                  autoFocus
                />
              </label>
              {regenerando && (
                <p className="field-hint">
                  {regenerarDemorando
                    ? 'A geração está demorando mais que o esperado. Continue aguardando — seus dados já estão salvos.'
                    : 'Gerando nova versão, isso pode levar até 1 minuto…'}
                </p>
              )}
              {regenerarError && <p className="form-error">{regenerarError}</p>}
              <div className="wizard-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setMostrarRegenerar(false);
                    setInstrucoesExtras('');
                    setRegenerarError(null);
                  }}
                  disabled={regenerando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRegenerar}
                  disabled={regenerando || !instrucoesExtras.trim()}
                >
                  {regenerando ? 'Gerando…' : 'Gerar nova versão'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
