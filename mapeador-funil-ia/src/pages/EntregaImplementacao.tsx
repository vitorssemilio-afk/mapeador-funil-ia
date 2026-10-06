// Módulo de Relatórios e Entrega Final (núcleo, Fase 1) — hub da
// implementação: visão geral, checklist de prontidão, documentos gerados e
// aceite da entrega. Página própria (não mais uma aba dentro de
// ImplementacaoDetalhe) pra não inchar ainda mais aquela tela — ver seção
// 42 do pedido ("evitar uma página enorme").
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { resolverAtividade, type AtividadeResolvida } from '../lib/atividadesCronograma';
import { CONFIGURACAO_PADRAO, resolverConfiguracaoCliente } from '../lib/configuracaoImplementacao';
import { fasesImplementacao } from '../lib/cronograma';
import { resolverResumoCriteriosEntrega } from '../lib/criteriosEntrega';
import { nomeConsultor } from '../lib/operacaoResumo';
import {
  construirSnapshotPlaybook,
  ordemPlaybook,
  SECOES_PLAYBOOK,
  statusSecaoPlaybook,
  TEXTO_SUGERIDO_SECAO_MANUAL,
  textoEditavelInicial,
  type PlaybookTextoEditavel,
  type SecaoPlaybookChave,
  type SnapshotPlaybook,
} from '../lib/playbook';
import {
  calcularChecklistEntrega,
  construirSnapshotConsolidadoImplementacao,
  construirSnapshotDocumentoFunil,
  construirSnapshotRelatorioAdocao,
  resolverStatusPreparoEntrega,
  STATUS_ACEITE_LABELS,
  STATUS_ACEITE_TONE,
  STATUS_PREPARO_ENTREGA_LABELS,
  STATUS_RELATORIO_LABELS,
  STATUS_RELATORIO_TONE,
  TIPO_RELATORIO_LABELS,
  tiposReuniaoObrigatoriasRealizadas,
  VISAO_RELATORIO_LABELS,
} from '../lib/relatoriosEntrega';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  CheckpointAdocao,
  Cliente,
  ClienteOcorrencia,
  ConfiguracaoImplementacao,
  Consultor,
  CriterioEntrega,
  CriterioEntregaStatus,
  EntregaAceite,
  EntregaRessalva,
  FunilGerado,
  FunilVersao,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatusHistorico,
  RelatorioImplementacao,
  Reuniao,
  StatusAceiteEntrega,
  TipoRelatorioImplementacao,
  VisaoRelatorio,
} from '../types/database';

type Aba = 'visao_geral' | 'checklist' | 'documentos' | 'aceite' | 'historico';

const ABAS: { valor: Aba; label: string }[] = [
  { valor: 'visao_geral', label: 'Visão geral' },
  { valor: 'checklist', label: 'Checklist de prontidão' },
  { valor: 'documentos', label: 'Documentos' },
  { valor: 'aceite', label: 'Aceite' },
  { valor: 'historico', label: 'Histórico' },
];

const TIPOS_DOCUMENTO: TipoRelatorioImplementacao[] = [
  'implementacao',
  'funil_vendas',
  'funil_pos_venda',
  'entrega_final',
  'adocao',
];

type HistoricoEvento = {
  id: string;
  acao: string;
  user_email: string | null;
  criado_em: string;
  detalhes: Record<string, unknown>;
};

