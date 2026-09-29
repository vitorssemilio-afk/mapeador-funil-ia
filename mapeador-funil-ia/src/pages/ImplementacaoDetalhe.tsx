import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GanttRuler } from '../components/GanttRuler';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { inicioDoDia } from '../lib/agendaImplementacao';
import {
  resolverAtividade,
  resolverTrialKommo,
  STATUS_ATIVIDADE_LABELS,
  STATUS_ATIVIDADE_TONE,
  type AtividadeResolvida,
} from '../lib/atividadesCronograma';
import { gerarItensDerivados } from '../lib/checklistDerivado';
import { extrairMensagemErroEdgeFunction } from '../lib/edgeFunctionError';
import {
  PX_POR_DIA,
  calcularEscala,
  diaParaPx,
  fasesImplementacao,
  prazoFaseAtual,
  prazoGeral,
  tempoAteReuniao,
} from '../lib/cronograma';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  CheckpointAdocao,
  Cliente,
  CredencialApiKommoMeta,
  CredencialCrmListada,
  FrequenciaUsoCheckpoint,
  FunilGerado,
  FunilKommoCriacao,
  ImplementacaoCrm,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
  IntencaoManutencaoCheckpoint,
  Mapeamento,
  UsoDiarioCheckpoint,
} from '../types/database';

type Aba = 'geral' | 'checklist' | 'cronograma' | 'credenciais' | 'checkpoint';

const USO_DIARIO_LABELS: Record<UsoDiarioCheckpoint, string> = {
  so_kommo: 'Só Kommo',
  kommo_mais_planilha: 'Kommo + planilha ainda',
  voltou_planilha: 'Voltaram pra planilha',
};

const FREQUENCIA_USO_LABELS: Record<FrequenciaUsoCheckpoint, string> = {
  diariamente: 'Diariamente',
  semanalmente: 'Semanalmente',
  raramente: 'Raramente',
  nao_uso: 'Não uso',
};

const INTENCAO_MANUTENCAO_LABELS: Record<IntencaoManutencaoCheckpoint, string> = {
  sim: 'Sim',
  talvez: 'Talvez',
  nao: 'Não',
};

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

type FormCredencialKommo = {
  subdominio: string;
  token: string;
};

const STATUS_BLOQUEADOS_SEM_PRE_REQUISITO = new Set<ImplementacaoStatus>([
  'crm_em_configuracao',
  'treinamento_agendado',
  'automacoes',
  'entrega',
  'adocao',
  'concluida',
]);

// Pra qual próximo status a conclusão do ciclo correspondente sugere avançar
// — usado no hint de "avançar status" mostrado junto do ciclo atual, na aba
// Checklist.
const PROXIMO_STATUS: Partial<Record<ImplementacaoStatus, ImplementacaoStatus>> = {
  preparacao_crm: 'crm_em_configuracao',
  crm_em_configuracao: 'treinamento_agendado',
  treinamento_agendado: 'automacoes',
  automacoes: 'entrega',
  entrega: 'adocao',
  adocao: 'concluida',
};

