import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AplicarTemplateModal } from '../components/AplicarTemplateModal';
import { GanttRuler } from '../components/GanttRuler';
import { IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { inicioDoDia } from '../lib/agendaImplementacao';
import {
  calcularDiaCiclo,
  IMPACTO_RESPONSAVEL_LABELS,
  resolverAtividade,
  resolverMarcoAgendavel,
  resolverMarcoSimples,
  resolverTrialKommo,
  STATUS_ATIVIDADE_LABELS,
  STATUS_ATIVIDADE_TONE,
  type AtividadeResolvida,
} from '../lib/atividadesCronograma';
import { gerarItensDerivados } from '../lib/checklistDerivado';
import {
  fonteAtaLabel,
  RESPONSAVEL_TIPO_ACAO_LABELS,
  STATUS_ACAO_ATA_LABELS,
  STATUS_ACAO_ATA_TONE,
  STATUS_ATA_LABELS,
  STATUS_ATA_TONE,
} from '../lib/atasIntegracao';
import { CONFIGURACAO_PADRAO, resolverConfiguracaoCliente } from '../lib/configuracaoImplementacao';
import {
  resolverResumoCriteriosEntrega,
  STATUS_CONTRATACAO_KOMMO_LABELS,
  STATUS_CONTRATACAO_KOMMO_TONE,
  STATUS_CRITERIO_LABELS,
  STATUS_CRITERIO_TONE,
} from '../lib/criteriosEntrega';
import {
  ATIVIDADES_FORA_KOMMO_LABELS,
  AUTONOMIA_EQUIPE_LABELS,
  FREQUENCIA_USO_LABELS,
  INTENCAO_MANUTENCAO_LABELS,
  PERCENTUAL_PROCESSO_LABELS,
  resolverDiagnosticoAdocao,
  STATUS_DIAGNOSTICO_LABELS,
  STATUS_DIAGNOSTICO_TONE,
  USO_DIARIO_LABELS,
  USO_RELATORIOS_DECISAO_LABELS,
} from '../lib/diagnosticoAdocao';
import {
  aprovarVersao,
  statusMapeamentoPorValidacao,
  VALIDACAO_FUNIL_KICKOFF_LABELS,
  type ValidacaoFunilKickoff,
} from '../lib/funilVersoes';
import { nomeConsultor } from '../lib/operacaoResumo';
import { TIPO_CRITERIO_TEMPLATE_LABELS } from '../lib/templatesImplementacao';
import {
  alertaReuniaoObrigatoria,
  STATUS_REUNIAO_LABELS,
  STATUS_REUNIAO_TONE,
  TIPO_REUNIAO_LABELS,
  TIPOS_REUNIAO_OBRIGATORIOS,
} from '../lib/reunioes';
import {
  resolverResumoTrialKommo,
  STATUS_TRIAL_LABELS,
  STATUS_TRIAL_TONE,
} from '../lib/trialKommo';
import { emOuAposProntoKickoff, emOuAposRevisaoInterna, funilJaGerado } from '../lib/statusFluxo';
import { extrairMensagemErroEdgeFunction } from '../lib/edgeFunctionError';
import { PX_POR_DIA, calcularEscala, diaParaPx, fasesImplementacao, tempoAteReuniao } from '../lib/cronograma';
import { supabase } from '../lib/supabaseClient';
import type {
  AtaAcaoIdentificada,
  AtaReuniao,
  AtividadeCronograma,
  AtividadeStatusRow,
  CheckpointAcompanhamento,
  CheckpointAdocao,
  Cliente,
  ConfiguracaoImplementacao,
  ConfiguracaoPipefy,
  Consultor,
  CredencialApiKommoMeta,
  CredencialCrmListada,
  CriterioEntrega,
  CriterioEntregaStatus,
  FunilGerado,
  FunilKommoCriacao,
  FunilVersao,
  ImplementacaoCriterioTemplate,
  ImplementacaoCrm,
  ImplementacaoDocumentoTemplate,
  ImplementacaoReuniaoEsperada,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatus,
  ImplementacaoStatusHistorico,
  Mapeamento,
  ImpactoResponsavel,
  ImplementacaoConsultorHistorico,
  MarcoRemarcacao,
  ResponsavelTipoAcaoAta,
  Reuniao,
  ReuniaoRemarcacao,
  StatusContratacaoKommo,
  StatusCriterioEntrega,
  StatusReuniao,
  TemplateAutomacao,
  TemplateCampoCrm,
  TipoReuniao,
} from '../types/database';

type Aba = 'geral' | 'checklist' | 'criterios' | 'cronograma' | 'credenciais' | 'checkpoint' | 'reunioes' | 'template';
const ABAS_IMPLEMENTACAO: Aba[] = [
  'geral',
  'checklist',
  'criterios',
  'cronograma',
  'credenciais',
  'checkpoint',
  'reunioes',
  'template',
];

// Ordem fixa de exibição — os 5 tipos "estruturados" (um card cada, sempre
// visível) vêm antes dos 2 ad-hoc (lista + "nova reunião", pode ter várias).
const TIPOS_REUNIAO_ESTRUTURADOS: TipoReuniao[] = [
  'kickoff',
  'treinamento',
  'checkin_1',
  'checkin_2',
  'reuniao_final',
];
const TIPOS_REUNIAO_AD_HOC: TipoReuniao[] = ['tira_duvidas', 'extraordinaria'];

// Ordem explícita de exibição das seções do checklist de implementação — não
// pode depender da coluna `ordem` de atividades_cronograma nem da ordem de
// carregamento (ver comentário em atividadesPorCiclo). "Ciclo N — ..." vira N;
// "Trial Kommo" (trilha independente dos 4 ciclos) sempre por último; qualquer
// rótulo inesperado cai no fim também, como fallback seguro.
function rankCiclo(ciclo: string): number {
  const match = ciclo.match(/^Ciclo (\d+)/);
  if (match) return Number(match[1]);
  return Number.POSITIVE_INFINITY;
}

type FormReuniao = {
  tipo: TipoReuniao;
  titulo: string;
  data_hora: string;
  consultor_responsavel_id: string;
  participantes: string;
  link: string;
  status: StatusReuniao;
  ata: string;
  resumo: string;
  decisoes: string;
  pendencias_cliente: string;
  pendencias_internas: string;
  proximos_passos: string;
};

function isoParaInputDatetime(iso: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatarDataHoraLocal(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formReuniaoVazio(tipo: TipoReuniao): FormReuniao {
  return {
    tipo,
    titulo: '',
    data_hora: '',
    consultor_responsavel_id: '',
    participantes: '',
    link: '',
    status: 'nao_agendada',
    ata: '',
    resumo: '',
    decisoes: '',
    pendencias_cliente: '',
    pendencias_internas: '',
    proximos_passos: '',
  };
}

function paraFormReuniao(reuniao: Reuniao): FormReuniao {
  return {
    tipo: reuniao.tipo,
    titulo: reuniao.titulo ?? '',
    data_hora: isoParaInputDatetime(reuniao.data_hora),
    consultor_responsavel_id: reuniao.consultor_responsavel_id ?? '',
    participantes: reuniao.participantes ?? '',
    link: reuniao.link ?? '',
    status: reuniao.status,
    ata: reuniao.ata ?? '',
    resumo: reuniao.resumo ?? '',
    decisoes: reuniao.decisoes ?? '',
    pendencias_cliente: reuniao.pendencias_cliente ?? '',
    pendencias_internas: reuniao.pendencias_internas ?? '',
    proximos_passos: reuniao.proximos_passos ?? '',
  };
}

type FormGeral = {
  nome_cliente: string;
  consultor_responsavel_id: string;
  consultor_adicional_id: string;
  stakeholder_decisor: string;
  status: ImplementacaoStatus;
  conta_criada_via_v4: boolean;
  email_conta_kommo: string;
  whatsapp_corporativo_confirmado: boolean;
  acesso_facebook_confirmado: boolean;
  plano_contratado: string;
  periodo_contratado: string;
  data_decisao_plano: string;
  status_contratacao_kommo: StatusContratacaoKommo;
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
    consultor_responsavel_id: impl.consultor_responsavel_id ?? '',
    consultor_adicional_id: impl.consultor_adicional_id ?? '',
    stakeholder_decisor: impl.stakeholder_decisor ?? '',
    status: impl.status,
    conta_criada_via_v4: impl.conta_criada_via_v4,
    email_conta_kommo: impl.email_conta_kommo ?? '',
    whatsapp_corporativo_confirmado: impl.whatsapp_corporativo_confirmado,
    acesso_facebook_confirmado: impl.acesso_facebook_confirmado,
    plano_contratado: impl.plano_contratado ?? '',
    periodo_contratado: impl.periodo_contratado ?? '',
    data_decisao_plano: impl.data_decisao_plano ?? '',
    status_contratacao_kommo: impl.status_contratacao_kommo,
    observacoes: impl.observacoes ?? '',
  };
}

export function ImplementacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const confirmarAcao = useConfirm();
  const { mostrarToast } = useToast();

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
  const [checkpointAcompanhamentos, setCheckpointAcompanhamentos] = useState<CheckpointAcompanhamento[]>([]);
  const [novoAcompanhamento, setNovoAcompanhamento] = useState('');
  const [salvandoAcompanhamento, setSalvandoAcompanhamento] = useState(false);
  const [linkCheckpointCopiado, setLinkCheckpointCopiado] = useState(false);
  // Aceita vir pré-selecionada por ?aba= na URL (usado pela Central de
  // Notificações pra abrir direto no contexto certo) — só na carga inicial.
  const abaInicial = searchParams.get('aba');
  const [aba, setAba] = useState<Aba>(
    ABAS_IMPLEMENTACAO.includes(abaInicial as Aba) ? (abaInicial as Aba) : 'geral',
  );
  const [mapeamentoOrigem, setMapeamentoOrigem] = useState<Pick<
    Mapeamento,
    'id' | 'nome_negocio' | 'enviado_em' | 'created_at' | 'status'
  > | null>(null);
  const [versoesMapeamentoOrigem, setVersoesMapeamentoOrigem] = useState<FunilVersao[]>([]);
  // P1-A1: qual versão está sendo validada no Kickoff — nunca inferida
  // automaticamente como "a mais recente".
  const [versaoParaValidarKickoff, setVersaoParaValidarKickoff] = useState('');
  const [posVendaMapeamento, setPosVendaMapeamento] = useState<{
    id: string;
    codigo_curto: string;
  } | null>(null);
  const [criandoPosVenda, setCriandoPosVenda] = useState(false);
  const [linkPosVendaCopiado, setLinkPosVendaCopiado] = useState(false);
  const [idImplementacaoCopiado, setIdImplementacaoCopiado] = useState(false);
  const [idClienteCopiado, setIdClienteCopiado] = useState(false);
  const [kickoffRealizadoEm, setKickoffRealizadoEm] = useState<string | null>(null);
  const [remarcacoes, setRemarcacoes] = useState<MarcoRemarcacao[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [reuniaoRemarcacoes, setReuniaoRemarcacoes] = useState<ReuniaoRemarcacao[]>([]);
  // Integração com o App de Atas (MVP) — atas do cliente (vinculadas ou
  // ainda aguardando vínculo) e as ações identificadas nelas.
  const [atasIntegracao, setAtasIntegracao] = useState<AtaReuniao[]>([]);
  const [acoesAtaIntegracao, setAcoesAtaIntegracao] = useState<AtaAcaoIdentificada[]>([]);
  const [formPendenciaDeAcao, setFormPendenciaDeAcao] = useState<{
    acao: AtaAcaoIdentificada;
    ata: AtaReuniao;
    titulo: string;
    descricao: string;
    tipo: ResponsavelTipoAcaoAta;
    consultor_responsavel_id: string;
    prazo: string;
  } | null>(null);
  const [salvandoPendenciaDeAcao, setSalvandoPendenciaDeAcao] = useState(false);
  const [vinculandoAtaId, setVinculandoAtaId] = useState<string | null>(null);
  const [formVinculoReuniao, setFormVinculoReuniao] = useState<{
    tipo: TipoReuniao | '';
    data_hora: string;
    consultor_responsavel_id: string;
    status: StatusReuniao;
  } | null>(null);
  const [vinculandoReuniaoSalvando, setVinculandoReuniaoSalvando] = useState(false);
  const [erroVinculoReuniao, setErroVinculoReuniao] = useState<string | null>(null);
  const [formImportarAta, setFormImportarAta] = useState<{
    reuniao_id: string;
    titulo: string;
    resumo: string;
    conteudo_original: string;
  } | null>(null);
  const [importandoAta, setImportandoAta] = useState(false);
  const [editandoReuniaoTipo, setEditandoReuniaoTipo] = useState<TipoReuniao | null>(null);
  const [editandoReuniaoId, setEditandoReuniaoId] = useState<string | null>(null);
  const [formReuniao, setFormReuniao] = useState<FormReuniao | null>(null);
  const [statusOriginalReuniaoEmEdicao, setStatusOriginalReuniaoEmEdicao] = useState<StatusReuniao | null>(null);
  const [validacaoFunilKickoff, setValidacaoFunilKickoff] = useState<ValidacaoFunilKickoff | ''>('');
  const [salvandoReuniao, setSalvandoReuniao] = useState(false);
  const [remarcandoReuniaoId, setRemarcandoReuniaoId] = useState<string | null>(null);
  const [formRemarcacaoReuniao, setFormRemarcacaoReuniao] = useState({
    data_nova: '',
    motivo: '',
    responsavel_impacto: 'cliente' as ImpactoResponsavel,
  });
  const [salvandoRemarcacaoReuniao, setSalvandoRemarcacaoReuniao] = useState(false);
  const [salvandoTrial, setSalvandoTrial] = useState(false);
  const [pipefyConfig, setPipefyConfig] = useState<ConfiguracaoPipefy | null>(null);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshot, setSnapshot] = useState<ImplementacaoSettingsSnapshot | null>(null);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [historicoConsultor, setHistoricoConsultor] = useState<ImplementacaoConsultorHistorico[]>([]);
  const [criterios, setCriterios] = useState<CriterioEntrega[]>([]);
  const [criteriosStatus, setCriteriosStatus] = useState<CriterioEntregaStatus[]>([]);
  const [reunioesEsperadas, setReunioesEsperadas] = useState<ImplementacaoReuniaoEsperada[]>([]);
  const [criteriosTemplate, setCriteriosTemplate] = useState<ImplementacaoCriterioTemplate[]>([]);
  const [documentosTemplate, setDocumentosTemplate] = useState<ImplementacaoDocumentoTemplate[]>([]);
  const [templateCamposCrm, setTemplateCamposCrm] = useState<TemplateCampoCrm[]>([]);
  const [templateAutomacoes, setTemplateAutomacoes] = useState<TemplateAutomacao[]>([]);
  const [mostrarAplicarTemplate, setMostrarAplicarTemplate] = useState(false);
  const [editandoCriterioId, setEditandoCriterioId] = useState<string | null>(null);
  const [formCriterio, setFormCriterio] = useState<{
    status: StatusCriterioEntrega;
    evidencia: string;
    observacao: string;
    justificativa_nao_aplica: string;
    responsavel_validacao_id: string;
  } | null>(null);
  const [salvandoCriterio, setSalvandoCriterio] = useState(false);
  const [confirmandoCampo, setConfirmandoCampo] = useState<
    'conta_kommo_solicitada_em' | 'contratacao_kommo_solicitada_em' | null
  >(null);
  const [valorConfirmacao, setValorConfirmacao] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formGeral, setFormGeral] = useState<FormGeral | null>(null);
  const [salvandoGeral, setSalvandoGeral] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);

  // P2-M4: transferir o consultor responsável deixou de ser só mais um
  // campo do form geral (fácil de mudar sem querer, sem confirmação) — vira
  // uma ação própria, com o consultor atual visível, escolha explícita do
  // novo e confirmação antes de salvar.
  const [transferindoConsultor, setTransferindoConsultor] = useState(false);
  const [novoConsultorTransferencia, setNovoConsultorTransferencia] = useState('');
  const [salvandoTransferenciaConsultor, setSalvandoTransferenciaConsultor] = useState(false);
  const [erroTransferenciaConsultor, setErroTransferenciaConsultor] = useState<string | null>(null);

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

  // Área de Configurações: regras vigentes pra este cliente — snapshot do
  // Kickoff dele, se já existir, senão a config global.
  const configuracao = useMemo(() => {
    if (!cliente) return CONFIGURACAO_PADRAO;
    const snapshotsPorClienteId = new Map(snapshot ? [[snapshot.cliente_id, snapshot]] : []);
    return resolverConfiguracaoCliente(cliente.id, snapshotsPorClienteId, configGlobal);
  }, [cliente, snapshot, configGlobal]);

  // "Dia X/Y" + "Ciclo X — Dias X–Y", sempre visível — contado só do
  // Kickoff realizado, independente de status manual ou de remarcações.
  const diaCiclo = useMemo(
    () => calcularDiaCiclo(kickoffRealizadoEm, hoje, configuracao.ciclos),
    [kickoffRealizadoEm, hoje, configuracao],
  );

  // Trial Kommo — indicador totalmente separado do prazo da implementação
  // (esse é ancorado no Kickoff, o Trial em conta_kommo_criada_em).
  const resumoTrial = useMemo(
    () =>
      cliente
        ? resolverResumoTrialKommo(cliente, hoje, {
            diasInicial: configuracao.trialInicialDias,
            diasExtensao14: configuracao.trialExtensao14Dias,
            diasExtensao7: configuracao.trialExtensao7Dias,
            diasAlerta: configuracao.trialAlertasDias,
          })
        : null,
    [cliente, hoje, configuracao],
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

  const alertasReunioes = useMemo(() => {
    if (!cliente) return [];
    return TIPOS_REUNIAO_OBRIGATORIOS.map((tipo) =>
      alertaReuniaoObrigatoria({
        tipo,
        reunioesDoTipo: reunioes.filter((r) => r.tipo === tipo),
        kickoffRealizadoEm: cliente.kickoff_realizado_em,
        hoje,
        ciclos: configuracao.ciclos,
      }),
    ).filter((alerta): alerta is NonNullable<typeof alerta> => alerta != null);
  }, [cliente, reunioes, hoje, configuracao]);

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
        reunioes,
        hoje,
        ciclos: configuracao.ciclos,
      }),
    );
    if (cliente) {
      resolvidas.push(
        resolverTrialKommo(cliente, hoje, {
          inicial: configuracao.trialInicialDias,
          extensao14: configuracao.trialExtensao14Dias,
          extensao7: configuracao.trialExtensao7Dias,
        }),
      );

      const CICLO_1 = configuracao.ciclos[0]?.nome ?? 'Ciclo 1 — Setup e Treinamento';
      const diaFimCiclo1 = configuracao.ciclos[0]?.diaFim ?? 10;
      resolvidas.push(
        resolverMarcoAgendavel({
          nome: 'Kickoff',
          ciclo: CICLO_1,
          agendadoPara: cliente.kickoff_agendado_para,
          realizadoEm: cliente.kickoff_realizado_em,
          remarcacoes: remarcacoes.filter((r) => r.campo_marco === 'kickoff_agendado_para'),
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          diaLimiteCiclo: 0,
          dependenciaLabel: null,
          hoje,
        }),
      );
      resolvidas.push(
        resolverMarcoSimples({
          nome: 'Funil validado',
          ciclo: CICLO_1,
          valorIso: cliente.funil_validado_em,
          dependenciaLabel: 'Kickoff realizado',
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          diaLimiteCiclo: diaFimCiclo1,
        }),
      );
      resolvidas.push(
        resolverMarcoSimples({
          nome: 'Conta Kommo solicitada',
          ciclo: CICLO_1,
          valorIso: cliente.conta_kommo_solicitada_em,
          dependenciaLabel: 'Kickoff realizado',
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          diaLimiteCiclo: diaFimCiclo1,
        }),
      );
      resolvidas.push(
        resolverMarcoSimples({
          nome: 'Conta Kommo criada',
          ciclo: CICLO_1,
          valorIso: cliente.conta_kommo_criada_em,
          dependenciaLabel: 'Conta Kommo solicitada',
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          diaLimiteCiclo: diaFimCiclo1,
        }),
      );
      resolvidas.push(
        resolverMarcoAgendavel({
          nome: 'Treinamento',
          ciclo: CICLO_1,
          agendadoPara: cliente.treinamento_agendado_para,
          realizadoEm: cliente.treinamento_realizado_em,
          remarcacoes: remarcacoes.filter((r) => r.campo_marco === 'treinamento_agendado_para'),
          kickoffRealizadoEm: cliente.kickoff_realizado_em,
          diaLimiteCiclo: configuracao.prazoTreinamentoDia,
          hoje,
        }),
      );
    }
    return resolvidas;
  }, [implementacao, atividadesTemplate, atividadesStatus, historicoStatus, cliente, remarcacoes, reunioes, hoje, configuracao]);

  // Agrupadas por ciclo. Dentro de cada grupo, a ordem preserva a ordem de
  // carregamento (já vem ordenado por `ordem` da query) — mas a ORDEM DOS
  // GRUPOS não pode depender de qual ciclo aparece primeiro nessa lista: os
  // valores de `ordem` em atividades_cronograma se repetem entre ciclos
  // diferentes (itens novos de cada ciclo foram cadastrados sempre a partir
  // de 100, ver migration 0037), então empates fazem o Postgres devolver as
  // linhas em uma ordem não-determinística entre ciclos — na prática, isso
  // fazia o Ciclo 4 às vezes aparecer antes do 2 e do 3. Por isso a ordem
  // dos GRUPOS é sempre decidida explicitamente por `rankCiclo` abaixo, nunca
  // pela ordem de inserção do Map.
  const atividadesPorCiclo = useMemo(() => {
    const mapa = new Map<string, AtividadeResolvida[]>();
    for (const atividade of atividadesResolvidas) {
      if (!mapa.has(atividade.ciclo)) mapa.set(atividade.ciclo, []);
      mapa.get(atividade.ciclo)!.push(atividade);
    }
    return new Map(
      Array.from(mapa.entries()).sort(([cicloA], [cicloB]) => rankCiclo(cicloA) - rankCiclo(cicloB)),
    );
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
      { data: pipefyData },
      { data: consultoresData },
      { data: historicoConsultorData },
      { data: criteriosData },
      { data: criteriosStatusData },
      { data: checkpointAcompanhamentosData },
      { data: configGlobalData },
      { data: reunioesEsperadasData },
      { data: criteriosTemplateData },
      { data: documentosTemplateData },
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
      supabase.from('configuracoes_pipefy').select('*').eq('id', true).single(),
      supabase.from('consultores').select('*').order('nome', { ascending: true }),
      supabase
        .from('implementacao_consultor_historico')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('alterado_em', { ascending: false }),
      supabase.from('criterios_entrega').select('*').order('ordem', { ascending: true }),
      supabase.from('criterios_entrega_status').select('*').eq('implementacao_id', implementacaoId),
      supabase
        .from('checkpoint_acompanhamentos')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('created_at', { ascending: false }),
      supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('implementacao_reunioes_esperadas')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('ordem', { ascending: true }),
      supabase
        .from('implementacao_criterios_template')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('ordem', { ascending: true }),
      supabase
        .from('implementacao_documentos_template')
        .select('*')
        .eq('implementacao_id', implementacaoId)
        .order('ordem', { ascending: true }),
    ]);

    setPipefyConfig(pipefyData ?? null);
    setConsultores(consultoresData ?? []);
    setHistoricoConsultor(historicoConsultorData ?? []);
    setCriterios(criteriosData ?? []);
    setCriteriosStatus(criteriosStatusData ?? []);
    setCheckpointAcompanhamentos(checkpointAcompanhamentosData ?? []);
    setConfigGlobal(configGlobalData ?? null);
    setReunioesEsperadas(reunioesEsperadasData ?? []);
    setCriteriosTemplate(criteriosTemplateData ?? []);
    setDocumentosTemplate(documentosTemplateData ?? []);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setImplementacao(implData);
    setFormGeral(paraFormGeral(implData));

    // Campos CRM e automações nunca são clonados por implementação (seções
    // 13/14 do pedido — conteúdo de referência, nunca implantado
    // automaticamente) — vêm direto do template aplicado, se houver um.
    if (implData.template_aplicado_id) {
      const [{ data: camposCrmData }, { data: automacoesData }] = await Promise.all([
        supabase
          .from('template_campos_crm')
          .select('*')
          .eq('template_id', implData.template_aplicado_id)
          .order('ordem', { ascending: true }),
        supabase
          .from('template_automacoes')
          .select('*')
          .eq('template_id', implData.template_aplicado_id)
          .order('ordem', { ascending: true }),
      ]);
      setTemplateCamposCrm(camposCrmData ?? []);
      setTemplateAutomacoes(automacoesData ?? []);
    } else {
      setTemplateCamposCrm([]);
      setTemplateAutomacoes([]);
    }
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
        .select('id, nome_negocio, enviado_em, created_at, status')
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

    if (clienteData) {
      const { data: snapshotData } = await supabase
        .from('implementacao_settings_snapshot')
        .select('*')
        .eq('cliente_id', clienteData.id)
        .maybeSingle();
      setSnapshot(snapshotData ?? null);
    } else {
      setSnapshot(null);
    }

    if (mapeamentoOrigemData) {
      const { data: versoesData } = await supabase
        .from('funil_versoes')
        .select('*')
        .eq('mapeamento_id', mapeamentoOrigemData.id)
        .order('versao', { ascending: false });
      setVersoesMapeamentoOrigem(versoesData ?? []);
    }

    if (clienteData) {
      const { data: remarcacoesData } = await supabase
        .from('marco_remarcacoes')
        .select('*')
        .eq('cliente_id', clienteData.id);
      setRemarcacoes(remarcacoesData ?? []);

      // Reuniões são escopadas por cliente_id (não implementacao_id) — um
      // Kickoff pode existir antes de a implementação ser criada.
      const { data: reunioesData } = await supabase
        .from('reunioes')
        .select('*')
        .eq('cliente_id', clienteData.id)
        .order('data_hora', { ascending: true });
      setReunioes(reunioesData ?? []);

      const idsReunioes = (reunioesData ?? []).map((r) => r.id);
      if (idsReunioes.length > 0) {
        const { data: reuniaoRemarcacoesData } = await supabase
          .from('reuniao_remarcacoes')
          .select('*')
          .in('reuniao_id', idsReunioes);
        setReuniaoRemarcacoes(reuniaoRemarcacoesData ?? []);
      } else {
        setReuniaoRemarcacoes([]);
      }
    } else {
      setRemarcacoes([]);
      setReunioes([]);
      setReuniaoRemarcacoes([]);
    }

    if (clienteData) {
      const { data: atasData } = await supabase
        .from('atas_reuniao')
        .select('*')
        .eq('cliente_id', clienteData.id)
        .order('recebido_em', { ascending: false });
      setAtasIntegracao(atasData ?? []);

      const idsAtas = (atasData ?? []).map((a) => a.id);
      if (idsAtas.length > 0) {
        const { data: acoesData } = await supabase
          .from('ata_acoes_identificadas')
          .select('*')
          .in('ata_id', idsAtas)
          .order('ordem', { ascending: true });
        setAcoesAtaIntegracao(acoesData ?? []);
      } else {
        setAcoesAtaIntegracao([]);
      }
    } else {
      setAtasIntegracao([]);
      setAcoesAtaIntegracao([]);
    }

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
    if (jaTemDerivados) {
      const confirmado = await confirmarAcao({
        titulo: 'Gerar as atividades de novo?',
        descricao:
          'Já existem atividades geradas a partir do funil nesta implementação. Gerar de novo substitui essas atividades — o que já tinha sido marcado nelas se perde.',
        confirmarLabel: 'Gerar de novo',
        destrutivo: true,
      });
      if (!confirmado) return;
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

    const ordemBaseSemana1 = proximaOrdemCiclo('Ciclo 1 — Setup e Treinamento');
    const ordemBaseSemana2 = proximaOrdemCiclo('Ciclo 2 — Automações I e Check-in 1');

    const rows = [
      ...semana1.map((texto, i) => ({
        nome: texto,
        ciclo: 'Ciclo 1 — Setup e Treinamento',
        ordem: ordemBaseSemana1 + i,
        implementacao_id: implementacao.id,
        depende_de: 'marco:kickoff_realizado_em',
      })),
      ...semana2.map((texto, i) => ({
        nome: texto,
        ciclo: 'Ciclo 2 — Automações I e Check-in 1',
        ordem: ordemBaseSemana2 + i,
        implementacao_id: implementacao.id,
        depende_de: 'marco:treinamento_realizado_em',
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

  function abrirFormCriterio(criterioId: string) {
    const atual = criteriosStatus.find((s) => s.criterio_id === criterioId);
    setEditandoCriterioId(criterioId);
    setFormCriterio({
      status: atual?.status ?? 'pendente',
      evidencia: atual?.evidencia ?? '',
      observacao: atual?.observacao ?? '',
      justificativa_nao_aplica: atual?.justificativa_nao_aplica ?? '',
      responsavel_validacao_id: atual?.responsavel_validacao_id ?? '',
    });
  }

  function fecharFormCriterio() {
    setEditandoCriterioId(null);
    setFormCriterio(null);
  }

  async function handleSalvarCriterio(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !editandoCriterioId || !formCriterio) return;

    if (formCriterio.status === 'nao_se_aplica' && !formCriterio.justificativa_nao_aplica.trim()) {
      setError('Justificativa obrigatória para marcar um critério como "Não se aplica".');
      return;
    }

    setSalvandoCriterio(true);
    setError(null);

    const jaValidado = formCriterio.status === 'concluido' || formCriterio.status === 'nao_se_aplica';
    const { data, error: upsertError } = await supabase
      .from('criterios_entrega_status')
      .upsert(
        {
          implementacao_id: implementacao.id,
          criterio_id: editandoCriterioId,
          status: formCriterio.status,
          evidencia: formCriterio.evidencia.trim() || null,
          observacao: formCriterio.observacao.trim() || null,
          justificativa_nao_aplica:
            formCriterio.status === 'nao_se_aplica' ? formCriterio.justificativa_nao_aplica.trim() : null,
          responsavel_validacao_id: formCriterio.responsavel_validacao_id || null,
          data_validacao: jaValidado ? new Date().toISOString() : null,
        },
        { onConflict: 'implementacao_id,criterio_id' },
      )
      .select()
      .single();

    setSalvandoCriterio(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    setCriteriosStatus((prev) => {
      const idx = prev.findIndex((s) => s.criterio_id === editandoCriterioId);
      if (idx === -1) return [...prev, data];
      const copia = [...prev];
      copia[idx] = data;
      return copia;
    });
    fecharFormCriterio();
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

    // Transferir o consultor RESPONSÁVEL não é mais um campo deste form —
    // virou uma ação própria (handleTransferirConsultor, P2-M4), com o
    // consultor atual visível e confirmação explícita antes de salvar.
    const { data, error: updateError } = await supabase
      .from('implementacoes_crm')
      .update({
        nome_cliente: formGeral.nome_cliente.trim(),
        consultor_adicional_id: formGeral.consultor_adicional_id || null,
        stakeholder_decisor: formGeral.stakeholder_decisor.trim() || null,
        status: formGeral.status,
        conta_criada_via_v4: formGeral.conta_criada_via_v4,
        email_conta_kommo: formGeral.email_conta_kommo.trim() || null,
        whatsapp_corporativo_confirmado: formGeral.whatsapp_corporativo_confirmado,
        acesso_facebook_confirmado: formGeral.acesso_facebook_confirmado,
        plano_contratado: formGeral.plano_contratado || null,
        periodo_contratado: formGeral.periodo_contratado.trim() || null,
        data_decisao_plano: formGeral.data_decisao_plano || null,
        status_contratacao_kommo: formGeral.status_contratacao_kommo,
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

  function abrirTransferirConsultor() {
    setTransferindoConsultor(true);
    setNovoConsultorTransferencia('');
    setErroTransferenciaConsultor(null);
  }

  function fecharTransferirConsultor() {
    setTransferindoConsultor(false);
    setNovoConsultorTransferencia('');
    setErroTransferenciaConsultor(null);
  }

  // P2-M4: ação dedicada pra transferir o consultor responsável — antes era
  // só mais um campo dentro do form geral de ~12 campos, fácil de mudar sem
  // querer e sem nenhuma confirmação. A operação em si já era atômica desde
  // o P0-C4 (RPC transferir_consultor_responsavel_implementacao); o que
  // faltava era uma UI que não escondesse essa decisão.
  async function handleTransferirConsultor() {
    if (!implementacao || !novoConsultorTransferencia) return;

    const nomeAtual = nomeConsultor(implementacao.consultor_responsavel_id, consultores) ?? 'sem responsável';
    const nomeNovo = nomeConsultor(novoConsultorTransferencia, consultores) ?? '—';
    const confirmado = await confirmarAcao({
      titulo: 'Transferir consultor responsável?',
      descricao: `De "${nomeAtual}" para "${nomeNovo}".`,
      confirmarLabel: 'Transferir',
    });
    if (!confirmado) return;

    setSalvandoTransferenciaConsultor(true);
    setErroTransferenciaConsultor(null);

    const { error: transferenciaError } = await supabase.rpc('transferir_consultor_responsavel_implementacao', {
      p_implementacao_id: implementacao.id,
      p_novo_consultor_id: novoConsultorTransferencia,
    });

    setSalvandoTransferenciaConsultor(false);

    if (transferenciaError) {
      setErroTransferenciaConsultor(transferenciaError.message);
      return;
    }

    const novaImplementacao = { ...implementacao, consultor_responsavel_id: novoConsultorTransferencia };
    setImplementacao(novaImplementacao);
    setFormGeral((prev) => (prev ? { ...prev, consultor_responsavel_id: novoConsultorTransferencia } : prev));

    const { data: historicoAtualizado } = await supabase
      .from('implementacao_consultor_historico')
      .select('*')
      .eq('implementacao_id', implementacao.id)
      .order('alterado_em', { ascending: false });
    setHistoricoConsultor(historicoAtualizado ?? []);
    mostrarToast('Consultor transferido.');

    fecharTransferirConsultor();
  }

  // Registra a solicitação/aprovação da extensão de Trial atual — grava
  // direto no marco correspondente em `clientes` (extensao_14/7_solicitada_em
  // ou _aprovada_em), com a data de hoje. A aprovação da extensão de 14 dias
  // é o que recalcula o vencimento pra incluir a 2ª extensão (+7) como
  // próxima opção — ver resolverResumoTrialKommo.
  async function handleRegistrarEventoTrial(
    campo: 'extensao_14_solicitada_em' | 'extensao_14_aprovada_em' | 'extensao_7_solicitada_em' | 'extensao_7_aprovada_em',
  ) {
    if (!cliente) return;
    setSalvandoTrial(true);

    const atualizacao: Partial<Cliente> = { [campo]: new Date().toISOString().slice(0, 10) };
    const { data, error: updateError } = await supabase
      .from('clientes')
      .update(atualizacao)
      .eq('id', cliente.id)
      .select()
      .single();

    setSalvandoTrial(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
  }

  function agoraParaInputDatetime(): string {
    const agora = new Date();
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  // CTA do Pipefy: abre o link (se cadastrado) e revela o painel pra
  // confirmar quando a solicitação foi de fato enviada — data/hora já vem
  // preenchida com agora, mas editável antes de confirmar.
  function handleAbrirLinkPipefy(
    url: string | null | undefined,
    campo: 'conta_kommo_solicitada_em' | 'contratacao_kommo_solicitada_em',
  ) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setConfirmandoCampo(campo);
    setValorConfirmacao(agoraParaInputDatetime());
  }

  async function handleConfirmarSolicitacaoPipefy() {
    if (!cliente || !confirmandoCampo || !valorConfirmacao) return;
    setSalvandoTrial(true);

    const atualizacao: Partial<Cliente> = { [confirmandoCampo]: new Date(valorConfirmacao).toISOString() };
    const { data, error: updateError } = await supabase
      .from('clientes')
      .update(atualizacao)
      .eq('id', cliente.id)
      .select()
      .single();

    setSalvandoTrial(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setConfirmandoCampo(null);
  }

  function abrirFormReuniao(tipo: TipoReuniao, reuniao: Reuniao | null) {
    setEditandoReuniaoTipo(tipo);
    setEditandoReuniaoId(reuniao?.id ?? null);
    setFormReuniao(reuniao ? paraFormReuniao(reuniao) : formReuniaoVazio(tipo));
    setStatusOriginalReuniaoEmEdicao(reuniao?.status ?? null);
    setValidacaoFunilKickoff('');
    // Pré-seleciona a versão mais recente só como ponto de partida — a
    // aprovação exige confirmação explícita (ver handleSalvarReuniao).
    setVersaoParaValidarKickoff(versoesMapeamentoOrigem[0] ? String(versoesMapeamentoOrigem[0].versao) : '');
  }

  function fecharFormReuniao() {
    setEditandoReuniaoTipo(null);
    setEditandoReuniaoId(null);
    setFormReuniao(null);
    setStatusOriginalReuniaoEmEdicao(null);
    setValidacaoFunilKickoff('');
    setVersaoParaValidarKickoff('');
  }

  // Kickoff/Treinamento continuam também escrevendo em
  // clientes.kickoff_realizado_em/treinamento_realizado_em (e seus pares
  // "_agendado_para") — isso é o que ancora o prazo de 40 dias e o gate do
  // treinamento em outros lugares do produto (ver src/lib/cronograma.ts e
  // src/lib/atividadesCronograma.ts). Nunca sobrescreve uma data já
  // realizada (isso seria uma remarcação silenciosa de um evento concluído).
  async function sincronizarMarcoCliente(reuniao: Reuniao, clienteAtual: Cliente) {
    if (reuniao.tipo !== 'kickoff' && reuniao.tipo !== 'treinamento') return;

    const campoRealizado = reuniao.tipo === 'kickoff' ? 'kickoff_realizado_em' : 'treinamento_realizado_em';
    const campoAgendado = reuniao.tipo === 'kickoff' ? 'kickoff_agendado_para' : 'treinamento_agendado_para';

    const patch: Partial<
      Pick<Cliente, 'kickoff_realizado_em' | 'kickoff_agendado_para' | 'treinamento_realizado_em' | 'treinamento_agendado_para'>
    > = {};

    if (reuniao.status === 'realizada' && reuniao.data_hora && !clienteAtual[campoRealizado]) {
      patch[campoRealizado] = reuniao.data_hora;
    }
    if (reuniao.data_hora && reuniao.status !== 'cancelada') {
      patch[campoAgendado] = reuniao.data_hora;
    }
    if (Object.keys(patch).length === 0) return;

    const { data, error: updateError } = await supabase
      .from('clientes')
      .update(patch)
      .eq('id', clienteAtual.id)
      .select()
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCliente(data);
    setKickoffRealizadoEm(data.kickoff_realizado_em);
  }

  // Só quando o Kickoff está virando "Realizado" agora (não quando já
  // estava e a edição é só de outro campo) — é o gatilho da pergunta "o
  // cliente validou o funil?", que não deve reaparecer numa edição comum.
  const confirmandoRealizacaoKickoff =
    formReuniao?.tipo === 'kickoff' &&
    formReuniao.status === 'realizada' &&
    statusOriginalReuniaoEmEdicao !== 'realizada';

  async function handleSalvarReuniao(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !formReuniao) return;
    const clienteId = implementacao.cliente_id;
    if (!clienteId) {
      setError('Esta implementação ainda não está vinculada a um cliente.');
      return;
    }
    if (confirmandoRealizacaoKickoff && !validacaoFunilKickoff) {
      setError('Selecione se o cliente validou o funil antes de confirmar o Kickoff como realizado.');
      return;
    }
    // P1-A1: a versão aprovada precisa ser uma escolha explícita e
    // confirmada — nunca inferida automaticamente como "a mais recente".
    if (confirmandoRealizacaoKickoff && validacaoFunilKickoff !== 'precisa_revisar') {
      if (!versaoParaValidarKickoff) {
        setError('Selecione qual versão do funil está sendo validada.');
        return;
      }
      const confirmado = await confirmarAcao({
        titulo: `Aprovar a Versão ${versaoParaValidarKickoff}?`,
        descricao: 'Esta versão passa a ser a usada na implementação.',
        confirmarLabel: 'Aprovar',
      });
      if (!confirmado) return;
    }

    setSalvandoReuniao(true);
    setError(null);

    const payload = {
      titulo: formReuniao.titulo.trim() || TIPO_REUNIAO_LABELS[formReuniao.tipo],
      data_hora: formReuniao.data_hora ? new Date(formReuniao.data_hora).toISOString() : null,
      consultor_responsavel_id: formReuniao.consultor_responsavel_id || null,
      participantes: formReuniao.participantes.trim() || null,
      link: formReuniao.link.trim() || null,
      status: formReuniao.status,
      ata: formReuniao.ata.trim() || null,
      resumo: formReuniao.resumo.trim() || null,
      decisoes: formReuniao.decisoes.trim() || null,
      pendencias_cliente: formReuniao.pendencias_cliente.trim() || null,
      pendencias_internas: formReuniao.pendencias_internas.trim() || null,
      proximos_passos: formReuniao.proximos_passos.trim() || null,
    };

    const { data, error: saveError } = editandoReuniaoId
      ? await supabase.from('reunioes').update(payload).eq('id', editandoReuniaoId).select().single()
      : await supabase
          .from('reunioes')
          .insert({
            ...payload,
            cliente_id: clienteId,
            implementacao_id: implementacao.id,
            tipo: formReuniao.tipo,
          })
          .select()
          .single();

    if (saveError) {
      setSalvandoReuniao(false);
      setError(saveError.message);
      return;
    }

    setReunioes((prev) => {
      const idx = prev.findIndex((r) => r.id === data.id);
      if (idx === -1) return [...prev, data];
      const copia = [...prev];
      copia[idx] = data;
      return copia;
    });

    if (cliente) await sincronizarMarcoCliente(data, cliente);

    if (confirmandoRealizacaoKickoff && mapeamentoOrigem) {
      const novoStatusMapeamento = statusMapeamentoPorValidacao(validacaoFunilKickoff as ValidacaoFunilKickoff);
      const { data: mapeamentoAtualizado, error: statusError } = await supabase
        .from('mapeamentos')
        .update({ status: novoStatusMapeamento })
        .eq('id', mapeamentoOrigem.id)
        .select('id, nome_negocio, enviado_em, created_at, status')
        .single();

      if (statusError) {
        setError(statusError.message);
      } else {
        setMapeamentoOrigem(mapeamentoAtualizado);
      }

      if (novoStatusMapeamento === 'funil_validado') {
        const { error: aprovacaoError } = await aprovarVersao(
          supabase,
          mapeamentoOrigem.id,
          Number(versaoParaValidarKickoff),
          { aprovadoPorEmail: user?.email ?? null, kickoffReuniaoId: data.id },
        );
        if (aprovacaoError) setError(aprovacaoError);
      }
    }

    setSalvandoReuniao(false);
    fecharFormReuniao();
  }

  function abrirRemarcacaoReuniao(reuniao: Reuniao) {
    setRemarcandoReuniaoId(reuniao.id);
    setFormRemarcacaoReuniao({
      data_nova: isoParaInputDatetime(reuniao.data_hora),
      motivo: '',
      responsavel_impacto: 'cliente',
    });
  }

  function fecharRemarcacaoReuniao() {
    setRemarcandoReuniaoId(null);
  }

  // Ação distinta de editar a reunião pelo formulário: preserva a data
  // anterior (vai pro log de auditoria), exige motivo e responsável pelo
  // impacto, mantém o status como estava (não força "remarcada") e nunca
  // mexe numa reunião já realizada.
  async function handleConfirmarRemarcacaoReuniao(e: FormEvent) {
    e.preventDefault();
    const reuniao = reunioes.find((r) => r.id === remarcandoReuniaoId);
    if (!reuniao || !formRemarcacaoReuniao.data_nova || !formRemarcacaoReuniao.motivo.trim()) return;

    setSalvandoRemarcacaoReuniao(true);
    setError(null);

    const dataNovaIso = new Date(formRemarcacaoReuniao.data_nova).toISOString();

    const { error: insertError } = await supabase.from('reuniao_remarcacoes').insert({
      reuniao_id: reuniao.id,
      data_anterior: reuniao.data_hora,
      data_nova: dataNovaIso,
      motivo: formRemarcacaoReuniao.motivo.trim(),
      responsavel_impacto: formRemarcacaoReuniao.responsavel_impacto,
      alterado_por_email: user?.email ?? null,
    });

    if (insertError) {
      setSalvandoRemarcacaoReuniao(false);
      setError(insertError.message);
      return;
    }

    const { data, error: updateError } = await supabase
      .from('reunioes')
      .update({ data_hora: dataNovaIso })
      .eq('id', reuniao.id)
      .select()
      .single();

    if (updateError) {
      setSalvandoRemarcacaoReuniao(false);
      setError(updateError.message);
      return;
    }

    setReunioes((prev) => prev.map((r) => (r.id === data.id ? data : r)));

    const { data: reuniaoRemarcacoesData } = await supabase
      .from('reuniao_remarcacoes')
      .select('*')
      .eq('reuniao_id', reuniao.id);
    setReuniaoRemarcacoes((prev) => [
      ...prev.filter((r) => r.reuniao_id !== reuniao.id),
      ...(reuniaoRemarcacoesData ?? []),
    ]);

    if (cliente) await sincronizarMarcoCliente(data, cliente);

    setSalvandoRemarcacaoReuniao(false);
    setRemarcandoReuniaoId(null);
  }

  function renderFormReuniao() {
    if (!formReuniao) return null;
    return (
      <form onSubmit={handleSalvarReuniao} className="card form-card">
        <div className="form-grid">
          <label className="field">
            <span>Título</span>
            <input
              type="text"
              value={formReuniao.titulo}
              placeholder={TIPO_REUNIAO_LABELS[formReuniao.tipo]}
              onChange={(e) => setFormReuniao({ ...formReuniao, titulo: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Data e horário</span>
            <input
              type="datetime-local"
              value={formReuniao.data_hora}
              onChange={(e) => setFormReuniao({ ...formReuniao, data_hora: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Consultor responsável</span>
            <select
              value={formReuniao.consultor_responsavel_id}
              onChange={(e) => setFormReuniao({ ...formReuniao, consultor_responsavel_id: e.target.value })}
            >
              <option value="">Selecione…</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {!c.ativo ? ' (inativo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Link</span>
            <input
              type="text"
              placeholder="https://..."
              value={formReuniao.link}
              onChange={(e) => setFormReuniao({ ...formReuniao, link: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={formReuniao.status}
              onChange={(e) => setFormReuniao({ ...formReuniao, status: e.target.value as StatusReuniao })}
            >
              {Object.entries(STATUS_REUNIAO_LABELS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {confirmandoRealizacaoKickoff && (
          <fieldset className="field">
            <legend>O cliente validou o funil?</legend>
            {(Object.entries(VALIDACAO_FUNIL_KICKOFF_LABELS) as [ValidacaoFunilKickoff, string][]).map(
              ([valor, rotulo]) => (
                <label key={valor} className="option-checkbox">
                  <input
                    type="radio"
                    name="validacao-funil-kickoff"
                    required
                    checked={validacaoFunilKickoff === valor}
                    onChange={() => setValidacaoFunilKickoff(valor)}
                  />
                  <span>{rotulo}</span>
                </label>
              ),
            )}
            <span className="field-hint">
              {validacaoFunilKickoff === 'precisa_revisar'
                ? 'O funil da implementação vai para "Ajustes solicitados".'
                : validacaoFunilKickoff
                  ? 'O funil da implementação vai para "Funil validado".'
                  : 'Isso também atualiza o status do funil desta implementação.'}
            </span>
          </fieldset>
        )}

        {confirmandoRealizacaoKickoff && validacaoFunilKickoff && validacaoFunilKickoff !== 'precisa_revisar' && (
          <label className="field">
            <span>Qual versão do funil está sendo validada?</span>
            <select
              required
              value={versaoParaValidarKickoff}
              onChange={(e) => setVersaoParaValidarKickoff(e.target.value)}
            >
              <option value="">Selecione…</option>
              {versoesMapeamentoOrigem.map((v) => (
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

        <label className="field">
          <span>Participantes</span>
          <textarea
            rows={2}
            placeholder="Um nome por linha"
            value={formReuniao.participantes}
            onChange={(e) => setFormReuniao({ ...formReuniao, participantes: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Ata</span>
          <textarea
            rows={3}
            value={formReuniao.ata}
            onChange={(e) => setFormReuniao({ ...formReuniao, ata: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Resumo</span>
          <textarea
            rows={3}
            value={formReuniao.resumo}
            onChange={(e) => setFormReuniao({ ...formReuniao, resumo: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Decisões</span>
          <textarea
            rows={2}
            value={formReuniao.decisoes}
            onChange={(e) => setFormReuniao({ ...formReuniao, decisoes: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Pendências do cliente</span>
          <textarea
            rows={2}
            value={formReuniao.pendencias_cliente}
            onChange={(e) => setFormReuniao({ ...formReuniao, pendencias_cliente: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Pendências internas</span>
          <textarea
            rows={2}
            value={formReuniao.pendencias_internas}
            onChange={(e) => setFormReuniao({ ...formReuniao, pendencias_internas: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Próximos passos</span>
          <textarea
            rows={2}
            value={formReuniao.proximos_passos}
            onChange={(e) => setFormReuniao({ ...formReuniao, proximos_passos: e.target.value })}
          />
        </label>
        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={fecharFormReuniao}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvandoReuniao}>
            {salvandoReuniao ? 'Salvando…' : 'Salvar reunião'}
          </button>
        </div>
      </form>
    );
  }

  function renderFormRemarcacaoReuniao() {
    return (
      <form onSubmit={handleConfirmarRemarcacaoReuniao} className="card form-card">
        <label className="field">
          <span>Nova data e horário</span>
          <input
            type="datetime-local"
            required
            value={formRemarcacaoReuniao.data_nova}
            onChange={(e) => setFormRemarcacaoReuniao({ ...formRemarcacaoReuniao, data_nova: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Motivo</span>
          <textarea
            rows={2}
            required
            value={formRemarcacaoReuniao.motivo}
            onChange={(e) => setFormRemarcacaoReuniao({ ...formRemarcacaoReuniao, motivo: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Responsável pelo impacto</span>
          <select
            value={formRemarcacaoReuniao.responsavel_impacto}
            onChange={(e) =>
              setFormRemarcacaoReuniao({
                ...formRemarcacaoReuniao,
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
          <button type="button" className="btn btn-secondary" onClick={fecharRemarcacaoReuniao}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvandoRemarcacaoReuniao}>
            {salvandoRemarcacaoReuniao ? 'Salvando…' : 'Confirmar remarcação'}
          </button>
        </div>
      </form>
    );
  }

  // ============================================================
  // Integração com o App de Atas (MVP) — a ata chega pronta (ou é
  // importada manualmente), o Mapeador só vincula e permite transformar
  // ação em pendência real. NUNCA cria pendência sozinho.
  // ============================================================
  function acoesDaAta(ataId: string): AtaAcaoIdentificada[] {
    return acoesAtaIntegracao.filter((a) => a.ata_id === ataId);
  }

  function abrirFormPendenciaDeAcao(acao: AtaAcaoIdentificada, ata: AtaReuniao) {
    const tipoSugerido: ResponsavelTipoAcaoAta = acao.responsavel_tipo ?? 'interna';
    const consultorSugerido = acao.responsavel_nome
      ? consultores.find((c) => c.nome.toLowerCase().includes(acao.responsavel_nome!.toLowerCase()))?.id ?? ''
      : '';
    setFormPendenciaDeAcao({
      acao,
      ata,
      titulo: acao.titulo,
      descricao: acao.descricao ?? '',
      tipo: tipoSugerido,
      consultor_responsavel_id: tipoSugerido === 'interna' ? consultorSugerido : '',
      prazo: acao.prazo_sugerido ?? '',
    });
  }

  // Seção 42 — antes de criar, verifica se já existe uma ação da MESMA
  // reunião já convertida em pendência com título parecido. Não bloqueia;
  // só avisa antes de confirmar.
  function possivelDuplicidade(acao: AtaAcaoIdentificada, ata: AtaReuniao): boolean {
    if (!ata.reuniao_id) return false;
    const atasDaMesmaReuniao = atasIntegracao.filter((a) => a.reuniao_id === ata.reuniao_id).map((a) => a.id);
    return acoesAtaIntegracao.some(
      (outra) =>
        outra.id !== acao.id &&
        atasDaMesmaReuniao.includes(outra.ata_id) &&
        outra.status === 'convertida_pendencia' &&
        outra.titulo.trim().toLowerCase() === acao.titulo.trim().toLowerCase(),
    );
  }

  async function criarPendenciaDeAcao(
    acao: AtaAcaoIdentificada,
    ata: AtaReuniao,
    dados: { titulo: string; descricao: string; tipo: ResponsavelTipoAcaoAta; consultor_responsavel_id: string; prazo: string },
  ): Promise<boolean> {
    if (!cliente) return false;

    const { data: pendenciaData, error: pendenciaError } = await supabase
      .from('cliente_ocorrencias')
      .insert({
        cliente_id: cliente.id,
        categoria: dados.tipo === 'cliente' ? 'pendencia_cliente' : 'outro',
        descricao: dados.descricao.trim() ? `${dados.titulo} — ${dados.descricao.trim()}` : dados.titulo,
        responsavel_impacto: dados.tipo === 'cliente' ? 'cliente' : 'consultor',
        data_ocorrencia: new Date().toISOString().slice(0, 10),
        impacta_cronograma: false,
        status: 'aberta',
        consultor_responsavel_id: dados.consultor_responsavel_id || null,
        prazo: dados.prazo || null,
        ata_id: ata.id,
        ata_acao_id: acao.id,
      })
      .select()
      .single();

    if (pendenciaError) {
      setError(pendenciaError.message);
      return false;
    }

    const { error: updateError } = await supabase
      .from('ata_acoes_identificadas')
      .update({ status: 'convertida_pendencia', pendencia_id: pendenciaData.id })
      .eq('id', acao.id);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    await supabase.rpc('registrar_auditoria', {
      p_acao: 'pendencia_criada_de_ata',
      p_entidade: 'ata_integracao',
      p_entidade_id: acao.id,
      p_cliente_id: cliente.id,
      p_implementacao_id: implementacao?.id ?? null,
      p_detalhes: { ata_id: ata.id, pendencia_id: pendenciaData.id },
    });
    await supabase.rpc('resolver_notificacao_ata_revisao', { p_ata_id: ata.id });

    return true;
  }

  async function handleSalvarPendenciaDeAcao(e: FormEvent) {
    e.preventDefault();
    if (!formPendenciaDeAcao) return;
    const { acao, ata, ...dados } = formPendenciaDeAcao;

    if (possivelDuplicidade(acao, ata)) {
      const confirmado = await confirmarAcao({
        titulo: 'Possível duplicidade',
        descricao:
          'Já existe uma ação desta mesma reunião convertida em pendência com um título parecido. Quer criar mesmo assim?',
        confirmarLabel: 'Criar mesmo assim',
      });
      if (!confirmado) return;
    }

    setSalvandoPendenciaDeAcao(true);
    const ok = await criarPendenciaDeAcao(acao, ata, dados);
    setSalvandoPendenciaDeAcao(false);

    if (ok) {
      mostrarToast('Pendência criada a partir da ata.');
      setFormPendenciaDeAcao(null);
      if (implementacao) await carregar(implementacao.id);
    }
  }

  async function handleDescartarAcaoAta(acao: AtaAcaoIdentificada, ata: AtaReuniao) {
    const confirmado = await confirmarAcao({
      titulo: `Descartar a ação "${acao.titulo}"?`,
      descricao: 'Ela não vai mais aparecer como pendente de revisão. Isso não cria nem remove nenhuma pendência.',
      confirmarLabel: 'Descartar',
    });
    if (!confirmado) return;

    const motivo = window.prompt('Motivo (opcional): já concluída, observação, duplicada, não aplicável…') ?? '';

    const { error: rpcError } = await supabase.rpc('descartar_acao_ata', {
      p_acao_id: acao.id,
      p_motivo: motivo.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    await supabase.rpc('resolver_notificacao_ata_revisao', { p_ata_id: ata.id });
    mostrarToast('Ação descartada.');
    if (implementacao) await carregar(implementacao.id);
  }

  // Seção 20 — "Criar todas": sem formulário individual por item, usa os
  // dados já sugeridos (tipo/consultor/prazo) direto; o consultor que
  // quiser ajustar algo antes de criar usa o botão individual.
  async function handleCriarTodasPendenciasDaAta(ata: AtaReuniao, selecionadas: AtaAcaoIdentificada[]) {
    if (selecionadas.length === 0) return;
    const confirmado = await confirmarAcao({
      titulo: `Confirmar ${selecionadas.length} pendência(s)?`,
      descricao: 'Cada ação marcada vira uma pendência rastreável, com os dados sugeridos pela ata.',
      confirmarLabel: `Confirmar ${selecionadas.length}`,
    });
    if (!confirmado) return;

    setSalvandoPendenciaDeAcao(true);
    for (const acao of selecionadas) {
      const tipo: ResponsavelTipoAcaoAta = acao.responsavel_tipo ?? 'interna';
      const consultorId = acao.responsavel_nome
        ? consultores.find((c) => c.nome.toLowerCase().includes(acao.responsavel_nome!.toLowerCase()))?.id ?? ''
        : '';
      await criarPendenciaDeAcao(acao, ata, {
        titulo: acao.titulo,
        descricao: acao.descricao ?? '',
        tipo,
        consultor_responsavel_id: tipo === 'interna' ? consultorId : '',
        prazo: acao.prazo_sugerido ?? '',
      });
    }
    setSalvandoPendenciaDeAcao(false);
    mostrarToast(`${selecionadas.length} pendência(s) criada(s).`);
    if (implementacao) await carregar(implementacao.id);
  }

  // Vincular manualmente nunca exige que a reunião já tenha sido agendada
  // antes: se não existir uma reunião desse tipo ainda, criamos uma aqui
  // mesmo (só com os campos essenciais) — se já existir, atualizamos ela em
  // vez de duplicar.
  async function handleVincularAtaManualmente(ata: AtaReuniao) {
    if (!formVinculoReuniao?.tipo) {
      setErroVinculoReuniao('Selecione o tipo de reunião.');
      return;
    }
    if (!implementacao || !cliente) {
      setErroVinculoReuniao('Implementação ou cliente não carregados — recarregue a página.');
      return;
    }
    const { tipo, data_hora, consultor_responsavel_id, status } = formVinculoReuniao;

    setErroVinculoReuniao(null);
    setVinculandoReuniaoSalvando(true);
    try {
      const existente = reunioes.find((r) => r.tipo === tipo) ?? null;

      const payload = {
        titulo: existente?.titulo ?? TIPO_REUNIAO_LABELS[tipo],
        data_hora: data_hora ? new Date(data_hora).toISOString() : (existente?.data_hora ?? null),
        consultor_responsavel_id: consultor_responsavel_id || existente?.consultor_responsavel_id || null,
        status,
      };

      const { data: reuniaoSalva, error: reuniaoError } = existente
        ? await supabase.from('reunioes').update(payload).eq('id', existente.id).select().single()
        : await supabase
            .from('reunioes')
            .insert({ ...payload, cliente_id: cliente.id, implementacao_id: implementacao.id, tipo })
            .select()
            .single();

      if (reuniaoError) {
        setErroVinculoReuniao(reuniaoError.message);
        return;
      }

      setReunioes((prev) => {
        const idx = prev.findIndex((r) => r.id === reuniaoSalva.id);
        if (idx === -1) return [...prev, reuniaoSalva];
        const copia = [...prev];
        copia[idx] = reuniaoSalva;
        return copia;
      });

      await sincronizarMarcoCliente(reuniaoSalva, cliente);

      const { error: rpcError } = await supabase.rpc('vincular_ata_manualmente', {
        p_ata_id: ata.id,
        p_cliente_id: cliente.id,
        p_implementacao_id: implementacao.id,
        p_reuniao_id: reuniaoSalva.id,
      });

      if (rpcError) {
        setErroVinculoReuniao(rpcError.message);
        return;
      }

      mostrarToast('Ata vinculada.');
      setVinculandoAtaId(null);
      setFormVinculoReuniao(null);
      await carregar(implementacao.id);
    } catch (err) {
      setErroVinculoReuniao(err instanceof Error ? err.message : 'Erro inesperado ao vincular a ata.');
    } finally {
      setVinculandoReuniaoSalvando(false);
    }
  }

  // Seção 37 — fallback manual: serve tanto pra quando o webhook falhar
  // quanto pra reunião que aconteceu fora do fluxo automático.
  async function handleImportarAtaManual(e: FormEvent) {
    e.preventDefault();
    if (!formImportarAta || !cliente) return;

    setImportandoAta(true);
    const { error: rpcError } = await supabase.rpc('importar_ata_manual', {
      p_cliente_id: cliente.id,
      p_implementacao_id: implementacao?.id ?? null,
      p_reuniao_id: formImportarAta.reuniao_id || null,
      p_titulo: formImportarAta.titulo.trim() || null,
      p_conteudo_original: formImportarAta.conteudo_original.trim() || null,
      p_resumo: formImportarAta.resumo.trim() || null,
    });
    setImportandoAta(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    mostrarToast('Ata importada.');
    setFormImportarAta(null);
    if (implementacao) await carregar(implementacao.id);
  }

  // Seção 14/39 — seção "Ata" dentro do card da reunião: estado vazio
  // ("Aguardando ata"), ata recebida com resumo/decisões, e as ações
  // aguardando revisão (seção 15/16/20/21/22). Cada reunião pode, em tese,
  // ter mais de uma versão de ata (seção 13) — mostra sempre a mais recente
  // (atasIntegracao já vem ordenada por recebido_em desc).
  function renderAtaDaReuniao(reuniao: Reuniao) {
    const ata = atasIntegracao.find((a) => a.reuniao_id === reuniao.id);
    if (!ata) {
      return (
        <p className="field-hint">
          <strong>Ata (integração):</strong> Aguardando ata.
        </p>
      );
    }

    const acoes = acoesDaAta(ata.id);
    const pendentes = acoes.filter((a) => a.status === 'pendente_revisao');
    const selecionaveis = pendentes;

    return (
      <div className="card" style={{ background: 'var(--color-surface-raised)' }}>
        <div className="page-header-actions page-header-actions-split">
          <h3 style={{ marginBottom: 0 }}>Ata</h3>
          <span className={`status-badge status-tone-${STATUS_ATA_TONE[ata.status]}`}>
            {STATUS_ATA_LABELS[ata.status]}
          </span>
        </div>
        <p className="field-hint">{fonteAtaLabel(ata.integration_source)}</p>

        {ata.status === 'vinculada' && reuniao.status !== 'realizada' && (
          <p className="form-error">
            Ata recebida, mas esta reunião ainda não está marcada como realizada.{' '}
            <button type="button" className="btn btn-ghost btn-auto" onClick={() => abrirFormReuniao(reuniao.tipo, reuniao)}>
              Revisar reunião
            </button>
          </p>
        )}

        {ata.resumo && <p className="field-hint">{ata.resumo}</p>}

        {ata.decisoes.length > 0 && (
          <>
            <p>
              <strong>Decisões</strong>
            </p>
            <ul className="observacoes-lista">
              {ata.decisoes.map((d, i) => (
                <li key={i} className="observacao-item">
                  <strong>{d.titulo ?? 'Decisão'}</strong>
                  {d.descricao && <p className="field-hint">{d.descricao}</p>}
                </li>
              ))}
            </ul>
          </>
        )}

        {acoes.length > 0 && (
          <>
            <div className="page-header-actions page-header-actions-split">
              <p style={{ margin: 0 }}>
                <strong>Ações identificadas</strong> ({pendentes.length} aguardando revisão)
              </p>
              {selecionaveis.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-auto"
                  disabled={salvandoPendenciaDeAcao}
                  onClick={() => handleCriarTodasPendenciasDaAta(ata, selecionaveis)}
                >
                  Criar todas ({selecionaveis.length})
                </button>
              )}
            </div>
            <ul className="observacoes-lista">
              {acoes.map((acao) => (
                <li key={acao.id} className="observacao-item">
                  <div className="observacao-item-header">
                    <span className="observacao-item-meta">
                      <span className={`status-badge status-tone-${STATUS_ACAO_ATA_TONE[acao.status]}`}>
                        {STATUS_ACAO_ATA_LABELS[acao.status]}
                      </span>{' '}
                      <strong style={{ color: 'var(--color-text)' }}>{acao.titulo}</strong>
                    </span>
                    {acao.status === 'pendente_revisao' && (
                      <span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-auto"
                          onClick={() => abrirFormPendenciaDeAcao(acao, ata)}
                        >
                          Criar pendência
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-ghost btn-auto"
                          onClick={() => handleDescartarAcaoAta(acao, ata)}
                        >
                          Não virar pendência
                        </button>
                      </span>
                    )}
                    {acao.status === 'convertida_pendencia' && acao.pendencia_id && cliente && (
                      <Link to={`/clientes/${cliente.id}`} className="btn btn-ghost btn-auto">
                        Ver pendência
                      </Link>
                    )}
                  </div>
                  {acao.descricao && <p className="field-hint">{acao.descricao}</p>}
                  <p className="field-hint">
                    {acao.responsavel_nome ? `Responsável sugerido: ${acao.responsavel_nome}` : 'Responsável não definido'}
                    {acao.prazo_sugerido ? ` · Prazo sugerido: ${new Date(`${acao.prazo_sugerido}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {ata.conteudo_original && (
          <details>
            <summary className="field-hint">Conteúdo original</summary>
            <p className="field-hint" style={{ whiteSpace: 'pre-wrap' }}>
              {ata.conteudo_original}
            </p>
          </details>
        )}
      </div>
    );
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
    const confirmado = await confirmarAcao({
      titulo: `Excluir a implementação de "${implementacao.nome_cliente}"?`,
      descricao: 'Isso também apaga as credenciais salvas. Essa ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

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

    mostrarToast('Implementação excluída.');
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
    const confirmado = await confirmarAcao({
      titulo: `Excluir a credencial "${credencial.login}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('credenciais_crm').delete().eq('id', credencial.id);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Credencial excluída.');
      setCredenciais((prev) => prev.filter((c) => c.id !== credencial.id));
    }
  }

  // ============================================================
  // Template aplicado — reuniões esperadas e critérios clonados (módulo
  // de Templates de Implementação). O consultor pode adaptar livremente:
  // marcar "não se aplica" (com justificativa) em vez de só excluir,
  // pra manter histórico de que a decisão foi avaliada — ver seção 24/23
  // do pedido do módulo de Templates.
  // ============================================================
  async function handleMarcarReuniaoEsperadaNaoAplicavel(reuniao: ImplementacaoReuniaoEsperada) {
    if (!implementacao) return;

    if (reuniao.nao_aplicavel) {
      const { error: updateError } = await supabase
        .from('implementacao_reunioes_esperadas')
        .update({ nao_aplicavel: false, nao_aplicavel_justificativa: null })
        .eq('id', reuniao.id);
      if (updateError) setError(updateError.message);
      else carregar(implementacao.id);
      return;
    }

    const justificativa = window.prompt(
      `Por que "${TIPO_REUNIAO_LABELS[reuniao.tipo]}" não se aplica a este cliente? (opcional)`,
    );
    if (justificativa === null) return;

    const { error: updateError } = await supabase
      .from('implementacao_reunioes_esperadas')
      .update({ nao_aplicavel: true, nao_aplicavel_justificativa: justificativa.trim() || null })
      .eq('id', reuniao.id);
    if (updateError) setError(updateError.message);
    else {
      mostrarToast('Marcado como não aplicável.');
      carregar(implementacao.id);
    }
  }

  async function handleExcluirReuniaoEsperada(reuniao: ImplementacaoReuniaoEsperada) {
    if (!implementacao) return;
    const confirmado = await confirmarAcao({
      titulo: `Remover "${TIPO_REUNIAO_LABELS[reuniao.tipo]}" desta implementação?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Remover',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('implementacao_reunioes_esperadas').delete().eq('id', reuniao.id);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Reunião esperada removida.');
      carregar(implementacao.id);
    }
  }

  async function handleAtualizarStatusCriterioTemplate(criterio: ImplementacaoCriterioTemplate, novoStatus: StatusCriterioEntrega) {
    if (!implementacao) return;

    if (novoStatus === 'nao_se_aplica') {
      const justificativa = window.prompt(`Por que "${criterio.titulo}" não se aplica a este cliente? (opcional)`);
      if (justificativa === null) return;
      const { error: updateError } = await supabase
        .from('implementacao_criterios_template')
        .update({ status: novoStatus, justificativa_nao_aplica: justificativa.trim() || null })
        .eq('id', criterio.id);
      if (updateError) setError(updateError.message);
      else carregar(implementacao.id);
      return;
    }

    const { error: updateError } = await supabase
      .from('implementacao_criterios_template')
      .update({ status: novoStatus, justificativa_nao_aplica: null })
      .eq('id', criterio.id);
    if (updateError) setError(updateError.message);
    else carregar(implementacao.id);
  }

  async function handleExcluirCriterioTemplate(criterio: ImplementacaoCriterioTemplate) {
    if (!implementacao) return;
    const confirmado = await confirmarAcao({
      titulo: `Excluir o critério "${criterio.titulo}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('implementacao_criterios_template').delete().eq('id', criterio.id);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Critério excluído.');
      carregar(implementacao.id);
    }
  }

  async function handleAlternarDocumentoEntregue(documento: ImplementacaoDocumentoTemplate) {
    if (!implementacao) return;

    const { error: updateError } = await supabase
      .from('implementacao_documentos_template')
      .update({
        entregue: !documento.entregue,
        entregue_em: !documento.entregue ? new Date().toISOString() : null,
      })
      .eq('id', documento.id);
    if (updateError) setError(updateError.message);
    else {
      mostrarToast(documento.entregue ? 'Documento marcado como pendente.' : 'Documento marcado como entregue.');
      carregar(implementacao.id);
    }
  }

  async function handleExcluirDocumentoTemplate(documento: ImplementacaoDocumentoTemplate) {
    if (!implementacao) return;
    const confirmado = await confirmarAcao({
      titulo: `Excluir o documento "${documento.nome}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('implementacao_documentos_template').delete().eq('id', documento.id);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Documento excluído.');
      carregar(implementacao.id);
    }
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

  async function handleRegistrarAcompanhamento(e: FormEvent) {
    e.preventDefault();
    if (!implementacao || !novoAcompanhamento.trim()) return;

    setSalvandoAcompanhamento(true);
    const { data, error: insertError } = await supabase
      .from('checkpoint_acompanhamentos')
      .insert({
        implementacao_id: implementacao.id,
        descricao: novoAcompanhamento.trim(),
        autor_email: user?.email ?? null,
      })
      .select()
      .single();
    setSalvandoAcompanhamento(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCheckpointAcompanhamentos((prev) => [data, ...prev]);
    setNovoAcompanhamento('');
  }

  async function handleCriarFunilNoKommo(funil: FunilGerado) {
    if (!implementacao) return;

    const jaCriado = criacoesKommo[funil.id];
    if (jaCriado) {
      const confirmado = await confirmarAcao({
        titulo: `Criar o funil "${funil.nome_funil}" de novo no Kommo?`,
        descricao: `Já foi criado (pipeline ${jaCriado.kommo_pipeline_id}) em ${new Date(jaCriado.criado_em).toLocaleString('pt-BR')}. Criar de novo cria um pipeline NOVO e separado na conta do cliente — não atualiza o existente.`,
        confirmarLabel: 'Criar mesmo assim',
        destrutivo: true,
      });
      if (!confirmado) return;
    } else {
      const confirmado = await confirmarAcao({
        titulo: `Criar o funil "${funil.nome_funil}" no Kommo?`,
        descricao:
          'Isso grava o pipeline, as etapas e os campos personalizados de verdade na conta do cliente — revise o funil antes de confirmar.',
        confirmarLabel: 'Criar no Kommo',
      });
      if (!confirmado) return;
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

  async function handleCopiarIdImplementacao() {
    await navigator.clipboard.writeText(implementacao!.id);
    setIdImplementacaoCopiado(true);
    setTimeout(() => setIdImplementacaoCopiado(false), 2000);
  }

  async function handleCopiarIdCliente() {
    if (!implementacao?.cliente_id) return;
    await navigator.clipboard.writeText(implementacao.cliente_id);
    setIdClienteCopiado(true);
    setTimeout(() => setIdClienteCopiado(false), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{implementacao.nome_cliente}</h1>
          <span className={`status-badge status-tone-${STATUS_CONTRATACAO_KOMMO_TONE[implementacao.status_contratacao_kommo]}`}>
            {STATUS_CONTRATACAO_KOMMO_LABELS[implementacao.status_contratacao_kommo]}
          </span>
          <p className="field-hint">
            {implementacao.cliente_id && (
              <>
                <Link to={`/clientes/${implementacao.cliente_id}`}>← Ver cliente</Link>
                {' · '}
              </>
            )}
            <Link to={`/mapeamento/${implementacao.mapeamento_id}`}>Ver mapeamento de origem</Link>
          </p>
          <p className="field-hint">
            ID da implementação: <code>{implementacao.id}</code>{' '}
            <button type="button" className="btn-link" onClick={handleCopiarIdImplementacao}>
              {idImplementacaoCopiado ? 'Copiado!' : 'Copiar'}
            </button>
            {implementacao.cliente_id && (
              <>
                {' · '}ID do cliente: <code>{implementacao.cliente_id}</code>{' '}
                <button type="button" className="btn-link" onClick={handleCopiarIdCliente}>
                  {idClienteCopiado ? 'Copiado!' : 'Copiar'}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="page-header-actions">
          <Link to={`/implementacoes/${implementacao.id}/entrega`} className="btn btn-secondary">
            Relatórios e Entrega
          </Link>
          <button type="button" className="btn btn-danger" onClick={handleExcluirImplementacao} disabled={excluindo}>
            {excluindo ? 'Excluindo…' : 'Excluir implementação'}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {diaCiclo && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">Dia {diaCiclo.dia}/{configuracao.duracaoTotalDias}</span>
            <span className="stat-label">
              {diaCiclo.ciclo
                ? `${diaCiclo.ciclo.nome} (dias ${diaCiclo.ciclo.diaInicio}–${diaCiclo.ciclo.diaFim})`
                : diaCiclo.dia < 1
                  ? 'Antes do Kickoff'
                  : 'Além dos 40 dias previstos'}
            </span>
          </div>
        </div>
      )}

      {cliente && !cliente.conta_kommo_criada_em && (
        <section className="card form-card">
          <h2>Conta Kommo</h2>
          {cliente.conta_kommo_solicitada_em ? (
            <p className="field-hint">
              Solicitada em {new Date(cliente.conta_kommo_solicitada_em).toLocaleString('pt-BR')} — aguardando
              criação (o Trial começa a contar quando isso acontecer).
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={() => handleAbrirLinkPipefy(pipefyConfig?.url_criacao_conta, 'conta_kommo_solicitada_em')}
            >
              Solicitar conta
            </button>
          )}
          {confirmandoCampo === 'conta_kommo_solicitada_em' && (
            <div className="form-info form-info-com-acao">
              <label className="field">
                <span>Solicitação enviada em</span>
                <input
                  type="datetime-local"
                  value={valorConfirmacao}
                  onChange={(e) => setValorConfirmacao(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmandoCampo(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvandoTrial}
                onClick={handleConfirmarSolicitacaoPipefy}
              >
                Confirmar
              </button>
            </div>
          )}
        </section>
      )}

      {/* Indicador totalmente separado do "Dia X/40" acima — o Trial conta a
          partir da conta Kommo criada, a implementação a partir do Kickoff. */}
      {resumoTrial && (
        <section className="card form-card">
          <div className="page-header">
            <h2 style={{ marginBottom: 0 }}>Trial Kommo</h2>
            <span className={`status-badge status-tone-${STATUS_TRIAL_TONE[resumoTrial.status]}`}>
              {STATUS_TRIAL_LABELS[resumoTrial.status]}
            </span>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{resumoTrial.periodoAtual}</span>
              <span className="stat-label">
                Dia {resumoTrial.diaAtualPeriodo}/{resumoTrial.duracaoPeriodoAtual}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {resumoTrial.usoTotalDias}/{resumoTrial.usoTotalMaximo}
              </span>
              <span className="stat-label">Uso total</span>
            </div>
            <div className={`stat-card${resumoTrial.diasRestantes < 0 ? ' stat-card-danger' : ''}`}>
              <span className="stat-value">
                {resumoTrial.diasRestantes < 0
                  ? `${-resumoTrial.diasRestantes}d vencido`
                  : `${resumoTrial.diasRestantes}d restantes`}
              </span>
              <span className="stat-label">Vence em {resumoTrial.vencimento.toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {resumoTrial.proximaExtensao ? (
            <div className="form-info form-info-com-acao">
              <span>
                Próxima extensão: <strong>{resumoTrial.proximaExtensao.rotulo}</strong>
                {' — '}
                {resumoTrial.proximaExtensao.aprovadaEm
                  ? `aprovada em ${new Date(`${resumoTrial.proximaExtensao.aprovadaEm}T12:00:00`).toLocaleDateString('pt-BR')}`
                  : resumoTrial.proximaExtensao.solicitadaEm
                    ? `solicitada em ${new Date(`${resumoTrial.proximaExtensao.solicitadaEm}T12:00:00`).toLocaleDateString('pt-BR')}, aguardando aprovação`
                    : 'Não solicitada'}
              </span>
              {!resumoTrial.proximaExtensao.solicitadaEm && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={salvandoTrial}
                  onClick={() => {
                    const campo =
                      resumoTrial.proximaExtensao!.rotulo === '+14 dias'
                        ? 'extensao_14_solicitada_em'
                        : 'extensao_7_solicitada_em';
                    const url =
                      campo === 'extensao_14_solicitada_em'
                        ? pipefyConfig?.url_extensao_14
                        : pipefyConfig?.url_extensao_7;
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    handleRegistrarEventoTrial(campo);
                  }}
                >
                  Solicitar extensão {resumoTrial.proximaExtensao.rotulo}
                </button>
              )}
              {resumoTrial.proximaExtensao.solicitadaEm && !resumoTrial.proximaExtensao.aprovadaEm && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={salvandoTrial}
                  onClick={() =>
                    handleRegistrarEventoTrial(
                      resumoTrial.proximaExtensao!.rotulo === '+14 dias'
                        ? 'extensao_14_aprovada_em'
                        : 'extensao_7_aprovada_em',
                    )
                  }
                >
                  Registrar aprovação
                </button>
              )}
            </div>
          ) : (
            <p className="field-hint">As duas extensões já foram usadas — não há mais prorrogação possível.</p>
          )}

          <div className="form-info form-info-com-acao">
            <span>
              Contratação definitiva:{' '}
              {cliente?.contratacao_kommo_solicitada_em
                ? `solicitada em ${new Date(cliente.contratacao_kommo_solicitada_em).toLocaleString('pt-BR')}`
                : 'Não solicitada'}
            </span>
            {!cliente?.contratacao_kommo_solicitada_em && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  handleAbrirLinkPipefy(pipefyConfig?.url_contratacao_definitiva, 'contratacao_kommo_solicitada_em')
                }
              >
                Solicitar contratação
              </button>
            )}
          </div>

          {confirmandoCampo === 'contratacao_kommo_solicitada_em' && (
            <div className="form-info form-info-com-acao">
              <label className="field">
                <span>Solicitação enviada em</span>
                <input
                  type="datetime-local"
                  value={valorConfirmacao}
                  onChange={(e) => setValorConfirmacao(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmandoCampo(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvandoTrial}
                onClick={handleConfirmarSolicitacaoPipefy}
              >
                Confirmar
              </button>
            </div>
          )}
        </section>
      )}

      {(diaCiclo || tempoReuniao) && (
        <div className="stats-grid">
          {diaCiclo && (
            <div className={`stat-card${diaCiclo.dia > configuracao.duracaoTotalDias ? ' stat-card-danger' : ''}`}>
              <span className="stat-value">
                {diaCiclo.dia > configuracao.duracaoTotalDias
                  ? `${diaCiclo.dia - configuracao.duracaoTotalDias}d atrasado`
                  : `${configuracao.duracaoTotalDias - diaCiclo.dia}d restantes`}
              </span>
              <span className="stat-label">
                Prazo geral da implementação — Dia {diaCiclo.dia}/{configuracao.duracaoTotalDias}
                {diaCiclo.ciclo ? ` (${diaCiclo.ciclo.nome})` : ''}
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
          className={`tab-button${aba === 'criterios' ? ' active' : ''}`}
          onClick={() => setAba('criterios')}
        >
          Critérios de Entrega
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
          Indicadores de Adoção
          {checkpointAdocao?.risco_churn && <span className="badge-danger">Risco</span>}
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'reunioes' ? ' active' : ''}`}
          onClick={() => setAba('reunioes')}
        >
          Reuniões
          {alertasReunioes.length > 0 && <span className="badge-danger">{alertasReunioes.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-button${aba === 'template' ? ' active' : ''}`}
          onClick={() => setAba('template')}
        >
          Template
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

              <div className="field">
                <span>Consultor responsável</span>
                <div className="page-header-actions" style={{ justifyContent: 'space-between' }}>
                  <p style={{ margin: 0 }}>
                    {nomeConsultor(implementacao.consultor_responsavel_id, consultores) ?? 'Sem responsável definido'}
                  </p>
                  <button type="button" className="btn btn-secondary btn-auto" onClick={abrirTransferirConsultor}>
                    Transferir
                  </button>
                </div>
              </div>

              {transferindoConsultor && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Transferir para</span>
                  <select
                    value={novoConsultorTransferencia}
                    onChange={(e) => setNovoConsultorTransferencia(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {consultores
                      .filter((c) => c.id !== implementacao.consultor_responsavel_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {!c.ativo ? ' (inativo)' : ''}
                        </option>
                      ))}
                  </select>
                  {erroTransferenciaConsultor && <p className="form-error">{erroTransferenciaConsultor}</p>}
                  <div className="wizard-actions">
                    <button type="button" className="btn btn-secondary" onClick={fecharTransferirConsultor}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleTransferirConsultor}
                      disabled={!novoConsultorTransferencia || salvandoTransferenciaConsultor}
                    >
                      {salvandoTransferenciaConsultor ? 'Transferindo…' : 'Confirmar transferência'}
                    </button>
                  </div>
                </div>
              )}

              <label className="field">
                <span>Consultor adicional (opcional)</span>
                <select
                  value={formGeral.consultor_adicional_id}
                  onChange={(e) => setFormGeral({ ...formGeral, consultor_adicional_id: e.target.value })}
                >
                  <option value="">Nenhum</option>
                  {consultores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {!c.ativo ? ' (inativo)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {historicoConsultor.length > 0 && (
                <p className="field-hint">
                  Histórico de responsáveis:{' '}
                  {historicoConsultor
                    .map((h) => {
                      const anterior = nomeConsultor(h.consultor_anterior_id, consultores) ?? 'ninguém';
                      const novo = nomeConsultor(h.consultor_novo_id, consultores) ?? '—';
                      return `${anterior} → ${novo} em ${new Date(h.alterado_em).toLocaleDateString('pt-BR')}${h.alterado_por_email ? ` (por ${h.alterado_por_email})` : ''}`;
                    })
                    .join(' · ')}
                </p>
              )}

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
                <span>Status da contratação do Kommo</span>
                <select
                  value={formGeral.status_contratacao_kommo}
                  onChange={(e) =>
                    setFormGeral({ ...formGeral, status_contratacao_kommo: e.target.value as StatusContratacaoKommo })
                  }
                >
                  {Object.entries(STATUS_CONTRATACAO_KOMMO_LABELS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  Status comercial — separado dos Critérios de Entrega, que são só técnicos.
                </span>
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

            {funisDoMapeamento.length === 0 ? (
              <div className="empty-state">
                <p>O mapeamento de origem ainda não tem funil gerado.</p>
              </div>
            ) : (
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
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === 'checklist' &&
        Array.from(atividadesPorCiclo.entries()).map(([ciclo, atividadesDoCiclo]) => {
          return (
            <section key={ciclo} className="card form-card">
              <h2>{ciclo}</h2>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Atividade</th>
                      <th>Prazo</th>
                      <th>Responsável</th>
                      <th>Dependência</th>
                      <th>Dia</th>
                      <th>Ciclo</th>
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
                        <Fragment key={atividade.id ?? `${atividade.ciclo}-${atividade.nome}`}>
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
                              {templateAtividade?.origem_template_id && (
                                <span className="derivado-badge"> · do template</span>
                              )}
                            </td>
                            <td>{atividade.prazoDias != null ? `${atividade.prazoDias}d` : '—'}</td>
                            <td>{atividade.responsavel ?? '—'}</td>
                            <td>{atividade.dependenciaLabel ?? '—'}</td>
                            <td>{atividade.diaDesdeKickoff != null ? `Dia ${atividade.diaDesdeKickoff}` : '—'}</td>
                            <td>
                              {atividade.foraDaJanelaDoCiclo ? (
                                <span className="ops-prazo-atrasado">
                                  {atividade.diasAcimaDaJanela}d acima do ciclo
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              {atividade.dataPlanejada?.toLocaleDateString('pt-BR') ?? '—'}
                              {atividade.deslocamentoDias != null && (
                                <span className="field-hint">
                                  {' '}
                                  (remarcado em {atividade.deslocamentoDias >= 0 ? '+' : ''}
                                  {atividade.deslocamentoDias}d)
                                </span>
                              )}
                            </td>
                            <td>{atividade.dataReal?.toLocaleDateString('pt-BR') ?? '—'}</td>
                            <td>{atividade.atrasoDias > 0 ? `${atividade.atrasoDias}d` : '—'}</td>
                            <td>
                              <span className={`status-badge status-tone-${STATUS_ATIVIDADE_TONE[atividade.status]}`}>
                                {atividade.status === 'aguardando_etapa_anterior' &&
                                atividade.dependenciaLabel === 'Treinamento realizado'
                                  ? 'Bloqueado até realização do treinamento'
                                  : STATUS_ATIVIDADE_LABELS[atividade.status]}
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
                              <td colSpan={12}>
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

      {aba === 'criterios' && implementacao && (
        <section className="card form-card">
          <div className="page-header-actions page-header-actions-split">
            <h2 style={{ marginBottom: 0 }}>Critérios de Entrega</h2>
            {(() => {
              const resumoCriterios = resolverResumoCriteriosEntrega(criterios, criteriosStatus, implementacao.id);
              return (
                <span
                  className={`status-badge status-tone-${resumoCriterios.todosObrigatoriosAtendidos ? 'success' : 'warning'}`}
                >
                  Critérios de entrega: {resumoCriterios.concluidos}/{resumoCriterios.total} concluídos
                </span>
              );
            })()}
          </div>
          <p className="field-hint">
            "A implementação foi corretamente entregue?" — técnico e objetivo, sob controle da V4.
            Não inclui contratação do plano, adoção do cliente nem o Checkpoint 30 dias (isso fica em
            "Indicadores de Adoção").
          </p>
          {(() => {
            const resumoCriterios = resolverResumoCriteriosEntrega(criterios, criteriosStatus, implementacao.id);
            return (
              resumoCriterios.todosObrigatoriosAtendidos && (
                <p className="field-hint" style={{ color: 'var(--color-success)' }}>
                  Todos os critérios obrigatórios de entrega estão atendidos — a implementação já pode
                  ser marcada como tecnicamente concluída.
                </p>
              )
            );
          })()}

          <ul className="observacoes-lista">
            {criterios.map((criterio) => {
              const statusRow = criteriosStatus.find((s) => s.criterio_id === criterio.id);
              const status = statusRow?.status ?? 'pendente';
              const editando = editandoCriterioId === criterio.id;

              return (
                <li key={criterio.id} className="observacao-item">
                  <div className="observacao-item-header">
                    <span className="observacao-item-meta">
                      <span className={`status-badge status-tone-${STATUS_CRITERIO_TONE[status]}`}>
                        {STATUS_CRITERIO_LABELS[status]}
                      </span>{' '}
                      <strong style={{ color: 'var(--color-text)' }}>{criterio.nome}</strong>
                      {!criterio.obrigatorio && <span className="field-hint"> (quando aplicável)</span>}
                    </span>
                    {!editando && (
                      <button type="button" className="btn btn-secondary" onClick={() => abrirFormCriterio(criterio.id)}>
                        Editar
                      </button>
                    )}
                  </div>

                  {!editando && statusRow && (
                    <div className="field-hint">
                      {statusRow.evidencia && <p>Evidência: {statusRow.evidencia}</p>}
                      {statusRow.observacao && <p>Observação: {statusRow.observacao}</p>}
                      {statusRow.status === 'nao_se_aplica' && statusRow.justificativa_nao_aplica && (
                        <p>Justificativa: {statusRow.justificativa_nao_aplica}</p>
                      )}
                      {statusRow.data_validacao && (
                        <p>
                          Validado em {formatarDataHoraLocal(statusRow.data_validacao)}
                          {statusRow.responsavel_validacao_id
                            ? ` por ${nomeConsultor(statusRow.responsavel_validacao_id, consultores) ?? '—'}`
                            : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {editando && formCriterio && (
                    <form onSubmit={handleSalvarCriterio} className="card form-card">
                      <div className="form-grid">
                        <label className="field">
                          <span>Status</span>
                          <select
                            value={formCriterio.status}
                            onChange={(e) =>
                              setFormCriterio({ ...formCriterio, status: e.target.value as StatusCriterioEntrega })
                            }
                          >
                            {Object.entries(STATUS_CRITERIO_LABELS).map(([valor, rotulo]) => (
                              <option key={valor} value={valor}>
                                {rotulo}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Responsável pela validação</span>
                          <select
                            value={formCriterio.responsavel_validacao_id}
                            onChange={(e) =>
                              setFormCriterio({ ...formCriterio, responsavel_validacao_id: e.target.value })
                            }
                          >
                            <option value="">Selecione…</option>
                            {consultores.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        <span>Evidência</span>
                        <textarea
                          rows={2}
                          value={formCriterio.evidencia}
                          onChange={(e) => setFormCriterio({ ...formCriterio, evidencia: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Observação</span>
                        <textarea
                          rows={2}
                          value={formCriterio.observacao}
                          onChange={(e) => setFormCriterio({ ...formCriterio, observacao: e.target.value })}
                        />
                      </label>
                      {formCriterio.status === 'nao_se_aplica' && (
                        <label className="field">
                          <span>Justificativa (obrigatória)</span>
                          <textarea
                            rows={2}
                            required
                            value={formCriterio.justificativa_nao_aplica}
                            onChange={(e) =>
                              setFormCriterio({ ...formCriterio, justificativa_nao_aplica: e.target.value })
                            }
                          />
                        </label>
                      )}
                      <div className="wizard-actions">
                        <button type="button" className="btn btn-secondary" onClick={fecharFormCriterio}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={salvandoCriterio}>
                          {salvandoCriterio ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
                        className="btn btn-danger"
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
          <h2>Indicadores de Adoção</h2>
          <p className="field-hint">
            Separados dos Critérios de Entrega: entrega técnica correta é uma coisa, adoção real
            pelo cliente é outra — nenhum indicador daqui (uso das planilhas, frequência de uso de
            relatórios, contratação do plano, resultado do Checkpoint) bloqueia ou conta como
            critério de qualidade da implementação.
          </p>
          <h3>Checkpoint de Adoção — 30 dias pós-entrega</h3>
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

          {checkpointAdocao &&
            (() => {
              const diagnostico = resolverDiagnosticoAdocao(checkpointAdocao);
              return (
                <>
                  {checkpointAdocao.risco_churn && (
                    <p className="form-error">
                      Sinal de risco de churn: o cliente respondeu que voltou a usar planilha/WhatsApp
                      em paralelo ao Kommo. Vale acionar o comercial ou reforçar o acompanhamento.
                    </p>
                  )}

                  <div className="page-header-actions page-header-actions-split">
                    <h3 style={{ marginBottom: 0 }}>Adoção</h3>
                    <span className={`status-badge status-tone-${STATUS_DIAGNOSTICO_TONE[diagnostico.status]}`}>
                      {STATUS_DIAGNOSTICO_LABELS[diagnostico.status]}
                    </span>
                  </div>
                  <p className="field-hint">
                    <strong>Principais sinais:</strong>
                  </p>
                  <ul className="observacoes-lista">
                    {diagnostico.sinais.map((sinal, i) => (
                      <li key={i} className="field-hint">
                        {sinal}
                      </li>
                    ))}
                  </ul>
                  <p className="field-hint">
                    <strong>Recomendações:</strong>
                  </p>
                  <ul className="observacoes-lista">
                    {diagnostico.recomendacoes.map((rec, i) => (
                      <li key={i} className="field-hint">
                        {rec}
                      </li>
                    ))}
                  </ul>

                  <h3>Respostas</h3>
                  <ul className="historico-status-lista">
                    <li className="historico-status-item">
                      <span className="historico-status-data">Data do Checkpoint</span>
                      <span>{new Date(checkpointAdocao.respondido_em).toLocaleString('pt-BR')}</span>
                    </li>
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
                    {checkpointAdocao.percentual_processo_kommo && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">% do processo dentro do Kommo</span>
                        <span>{PERCENTUAL_PROCESSO_LABELS[checkpointAdocao.percentual_processo_kommo]}</span>
                      </li>
                    )}
                    {checkpointAdocao.autonomia_equipe && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">Autonomia da equipe</span>
                        <span>{AUTONOMIA_EQUIPE_LABELS[checkpointAdocao.autonomia_equipe]}</span>
                      </li>
                    )}
                    {checkpointAdocao.uso_relatorios_decisao && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">Usou relatório para decisão</span>
                        <span>{USO_RELATORIOS_DECISAO_LABELS[checkpointAdocao.uso_relatorios_decisao]}</span>
                      </li>
                    )}
                    {checkpointAdocao.atividades_fora_kommo && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">Atividades fora do Kommo</span>
                        <span>{ATIVIDADES_FORA_KOMMO_LABELS[checkpointAdocao.atividades_fora_kommo]}</span>
                      </li>
                    )}
                    {checkpointAdocao.quais_atividades_fora_kommo && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">Quais atividades</span>
                        <span>{checkpointAdocao.quais_atividades_fora_kommo}</span>
                      </li>
                    )}
                    {checkpointAdocao.principal_dificuldade && (
                      <li className="historico-status-item">
                        <span className="historico-status-data">Principal dificuldade</span>
                        <span>{checkpointAdocao.principal_dificuldade}</span>
                      </li>
                    )}
                  </ul>

                  <h3>Ações de acompanhamento</h3>
                  <form onSubmit={handleRegistrarAcompanhamento} className="card form-card">
                    <label className="field">
                      <span>Registrar ação após analisar as respostas</span>
                      <textarea
                        rows={2}
                        value={novoAcompanhamento}
                        onChange={(e) => setNovoAcompanhamento(e.target.value)}
                        placeholder="Ex: liguei pro cliente pra reforçar o treinamento de relatórios"
                      />
                    </label>
                    <div className="wizard-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-auto"
                        disabled={salvandoAcompanhamento || !novoAcompanhamento.trim()}
                      >
                        {salvandoAcompanhamento ? 'Salvando…' : 'Registrar ação'}
                      </button>
                    </div>
                  </form>
                  {checkpointAcompanhamentos.length > 0 && (
                    <ul className="observacoes-lista">
                      {checkpointAcompanhamentos.map((a) => (
                        <li key={a.id} className="observacao-item">
                          <div className="observacao-item-header">
                            <span className="observacao-item-meta">
                              {new Date(a.created_at).toLocaleString('pt-BR')}
                              {a.autor_email ? ` · ${a.autor_email}` : ''}
                            </span>
                          </div>
                          <p className="observacao-item-texto">{a.descricao}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
        </section>
      )}

      {aba === 'reunioes' &&
        (!cliente ? (
          <section className="card form-card">
            <p className="field-hint">Esta implementação ainda não está vinculada a um cliente.</p>
          </section>
        ) : (
          <>
            <section className="card form-card">
              <div className="page-header-actions page-header-actions-split">
                <h2 style={{ marginBottom: 0 }}>Atas</h2>
                {!formImportarAta && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-auto"
                    onClick={() => setFormImportarAta({ reuniao_id: '', titulo: '', resumo: '', conteudo_original: '' })}
                  >
                    Importar ata
                  </button>
                )}
              </div>
              <p className="field-hint">
                Atas chegam automaticamente do App de Atas. Use "Importar ata" se o webhook falhar ou a reunião tiver
                acontecido fora do fluxo normal.
              </p>
              {formImportarAta && (
                <form onSubmit={handleImportarAtaManual} className="card form-card">
                  <label className="field">
                    <span>Reunião (opcional)</span>
                    <select
                      value={formImportarAta.reuniao_id}
                      onChange={(e) => setFormImportarAta({ ...formImportarAta, reuniao_id: e.target.value })}
                    >
                      <option value="">Sem reunião específica</option>
                      {reunioes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {TIPO_REUNIAO_LABELS[r.tipo]}
                          {r.data_hora ? ` — ${formatarDataHoraLocal(r.data_hora)}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Título</span>
                    <input
                      type="text"
                      value={formImportarAta.titulo}
                      onChange={(e) => setFormImportarAta({ ...formImportarAta, titulo: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Resumo</span>
                    <textarea
                      rows={3}
                      value={formImportarAta.resumo}
                      onChange={(e) => setFormImportarAta({ ...formImportarAta, resumo: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Conteúdo original (colar texto)</span>
                    <textarea
                      rows={6}
                      value={formImportarAta.conteudo_original}
                      onChange={(e) => setFormImportarAta({ ...formImportarAta, conteudo_original: e.target.value })}
                    />
                  </label>
                  <div className="wizard-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setFormImportarAta(null)} disabled={importandoAta}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={importandoAta}>
                      {importandoAta ? 'Importando…' : 'Importar'}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {alertasReunioes.length > 0 && (
              <section className="card form-card">
                {alertasReunioes.map((alerta) => (
                  <p key={alerta.tipo} className="form-error">
                    {alerta.titulo}
                  </p>
                ))}
              </section>
            )}

            {atasIntegracao
              .filter((a) => a.status === 'requer_revisao' || a.status === 'erro_vinculo')
              .map((ata) => (
                <section key={ata.id} className="card form-card">
                  <p className="form-error">
                    Esta ata precisa ser vinculada a uma reunião.
                    {ata.erro_mensagem ? ` (${ata.erro_mensagem})` : ''}
                  </p>
                  {ata.resumo && <p className="field-hint">{ata.resumo}</p>}
                  {vinculandoAtaId === ata.id && formVinculoReuniao ? (
                    <div className="form-grid">
                      <label className="field">
                        <span>Tipo de reunião</span>
                        <select
                          value={formVinculoReuniao.tipo}
                          onChange={(e) =>
                            setFormVinculoReuniao({ ...formVinculoReuniao, tipo: e.target.value as TipoReuniao })
                          }
                        >
                          <option value="">Selecione</option>
                          {[...TIPOS_REUNIAO_ESTRUTURADOS, ...TIPOS_REUNIAO_AD_HOC].map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {TIPO_REUNIAO_LABELS[tipo]}
                            </option>
                          ))}
                        </select>
                        {formVinculoReuniao.tipo && reunioes.some((r) => r.tipo === formVinculoReuniao.tipo) && (
                          <span className="field-hint">
                            Já existe uma reunião desse tipo cadastrada — os dados abaixo vão atualizá-la.
                          </span>
                        )}
                      </label>
                      <label className="field">
                        <span>Data e horário</span>
                        <input
                          type="datetime-local"
                          value={formVinculoReuniao.data_hora}
                          onChange={(e) => setFormVinculoReuniao({ ...formVinculoReuniao, data_hora: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Consultor responsável</span>
                        <select
                          value={formVinculoReuniao.consultor_responsavel_id}
                          onChange={(e) =>
                            setFormVinculoReuniao({ ...formVinculoReuniao, consultor_responsavel_id: e.target.value })
                          }
                        >
                          <option value="">Selecione…</option>
                          {consultores.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                              {!c.ativo ? ' (inativo)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Status</span>
                        <select
                          value={formVinculoReuniao.status}
                          onChange={(e) =>
                            setFormVinculoReuniao({ ...formVinculoReuniao, status: e.target.value as StatusReuniao })
                          }
                        >
                          {Object.entries(STATUS_REUNIAO_LABELS).map(([valor, rotulo]) => (
                            <option key={valor} value={valor}>
                              {rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      {erroVinculoReuniao && <p className="form-error">{erroVinculoReuniao}</p>}
                      <div className="wizard-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={vinculandoReuniaoSalvando}
                          onClick={() => {
                            setVinculandoAtaId(null);
                            setFormVinculoReuniao(null);
                            setErroVinculoReuniao(null);
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!formVinculoReuniao.tipo || vinculandoReuniaoSalvando}
                          onClick={() => handleVincularAtaManualmente(ata)}
                        >
                          {vinculandoReuniaoSalvando ? 'Vinculando…' : 'Vincular'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-auto"
                      onClick={() => {
                        setVinculandoAtaId(ata.id);
                        setErroVinculoReuniao(null);
                        const tipoSugerido = (
                          [...TIPOS_REUNIAO_ESTRUTURADOS, ...TIPOS_REUNIAO_AD_HOC] as string[]
                        ).includes(ata.tipo_reuniao ?? '')
                          ? (ata.tipo_reuniao as TipoReuniao)
                          : '';
                        setFormVinculoReuniao({
                          tipo: tipoSugerido,
                          data_hora: isoParaInputDatetime(ata.data_reuniao),
                          consultor_responsavel_id: '',
                          status: 'realizada',
                        });
                      }}
                    >
                      Vincular manualmente
                    </button>
                  )}
                </section>
              ))}

            {TIPOS_REUNIAO_ESTRUTURADOS.map((tipo) => {
              const reuniao = reunioes.find((r) => r.tipo === tipo) ?? null;
              const remarcacoesDaReuniao = reuniao
                ? reuniaoRemarcacoes.filter((rr) => rr.reuniao_id === reuniao.id)
                : [];
              const podeRemarcar = !!(reuniao?.data_hora && reuniao.status !== 'realizada');
              const editando = editandoReuniaoTipo === tipo;

              return (
                <section key={tipo} className="card form-card">
                  <div className="page-header-actions page-header-actions-split">
                    <h2 style={{ marginBottom: 0 }}>
                      {TIPO_REUNIAO_LABELS[tipo]}
                      {reuniao && (
                        <>
                          {' '}
                          <span className={`status-badge status-tone-${STATUS_REUNIAO_TONE[reuniao.status]}`}>
                            {STATUS_REUNIAO_LABELS[reuniao.status]}
                          </span>
                        </>
                      )}
                    </h2>
                    {!editando && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-auto"
                        onClick={() => abrirFormReuniao(tipo, reuniao)}
                      >
                        {reuniao ? 'Editar' : 'Agendar'}
                      </button>
                    )}
                  </div>

                  {tipo === 'kickoff' && !cliente.kickoff_realizado_em && (
                    <ul className="form-grid" style={{ marginBottom: 12 }}>
                      {[
                        { label: 'Formulário respondido', feito: !!mapeamentoOrigem?.enviado_em },
                        {
                          label: 'Funil gerado',
                          feito: !!mapeamentoOrigem && funilJaGerado(mapeamentoOrigem.status),
                        },
                        {
                          label: 'Revisão interna',
                          feito: !!mapeamentoOrigem && emOuAposRevisaoInterna(mapeamentoOrigem.status),
                        },
                        {
                          label: 'Apresentação preparada',
                          feito: !!mapeamentoOrigem && emOuAposProntoKickoff(mapeamentoOrigem.status),
                        },
                      ].map((item) => (
                        <li key={item.label} style={{ listStyle: 'none' }}>
                          <span className={`status-badge status-tone-${item.feito ? 'success' : 'warning'}`}>
                            {item.feito ? '✓' : '—'} {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {editando ? (
                    renderFormReuniao()
                  ) : reuniao ? (
                    <>
                      <div className="form-grid">
                        <p>
                          <strong>Título:</strong> {reuniao.titulo ?? '—'}
                        </p>
                        <p>
                          <strong>Data e horário:</strong>{' '}
                          {reuniao.data_hora ? formatarDataHoraLocal(reuniao.data_hora) : 'Não agendada'}
                        </p>
                        <p>
                          <strong>Consultor responsável:</strong>{' '}
                          {nomeConsultor(reuniao.consultor_responsavel_id, consultores) ?? '—'}
                        </p>
                        <p>
                          <strong>Participantes:</strong> {reuniao.participantes ?? '—'}
                        </p>
                        <p>
                          <strong>Link:</strong>{' '}
                          {reuniao.link ? (
                            <a href={reuniao.link} target="_blank" rel="noopener noreferrer">
                              {reuniao.link}
                            </a>
                          ) : (
                            '—'
                          )}
                        </p>
                      </div>
                      <div className="form-grid">
                        <p>
                          <strong>Ata:</strong> {reuniao.ata ?? '—'}
                        </p>
                        <p>
                          <strong>Resumo:</strong> {reuniao.resumo ?? '—'}
                        </p>
                        <p>
                          <strong>Decisões:</strong> {reuniao.decisoes ?? '—'}
                        </p>
                        <p>
                          <strong>Pendências do cliente:</strong> {reuniao.pendencias_cliente ?? '—'}
                        </p>
                        <p>
                          <strong>Pendências internas:</strong> {reuniao.pendencias_internas ?? '—'}
                        </p>
                        <p>
                          <strong>Próximos passos:</strong> {reuniao.proximos_passos ?? '—'}
                        </p>
                      </div>
                      {podeRemarcar && remarcandoReuniaoId !== reuniao.id && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-auto"
                          onClick={() => abrirRemarcacaoReuniao(reuniao)}
                        >
                          Remarcar
                        </button>
                      )}
                      {renderAtaDaReuniao(reuniao)}
                    </>
                  ) : (
                    <p className="field-hint">Ainda não agendada.</p>
                  )}

                  {reuniao && remarcandoReuniaoId === reuniao.id && renderFormRemarcacaoReuniao()}

                  {remarcacoesDaReuniao.length > 0 && (
                    <p className="field-hint">
                      Histórico de remarcação:{' '}
                      {remarcacoesDaReuniao
                        .map(
                          (rr) =>
                            `${rr.data_anterior ? formatarDataHoraLocal(rr.data_anterior) : '—'} → ${formatarDataHoraLocal(rr.data_nova)} (motivo: ${rr.motivo}, impacto: ${IMPACTO_RESPONSAVEL_LABELS[rr.responsavel_impacto]})`,
                        )
                        .join(' · ')}
                    </p>
                  )}
                </section>
              );
            })}

            {TIPOS_REUNIAO_AD_HOC.map((tipo) => {
              const reunioesDoTipo = [...reunioes]
                .filter((r) => r.tipo === tipo)
                .sort(
                  (a, b) =>
                    new Date(b.data_hora ?? b.created_at).getTime() - new Date(a.data_hora ?? a.created_at).getTime(),
                );
              const formAberto = editandoReuniaoTipo === tipo;

              return (
                <section key={tipo} className="card form-card">
                  <div className="page-header-actions page-header-actions-split">
                    <h2 style={{ marginBottom: 0 }}>{TIPO_REUNIAO_LABELS[tipo]}</h2>
                    {!formAberto && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-auto"
                        onClick={() => abrirFormReuniao(tipo, null)}
                      >
                        + Nova reunião
                      </button>
                    )}
                  </div>

                  {reunioesDoTipo.length === 0 ? (
                    <p className="field-hint">Nenhuma reunião registrada ainda.</p>
                  ) : (
                    <ul className="observacoes-lista">
                      {reunioesDoTipo.map((r) => {
                        const remarcacoesDaReuniao = reuniaoRemarcacoes.filter((rr) => rr.reuniao_id === r.id);
                        const podeRemarcar = r.data_hora && r.status !== 'realizada';
                        return (
                          <li key={r.id} className="observacao-item">
                            <div className="observacao-item-header">
                              <span className="observacao-item-meta">
                                <span className={`status-badge status-tone-${STATUS_REUNIAO_TONE[r.status]}`}>
                                  {STATUS_REUNIAO_LABELS[r.status]}
                                </span>{' '}
                                <strong style={{ color: 'var(--color-text)' }}>
                                  {r.titulo ?? TIPO_REUNIAO_LABELS[tipo]}
                                </strong>
                                {' · '}
                                {r.data_hora ? formatarDataHoraLocal(r.data_hora) : 'Não agendada'}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => abrirFormReuniao(tipo, r)}
                              >
                                Editar
                              </button>
                            </div>
                            {podeRemarcar && remarcandoReuniaoId !== r.id && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-auto"
                                onClick={() => abrirRemarcacaoReuniao(r)}
                              >
                                Remarcar
                              </button>
                            )}
                            {remarcandoReuniaoId === r.id && renderFormRemarcacaoReuniao()}
                            {renderAtaDaReuniao(r)}
                            {remarcacoesDaReuniao.length > 0 && (
                              <p className="field-hint">
                                Histórico de remarcação:{' '}
                                {remarcacoesDaReuniao
                                  .map(
                                    (rr) =>
                                      `${rr.data_anterior ? formatarDataHoraLocal(rr.data_anterior) : '—'} → ${formatarDataHoraLocal(rr.data_nova)} (motivo: ${rr.motivo}, impacto: ${IMPACTO_RESPONSAVEL_LABELS[rr.responsavel_impacto]})`,
                                  )
                                  .join(' · ')}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {formAberto && renderFormReuniao()}
                </section>
              );
            })}
          </>
        ))}

      {formPendenciaDeAcao && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Criar pendência a partir da ata">
          <form onSubmit={handleSalvarPendenciaDeAcao} className="card modal-card">
            <h2>Criar pendência</h2>
            <p className="field-hint">
              Origem: {TIPO_REUNIAO_LABELS[formPendenciaDeAcao.ata.tipo_reuniao as TipoReuniao] ?? formPendenciaDeAcao.ata.titulo ?? 'Ata'}
            </p>
            <label className="field">
              <span>Título</span>
              <input
                type="text"
                required
                value={formPendenciaDeAcao.titulo}
                onChange={(e) => setFormPendenciaDeAcao({ ...formPendenciaDeAcao, titulo: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Descrição</span>
              <textarea
                rows={2}
                value={formPendenciaDeAcao.descricao}
                onChange={(e) => setFormPendenciaDeAcao({ ...formPendenciaDeAcao, descricao: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                value={formPendenciaDeAcao.tipo}
                onChange={(e) =>
                  setFormPendenciaDeAcao({ ...formPendenciaDeAcao, tipo: e.target.value as ResponsavelTipoAcaoAta })
                }
              >
                {Object.entries(RESPONSAVEL_TIPO_ACAO_LABELS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            {formPendenciaDeAcao.tipo === 'interna' && (
              <label className="field">
                <span>Responsável</span>
                <select
                  value={formPendenciaDeAcao.consultor_responsavel_id}
                  onChange={(e) =>
                    setFormPendenciaDeAcao({ ...formPendenciaDeAcao, consultor_responsavel_id: e.target.value })
                  }
                >
                  <option value="">
                    {formPendenciaDeAcao.acao.responsavel_nome
                      ? `Sugestão da ata: ${formPendenciaDeAcao.acao.responsavel_nome} (selecione o consultor)`
                      : 'Sem responsável'}
                  </option>
                  {consultores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formPendenciaDeAcao.tipo === 'cliente' && formPendenciaDeAcao.acao.responsavel_nome && (
              <p className="field-hint">Responsável sugerido pela ata: {formPendenciaDeAcao.acao.responsavel_nome}</p>
            )}
            <label className="field">
              <span>Prazo</span>
              <input
                type="date"
                value={formPendenciaDeAcao.prazo}
                onChange={(e) => setFormPendenciaDeAcao({ ...formPendenciaDeAcao, prazo: e.target.value })}
              />
            </label>
            <div className="wizard-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFormPendenciaDeAcao(null)}
                disabled={salvandoPendenciaDeAcao}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvandoPendenciaDeAcao}>
                {salvandoPendenciaDeAcao ? 'Criando…' : 'Criar pendência'}
              </button>
            </div>
          </form>
        </div>
      )}

      {aba === 'template' && implementacao && (
        <>
          <section className="card">
            <div className="page-header-actions page-header-actions-split">
              <h2 style={{ marginBottom: 0 }}>Template aplicado</h2>
              <button type="button" className="btn btn-secondary btn-auto" onClick={() => setMostrarAplicarTemplate(true)}>
                {implementacao.template_aplicado_id ? 'Aplicar outro template' : 'Aplicar template'}
              </button>
            </div>
            {implementacao.template_aplicado_id ? (
              <p className="field-hint">
                <strong style={{ color: 'var(--color-text)' }}>{implementacao.template_aplicado_nome}</strong> · v
                {implementacao.template_aplicado_versao}
                {implementacao.template_aplicado_em ? ` · aplicado em ${formatarDataHoraLocal(implementacao.template_aplicado_em)}` : ''}
              </p>
            ) : (
              <p className="field-hint">Nenhum template foi aplicado nesta implementação.</p>
            )}
          </section>

          {templateCamposCrm.length > 0 && (
            <section className="card">
              <h2>Campos CRM recomendados</h2>
              <p className="field-hint">
                Só referência — nenhum campo é criado automaticamente no Kommo. Revise e configure manualmente.
              </p>
              <div className="table-wrap">
                <table className="data-table data-table-cards-mobile">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Entidade</th>
                      <th>Tipo</th>
                      <th>Obrigatório</th>
                      <th>Quando usar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateCamposCrm.map((c) => (
                      <tr key={c.id}>
                        <td data-label="Nome">{c.nome}</td>
                        <td data-label="Entidade">{c.entidade}</td>
                        <td data-label="Tipo">{c.tipo}</td>
                        <td data-label="Obrigatório">{c.obrigatorio ? 'Sim' : 'Não'}</td>
                        <td data-label="Quando usar">{c.quando_usar ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {templateAutomacoes.length > 0 && (
            <section className="card">
              <h2>Automações sugeridas</h2>
              <p className="field-hint">
                Modelos pra revisão — nenhuma automação é implantada automaticamente no Kommo.
              </p>
              <ul className="observacoes-lista">
                {templateAutomacoes.map((a) => (
                  <li key={a.id} className="observacao-item">
                    <strong style={{ color: 'var(--color-text)' }}>{a.nome}</strong>
                    {a.objetivo && <p className="field-hint">{a.objetivo}</p>}
                    <p className="field-hint">
                      {a.gatilho ? `Gatilho: ${a.gatilho}` : ''}
                      {a.condicao ? ` · Condição: ${a.condicao}` : ''}
                      {a.acao ? ` · Ação: ${a.acao}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card form-card">
            <h2>Documentos esperados</h2>
            {documentosTemplate.length === 0 ? (
              <div className="empty-state">
                <p>Nenhum documento clonado de template nesta implementação.</p>
              </div>
            ) : (
              <ul className="observacoes-lista">
                {documentosTemplate.map((d) => (
                  <li key={d.id} className="observacao-item">
                    <div className="observacao-item-header">
                      <span className="observacao-item-meta">
                        <span className={`status-badge status-tone-${d.nao_aplicavel ? 'neutral' : d.entregue ? 'success' : 'warning'}`}>
                          {d.nao_aplicavel ? 'Não se aplica' : d.entregue ? 'Entregue' : 'Pendente'}
                        </span>{' '}
                        <strong style={{ color: 'var(--color-text)' }}>{d.nome}</strong>
                        {d.obrigatorio && !d.nao_aplicavel ? ' · obrigatório' : ''}
                        {d.fase ? ` · ${d.fase}` : ''}
                      </span>
                      <span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-auto"
                          onClick={() => handleAlternarDocumentoEntregue(d)}
                        >
                          {d.entregue ? 'Marcar pendente' : 'Marcar entregue'}
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-danger btn-auto"
                          onClick={() => handleExcluirDocumentoTemplate(d)}
                        >
                          Excluir
                        </button>
                      </span>
                    </div>
                    {d.descricao && <p className="field-hint">{d.descricao}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mostrarAplicarTemplate && (
            <AplicarTemplateModal
              implementacaoId={implementacao.id}
              implementacaoExistente
              onConcluido={() => {
                setMostrarAplicarTemplate(false);
                carregar(implementacao.id);
              }}
              onFechar={() => setMostrarAplicarTemplate(false)}
            />
          )}

          <section className="card form-card">
            <h2>Reuniões esperadas</h2>
            <p className="field-hint">
              Só a expectativa operacional do template — a reunião de verdade continua sendo agendada na aba
              "Reuniões".
            </p>
            {reunioesEsperadas.length === 0 ? (
              <div className="empty-state">
                <p>Nenhuma reunião esperada clonada de template nesta implementação.</p>
              </div>
            ) : (
              <ul className="observacoes-lista">
                {reunioesEsperadas.map((r) => (
                  <li key={r.id} className="observacao-item">
                    <div className="observacao-item-header">
                      <span className="observacao-item-meta">
                        {r.nao_aplicavel && <span className="status-badge status-tone-neutral">Não se aplica</span>}{' '}
                        <strong style={{ color: 'var(--color-text)' }}>{TIPO_REUNIAO_LABELS[r.tipo]}</strong>
                        {r.obrigatoria && !r.nao_aplicavel ? ' · obrigatória' : ''}
                        {r.ciclo ? ` · ${r.ciclo}` : ''}
                        {r.dia_recomendado != null ? ` · dia ${r.dia_recomendado}` : ''}
                      </span>
                      <span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-auto"
                          onClick={() => handleMarcarReuniaoEsperadaNaoAplicavel(r)}
                        >
                          {r.nao_aplicavel ? 'Reverter' : 'Não se aplica'}
                        </button>{' '}
                        <button type="button" className="btn btn-danger btn-auto" onClick={() => handleExcluirReuniaoEsperada(r)}>
                          Excluir
                        </button>
                      </span>
                    </div>
                    {r.objetivo && <p className="field-hint">{r.objetivo}</p>}
                    {r.pauta_padrao.length > 0 && (
                      <p className="field-hint">Pauta padrão: {r.pauta_padrao.join(' · ')}</p>
                    )}
                    {r.nao_aplicavel && r.nao_aplicavel_justificativa && (
                      <p className="field-hint">Justificativa: {r.nao_aplicavel_justificativa}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(['entrega', 'adocao'] as const).map((tipo) => {
            const lista = criteriosTemplate.filter((c) => c.tipo === tipo);
            return (
              <section className="card form-card" key={tipo}>
                <h2>Critérios de {TIPO_CRITERIO_TEMPLATE_LABELS[tipo]} (do template)</h2>
                {tipo === 'adocao' && (
                  <p className="field-hint">Nunca bloqueiam a conclusão técnica da implementação.</p>
                )}
                {lista.length === 0 ? (
                  <div className="empty-state">
                    <p>Nenhum critério de {TIPO_CRITERIO_TEMPLATE_LABELS[tipo].toLowerCase()} clonado de template.</p>
                  </div>
                ) : (
                  <ul className="observacoes-lista">
                    {lista.map((c) => (
                      <li key={c.id} className="observacao-item">
                        <div className="observacao-item-header">
                          <span className="observacao-item-meta">
                            <span className={`status-badge status-tone-${STATUS_CRITERIO_TONE[c.status]}`}>
                              {STATUS_CRITERIO_LABELS[c.status]}
                            </span>{' '}
                            <strong style={{ color: 'var(--color-text)' }}>{c.titulo}</strong>
                          </span>
                          <span>
                            <select
                              value={c.status}
                              onChange={(e) =>
                                handleAtualizarStatusCriterioTemplate(c, e.target.value as StatusCriterioEntrega)
                              }
                            >
                              {Object.entries(STATUS_CRITERIO_LABELS).map(([valor, rotulo]) => (
                                <option key={valor} value={valor}>
                                  {rotulo}
                                </option>
                              ))}
                            </select>{' '}
                            <button type="button" className="btn btn-danger btn-auto" onClick={() => handleExcluirCriterioTemplate(c)}>
                              Excluir
                            </button>
                          </span>
                        </div>
                        {c.descricao && <p className="field-hint">{c.descricao}</p>}
                        {c.evidencia_esperada && <p className="field-hint">Evidência esperada: {c.evidencia_esperada}</p>}
                        {c.status === 'nao_se_aplica' && c.justificativa_nao_aplica && (
                          <p className="field-hint">Justificativa: {c.justificativa_nao_aplica}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