export function EntregaImplementacao() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const confirmarAcao = useConfirm();
  const { mostrarToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('visao_geral');

  const [implementacao, setImplementacao] = useState<ImplementacaoCrm | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [historicoStatus, setHistoricoStatus] = useState<ImplementacaoStatusHistorico[]>([]);
  const [atividadesTemplate, setAtividadesTemplate] = useState<AtividadeCronograma[]>([]);
  const [atividadesStatus, setAtividadesStatus] = useState<AtividadeStatusRow[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [ocorrencias, setOcorrencias] = useState<ClienteOcorrencia[]>([]);
  const [criterios, setCriterios] = useState<CriterioEntrega[]>([]);
  const [criteriosStatus, setCriteriosStatus] = useState<CriterioEntregaStatus[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshotConfig, setSnapshotConfig] = useState<ImplementacaoSettingsSnapshot | null>(null);

  const [versaoFunilVendasAprovada, setVersaoFunilVendasAprovada] = useState<FunilVersao | null>(null);
  const [funisVendas, setFunisVendas] = useState<FunilGerado[]>([]);
  const [mapeamentoPosVendaId, setMapeamentoPosVendaId] = useState<string | null>(null);
  const [versaoFunilPosVendaAprovada, setVersaoFunilPosVendaAprovada] = useState<FunilVersao | null>(null);
  const [funisPosVenda, setFunisPosVenda] = useState<FunilGerado[]>([]);

  const [relatorios, setRelatorios] = useState<RelatorioImplementacao[]>([]);
  const [aceite, setAceite] = useState<EntregaAceite | null>(null);
  const [ressalvas, setRessalvas] = useState<EntregaRessalva[]>([]);
  const [checkpointAdocao, setCheckpointAdocao] = useState<CheckpointAdocao | null>(null);

  const [gerandoTipo, setGerandoTipo] = useState<TipoRelatorioImplementacao | null>(null);
  const [formVisao, setFormVisao] = useState<VisaoRelatorio>('executiva');
  const [formResumoExecutivo, setFormResumoExecutivo] = useState('');
  // Seção 21 (Fase 2): próximos passos vira uma lista de itens curtos, não
  // um parágrafo só — cada item é só um texto livre registrado aqui; virar
  // uma pendência/tarefa de verdade continua exigindo uma ação própria do
  // consultor em outro lugar do sistema, nunca automático.
  const [formProximosPassos, setFormProximosPassos] = useState<string[]>([]);
  const [novoProximoPasso, setNovoProximoPasso] = useState('');
  const [motivoNovaVersao, setMotivoNovaVersao] = useState('');
  const [gerando, setGerando] = useState(false);

  // Playbook Final — cópia local editável de texto_editavel do relatório
  // mais recente (tipo='playbook'), sincronizada ao carregar/trocar de
  // versão. Editar aqui nunca toca em conteudo_snapshot nem nos dados
  // oficiais da implementação (seção 37 do pedido) — só Salvar grava, e só
  // na própria linha do relatório.
  const [playbookEditavel, setPlaybookEditavel] = useState<PlaybookTextoEditavel | null>(null);
  const [salvandoPlaybook, setSalvandoPlaybook] = useState(false);
  const [gerandoPlaybook, setGerandoPlaybook] = useState(false);

  const [formAceite, setFormAceite] = useState<{
    status: StatusAceiteEntrega;
    data_entrega: string;
    responsavel_entrega_id: string;
    contato_cliente: string;
    observacao: string;
    motivo_nao_aceito: string;
    itens_contestados: string;
    proximos_passos_nao_aceito: string;
  } | null>(null);
  const [salvandoAceite, setSalvandoAceite] = useState(false);

  const [formRessalva, setFormRessalva] = useState<{
    ressalva: string;
    responsavel_id: string;
    prazo: string;
    acao_necessaria: string;
    criarPendencia: boolean;
  } | null>(null);

  async function carregar(implementacaoId: string) {
    setLoading(true);
    setError(null);

    const { data: implData, error: implError } = await supabase
      .from('implementacoes_crm')
      .select('*')
      .eq('id', implementacaoId)
      .single();

    if (implError || !implData) {
      setError(implError?.message ?? 'Implementação não encontrada.');
      setLoading(false);
      return;
    }
    setImplementacao(implData);

    const [
      { data: clienteData },
      { data: consultoresData },
      { data: historicoData },
      { data: atividadesData },
      { data: atividadesStatusData },
      { data: criteriosData },
      { data: criteriosStatusData },
      { data: configGlobalData },
      { data: relatoriosData },
      { data: aceiteData },
      { data: checkpointAdocaoData },
    ] = await Promise.all([
      implData.cliente_id
        ? supabase.from('clientes').select('*').eq('id', implData.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('consultores').select('*').order('nome', { ascending: true }),
      supabase
        .from('implementacao_status_historico')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('alterado_em', { ascending: true }),
      supabase
        .from('atividades_cronograma')
        .select('*')
        .or(`implementacao_id.is.null,implementacao_id.eq.${implementacaoId}`)
        .order('ordem', { ascending: true }),
      supabase.from('atividades_status').select('*').eq('implementacao_id', implementacaoId),
      supabase.from('criterios_entrega').select('*').order('ordem', { ascending: true }),
      supabase.from('criterios_entrega_status').select('*').eq('implementacao_id', implementacaoId),
      supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('relatorios_implementacao')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('tipo', { ascending: true })
        .order('versao', { ascending: false }),
      supabase.from('entregas_aceite').select('*').eq('implementacao_id', implementacaoId).maybeSingle(),
      supabase.from('checkpoints_adocao').select('*').eq('implementacao_id', implementacaoId).maybeSingle(),
    ]);

    setCliente(clienteData ?? null);
    setConsultores(consultoresData ?? []);
    setHistoricoStatus(historicoData ?? []);
    setAtividadesTemplate(atividadesData ?? []);
    setAtividadesStatus(atividadesStatusData ?? []);
    setCriterios(criteriosData ?? []);
    setCriteriosStatus(criteriosStatusData ?? []);
    setConfigGlobal(configGlobalData ?? null);
    setRelatorios(relatoriosData ?? []);
    setAceite(aceiteData ?? null);
    setCheckpointAdocao(checkpointAdocaoData ?? null);

    if (clienteData) {
      const [{ data: snapshotData }, { data: reunioesData }, { data: ocorrenciasData }] = await Promise.all([
        supabase.from('implementacao_settings_snapshot').select('*').eq('cliente_id', clienteData.id).maybeSingle(),
        supabase.from('reunioes').select('*').eq('cliente_id', clienteData.id).order('data_hora', { ascending: true }),
        supabase.from('cliente_ocorrencias').select('*').eq('cliente_id', clienteData.id).order('data_ocorrencia', { ascending: false }),
      ]);
      setSnapshotConfig(snapshotData ?? null);
      setReunioes(reunioesData ?? []);
      setOcorrencias(ocorrenciasData ?? []);
    } else {
      setSnapshotConfig(null);
      setReunioes([]);
      setOcorrencias([]);
    }

    if (aceiteData) {
      const { data: ressalvasData } = await supabase
        .from('entrega_ressalvas')
        .select('*')
        .eq('aceite_id', aceiteData.id)
        .order('created_at', { ascending: true });
      setRessalvas(ressalvasData ?? []);
    } else {
      setRessalvas([]);
    }

    // Funil de vendas: só a versão APROVADA (nunca rascunho — seção 4).
    const { data: versoesVendas } = await supabase
      .from('funil_versoes')
      .select('*')
      .eq('mapeamento_id', implData.mapeamento_id)
      .eq('status', 'aprovada')
      .order('versao', { ascending: false })
      .limit(1);
    const aprovadaVendas = versoesVendas?.[0] ?? null;
    setVersaoFunilVendasAprovada(aprovadaVendas);

    if (aprovadaVendas) {
      const { data: funisData } = await supabase
        .from('funis_gerados')
        .select('*')
        .eq('mapeamento_id', implData.mapeamento_id)
        .eq('versao', aprovadaVendas.versao)
        .order('ordem', { ascending: true });
      setFunisVendas(funisData ?? []);
    } else {
      setFunisVendas([]);
    }

    // Pós-venda (seção 5): mapeamento próprio, separado do de vendas — só
    // mostrado se existir e tiver versão aprovada.
    const { data: posVendaData } = await supabase
      .from('mapeamentos')
      .select('id')
      .eq('mapeamento_origem_id', implData.mapeamento_id)
      .eq('tipo', 'pos_venda')
      .maybeSingle();
    setMapeamentoPosVendaId(posVendaData?.id ?? null);

    if (posVendaData) {
      const { data: versoesPosVenda } = await supabase
        .from('funil_versoes')
        .select('*')
        .eq('mapeamento_id', posVendaData.id)
        .eq('status', 'aprovada')
        .order('versao', { ascending: false })
        .limit(1);
      const aprovadaPosVenda = versoesPosVenda?.[0] ?? null;
      setVersaoFunilPosVendaAprovada(aprovadaPosVenda);

      if (aprovadaPosVenda) {
        const { data: funisPosVendaData } = await supabase
          .from('funis_gerados')
          .select('*')
          .eq('mapeamento_id', posVendaData.id)
          .eq('versao', aprovadaPosVenda.versao)
          .order('ordem', { ascending: true });
        setFunisPosVenda(funisPosVendaData ?? []);
      } else {
        setFunisPosVenda([]);
      }
    } else {
      setVersaoFunilPosVendaAprovada(null);
      setFunisPosVenda([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (id) carregar(id);
  }, [id]);

  const configuracao = useMemo(() => {
    if (!cliente) return CONFIGURACAO_PADRAO;
    const snapshotsPorClienteId = new Map(snapshotConfig ? [[snapshotConfig.cliente_id, snapshotConfig]] : []);
    return resolverConfiguracaoCliente(cliente.id, snapshotsPorClienteId, configGlobal);
  }, [cliente, snapshotConfig, configGlobal]);

  const hoje = useMemo(() => new Date(), []);

  const fasesCronograma = useMemo(
    () => (implementacao ? fasesImplementacao(implementacao, historicoStatus) : []),
    [implementacao, historicoStatus],
  );

  const atividadesResolvidas: AtividadeResolvida[] = useMemo(() => {
    if (!implementacao) return [];
    return atividadesTemplate.map((atividade) =>
      resolverAtividade({
        atividade,
        statusRow: atividadesStatus.find((s) => s.atividade_id === atividade.id) ?? null,
        historico: historicoStatus,
        cliente,
        reunioes,
        hoje,
        ciclos: configuracao.ciclos,
      }),
    );
  }, [implementacao, atividadesTemplate, atividadesStatus, historicoStatus, cliente, reunioes, hoje, configuracao]);

  const resumoCriterios = useMemo(
    () => (implementacao ? resolverResumoCriteriosEntrega(criterios, criteriosStatus, implementacao.id) : null),
    [implementacao, criterios, criteriosStatus],
  );

  const checklist = useMemo(
    () =>
      calcularChecklistEntrega({
        funilAprovado: !!versaoFunilVendasAprovada,
        treinamentoRealizado: !!cliente?.treinamento_realizado_em,
        reunioesObrigatoriasRealizadas: tiposReuniaoObrigatoriasRealizadas(reunioes),
        criteriosObrigatoriosAtendidos: resumoCriterios?.todosObrigatoriosAtendidos ?? false,
        documentacaoEntregaPreparada: relatorios.some((r) => r.tipo === 'entrega_final' && r.status !== 'rascunho'),
      }),
    [versaoFunilVendasAprovada, cliente, reunioes, resumoCriterios, relatorios],
  );

  const statusPreparoEntrega = useMemo(() => resolverStatusPreparoEntrega(reunioes), [reunioes]);

  // relatorios já vem ordenado por versão desc (ver carregar) — o primeiro
  // tipo='playbook' é sempre a versão mais recente, mesmo padrão já usado
  // pra 'entrega_final' em handleSalvarAceite.
  const playbookAtual = useMemo(() => relatorios.find((r) => r.tipo === 'playbook') ?? null, [relatorios]);
  const playbookSnapshot = playbookAtual?.conteudo_snapshot as unknown as SnapshotPlaybook | undefined;

  useEffect(() => {
    if (!playbookAtual) {
      setPlaybookEditavel(null);
      return;
    }
    const te = playbookAtual.texto_editavel as unknown as Partial<PlaybookTextoEditavel>;
    setPlaybookEditavel({
      ordem: te.ordem?.length ? te.ordem : textoEditavelInicial().ordem,
      ocultas: te.ocultas ?? [],
      overrides: te.overrides ?? {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookAtual?.id]);

  async function handleGerarPlaybook() {
    if (!implementacao) return;
    const jaExiste = !!playbookAtual;
    let motivo: string | null = null;
    if (jaExiste) {
      motivo = window.prompt('O que mudou desde a última versão do Playbook?');
      if (!motivo || !motivo.trim()) return;
    }

    setGerandoPlaybook(true);
    setError(null);

    const snapshot = construirSnapshotPlaybook({
      implementacao,
      cliente,
      consultores,
      versaoFunilVendasAprovada,
      funisVendas,
      versaoFunilPosVendaAprovada,
      funisPosVenda,
      reunioes,
      criterios,
      criteriosStatus,
      ressalvas,
      aceite,
      checkpointAdocao,
    });

    const { data, error: insertError } = await supabase
      .from('relatorios_implementacao')
      .insert({
        implementacao_id: implementacao.id,
        cliente_id: implementacao.cliente_id,
        tipo: 'playbook',
        status: 'gerado',
        titulo: `${TIPO_RELATORIO_LABELS.playbook} — ${implementacao.nome_cliente}`,
        conteudo_snapshot: snapshot,
        texto_editavel: textoEditavelInicial(),
        motivo_nova_versao: motivo,
        gerado_por_email: user?.email ?? null,
        gerado_em: new Date().toISOString(),
      })
      .select()
      .single();

    setGerandoPlaybook(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await registrarHistorico('playbook_gerado', data.id, { versao: data.versao });
    mostrarToast(`Playbook gerado (v${data.versao}).`);
    await carregar(implementacao.id);
  }

  function handleAlternarSecaoPlaybookOculta(chave: SecaoPlaybookChave) {
    setPlaybookEditavel(
      (atual) =>
        atual && {
          ...atual,
          ocultas: atual.ocultas.includes(chave)
            ? atual.ocultas.filter((c) => c !== chave)
            : [...atual.ocultas, chave],
        },
    );
  }

  function handleMoverSecaoPlaybook(chave: SecaoPlaybookChave, direcao: -1 | 1) {
    setPlaybookEditavel((atual) => {
      if (!atual) return atual;
      const ordem = ordemPlaybook(atual);
      const indice = ordem.indexOf(chave);
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= ordem.length) return atual;
      const nova = [...ordem];
      [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
      return { ...atual, ordem: nova };
    });
  }

  function handleEditarTextoSecaoPlaybook(chave: SecaoPlaybookChave, texto: string) {
    setPlaybookEditavel((atual) => atual && { ...atual, overrides: { ...atual.overrides, [chave]: texto } });
  }

  function handleRestaurarSecaoPlaybook(chave: SecaoPlaybookChave) {
    setPlaybookEditavel((atual) => {
      if (!atual) return atual;
      const overrides = { ...atual.overrides };
      if (TEXTO_SUGERIDO_SECAO_MANUAL[chave] != null) overrides[chave] = TEXTO_SUGERIDO_SECAO_MANUAL[chave]!;
      else delete overrides[chave];
      return { ...atual, overrides };
    });
  }

  async function handleSalvarPlaybookEditavel() {
    if (!playbookAtual || !playbookEditavel) return;
    setSalvandoPlaybook(true);
    const { error: updateError } = await supabase
      .from('relatorios_implementacao')
      .update({ texto_editavel: playbookEditavel })
      .eq('id', playbookAtual.id);
    setSalvandoPlaybook(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    mostrarToast('Playbook atualizado.');
    if (implementacao) await carregar(implementacao.id);
  }

  async function handleMarcarPlaybookEntregue() {
    if (!playbookAtual || !implementacao) return;
    const { error: updateError } = await supabase
      .from('relatorios_implementacao')
      .update({
        status: 'entregue',
        entregue_em: new Date().toISOString(),
        entregue_por_email: user?.email ?? null,
      })
      .eq('id', playbookAtual.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await registrarHistorico('playbook_entregue', playbookAtual.id, { versao: playbookAtual.versao });
    mostrarToast('Playbook marcado como entregue.');
    await carregar(implementacao.id);
  }

  async function registrarHistorico(acao: string, entidadeId: string | null, detalhes: Record<string, unknown> = {}) {
    if (!implementacao) return;
    await supabase.rpc('registrar_auditoria', {
      p_acao: acao,
      p_entidade: 'entrega_implementacao',
      p_entidade_id: entidadeId,
      p_cliente_id: implementacao.cliente_id,
      p_implementacao_id: implementacao.id,
      p_detalhes: detalhes,
    });
  }

  function abrirGeracao(tipo: TipoRelatorioImplementacao) {
    setGerandoTipo(tipo);
    setFormVisao('executiva');
    setFormResumoExecutivo('');
    setFormProximosPassos([]);
    setNovoProximoPasso('');
    const jaExiste = relatorios.some((r) => r.tipo === tipo);
    setMotivoNovaVersao(jaExiste ? '' : '');
  }

  function handleAdicionarProximoPasso() {
    const texto = novoProximoPasso.trim();
    if (!texto) return;
    setFormProximosPassos((prev) => [...prev, texto]);
    setNovoProximoPasso('');
  }

  function handleRemoverProximoPasso(indice: number) {
    setFormProximosPassos((prev) => prev.filter((_, i) => i !== indice));
  }

  function fecharGeracao() {
    setGerandoTipo(null);
  }

  async function handleGerar(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !gerandoTipo) return;

    const jaExiste = relatorios.some((r) => r.tipo === gerandoTipo);
    if (jaExiste && !motivoNovaVersao.trim()) {
      setError('Informe o motivo da nova versão.');
      return;
    }

    setGerando(true);
    setError(null);

    let titulo = TIPO_RELATORIO_LABELS[gerandoTipo];
    let conteudoSnapshot: Record<string, unknown> = {};
    let visao: VisaoRelatorio | null = null;
    let textoEditavel: Record<string, unknown> = {};

    if (gerandoTipo === 'implementacao' || gerandoTipo === 'entrega_final') {
      conteudoSnapshot = construirSnapshotConsolidadoImplementacao({
        implementacao,
        cliente,
        consultores,
        fasesCronograma,
        atividadesResolvidas,
        reunioes,
        ocorrencias,
        criterios,
        criteriosStatus,
      });
      textoEditavel = { resumoExecutivo: formResumoExecutivo.trim(), proximosPassos: formProximosPassos };
      titulo = `${TIPO_RELATORIO_LABELS[gerandoTipo]} — ${implementacao.nome_cliente}`;
    } else if (gerandoTipo === 'funil_vendas' || gerandoTipo === 'funil_pos_venda') {
      const versaoAprovada = gerandoTipo === 'funil_vendas' ? versaoFunilVendasAprovada : versaoFunilPosVendaAprovada;
      const funis = gerandoTipo === 'funil_vendas' ? funisVendas : funisPosVenda;
      if (!versaoAprovada) {
        setGerando(false);
        setError('Não existe uma versão aprovada deste funil ainda.');
        return;
      }
      conteudoSnapshot = construirSnapshotDocumentoFunil({
        nomeProcesso: implementacao.nome_cliente,
        versaoAprovada,
        funis,
      });
      visao = formVisao;
      titulo = `${TIPO_RELATORIO_LABELS[gerandoTipo]} — ${implementacao.nome_cliente} (${VISAO_RELATORIO_LABELS[formVisao]})`;
    } else if (gerandoTipo === 'adocao') {
      if (!checkpointAdocao) {
        setGerando(false);
        setError('Esta implementação ainda não tem o Checkpoint de 30 dias respondido.');
        return;
      }
      conteudoSnapshot = construirSnapshotRelatorioAdocao(checkpointAdocao);
      titulo = `${TIPO_RELATORIO_LABELS[gerandoTipo]} — ${implementacao.nome_cliente}`;
    }

    const { data, error: insertError } = await supabase
      .from('relatorios_implementacao')
      .insert({
        implementacao_id: implementacao.id,
        cliente_id: implementacao.cliente_id,
        tipo: gerandoTipo,
        visao,
        status: 'gerado',
        titulo,
        conteudo_snapshot: conteudoSnapshot,
        texto_editavel: textoEditavel,
        motivo_nova_versao: jaExiste ? motivoNovaVersao.trim() : null,
        gerado_por_email: user?.email ?? null,
        gerado_em: new Date().toISOString(),
      })
      .select()
      .single();

    setGerando(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await registrarHistorico(jaExiste ? 'relatorio_nova_versao' : 'relatorio_criado', data.id, {
      tipo: gerandoTipo,
      versao: data.versao,
    });
    mostrarToast(`${TIPO_RELATORIO_LABELS[gerandoTipo]} gerado (v${data.versao}).`);
    fecharGeracao();
    await carregar(implementacao.id);
    navigate(`/implementacoes/${implementacao.id}/relatorios/${data.id}`);
  }

  async function handleAlterarStatusRelatorio(relatorio: RelatorioImplementacao, novoStatus: 'final' | 'arquivado') {
    if (!implementacao) return;

    if (novoStatus === 'final' && relatorio.tipo === 'entrega_final' && !checklist.pronto) {
      const confirmado = await confirmarAcao({
        titulo: 'Marcar como final mesmo com pendências no checklist?',
        descricao: `O checklist de prontidão ainda mostra ${checklist.total - checklist.concluidos} item(ns) pendente(s). Isso não bloqueia a entrega, mas vale revisar antes de finalizar.`,
        confirmarLabel: 'Marcar como final mesmo assim',
      });
      if (!confirmado) return;
    }

    const patch: Partial<RelatorioImplementacao> =
      novoStatus === 'final' ? { status: 'final', finalizado_em: new Date().toISOString() } : { status: 'arquivado', arquivado_em: new Date().toISOString() };

    const { error: updateError } = await supabase.from('relatorios_implementacao').update(patch).eq('id', relatorio.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await registrarHistorico(novoStatus === 'final' ? 'relatorio_finalizado' : 'relatorio_arquivado', relatorio.id, {
      tipo: relatorio.tipo,
      versao: relatorio.versao,
    });
    mostrarToast(novoStatus === 'final' ? 'Relatório marcado como final.' : 'Relatório arquivado.');
    await carregar(implementacao.id);
  }

  function abrirFormAceite() {
    setFormAceite({
      status: aceite?.status ?? 'aguardando_aceite',
      data_entrega: aceite?.data_entrega ?? new Date().toISOString().slice(0, 10),
      responsavel_entrega_id: aceite?.responsavel_entrega_id ?? implementacao?.consultor_responsavel_id ?? '',
      contato_cliente: aceite?.contato_cliente ?? '',
      observacao: aceite?.observacao ?? '',
      motivo_nao_aceito: aceite?.motivo_nao_aceito ?? '',
      itens_contestados: aceite?.itens_contestados ?? '',
      proximos_passos_nao_aceito: aceite?.proximos_passos_nao_aceito ?? '',
    });
  }

  async function handleSalvarAceite(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formAceite) return;

    if (formAceite.status === 'nao_aceito' && !formAceite.motivo_nao_aceito.trim()) {
      setError('Informe o motivo da entrega não ter sido aceita.');
      return;
    }

    setSalvandoAceite(true);
    setError(null);

    const ultimoEntregaFinal = relatorios.find((r) => r.tipo === 'entrega_final');

    const payload = {
      implementacao_id: implementacao.id,
      relatorio_entrega_final_id: ultimoEntregaFinal?.id ?? aceite?.relatorio_entrega_final_id ?? null,
      data_entrega: formAceite.data_entrega || null,
      responsavel_entrega_id: formAceite.responsavel_entrega_id || null,
      contato_cliente: formAceite.contato_cliente.trim() || null,
      status: formAceite.status,
      observacao: formAceite.observacao.trim() || null,
      motivo_nao_aceito: formAceite.status === 'nao_aceito' ? formAceite.motivo_nao_aceito.trim() : null,
      itens_contestados: formAceite.status === 'nao_aceito' ? formAceite.itens_contestados.trim() || null : null,
      proximos_passos_nao_aceito: formAceite.status === 'nao_aceito' ? formAceite.proximos_passos_nao_aceito.trim() || null : null,
      registrado_por_email: user?.email ?? null,
      registrado_em: new Date().toISOString(),
    };

    const { data, error: upsertError } = aceite
      ? await supabase.from('entregas_aceite').update(payload).eq('id', aceite.id).select().single()
      : await supabase.from('entregas_aceite').insert(payload).select().single();

    setSalvandoAceite(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setAceite(data);
    await registrarHistorico('aceite_registrado', data.id, { status: data.status });
    mostrarToast('Aceite registrado.');
    setFormAceite(null);
  }

  function abrirFormRessalva() {
    setFormRessalva({ ressalva: '', responsavel_id: '', prazo: '', acao_necessaria: '', criarPendencia: false });
  }

  async function handleSalvarRessalva(e: FormEvent) {
    e.preventDefault();
    if (!formRessalva || !aceite || !implementacao || !formRessalva.ressalva.trim()) return;

    let pendenciaId: string | null = null;
    if (formRessalva.criarPendencia && implementacao.cliente_id) {
      const { data: pendenciaData, error: pendenciaError } = await supabase
        .from('cliente_ocorrencias')
        .insert({
          cliente_id: implementacao.cliente_id,
          categoria: 'outro',
          descricao: `Ressalva na entrega: ${formRessalva.ressalva.trim()}`,
          responsavel_impacto: 'v4',
          data_ocorrencia: new Date().toISOString().slice(0, 10),
          impacta_cronograma: false,
          status: 'aberta',
          consultor_responsavel_id: formRessalva.responsavel_id || null,
          prazo: formRessalva.prazo || null,
        })
        .select()
        .single();
      if (pendenciaError) {
        setError(pendenciaError.message);
        return;
      }
      pendenciaId = pendenciaData.id;
    }

    const { error: insertError } = await supabase.from('entrega_ressalvas').insert({
      aceite_id: aceite.id,
      ressalva: formRessalva.ressalva.trim(),
      responsavel_id: formRessalva.responsavel_id || null,
      prazo: formRessalva.prazo || null,
      acao_necessaria: formRessalva.acao_necessaria.trim() || null,
      pendencia_id: pendenciaId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await registrarHistorico('ressalva_adicionada', aceite.id, { ressalva: formRessalva.ressalva.trim() });
    mostrarToast('Ressalva registrada.');
    setFormRessalva(null);
    await carregar(implementacao.id);
  }

  const [historico, setHistorico] = useState<HistoricoEvento[]>([]);
  useEffect(() => {
    if (aba !== 'historico' || !implementacao) return;
    supabase
      .from('auditoria_eventos')
      .select('id, acao, user_email, criado_em, detalhes')
      .eq('implementacao_id', implementacao.id)
      .eq('entidade', 'entrega_implementacao')
      .order('criado_em', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistorico((data ?? []) as HistoricoEvento[]));
  }, [aba, implementacao]);

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  if (!implementacao) {
    return (
      <div className="page">
        <p className="form-error">{error ?? 'Implementação não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Relatórios e Entrega</h1>
          <p className="field-hint">
            <Link to={`/implementacoes/${implementacao.id}`}>{implementacao.nome_cliente}</Link> ·{' '}
            {IMPLEMENTACAO_STATUS_LABELS[implementacao.status]}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {ABAS.map((a) => (
          <button
            type="button"
            key={a.valor}
            className={`tab-button${aba === a.valor ? ' active' : ''}`}
            onClick={() => setAba(a.valor)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'visao_geral' && (
        <section className="card">
          <h2>Visão geral</h2>
          <p className="field-hint">
            Checklist de prontidão: {checklist.concluidos}/{checklist.total}
            {checklist.pronto ? ' · Pronto para entrega' : ` · ${checklist.total - checklist.concluidos} item(ns) pendente(s)`}
          </p>
          <p className="field-hint">
            Documentos gerados: {relatorios.length === 0 ? 'nenhum ainda' : relatorios.length}
          </p>
          <p className="field-hint">
            Aceite:{' '}
            <span className={`status-badge status-tone-${STATUS_ACEITE_TONE[aceite?.status ?? 'aguardando_aceite']}`}>
              {STATUS_ACEITE_LABELS[aceite?.status ?? 'aguardando_aceite']}
            </span>
          </p>
          <p className="field-hint">
            Reunião final: <strong>{STATUS_PREPARO_ENTREGA_LABELS[statusPreparoEntrega]}</strong>
          </p>
        </section>
      )}

      {aba === 'checklist' && (
        <section className="card">
          <h2>Checklist de prontidão</h2>
          <p className="field-hint">
            Lista só o que já tem uma fonte oficial no sistema hoje — não bloqueia a geração de documentos nem a
            entrega, é só um indicador.
          </p>
          <ul className="observacoes-lista">
            {checklist.itens.map((item) => (
              <li key={item.label} className="observacao-item">
                <span className={`status-badge status-tone-${item.atendido ? 'success' : 'warning'}`}>
                  {item.atendido ? 'Concluído' : 'Pendente'}
                </span>{' '}
                {item.label}
              </li>
            ))}
          </ul>
          <p className="field-hint">
            {checklist.pronto
              ? 'Pronto para entrega.'
              : `${checklist.total - checklist.concluidos} item(ns) pendente(s).`}
          </p>
        </section>
      )}

      {aba === 'documentos' && (
        <>
          <section className="card">
            <h2>Gerar documento</h2>
            <div className="page-header-actions">
              {TIPOS_DOCUMENTO.filter((tipo) => {
                if (tipo === 'funil_pos_venda') return !!mapeamentoPosVendaId;
                if (tipo === 'adocao') return !!checkpointAdocao;
                return true;
              }).map((tipo) => (
                <button key={tipo} type="button" className="btn btn-secondary btn-auto" onClick={() => abrirGeracao(tipo)}>
                  Gerar {TIPO_RELATORIO_LABELS[tipo]}
                </button>
              ))}
            </div>

            {gerandoTipo && (
              <form onSubmit={handleGerar} className="card form-card">
                <h3>Gerar {TIPO_RELATORIO_LABELS[gerandoTipo]}</h3>

                {(gerandoTipo === 'funil_vendas' || gerandoTipo === 'funil_pos_venda') && (
                  <>
                    {!(gerandoTipo === 'funil_vendas' ? versaoFunilVendasAprovada : versaoFunilPosVendaAprovada) && (
                      <p className="form-error">
                        Ainda não existe uma versão aprovada deste funil — aprove uma versão antes de gerar o documento.
                      </p>
                    )}
                    <label className="field">
                      <span>Visão</span>
                      <select value={formVisao} onChange={(e) => setFormVisao(e.target.value as VisaoRelatorio)}>
                        <option value="executiva">{VISAO_RELATORIO_LABELS.executiva}</option>
                        <option value="tecnica">{VISAO_RELATORIO_LABELS.tecnica}</option>
                      </select>
                    </label>
                  </>
                )}

                {(gerandoTipo === 'implementacao' || gerandoTipo === 'entrega_final') && (
                  <>
                    <label className="field">
                      <span>Resumo executivo (texto editável)</span>
                      <textarea
                        rows={4}
                        value={formResumoExecutivo}
                        onChange={(e) => setFormResumoExecutivo(e.target.value)}
                        placeholder="O que foi feito, principais entregas, estado atual…"
                      />
                    </label>
                    <label className="field">
                      <span>Próximos passos recomendados (texto editável)</span>
                      <span className="field-hint">
                        Cada item é uma recomendação — ex: acompanhamento de adoção, ajustes futuros, novas
                        automações. Registrar aqui não cria uma tarefa automaticamente.
                      </span>
                    </label>
                    {formProximosPassos.length > 0 && (
                      <ul className="observacoes-lista">
                        {formProximosPassos.map((passo, i) => (
                          <li key={i} className="observacao-item">
                            <div className="observacao-item-header">
                              <span>{passo}</span>
                              <button type="button" className="btn btn-danger btn-auto" onClick={() => handleRemoverProximoPasso(i)}>
                                Remover
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="form-grid">
                      <input
                        type="text"
                        value={novoProximoPasso}
                        onChange={(e) => setNovoProximoPasso(e.target.value)}
                        placeholder="Ex: Acompanhamento de adoção em 30 dias"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdicionarProximoPasso();
                          }
                        }}
                      />
                      <button type="button" className="btn btn-secondary btn-auto" onClick={handleAdicionarProximoPasso}>
                        + Adicionar
                      </button>
                    </div>
                  </>
                )}

                {gerandoTipo === 'adocao' && !checkpointAdocao && (
                  <p className="form-error">
                    Esta implementação ainda não tem o Checkpoint de 30 dias respondido.
                  </p>
                )}

                {relatorios.some((r) => r.tipo === gerandoTipo) && (
                  <label className="field">
                    <span>Motivo da nova versão</span>
                    <input
                      type="text"
                      required
                      value={motivoNovaVersao}
                      onChange={(e) => setMotivoNovaVersao(e.target.value)}
                      placeholder="O que mudou desde a última versão"
                    />
                    <span className="field-hint">
                      Já existe uma versão deste documento — ela continua intacta, esta vira uma versão nova.
                    </span>
                  </label>
                )}

                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharGeracao} disabled={gerando}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={gerando}>
                    {gerando ? 'Gerando…' : 'Gerar'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="card">
            <div className="page-header-actions page-header-actions-split">
              <h2 style={{ marginBottom: 0 }}>Playbook Final de Implementação</h2>
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={handleGerarPlaybook}
                disabled={gerandoPlaybook}
              >
                {gerandoPlaybook
                  ? 'Gerando…'
                  : playbookAtual
                    ? 'Gerar nova versão'
                    : 'Gerar rascunho do Playbook'}
              </button>
            </div>
            <p className="field-hint">
              Documento pra entregar ao cliente — consolida funil, campos, automações, responsabilidades,
              treinamentos e entregas já registrados nesta implementação. Pode começar a ser preparado antes da
              entrega oficial; nada aqui altera o funil ou os dados oficiais.
            </p>

            {!playbookAtual && (
              <p className="field-hint">Nenhuma versão gerada ainda.</p>
            )}

            {playbookAtual && playbookSnapshot && playbookEditavel && (
              <>
                <p className="field-hint">
                  Versão {playbookAtual.versao} ·{' '}
                  <span className={`status-badge status-tone-${STATUS_RELATORIO_TONE[playbookAtual.status]}`}>
                    {STATUS_RELATORIO_LABELS[playbookAtual.status]}
                  </span>
                  {playbookAtual.entregue_em && (
                    <> · entregue em {new Date(playbookAtual.entregue_em).toLocaleString('pt-BR')}</>
                  )}
                </p>

                <div className="table-wrap">
                  <table className="data-table data-table-cards-mobile">
                    <thead>
                      <tr>
                        <th>Seção</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ordemPlaybook(playbookEditavel).map((chave, indice, lista) => {
                        const manifesto = SECOES_PLAYBOOK.find((s) => s.chave === chave)!;
                        const status = statusSecaoPlaybook(chave, playbookSnapshot, playbookEditavel);
                        const oculta = status === 'Oculta';
                        return (
                          <tr key={chave}>
                            <td data-label="Seção">{manifesto.titulo}</td>
                            <td data-label="Status">
                              <span
                                className={`status-badge status-tone-${status === 'Completa' ? 'success' : status === 'Oculta' ? 'neutral' : 'warning'}`}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="table-actions">
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => handleMoverSecaoPlaybook(chave, -1)}
                                disabled={indice === 0}
                                title="Mover para cima"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => handleMoverSecaoPlaybook(chave, 1)}
                                disabled={indice === lista.length - 1}
                                title="Mover para baixo"
                              >
                                ↓
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleAlternarSecaoPlaybookOculta(chave)}
                              >
                                {oculta ? 'Mostrar' : 'Ocultar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {ordemPlaybook(playbookEditavel)
                  .filter((chave) => !playbookEditavel.ocultas.includes(chave))
                  .map((chave) => {
                    const manifesto = SECOES_PLAYBOOK.find((s) => s.chave === chave)!;
                    if (manifesto.origem !== 'manual') return null;
                    return (
                    <label className="field" key={chave}>
                      <span>{manifesto.titulo}</span>
                      <textarea
                        rows={3}
                        value={playbookEditavel.overrides[chave] ?? ''}
                        onChange={(e) => handleEditarTextoSecaoPlaybook(chave, e.target.value)}
                      />
                      {TEXTO_SUGERIDO_SECAO_MANUAL[chave] != null && (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => handleRestaurarSecaoPlaybook(chave)}
                        >
                          Restaurar sugestão
                        </button>
                      )}
                    </label>
                  );
                })}

                <div className="wizard-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSalvarPlaybookEditavel}
                    disabled={salvandoPlaybook}
                  >
                    {salvandoPlaybook ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                  <Link
                    to={`/implementacoes/${implementacao.id}/relatorios/${playbookAtual.id}`}
                    className="btn btn-secondary"
                  >
                    Visualizar / Baixar PDF
                  </Link>
                  {playbookAtual.status !== 'entregue' && (
                    <button type="button" className="btn btn-secondary" onClick={handleMarcarPlaybookEntregue}>
                      Marcar como entregue
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <h2>Documentos gerados</h2>
            {relatorios.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum relatório gerado ainda.</p>
                <p className="field-hint">
                  Quando a implementação estiver próxima da entrega, você pode gerar a documentação final aqui.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table data-table-cards-mobile">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Versão</th>
                      <th>Status</th>
                      <th>Gerado em</th>
                      <th>Gerado por</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {relatorios.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Tipo">
                          {TIPO_RELATORIO_LABELS[r.tipo]}
                          {r.visao ? ` (${VISAO_RELATORIO_LABELS[r.visao]})` : ''}
                        </td>
                        <td data-label="Versão">v{r.versao}</td>
                        <td data-label="Status">
                          <span className={`status-badge status-tone-${STATUS_RELATORIO_TONE[r.status]}`}>
                            {STATUS_RELATORIO_LABELS[r.status]}
                          </span>
                        </td>
                        <td data-label="Gerado em">{r.gerado_em ? new Date(r.gerado_em).toLocaleString('pt-BR') : '—'}</td>
                        <td data-label="Gerado por">{r.gerado_por_email ?? '—'}</td>
                        <td className="table-actions">
                          <Link to={`/implementacoes/${implementacao.id}/relatorios/${r.id}`} className="btn btn-secondary btn-auto">
                            Visualizar
                          </Link>{' '}
                          {r.status !== 'final' && r.status !== 'arquivado' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-auto"
                              onClick={() => handleAlterarStatusRelatorio(r, 'final')}
                            >
                              Marcar como final
                            </button>
                          )}{' '}
                          {r.status !== 'arquivado' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-auto"
                              onClick={() => handleAlterarStatusRelatorio(r, 'arquivado')}
                            >
                              Arquivar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === 'aceite' && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Aceite da entrega</h2>
            {!formAceite && (
              <button type="button" className="btn btn-secondary btn-auto" onClick={abrirFormAceite}>
                {aceite ? 'Atualizar aceite' : 'Registrar aceite'}
              </button>
            )}
          </div>

          {!aceite && !formAceite && (
            <div className="empty-state">
              <p>Nenhum aceite registrado ainda.</p>
              <p className="field-hint">Ausência de resposta do cliente nunca é tratada como aceite automático.</p>
            </div>
          )}

          {aceite && !formAceite && (
            <>
              <p className="field-hint">
                <span className={`status-badge status-tone-${STATUS_ACEITE_TONE[aceite.status]}`}>
                  {STATUS_ACEITE_LABELS[aceite.status]}
                </span>{' '}
                {aceite.data_entrega ? `· Entrega em ${new Date(aceite.data_entrega).toLocaleDateString('pt-BR')}` : ''}
                {aceite.contato_cliente ? ` · Contato: ${aceite.contato_cliente}` : ''}
              </p>
              <p className="field-hint">
                Responsável: {nomeConsultor(aceite.responsavel_entrega_id, consultores) ?? '—'}
              </p>
              {aceite.observacao && <p className="field-hint">{aceite.observacao}</p>}

              {aceite.status === 'nao_aceito' && (
                <div className="card" style={{ background: 'var(--color-surface-raised)' }}>
                  <p>
                    <strong>Motivo:</strong> {aceite.motivo_nao_aceito}
                  </p>
                  {aceite.itens_contestados && (
                    <p>
                      <strong>Itens contestados:</strong> {aceite.itens_contestados}
                    </p>
                  )}
                  {aceite.proximos_passos_nao_aceito && (
                    <p>
                      <strong>Próximos passos:</strong> {aceite.proximos_passos_nao_aceito}
                    </p>
                  )}
                </div>
              )}

              {aceite.status === 'aceito_com_ressalvas' && (
                <>
                  <div className="page-header-actions page-header-actions-split">
                    <h3 style={{ marginBottom: 0 }}>Ressalvas</h3>
                    {!formRessalva && (
                      <button type="button" className="btn btn-secondary btn-auto" onClick={abrirFormRessalva}>
                        + Nova ressalva
                      </button>
                    )}
                  </div>
                  {ressalvas.length === 0 ? (
                    <p className="field-hint">Nenhuma ressalva registrada ainda.</p>
                  ) : (
                    <ul className="observacoes-lista">
                      {ressalvas.map((r) => (
                        <li key={r.id} className="observacao-item">
                          <strong>{r.ressalva}</strong>
                          <p className="field-hint">
                            {nomeConsultor(r.responsavel_id, consultores) ?? 'Sem responsável'}
                            {r.prazo ? ` · Prazo: ${new Date(r.prazo).toLocaleDateString('pt-BR')}` : ''}
                            {r.pendencia_id ? ' · Pendência vinculada criada' : ''}
                          </p>
                          {r.acao_necessaria && <p className="field-hint">{r.acao_necessaria}</p>}
                        </li>
                      ))}
                    </ul>
                  )}

                  {formRessalva && (
                    <form onSubmit={handleSalvarRessalva} className="card form-card">
                      <label className="field">
                        <span>Ressalva</span>
                        <textarea
                          required
                          rows={2}
                          value={formRessalva.ressalva}
                          onChange={(e) => setFormRessalva({ ...formRessalva, ressalva: e.target.value })}
                        />
                      </label>
                      <div className="form-grid">
                        <label className="field">
                          <span>Responsável</span>
                          <select
                            value={formRessalva.responsavel_id}
                            onChange={(e) => setFormRessalva({ ...formRessalva, responsavel_id: e.target.value })}
                          >
                            <option value="">Sem responsável</option>
                            {consultores.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Prazo</span>
                          <input
                            type="date"
                            value={formRessalva.prazo}
                            onChange={(e) => setFormRessalva({ ...formRessalva, prazo: e.target.value })}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Ação necessária</span>
                        <textarea
                          rows={2}
                          value={formRessalva.acao_necessaria}
                          onChange={(e) => setFormRessalva({ ...formRessalva, acao_necessaria: e.target.value })}
                        />
                      </label>
                      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={formRessalva.criarPendencia}
                          onChange={(e) => setFormRessalva({ ...formRessalva, criarPendencia: e.target.checked })}
                        />
                        <span>Criar pendência vinculada</span>
                      </label>
                      <div className="wizard-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setFormRessalva(null)}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary">
                          Salvar
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          )}

          {formAceite && (
            <form onSubmit={handleSalvarAceite} className="card form-card">
              <label className="field">
                <span>Status</span>
                <select
                  value={formAceite.status}
                  onChange={(e) => setFormAceite({ ...formAceite, status: e.target.value as StatusAceiteEntrega })}
                >
                  {(Object.keys(STATUS_ACEITE_LABELS) as StatusAceiteEntrega[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_ACEITE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Data da entrega</span>
                  <input
                    type="date"
                    value={formAceite.data_entrega}
                    onChange={(e) => setFormAceite({ ...formAceite, data_entrega: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Responsável pela entrega</span>
                  <select
                    value={formAceite.responsavel_entrega_id}
                    onChange={(e) => setFormAceite({ ...formAceite, responsavel_entrega_id: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {consultores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Contato do cliente</span>
                <input
                  type="text"
                  value={formAceite.contato_cliente}
                  onChange={(e) => setFormAceite({ ...formAceite, contato_cliente: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Observação</span>
                <textarea
                  rows={2}
                  value={formAceite.observacao}
                  onChange={(e) => setFormAceite({ ...formAceite, observacao: e.target.value })}
                />
              </label>

              {formAceite.status === 'nao_aceito' && (
                <>
                  <label className="field">
                    <span>Motivo</span>
                    <textarea
                      required
                      rows={2}
                      value={formAceite.motivo_nao_aceito}
                      onChange={(e) => setFormAceite({ ...formAceite, motivo_nao_aceito: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Itens contestados</span>
                    <textarea
                      rows={2}
                      value={formAceite.itens_contestados}
                      onChange={(e) => setFormAceite({ ...formAceite, itens_contestados: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Próximos passos</span>
                    <textarea
                      rows={2}
                      value={formAceite.proximos_passos_nao_aceito}
                      onChange={(e) => setFormAceite({ ...formAceite, proximos_passos_nao_aceito: e.target.value })}
                    />
                  </label>
                  <p className="field-hint">
                    Registrar a entrega como não aceita não marca a implementação como concluída automaticamente.
                  </p>
                </>
              )}

              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFormAceite(null)} disabled={salvandoAceite}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvandoAceite}>
                  {salvandoAceite ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {aba === 'historico' && (
        <section className="card">
          <h2>Histórico</h2>
          {historico.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum evento registrado ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Ação</th>
                    <th>Usuário</th>
                    <th>Data/hora</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Ação">{h.acao}</td>
                      <td data-label="Usuário">{h.user_email ?? '—'}</td>
                      <td data-label="Data/hora">{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