function preRequisitoCompleto(form: FormGeral): boolean {
  return (
    form.email_conta_kommo.trim().length > 0 &&
    form.whatsapp_corporativo_confirmado &&
    form.acesso_facebook_confirmado
  );
}

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
  const { user } = useAuth();

  const [implementacao, setImplementacao] = useState<ImplementacaoCrm | null>(null);
  const [atividadesTemplate, setAtividadesTemplate] = useState<AtividadeCronograma[]>([]);
  const [atividadesStatus, setAtividadesStatus] = useState<AtividadeStatusRow[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [evidenciaFaltando, setEvidenciaFaltando] = useState<Set<string>>(new Set());
  const [credenciais, setCredenciais] = useState<CredencialCrmListada[]>([]);
  const [funisDoMapeamento, setFunisDoMapeamento] = useState<FunilGerado[]>([]);
  const [criacoesKommo, setCriacoesKommo] = useState<Record<string, FunilKommoCriacao>>({});
  const [credencialKommoMeta, setCredencialKommoMeta] = useState<CredencialApiKommoMeta | null>(null);
  const [historicoStatus, setHistoricoStatus] = useState<ImplementacaoStatusHistorico[]>([]);
  const [checkpointAdocao, setCheckpointAdocao] = useState<CheckpointAdocao | null>(null);
  const [linkCheckpointCopiado, setLinkCheckpointCopiado] = useState(false);
  const [aba, setAba] = useState<Aba>('geral');
  const [mapeamentoOrigem, setMapeamentoOrigem] = useState<Pick<
    Mapeamento,
    'id' | 'nome_negocio' | 'enviado_em' | 'created_at'
  > | null>(null);
  const [posVendaMapeamento, setPosVendaMapeamento] = useState<{
    id: string;
    codigo_curto: string;
  } | null>(null);
  const [criandoPosVenda, setCriandoPosVenda] = useState(false);
  const [linkPosVendaCopiado, setLinkPosVendaCopiado] = useState(false);
  const [kickoffRealizadoEm, setKickoffRealizadoEm] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formGeral, setFormGeral] = useState<FormGeral | null>(null);
  const [salvandoGeral, setSalvandoGeral] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);

  const [formCredencial, setFormCredencial] = useState<FormCredencial | null>(null);
  const [salvandoCredencial, setSalvandoCredencial] = useState(false);
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [revelando, setRevelando] = useState<string | null>(null);

  const [formCredencialKommo, setFormCredencialKommo] = useState<FormCredencialKommo | null>(null);
  const [salvandoCredencialKommo, setSalvandoCredencialKommo] = useState(false);
  const [criandoFunilId, setCriandoFunilId] = useState<string | null>(null);
  const [apagarFunilPadrao, setApagarFunilPadrao] = useState(false);
  const [mensagemSucessoKommo, setMensagemSucessoKommo] = useState<string | null>(null);

  const [excluindo, setExcluindo] = useState(false);
  const [gerandoItens, setGerandoItens] = useState(false);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const fasesCronograma = useMemo(
    () => (implementacao ? fasesImplementacao(implementacao, historicoStatus) : []),
    [implementacao, historicoStatus],
  );

  const prazoSemanaAtual = useMemo(
    () => (implementacao ? prazoFaseAtual(implementacao, historicoStatus, hoje) : null),
    [implementacao, historicoStatus, hoje],
  );

  const prazoProcesso = useMemo(
    () => (implementacao ? prazoGeral(implementacao, kickoffRealizadoEm, hoje) : null),
    [implementacao, kickoffRealizadoEm, hoje],
  );

  const tempoReuniao = useMemo(
    () =>
      implementacao ? tempoAteReuniao(implementacao, historicoStatus, kickoffRealizadoEm, hoje) : null,
    [implementacao, historicoStatus, kickoffRealizadoEm, hoje],
  );

  const escalaGantt = useMemo(() => {
    const datas = fasesCronograma.flatMap((fase) => [fase.inicio, fase.fim ?? hoje]);
    return calcularEscala(datas, hoje);
  }, [fasesCronograma, hoje]);

  // Cada atividade do template global (ou derivada desta implementação) +
  // a atividade virtual do Trial Kommo, todas já resolvidas com datas,
  // status e atraso a partir das dependências e do histórico de status.
  const atividadesResolvidas: AtividadeResolvida[] = useMemo(() => {
    if (!implementacao) return [];
    const resolvidas = atividadesTemplate.map((atividade) =>
      resolverAtividade({
        atividade,
        statusRow: atividadesStatus.find((s) => s.atividade_id === atividade.id) ?? null,
        historico: historicoStatus,
        cliente,
        hoje,
      }),
    );
    if (cliente) resolvidas.push(resolverTrialKommo(cliente, hoje));
    return resolvidas;
  }, [implementacao, atividadesTemplate, atividadesStatus, historicoStatus, cliente, hoje]);

  // Agrupadas por ciclo, preservando a ordem de carregamento (já vem
  // ordenado por `ordem` da query) — Trial Kommo cai sozinho no seu próprio
  // grupo, por já ter `ciclo: 'Trial Kommo'`.
  const atividadesPorCiclo = useMemo(() => {
    const mapa = new Map<string, AtividadeResolvida[]>();
    for (const atividade of atividadesResolvidas) {
      if (!mapa.has(atividade.ciclo)) mapa.set(atividade.ciclo, []);
      mapa.get(atividade.ciclo)!.push(atividade);
    }
    return mapa;
  }, [atividadesResolvidas]);

  async function carregar(implementacaoId: string) {
    setLoading(true);
    setError(null);

    const [
      { data: implData, error: implError },
      { data: atividadesData, error: atividadesError },
      { data: atividadesStatusData, error: atividadesStatusError },
      { data: credenciaisData, error: credenciaisError },
      { data: historicoData, error: historicoError },
      { data: checkpointData },
    ] = await Promise.all([
      supabase.from('implementacoes_crm').select('*').eq('id', implementacaoId).single(),
      // Template global (implementacao_id nulo) + atividades derivadas do funil desta implementação.
      supabase
        .from('atividades_cronograma')
        .select('*')
        .or(`implementacao_id.is.null,implementacao_id.eq.${implementacaoId}`)
        .order('ordem', { ascending: true }),
      supabase.from('atividades_status').select('*').eq('implementacao_id', implementacaoId),
      supabase.rpc('listar_credenciais_crm', { p_implementacao_id: implementacaoId }),
      supabase
        .from('implementacao_status_historico')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('alterado_em', { ascending: true }),
      supabase
        .from('checkpoints_adocao')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .maybeSingle(),
    ]);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setImplementacao(implData);
    setFormGeral(paraFormGeral(implData));
    if (!atividadesError) setAtividadesTemplate(atividadesData ?? []);
    if (!atividadesStatusError) {
      setAtividadesStatus(atividadesStatusData ?? []);
      setEvidencias(
        Object.fromEntries((atividadesStatusData ?? []).map((s) => [s.atividade_id, s.evidencia ?? ''])),
      );
    }
    setEvidenciaFaltando(new Set());
    if (!credenciaisError) setCredenciais(credenciaisData ?? []);
    if (!historicoError) setHistoricoStatus(historicoData ?? []);
    setCheckpointAdocao(checkpointData ?? null);

    const [{ data: mapeamentoOrigemData }, { data: posVendaData }, { data: clienteData }] = await Promise.all([
      supabase
        .from('mapeamentos')
        .select('id, nome_negocio, enviado_em, created_at')
        .eq('id', implData.mapeamento_id)
        .single(),
      supabase
        .from('mapeamentos')
        .select('id, codigo_curto')
        .eq('mapeamento_origem_id', implData.mapeamento_id)
        .eq('tipo', 'pos_venda'),
      implData.cliente_id
        ? supabase.from('clientes').select('*').eq('id', implData.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setMapeamentoOrigem(mapeamentoOrigemData ?? null);
    setCliente(clienteData ?? null);
    setKickoffRealizadoEm(clienteData?.kickoff_realizado_em ?? null);
    setPosVendaMapeamento(posVendaData?.[0] ?? null);

    const idsMapeamentos = [implData.mapeamento_id, ...(posVendaData ?? []).map((m) => m.id)];
    const funisPorMapeamento = await Promise.all(idsMapeamentos.map(buscarFunisMaisRecentes));
    const funis = funisPorMapeamento.flat();
    setFunisDoMapeamento(funis);

    const [{ data: criacoesData }, { data: credKommoData }] = await Promise.all([
      funis.length > 0
        ? supabase
            .from('funis_kommo_criacoes')
            .select('*')
            .in(
              'funil_gerado_id',
              funis.map((f) => f.id),
            )
        : Promise.resolve({ data: [] as FunilKommoCriacao[] }),
      supabase.rpc('obter_credencial_api_kommo_meta', { p_implementacao_id: implementacaoId }),
    ]);

    setCriacoesKommo(
      Object.fromEntries((criacoesData ?? []).map((c) => [c.funil_gerado_id, c])),
    );
    setCredencialKommoMeta(credKommoData?.[0] ?? null);

    setLoading(false);
  }

  useEffect(() => {
    if (id) carregar(id);
  }, [id]);

  // Base pras atividades derivadas: sempre logo após as atividades globais
  // do template do ciclo, pra não crescer a cada regeneração (as derivadas
  // antigas já foram apagadas antes de inserir as novas).
  function proximaOrdemCiclo(ciclo: string): number {
    const ordens = atividadesTemplate
      .filter((a) => a.ciclo === ciclo && a.implementacao_id === null)
      .map((a) => a.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 0;
  }

  async function buscarFunisMaisRecentes(mapeamentoId: string): Promise<FunilGerado[]> {
    const { data: versaoAtual } = await supabase
      .from('funis_gerados')
      .select('versao')
      .eq('mapeamento_id', mapeamentoId)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!versaoAtual) return [];

    const { data } = await supabase
      .from('funis_gerados')
      .select('*')
      .eq('mapeamento_id', mapeamentoId)
      .eq('versao', versaoAtual.versao)
      .order('ordem', { ascending: true });

    return data ?? [];
  }

  async function handleGerarItensDoFunil() {
    if (!implementacao) return;

    const jaTemDerivados = atividadesTemplate.some((a) => a.implementacao_id === implementacao.id);
    if (
      jaTemDerivados &&
      !window.confirm(
        'Já existem atividades geradas a partir do funil nesta implementação. Gerar de novo substitui essas atividades — o que já tinha sido marcado nelas se perde. Continuar?',
      )
    ) {
      return;
    }

    setGerandoItens(true);
    setError(null);

    const funis = await buscarFunisMaisRecentes(implementacao.mapeamento_id);
    if (funis.length === 0) {
      setGerandoItens(false);
      setError('O mapeamento de origem ainda não tem funil gerado.');
      return;
    }

    const { semana1, semana2 } = gerarItensDerivados(funis);

    if (jaTemDerivados) {
      await supabase.from('atividades_cronograma').delete().eq('implementacao_id', implementacao.id);
    }

    const ordemBaseSemana1 = proximaOrdemCiclo('CRM em configuração');
    const ordemBaseSemana2 = proximaOrdemCiclo('Treinamento agendado');

    const rows = [
      ...semana1.map((texto, i) => ({
        nome: texto,
        ciclo: 'CRM em configuração',
        ordem: ordemBaseSemana1 + i,
        implementacao_id: implementacao.id,
        depende_de: 'ciclo:preparacao_crm',
      })),
      ...semana2.map((texto, i) => ({
        nome: texto,
        ciclo: 'Treinamento agendado',
        ordem: ordemBaseSemana2 + i,
        implementacao_id: implementacao.id,
        depende_de: 'ciclo:crm_em_configuracao',
      })),
    ];

    const { error: insertError } = await supabase.from('atividades_cronograma').insert(rows);
    setGerandoItens(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await carregar(implementacao.id);
  }

  // Helper único pras 4 ações do checklist (concluir, agendar, bloquear pelo
  // cliente, salvar evidência) — todas são upserts na mesma linha de
  // atividades_status, só mudando qual campo é patcheado.
  async function upsertAtividadeStatus(atividadeId: string, patch: Partial<AtividadeStatusRow>) {
    if (!implementacao) return;

    const { data, error: upsertError } = await supabase
      .from('atividades_status')
      .upsert(
        { implementacao_id: implementacao.id, atividade_id: atividadeId, ...patch },
        { onConflict: 'implementacao_id,atividade_id' },
      )
      .select()
      .single();

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setAtividadesStatus((prev) => {
      const idx = prev.findIndex((s) => s.atividade_id === atividadeId);
      if (idx === -1) return [...prev, data];
      const copia = [...prev];
      copia[idx] = data;
      return copia;
    });
  }

  async function handleMarcarConcluido(atividade: AtividadeResolvida, concluido: boolean) {
    if (atividade.id === null) return;

    // Critério que exige evidência não pode ser marcado sem ela — vira só
    // um lembrete e perde a força de controle de qualidade, senão.
    const requerEvidencia = atividadesTemplate.find((a) => a.id === atividade.id)?.requer_evidencia ?? false;
    if (concluido && requerEvidencia && !(evidencias[atividade.id] ?? '').trim()) {
      setEvidenciaFaltando((prev) => new Set(prev).add(atividade.id!));
      return;
    }

    setEvidenciaFaltando((prev) => {
      if (!prev.has(atividade.id!)) return prev;
      const next = new Set(prev);
      next.delete(atividade.id!);
      return next;
    });

    await upsertAtividadeStatus(atividade.id, { data_real: concluido ? new Date().toISOString() : null });
  }

  async function handleAgendar(atividadeId: string, data: string) {
    await upsertAtividadeStatus(atividadeId, { agendado_para: data || null });
  }

  async function handleBloquearPeloCliente(atividadeId: string, bloqueado: boolean) {
    await upsertAtividadeStatus(atividadeId, { bloqueado_pelo_cliente: bloqueado });
  }

  function handleEvidenciaChange(atividadeId: string, texto: string) {
    setEvidencias((prev) => ({ ...prev, [atividadeId]: texto }));
  }

  async function handleEvidenciaBlur(atividade: AtividadeResolvida) {
    if (atividade.id === null) return;
    const texto = (evidencias[atividade.id] ?? '').trim();

    const requerEvidencia = atividadesTemplate.find((a) => a.id === atividade.id)?.requer_evidencia ?? false;

    // Sem evidência não sustenta a marcação de um critério que exige evidência.
    if (requerEvidencia && !texto && atividade.status === 'concluido') {
      await upsertAtividadeStatus(atividade.id, { evidencia: null, data_real: null });
      return;
    }

    await upsertAtividadeStatus(atividade.id, { evidencia: texto || null });
  }

  async function handleSalvarGeral(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formGeral) return;

    setError(null);

    if (
      implementacao.status === 'preparacao_crm' &&
      STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(formGeral.status) &&
      !preRequisitoCompleto(formGeral)
    ) {
      setError(
        'Não dá pra avançar pra CRM em configuração sem o pré-requisito completo: e-mail da conta Kommo, WhatsApp Corporativo e acesso ao Facebook confirmados.',
      );
      return;
    }

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

  async function handleAvancarStatus(proximo: ImplementacaoStatus) {
    if (!implementacao || !formGeral) return;
    setError(null);
    setSalvandoGeral(true);

    const { data, error: updateError } = await supabase
      .from('implementacoes_crm')
      .update({ status: proximo })
      .eq('id', implementacao.id)
      .select()
      .single();

    setSalvandoGeral(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setImplementacao(data);
    setFormGeral({ ...formGeral, status: proximo });
  }

  async function handleGerarPosVenda() {
    if (!implementacao || !mapeamentoOrigem || !user) return;
    setCriandoPosVenda(true);

    const { data, error: insertError } = await supabase
      .from('mapeamentos')
      .insert({
        user_id: user.id,
        cliente_id: implementacao.cliente_id,
        nome_negocio: mapeamentoOrigem.nome_negocio,
        status: 'em_preenchimento',
        respostas: {},
        tipo: 'pos_venda',
        mapeamento_origem_id: mapeamentoOrigem.id,
      })
      .select('id, codigo_curto')
      .single();

    setCriandoPosVenda(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setPosVendaMapeamento(data);
  }

  async function handleCopiarLinkPosVenda() {
    if (!posVendaMapeamento) return;
    const link = `${window.location.origin}/f/${posVendaMapeamento.codigo_curto}`;
    await navigator.clipboard.writeText(link);
    setLinkPosVendaCopiado(true);
    setTimeout(() => setLinkPosVendaCopiado(false), 2000);
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

  function abrirFormCredencialKommo() {
    setFormCredencialKommo({
      subdominio: credencialKommoMeta?.subdominio ?? '',
      token: '',
    });
  }

  function fecharFormCredencialKommo() {
    setFormCredencialKommo(null);
  }

  async function handleSalvarCredencialKommo(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formCredencialKommo) return;
    if (!formCredencialKommo.subdominio.trim() || !formCredencialKommo.token.trim()) return;

    setSalvandoCredencialKommo(true);
    const { error: saveError } = await supabase.rpc('salvar_credencial_api_kommo', {
      p_implementacao_id: implementacao.id,
      p_subdominio: formCredencialKommo.subdominio.trim(),
      p_token: formCredencialKommo.token.trim(),
    });
    setSalvandoCredencialKommo(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormCredencialKommo();
    carregar(implementacao.id);
  }

  async function handleCopiarLinkCheckpoint() {
    if (!implementacao) return;
    const link = `${window.location.origin}/checkpoint/${implementacao.codigo_checkpoint}`;
    await navigator.clipboard.writeText(link);
    setLinkCheckpointCopiado(true);
    setTimeout(() => setLinkCheckpointCopiado(false), 2000);
  }

  async function handleCriarFunilNoKommo(funil: FunilGerado) {
    if (!implementacao) return;

    const jaCriado = criacoesKommo[funil.id];
    if (jaCriado) {
      const confirmar = window.confirm(
        `O funil "${funil.nome_funil}" já foi criado no Kommo (pipeline ${jaCriado.kommo_pipeline_id}) em ${new Date(jaCriado.criado_em).toLocaleString('pt-BR')}. Criar de novo cria um pipeline NOVO e separado na conta do cliente — não atualiza o existente. Continuar mesmo assim?`,
      );
      if (!confirmar) return;
    } else if (
      !window.confirm(
        `Confirma a criação do funil "${funil.nome_funil}" direto na conta Kommo do cliente? Isso grava o pipeline, as etapas e os campos personalizados de verdade — revise o funil antes de confirmar.`,
      )
    ) {
      return;
    }

    setCriandoFunilId(funil.id);
    setError(null);
    setMensagemSucessoKommo(null);

    const { data, error: invokeError } = await supabase.functions.invoke('criar-funil-kommo', {
      body: {
        implementacao_id: implementacao.id,
        funil_id: funil.id,
        confirmar: Boolean(jaCriado),
        apagar_funil_padrao: apagarFunilPadrao,
      },
    });

    setCriandoFunilId(null);

    if (invokeError || data?.error) {
      const mensagemDetalhada = invokeError ? await extrairMensagemErroEdgeFunction(invokeError) : null;
      setError(
        data?.message ??
          data?.error ??
          mensagemDetalhada ??
          invokeError?.message ??
          'Falha ao criar o funil no Kommo.',
      );
      return;
    }

    const campos: { reaproveitado: boolean }[] = data?.campoIds ?? [];
    const novos = campos.filter((c) => !c.reaproveitado).length;
    const reaproveitados = campos.filter((c) => c.reaproveitado).length;
    const resumoCampos =
      campos.length > 0
        ? ` ${novos} campo(s) criado(s)${reaproveitados > 0 ? `, ${reaproveitados} já existiam e foram reaproveitados` : ''}.`
        : '';

    if (data?.funil_padrao) {
      setMensagemSucessoKommo(
        (data.funil_padrao.apagado
          ? `Funil "${funil.nome_funil}" criado no Kommo. O funil padrão da conta também foi apagado.`
          : `Funil "${funil.nome_funil}" criado no Kommo. Funil padrão não apagado: ${data.funil_padrao.motivo ?? 'motivo desconhecido'}.`) +
          resumoCampos,
      );
    } else {
      setMensagemSucessoKommo(`Funil "${funil.nome_funil}" criado no Kommo.${resumoCampos}`);
    }

    await carregar(implementacao.id);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !implementacao) return <p className="form-error">{error}</p>;
  if (!implementacao || !formGeral) return <p className="form-error">Implementação não encontrada.</p>;

  const gateSemanaUmBloqueado = implementacao.status === 'preparacao_crm' && !preRequisitoCompleto(formGeral);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{implementacao.nome_cliente}</h1>
          <p className="field-hint">
            {implementacao.cliente_id && (
              <>
                <Link to={`/clientes/${implementacao.cliente_id}`}>← Ver cliente</Link>
                {' · '}
              </>
            )}
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

      {(prazoSemanaAtual || prazoProcesso || tempoReuniao) && (
        <div className="stats-grid">
          {prazoSemanaAtual && (
            <div className={`stat-card${prazoSemanaAtual.atrasada ? ' stat-card-danger' : ' stat-card-warning'}`}>
              <span className="stat-value">
                {prazoSemanaAtual.atrasada
                  ? `${prazoSemanaAtual.diasAtraso}d atrasada`
                  : `${prazoSemanaAtual.diasRestantes}d restantes`}
              </span>
              <span className="stat-label">
                Prazo desta semana — até {prazoSemanaAtual.prazo.toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}

          {prazoProcesso && (
            <div className={`stat-card${prazoProcesso.atrasada ? ' stat-card-danger' : ''}`}>
              <span className="stat-value">
                {prazoProcesso.atrasada
                  ? `${prazoProcesso.diasAtraso}d atrasada`
                  : `${prazoProcesso.diasRestantes}d restantes`}
              </span>
              <span className="stat-label">
                Conclusão prevista da implementação — {prazoProcesso.prazoConclusao.toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}

          {tempoReuniao && (
            <div className="stat-card">
              <span className="stat-value">{tempoReuniao.dias}d</span>
              <span className="stat-label">
                {tempoReuniao.concluido
                  ? 'Da resposta do formulário até a 1ª reunião'
                  : 'Desde a resposta do formulário, ainda sem 1ª reunião'}
              </span>
            </div>
          )}
        </div>
      )}

      {(implementacao.status === 'automacoes' ||
        implementacao.status === 'entrega' ||
        implementacao.status === 'adocao' ||
        implementacao.status === 'concluida') &&
        (posVendaMapeamento ? (
          <div className="form-info form-info-com-acao">
            <span>O formulário de pós-venda já foi gerado para este cliente.</span>
            <button type="button" className="btn btn-secondary" onClick={handleCopiarLinkPosVenda}>
              {linkPosVendaCopiado ? 'Link copiado!' : 'Copiar link de pós-venda'}
            </button>
          </div>
        ) : (
          <div className="form-info form-info-com-acao">
            <span>
              A implementação chegou na Semana 3 — hora de oferecer o formulário de pós-venda pro
              cliente.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGerarPosVenda}
              disabled={criandoPosVenda || !mapeamentoOrigem || !user}
            >
              {criandoPosVenda ? 'Gerando…' : 'Gerar link de pós-venda'}
            </button>
          </div>
        ))}

      <div className="tabs">
        <button
          type="button"
          className={`tab-button${aba === 'geral' ? ' active' : ''}`}
          onClick={() => setAba('geral')}
        >
          Visão Geral
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'checklist' ? ' active' : ''}`}
          onClick={() => setAba('checklist')}
        >
          Checklist
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'cronograma' ? ' active' : ''}`}
          onClick={() => setAba('cronograma')}
        >
          Cronograma
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'credenciais' ? ' active' : ''}`}
          onClick={() => setAba('credenciais')}
        >
          Credenciais
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'checkpoint' ? ' active' : ''}`}
          onClick={() => setAba('checkpoint')}
        >
          Checkpoint 30 dias
          {checkpointAdocao?.risco_churn && <span className="badge-danger">Risco</span>}
        </button>
      </div>

      {aba === 'geral' && (
        <>
          <form onSubmit={handleSalvarGeral} className="card form-card">
            <h2>Dados gerais</h2>

            <div className="form-grid">
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
                    <option
                      key={valor}
                      value={valor}
                      disabled={
                        gateSemanaUmBloqueado &&
                        STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(valor as ImplementacaoStatus)
                      }
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {gateSemanaUmBloqueado && (
                  <span className="field-hint">
                    Bloqueado até confirmar o pré-requisito: e-mail da conta Kommo, WhatsApp
                    Corporativo e acesso ao Facebook (campos "Acessos" abaixo).
                  </span>
                )}
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
            </div>

            <h3>Acessos</h3>

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={formGeral.conta_criada_via_v4}
                onChange={(e) => setFormGeral({ ...formGeral, conta_criada_via_v4: e.target.checked })}
              />
              <span>Conta Kommo criada via V4 Company</span>
            </label>

            <div className="form-grid">
              <label className="field">
                <span>E-mail da conta Kommo</span>
                <input
                  type="email"
                  value={formGeral.email_conta_kommo}
                  onChange={(e) => setFormGeral({ ...formGeral, email_conta_kommo: e.target.value })}
                />
              </label>
            </div>

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

            <div className="form-grid">
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

              <label className="field field-full">
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={formGeral.observacoes}
                  onChange={(e) => setFormGeral({ ...formGeral, observacoes: e.target.value })}
                />
              </label>
            </div>

            <div className="wizard-actions">
              <span className="field-hint">{salvoRecentemente ? 'Alterações salvas.' : ''}</span>
              <button type="submit" className="btn btn-primary" disabled={salvandoGeral}>
                {salvandoGeral ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </form>

          {historicoStatus.length > 0 && (
            <section className="card form-card">
              <h2>Histórico de status</h2>
              <p className="field-hint">Data real de quando cada fase foi alcançada.</p>
              <ul className="historico-status-lista">
                {historicoStatus.map((h) => (
                  <li key={h.id} className="historico-status-item">
                    <span className="historico-status-data">
                      {new Date(h.alterado_em).toLocaleString('pt-BR')}
                    </span>
                    <span>
                      {h.status_anterior
                        ? `${IMPLEMENTACAO_STATUS_LABELS[h.status_anterior]} → ${IMPLEMENTACAO_STATUS_LABELS[h.status_novo]}`
                        : `Implementação iniciada em ${IMPLEMENTACAO_STATUS_LABELS[h.status_novo]}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card form-card">
            <h2>Itens derivados do funil</h2>
            <p className="field-hint">
              Gera itens específicos pra Semana 1 (funis, campos, gatilhos) e Semana 2 (automações,
              mensagens, motivos de perda) a partir do funil já gerado pra este cliente, direto no
              checklist abaixo — sem precisar montar essa lista na mão. Rodar de novo substitui os
              itens gerados anteriormente (o que já tinha sido marcado neles se perde).
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={handleGerarItensDoFunil}
              disabled={gerandoItens}
            >
              {gerandoItens ? 'Gerando…' : 'Gerar itens a partir do funil'}
            </button>
          </section>

          <section className="card form-card">
            <div className="page-header">
              <h2 style={{ marginBottom: 0 }}>Criar funil no Kommo (API)</h2>
              {!formCredencialKommo && (
                <button type="button" className="btn btn-secondary" onClick={abrirFormCredencialKommo}>
                  {credencialKommoMeta ? 'Trocar token' : '+ Cadastrar credencial de API'}
                </button>
              )}
            </div>
            <p className="field-hint">
              Cria o pipeline, as etapas e os campos personalizados direto na conta Kommo do cliente,
              usando o token de longa duração da integração (Kommo → Configurações → Integrações →
              sua integração → "Token de longa duração"). Diferente das credenciais de acesso acima
              — esse token nunca fica visível na tela depois de salvo.
            </p>

            {credencialKommoMeta && !formCredencialKommo && (
              <p className="field-hint">
                Configurado para <code>{credencialKommoMeta.subdominio}.kommo.com</code>.
              </p>
            )}
            {!credencialKommoMeta && !formCredencialKommo && (
              <p className="field-hint">Nenhuma credencial de API cadastrada ainda.</p>
            )}

            {formCredencialKommo && (
              <form onSubmit={handleSalvarCredencialKommo} className="card form-card">
                <label className="field">
                  <span>Subdomínio Kommo</span>
                  <input
                    type="text"
                    required
                    placeholder="ex: minhaempresa (de minhaempresa.kommo.com)"
                    value={formCredencialKommo.subdominio}
                    onChange={(e) =>
                      setFormCredencialKommo({ ...formCredencialKommo, subdominio: e.target.value })
                    }
                  />
                </label>

                <label className="field">
                  <span>Token de longa duração</span>
                  <input
                    type="text"
                    required
                    value={formCredencialKommo.token}
                    onChange={(e) =>
                      setFormCredencialKommo({ ...formCredencialKommo, token: e.target.value })
                    }
                  />
                </label>

                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharFormCredencialKommo}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={salvandoCredencialKommo}>
                    {salvandoCredencialKommo ? 'Salvando…' : 'Salvar credencial'}
                  </button>
                </div>
              </form>
            )}

            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={apagarFunilPadrao}
                onChange={(e) => setApagarFunilPadrao(e.target.checked)}
              />
              <span>
                Ao criar, apagar também o funil padrão que o Kommo cria sozinho em conta nova — só
                some se ele ainda estiver vazio (sem negociações); com dado dentro, não é apagado.
              </span>
            </label>

            {mensagemSucessoKommo && <p className="form-info">{mensagemSucessoKommo}</p>}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Funil</th>
                    <th>Status no Kommo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {funisDoMapeamento.map((funil) => {
                    const criacao = criacoesKommo[funil.id];
                    return (
                      <tr key={funil.id}>
                        <td>{funil.nome_funil}</td>
                        <td>
                          {criacao
                            ? `Criado (pipeline ${criacao.kommo_pipeline_id}) em ${new Date(criacao.criado_em).toLocaleString('pt-BR')}`
                            : 'Ainda não criado'}
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleCriarFunilNoKommo(funil)}
                            disabled={criandoFunilId === funil.id || !credencialKommoMeta}
                            title={
                              !credencialKommoMeta ? 'Cadastre a credencial de API acima primeiro' : undefined
                            }
                          >
                            {criandoFunilId === funil.id
                              ? 'Criando…'
                              : criacao
                                ? 'Criar de novo'
                                : 'Criar no Kommo'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {funisDoMapeamento.length === 0 && (
                    <tr>
                      <td colSpan={3} className="field-hint">
                        O mapeamento de origem ainda não tem funil gerado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {aba === 'checklist' &&
        Array.from(atividadesPorCiclo.entries()).map(([ciclo, atividadesDoCiclo]) => {
          const reais = atividadesDoCiclo.filter((a) => a.id !== null);
          const cicloCompleto = reais.length > 0 && reais.every((a) => a.status === 'concluido');
          const ehCicloAtual = ciclo === IMPLEMENTACAO_STATUS_LABELS[implementacao.status];
          const proximo = cicloCompleto && ehCicloAtual ? PROXIMO_STATUS[implementacao.status] : undefined;
          const avancoBloqueado =
            !!proximo && STATUS_BLOQUEADOS_SEM_PRE_REQUISITO.has(proximo) && !preRequisitoCompleto(formGeral);

          return (
            <section key={ciclo} className="card form-card">
              <h2>{ciclo}</h2>

              {proximo && (
                <p className="form-info form-info-com-acao">
                  <span>
                    Ciclo completo! O status da implementação ainda está em "
                    {IMPLEMENTACAO_STATUS_LABELS[implementacao.status]}".
                  </span>
                  {avancoBloqueado ? (
                    'Confirme o pré-requisito (aba Visão Geral) antes de avançar.'
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleAvancarStatus(proximo)}
                      disabled={salvandoGeral}
                    >
                      Avançar status para "{IMPLEMENTACAO_STATUS_LABELS[proximo]}"
                    </button>
                  )}
                </p>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Atividade</th>
                      <th>Prazo</th>
                      <th>Responsável</th>
                      <th>Dependência</th>
                      <th>Data planejada</th>
                      <th>Data real</th>
                      <th>Atraso</th>
                      <th>Status</th>
                      <th>Agendado para</th>
                      <th>Bloqueado pelo cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atividadesDoCiclo.map((atividade) => {
                      const virtual = atividade.id === null;
                      const templateAtividade = atividadesTemplate.find((a) => a.id === atividade.id);
                      const requerEvidencia = templateAtividade?.requer_evidencia ?? false;
                      const desabilitarConcluir = atividade.status === 'aguardando_etapa_anterior';
                      const statusRow = atividadesStatus.find((s) => s.atividade_id === atividade.id);

                      return (
                        <Fragment key={atividade.id ?? 'trial-kommo'}>
                          <tr>
                            <td>
                              {!virtual && (
                                <input
                                  type="checkbox"
                                  checked={atividade.status === 'concluido'}
                                  disabled={desabilitarConcluir}
                                  onChange={(e) => handleMarcarConcluido(atividade, e.target.checked)}
                                />
                              )}{' '}
                              {atividade.nome}
                              {templateAtividade?.implementacao_id && (
                                <span className="derivado-badge"> · gerado do funil</span>
                              )}
                            </td>
                            <td>{atividade.prazoDias != null ? `${atividade.prazoDias}d` : '—'}</td>
                            <td>{atividade.responsavel ?? '—'}</td>
                            <td>{atividade.dependenciaLabel ?? '—'}</td>
                            <td>{atividade.dataPlanejada?.toLocaleDateString('pt-BR') ?? '—'}</td>
                            <td>{atividade.dataReal?.toLocaleDateString('pt-BR') ?? '—'}</td>
                            <td>{atividade.atrasoDias > 0 ? `${atividade.atrasoDias}d` : '—'}</td>
                            <td>
                              <span className={`status-badge status-tone-${STATUS_ATIVIDADE_TONE[atividade.status]}`}>
                                {STATUS_ATIVIDADE_LABELS[atividade.status]}
                              </span>
                            </td>
                            <td>
                              {!virtual && (
                                <input
                                  type="date"
                                  value={statusRow?.agendado_para ?? ''}
                                  onChange={(e) => handleAgendar(atividade.id!, e.target.value)}
                                />
                              )}
                            </td>
                            <td>
                              {!virtual && (
                                <input
                                  type="checkbox"
                                  checked={atividade.bloqueadoPeloCliente}
                                  onChange={(e) => handleBloquearPeloCliente(atividade.id!, e.target.checked)}
                                />
                              )}
                            </td>
                          </tr>
                          {!virtual && requerEvidencia && (
                            <tr>
                              <td colSpan={10}>
                                <input
                                  type="text"
                                  className="option-livre-input evidencia-input"
                                  placeholder="Evidência (link, print ou nota) — obrigatória pra marcar"
                                  value={evidencias[atividade.id!] ?? ''}
                                  onChange={(e) => handleEvidenciaChange(atividade.id!, e.target.value)}
                                  onBlur={() => handleEvidenciaBlur(atividade)}
                                />
                                {evidenciaFaltando.has(atividade.id!) && (
                                  <p className="form-error">Escreva a evidência antes de marcar este critério.</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      {aba === 'cronograma' && (
        <section className="card form-card">
          <h2>Cronograma</h2>
          <p className="field-hint">
            Uma linha por fase da implementação, do início real (histórico de status) até o fim (ou
            até hoje, se ainda estiver em andamento).
          </p>

          {fasesCronograma.length === 0 && <p className="field-hint">Nenhuma fase iniciada ainda.</p>}

          {fasesCronograma.length > 0 && (
            <div className="gantt-scroll">
              <div className="gantt-inner" style={{ minWidth: escalaGantt.totalDias * PX_POR_DIA + 220 }}>
                <div className="gantt-row gantt-row-ruler">
                  <div className="gantt-row-label" />
                  <div className="gantt-row-track" style={{ width: escalaGantt.totalDias * PX_POR_DIA }}>
                    <GanttRuler escala={escalaGantt} />
                  </div>
                </div>

                {fasesCronograma.map((fase) => {
                  const largura = escalaGantt.totalDias * PX_POR_DIA;
                  const hojePx = diaParaPx(hoje, escalaGantt);
                  const inicioPx = diaParaPx(fase.inicio, escalaGantt);
                  const fimPx = diaParaPx(fase.fim ?? hoje, escalaGantt);

                  return (
                    <div key={fase.status} className="gantt-row">
                      <div className="gantt-row-label" title={fase.titulo}>
                        <span className="gantt-row-label-texto">{fase.titulo}</span>
                      </div>
                      <div className="gantt-row-track" style={{ width: largura }}>
                        <div className="gantt-hoje-tick" style={{ left: hojePx }} />
                        <div
                          className="gantt-bar"
                          style={{
                            left: inicioPx,
                            width: Math.max(PX_POR_DIA, fimPx - inicioPx),
                            background: fase.fim ? '#34d399' : '#fbbf24',
                          }}
                          title={
                            fase.fim
                              ? `${fase.inicio.toLocaleDateString('pt-BR')} — ${fase.fim.toLocaleDateString('pt-BR')}`
                              : `Desde ${fase.inicio.toLocaleDateString('pt-BR')} (em andamento)`
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {aba === 'credenciais' && (
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
                      {reveladas[credencial.id] ? <code>{reveladas[credencial.id]}</code> : '••••••••'}
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
      )}

      {aba === 'checkpoint' && (
        <section className="card form-card">
          <h2>Checkpoint de Adoção — 30 dias pós-entrega</h2>
          <p className="field-hint">
            Instrumento separado do checklist técnico e do NPS: mede se a adoção do Kommo
            realmente aconteceu depois que o cliente ficou sozinho com a ferramenta, 30 dias após
            a Semana 4.
          </p>

          {!checkpointAdocao && (
            <>
              <p className="field-hint">
                Copie o link abaixo e envie para o cliente 30 dias após a entrega (Semana 4).
              </p>
              <button type="button" className="btn btn-secondary" onClick={handleCopiarLinkCheckpoint}>
                {linkCheckpointCopiado ? 'Link copiado!' : 'Copiar link do checkpoint'}
              </button>
            </>
          )}

          {checkpointAdocao && (
            <>
              {checkpointAdocao.risco_churn && (
                <p className="form-error">
                  Sinal de risco de churn: o cliente respondeu que voltou a usar planilha/WhatsApp
                  em paralelo ao Kommo. Vale acionar o comercial ou reforçar o acompanhamento.
                </p>
              )}

              <ul className="historico-status-lista">
                <li className="historico-status-item">
                  <span className="historico-status-data">Uso diário</span>
                  <span>{USO_DIARIO_LABELS[checkpointAdocao.uso_diario]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Frequência de uso dos relatórios</span>
                  <span>{FREQUENCIA_USO_LABELS[checkpointAdocao.frequencia_uso]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Obstáculo relatado</span>
                  <span>{checkpointAdocao.obstaculo || '—'}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Contrataria manutenção?</span>
                  <span>{INTENCAO_MANUTENCAO_LABELS[checkpointAdocao.intencao_manutencao]}</span>
                </li>
                <li className="historico-status-item">
                  <span className="historico-status-data">Respondido em</span>
                  <span>{new Date(checkpointAdocao.respondido_em).toLocaleString('pt-BR')}</span>
                </li>
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
