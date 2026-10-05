import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { resolverAcaoOperacional, type AcaoOperacional } from '../lib/acaoOperacional';
import { inicioDoDia } from '../lib/agendaImplementacao';
import {
  bucketDeItem,
  construirAgendaOperacional,
  TIPO_ITEM_AGENDA_LABELS,
  type BucketAgenda,
  type ItemAgendaOperacional,
  type TipoItemAgenda,
} from '../lib/agendaOperacional';
import { STATUS_ATA_LABELS } from '../lib/atasIntegracao';
import { construirMapaConfiguracoes } from '../lib/configuracaoImplementacao';
import {
  construirAlertas,
  construirResumoClientes,
  estaAtrasado,
  prazoLabelDe,
  SAUDE_LABELS,
  SAUDE_TONE,
  type AlertaOperacao,
  type ClienteResumo,
  type SaudeCliente,
} from '../lib/operacaoResumo';
import { alertaReuniaoObrigatoria, TIPO_REUNIAO_LABELS, TIPOS_REUNIAO_OBRIGATORIOS } from '../lib/reunioes';
import { MAPEAMENTO_STATUS_LABELS } from '../lib/statusFluxo';
import { supabase } from '../lib/supabaseClient';
import { STATUS_TRIAL_TONE } from '../lib/trialKommo';
import type {
  AtaReuniao,
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  ClienteOcorrencia,
  ConfiguracaoImplementacao,
  Consultor,
  EntregaAceite,
  ImplementacaoCrm,
  ImplementacaoSettingsSnapshot,
  ImplementacaoStatusHistorico,
  Mapeamento,
  RelatorioImplementacao,
  Reuniao,
  TipoReuniao,
} from '../types/database';

const MAX_ATENCAO_VISIVEL = 5;
const MAX_CARTEIRA_VISIVEL = 9;
const MAX_PROXIMOS_COMPROMISSOS = 3;

const PESO_SAUDE: Record<SaudeCliente, number> = {
  critico: 0,
  atencao: 1,
  aguardando_cliente: 2,
  normal: 3,
  concluido: 4,
};

// Contexto de prazo pra cada alerta — evita o caso descrito na seção 11: um
// prazo geral da implementação (ex: "32d restantes") ao lado de um alerta
// de reunião não agendada passa a impressão errada de que esses 32 dias são
// o prazo pra agendar a reunião. Pra esse motivo específico, troca por um
// dado que já existe (ciclo atual) em vez do prazo geral; os demais alertas
// continuam usando prazoLabel normalmente (lá ele É a informação certa).
function contextoPrazoAlerta(alerta: AlertaOperacao, resumo: ClienteResumo | undefined): string | null {
  if (alerta.motivo.includes('Reunião obrigatória')) {
    return resumo?.diaCiclo?.ciclo ? `Ciclo atual: ${resumo.diaCiclo.ciclo.nome}` : null;
  }
  return alerta.prazoLabel;
}

function compararPrioridadeCarteira(a: ClienteResumo, b: ClienteResumo): number {
  const pa = PESO_SAUDE[a.saude];
  const pb = PESO_SAUDE[b.saude];
  if (pa !== pb) return pa - pb;

  const aAtrasado = estaAtrasado(a);
  const bAtrasado = estaAtrasado(b);
  if (aAtrasado !== bAtrasado) return aAtrasado ? -1 : 1;

  const diasA = a.trial?.diasRestantes ?? Infinity;
  const diasB = b.trial?.diasRestantes ?? Infinity;
  if (diasA !== diasB) return diasA - diasB;

  return a.cliente.nome_empresa.localeCompare(b.cliente.nome_empresa, 'pt-BR');
}

function saudacaoPorHorario(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function contarPorTipo(itens: ItemAgendaOperacional[]): Partial<Record<TipoItemAgenda, number>> {
  const contagem: Partial<Record<TipoItemAgenda, number>> = {};
  for (const item of itens) {
    contagem[item.tipo] = (contagem[item.tipo] ?? 0) + 1;
  }
  return contagem;
}

// Resumo contado por tipo (seção 12: "2 reuniões · 1 pendência vence"), não
// a lista completa — usado pra Amanhã/Próximos 7 dias dentro da Agenda
// rápida.
function resumoContagemPorTipo(itens: ItemAgendaOperacional[]): string[] {
  const contagem = contarPorTipo(itens);
  const partes: string[] = [];
  if (contagem.reuniao) partes.push(`${contagem.reuniao} reunião(ões)`);
  if (contagem.trial) partes.push(`${contagem.trial} Trial(s)`);
  const pendencias = (contagem.pendencia_cliente ?? 0) + (contagem.pendencia_interna ?? 0);
  if (pendencias) partes.push(`${pendencias} pendência(s)`);
  if (contagem.tarefa) partes.push(`${contagem.tarefa} atividade(s)`);
  if (contagem.alerta) partes.push(`${contagem.alerta} alerta(s)`);
  return partes;
}

// "Nd restantes"/"Nd atrasado" já vem de prazoLabelDe (fonte oficial) — só
// troca a fraseação dos dois casos mais confundíveis (seção 22), sem
// recalcular nada.
function prazoHumanizado(resumo: ClienteResumo): string | null {
  const label = prazoLabelDe(resumo);
  if (label === '0d restantes') return 'vence hoje';
  if (label === '1d restantes') return 'vence amanhã';
  return label;
}

function trialHumanizado(diasRestantes: number): string {
  if (diasRestantes === 0) return 'Expira hoje';
  if (diasRestantes === 1) return 'Expira amanhã';
  return `${diasRestantes}d`;
}

function diaCicloLabel(resumo: ClienteResumo): string {
  if (!resumo.diaCiclo) return 'Kickoff pendente';
  return resumo.diaCiclo.ciclo
    ? `Dia ${resumo.diaCiclo.dia}/${resumo.duracaoTotalDias} · ${resumo.diaCiclo.ciclo.nome}`
    : `Dia ${resumo.diaCiclo.dia}/${resumo.duracaoTotalDias}`;
}

function diferencaEmDiasLocal(depois: Date, antes: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const d = inicioDoDia(depois).getTime() - inicioDoDia(antes).getTime();
  return Math.round(d / MS_POR_DIA);
}

function rotuloDiaRelativo(data: Date, hoje: Date): string {
  const dias = diferencaEmDiasLocal(data, hoje);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type ItemDecisao = {
  id: string;
  clienteId: string;
  clienteNome: string;
  motivo: string;
  acaoLabel: string;
  to: string;
};

// Formato da linha de ata_acoes_identificadas quando embeda atas_reuniao
// via FK (select com `atas_reuniao(...)` do PostgREST).
type AcaoPendenteComAta = {
  ata_id: string;
  atas_reuniao: { cliente_id: string | null; implementacao_id: string | null; titulo: string | null } | null;
};

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [statusRows, setStatusRows] = useState<AtividadeStatusRow[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<ClienteOcorrencia[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [configGlobal, setConfigGlobal] = useState<ConfiguracaoImplementacao | null>(null);
  const [snapshots, setSnapshots] = useState<ImplementacaoSettingsSnapshot[]>([]);
  const [atasPendentes, setAtasPendentes] = useState<AtaReuniao[]>([]);
  const [relatoriosEntrega, setRelatoriosEntrega] = useState<RelatorioImplementacao[]>([]);
  const [aceitesEntrega, setAceitesEntrega] = useState<EntregaAceite[]>([]);
  const [souAdministrador, setSouAdministrador] = useState(false);

  const [mostrarTodaAtencao, setMostrarTodaAtencao] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      const [
        { data: clientesData, error: clientesError },
        { data: mapeamentosData },
        { data: implementacoesData },
        { data: historicoData },
        { data: atividadesData },
        { data: statusRowsData },
        { data: consultoresData },
        { data: ocorrenciasData },
        { data: reunioesData },
        { data: configGlobalData },
        { data: snapshotsData },
        { data: atasData },
        { data: relatoriosData },
        { data: aceitesData },
      ] = await Promise.all([
        supabase.from('clientes').select('*'),
        supabase.from('mapeamentos').select('*'),
        supabase.from('implementacoes_crm').select('*'),
        supabase.from('implementacao_status_historico').select('*'),
        supabase.from('atividades_cronograma').select('*'),
        supabase.from('atividades_status').select('*'),
        supabase.from('consultores').select('*').order('nome', { ascending: true }),
        supabase.from('cliente_ocorrencias').select('*').eq('status', 'aberta'),
        supabase.from('reunioes').select('*'),
        supabase.from('configuracoes_implementacao').select('*').eq('id', true).maybeSingle(),
        supabase.from('implementacao_settings_snapshot').select('*'),
        // "Precisa da sua decisão" — mesma tabela/status já usados na seção
        // "Ata" da implementação (ImplementacaoDetalhe).
        supabase.from('atas_reuniao').select('*').in('status', ['requer_revisao', 'erro_vinculo']),
        // Ação contextual de entrega (seções 18-20): mesmas tabelas oficiais
        // já usadas no módulo de Relatórios/Entrega.
        supabase.from('relatorios_implementacao').select('*').eq('tipo', 'entrega_final'),
        supabase.from('entregas_aceite').select('*'),
      ]);

      if (cancelled) return;

      if (clientesError) {
        setError(clientesError.message);
        setLoading(false);
        return;
      }

      setClientes(clientesData ?? []);
      setMapeamentos(mapeamentosData ?? []);
      setImplementacoes(implementacoesData ?? []);
      setHistorico(historicoData ?? []);
      setAtividades(atividadesData ?? []);
      setStatusRows(statusRowsData ?? []);
      setConsultores(consultoresData ?? []);
      setOcorrenciasAbertas(ocorrenciasData ?? []);
      setReunioes(reunioesData ?? []);
      setConfigGlobal(configGlobalData ?? null);
      setSnapshots(snapshotsData ?? []);
      setAtasPendentes(atasData ?? []);
      setRelatoriosEntrega(relatoriosData ?? []);
      setAceitesEntrega(aceitesData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
  }, [user]);

  // Configurações (Fase 1): regras vigentes por cliente — snapshot do
  // Kickoff se já existir, senão a configuração global.
  const configuracoesPorCliente = useMemo(
    () => construirMapaConfiguracoes(clientes.map((c) => c.id), snapshots, configGlobal),
    [clientes, snapshots, configGlobal],
  );

  const resumos = useMemo(
    () =>
      construirResumoClientes({
        clientes,
        mapeamentos,
        implementacoes,
        historico,
        atividades,
        statusRows,
        consultores,
        reunioes,
        hoje,
        configuracoesPorCliente,
      }),
    [clientes, mapeamentos, implementacoes, historico, atividades, statusRows, consultores, reunioes, hoje, configuracoesPorCliente],
  );

  const resumoPorCliente = useMemo(() => {
    const mapa = new Map<string, ClienteResumo>();
    for (const r of resumos) mapa.set(r.cliente.id, r);
    return mapa;
  }, [resumos]);

  const ocorrenciaPorCliente = useMemo(() => {
    const mapa = new Map<string, ClienteOcorrencia>();
    for (const o of ocorrenciasAbertas) if (!mapa.has(o.cliente_id)) mapa.set(o.cliente_id, o);
    return mapa;
  }, [ocorrenciasAbertas]);

  // Qual tipo de reunião obrigatória está pendente pra cada cliente — mesma
  // função oficial usada dentro de construirResumoClientes pra decidir o
  // booleano reuniaoObrigatoriaPendente, só chamada de novo aqui (sem
  // reimplementar a regra) pra descobrir QUAL tipo é, e poder pré-preencher
  // o formulário de agendamento (seção 9/26).
  const tipoReuniaoPendentePorCliente = useMemo(() => {
    const mapa = new Map<string, TipoReuniao>();
    for (const cliente of clientes) {
      if (!cliente.kickoff_realizado_em) continue;
      const config = configuracoesPorCliente.get(cliente.id);
      const reunioesDoCliente = reunioes.filter((r) => r.cliente_id === cliente.id);
      const tipoPendente = TIPOS_REUNIAO_OBRIGATORIOS.find(
        (tipo) =>
          alertaReuniaoObrigatoria({
            tipo,
            reunioesDoTipo: reunioesDoCliente.filter((r) => r.tipo === tipo),
            kickoffRealizadoEm: cliente.kickoff_realizado_em,
            hoje,
            ciclos: config?.ciclos,
          }) != null,
      );
      if (tipoPendente) mapa.set(cliente.id, tipoPendente);
    }
    return mapa;
  }, [clientes, reunioes, hoje, configuracoesPorCliente]);

  const relatorioEntregaFinalPorImplementacao = useMemo(() => {
    const mapa = new Map<string, RelatorioImplementacao>();
    for (const r of relatoriosEntrega) {
      const atual = mapa.get(r.implementacao_id);
      if (!atual || r.versao > atual.versao) mapa.set(r.implementacao_id, r);
    }
    return mapa;
  }, [relatoriosEntrega]);

  const aceitePorImplementacao = useMemo(() => {
    const mapa = new Map<string, EntregaAceite>();
    for (const a of aceitesEntrega) {
      const atual = mapa.get(a.implementacao_id);
      if (!atual || new Date(a.created_at).getTime() > new Date(atual.created_at).getTime()) {
        mapa.set(a.implementacao_id, a);
      }
    }
    return mapa;
  }, [aceitesEntrega]);

  // Resolvedor central (seção 3) — usado por todo CTA da Home: cards de
  // atenção, "Precisa da sua decisão" (quando aplicável) e a coluna
  // "Próxima ação" da carteira. Uma única árvore de prioridade, nenhuma
  // regra nova — só traduz o que operacaoResumo.ts/trialKommo.ts/entrega já
  // calcularam.
  const acaoPorCliente = useMemo(() => {
    const mapa = new Map<string, AcaoOperacional>();
    for (const r of resumos) {
      mapa.set(
        r.cliente.id,
        resolverAcaoOperacional({
          resumo: r,
          ocorrenciaDoCliente: ocorrenciaPorCliente.get(r.cliente.id) ?? null,
          tipoReuniaoPendente: tipoReuniaoPendentePorCliente.get(r.cliente.id) ?? null,
          relatorioEntregaFinal: r.implementacao
            ? (relatorioEntregaFinalPorImplementacao.get(r.implementacao.id) ?? null)
            : null,
          aceiteEntrega: r.implementacao ? (aceitePorImplementacao.get(r.implementacao.id) ?? null) : null,
        }),
      );
    }
    return mapa;
  }, [resumos, ocorrenciaPorCliente, tipoReuniaoPendentePorCliente, relatorioEntregaFinalPorImplementacao, aceitePorImplementacao]);

  // Fonte oficial de "atenção necessária" — já vem ordenada por severidade
  // (crítico primeiro). Nenhuma regra nova aqui.
  const alertas = useMemo(
    () => construirAlertas(resumos, hoje, ocorrenciasAbertas),
    [resumos, hoje, ocorrenciasAbertas],
  );

  const alertasVisiveis = mostrarTodaAtencao ? alertas : alertas.slice(0, MAX_ATENCAO_VISIVEL);

  // Seção 9 — explica a diferença entre "clientes em risco" (saúde
  // atencao/critico) e "itens de atenção" (um alerta pode existir mesmo
  // pra cliente com saúde normal/aguardando, ex: formulário sem resposta).
  // Só uma leitura cruzada dos dois campos oficiais já existentes.
  const resumoDaAtencao = useMemo(() => {
    let criticos = 0;
    let atencaoComRisco = 0;
    let pendenciasOperacionais = 0;
    for (const a of alertas) {
      if (a.severidade === 'critico') {
        criticos += 1;
        continue;
      }
      const r = resumoPorCliente.get(a.clienteId);
      if (r && (r.saude === 'atencao' || r.saude === 'critico')) atencaoComRisco += 1;
      else pendenciasOperacionais += 1;
    }
    const partes: string[] = [];
    if (criticos) partes.push(`${criticos} crítico`);
    if (atencaoComRisco) partes.push(`${atencaoComRisco} atenção`);
    if (pendenciasOperacionais) partes.push(`${pendenciasOperacionais} pendência(s) operacional(is)`);
    return partes.join(' · ');
  }, [alertas, resumoPorCliente]);

  // P1-A6: mesma fonte de agenda usada na página Agenda — nunca uma segunda
  // regra paralela pra "o que precisa ser feito hoje".
  const agendaOperacional = useMemo(
    () =>
      construirAgendaOperacional({
        clientes,
        mapeamentosVendas: mapeamentos.filter((m) => m.tipo === 'vendas'),
        mapeamentosPosVenda: mapeamentos.filter((m) => m.tipo === 'pos_venda'),
        implementacoes,
        atividades,
        atividadesStatus: statusRows,
        historico,
        consultores,
        ocorrenciasAbertas,
        reunioes,
        hoje,
        configuracoesPorCliente,
      }),
    [
      clientes,
      mapeamentos,
      implementacoes,
      atividades,
      statusRows,
      historico,
      consultores,
      ocorrenciasAbertas,
      reunioes,
      hoje,
      configuracoesPorCliente,
    ],
  );

  const itensPorBucket = useMemo(() => {
    const mapa = new Map<BucketAgenda, ItemAgendaOperacional[]>();
    for (const item of agendaOperacional) {
      const bucket = bucketDeItem(item, hoje);
      if (!mapa.has(bucket)) mapa.set(bucket, []);
      mapa.get(bucket)!.push(item);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0));
    }
    return mapa;
  }, [agendaOperacional, hoje]);

  const itensHoje = useMemo(
    () => [...(itensPorBucket.get('atrasados') ?? []), ...(itensPorBucket.get('hoje') ?? [])],
    [itensPorBucket],
  );
  const itensAmanha = itensPorBucket.get('amanha') ?? [];
  const itensProximos7 = itensPorBucket.get('proximos7') ?? [];

  // Seção 24 — até 3 próximas reuniões já agendadas (fonte: módulo de
  // Reuniões, igual já era usado antes da versão anterior deste redesenho).
  const proximasReunioes = useMemo(
    () =>
      reunioes
        .filter((r) => r.status === 'agendada' && r.data_hora && new Date(r.data_hora).getTime() >= hoje.getTime())
        .sort((a, b) => new Date(a.data_hora!).getTime() - new Date(b.data_hora!).getTime())
        .slice(0, MAX_PROXIMOS_COMPROMISSOS),
    [reunioes, hoje],
  );

  const [acoesPendentesComAta, setAcoesPendentesComAta] = useState<AcaoPendenteComAta[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function carregarAcoesPendentes() {
      const { data } = await supabase
        .from('ata_acoes_identificadas')
        .select('ata_id, atas_reuniao(cliente_id, implementacao_id, titulo)')
        .eq('status', 'pendente_revisao');
      if (cancelled) return;
      setAcoesPendentesComAta((data as unknown as AcaoPendenteComAta[]) ?? []);
    }

    carregarAcoesPendentes();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // "Precisa da sua decisão" (seção 14) — situações que exigem uma decisão
  // humana, não apenas um alerta automático: atas aguardando vínculo
  // manual, atas já vinculadas com ações ainda não revisadas, e funis com
  // ajustes solicitados pelo cliente (aguardando o time revisar). Todos já
  // são estados oficiais existentes — nenhuma regra nova.
  const itensDecisao = useMemo(() => {
    const itens: ItemDecisao[] = [];

    for (const ata of atasPendentes) {
      if (!ata.cliente_id) continue;
      const cliente = clientes.find((c) => c.id === ata.cliente_id);
      if (!cliente) continue;
      itens.push({
        id: `vinculo:${ata.id}`,
        clienteId: cliente.id,
        clienteNome: cliente.nome_empresa,
        motivo: `Ata "${ata.titulo ?? 'sem título'}" — ${STATUS_ATA_LABELS[ata.status]}`,
        acaoLabel: 'Vincular ata',
        to: ata.implementacao_id
          ? `/implementacoes/${ata.implementacao_id}?aba=reunioes`
          : `/clientes/${cliente.id}?aba=reunioes`,
      });
    }

    const contagemPorCliente = new Map<string, { implementacaoId: string | null; quantidade: number }>();
    for (const row of acoesPendentesComAta) {
      const ataInfo = row.atas_reuniao;
      if (!ataInfo?.cliente_id) continue;
      const atual = contagemPorCliente.get(ataInfo.cliente_id);
      contagemPorCliente.set(ataInfo.cliente_id, {
        implementacaoId: ataInfo.implementacao_id,
        quantidade: (atual?.quantidade ?? 0) + 1,
      });
    }
    for (const [clienteId, info] of contagemPorCliente) {
      const cliente = clientes.find((c) => c.id === clienteId);
      if (!cliente) continue;
      itens.push({
        id: `revisao:${clienteId}`,
        clienteId,
        clienteNome: cliente.nome_empresa,
        motivo: `${info.quantidade} ação(ões) de ata aguardando revisão`,
        acaoLabel: 'Revisar ações',
        to: info.implementacaoId
          ? `/implementacoes/${info.implementacaoId}?aba=reunioes`
          : `/clientes/${clienteId}?aba=reunioes`,
      });
    }

    for (const mapa of mapeamentos) {
      if (mapa.status !== 'ajustes_solicitados' || !mapa.cliente_id) continue;
      const cliente = clientes.find((c) => c.id === mapa.cliente_id);
      if (!cliente) continue;
      itens.push({
        id: `funil:${mapa.id}`,
        clienteId: cliente.id,
        clienteNome: cliente.nome_empresa,
        motivo: `Funil com ${MAPEAMENTO_STATUS_LABELS[mapa.status].toLowerCase()} pelo cliente`,
        acaoLabel: 'Revisar funil',
        to: `/mapeamento/${mapa.id}`,
      });
    }

    // Entrega gerada mas ainda não marcada como final (seção 30 — "Entrega
    // aguardando revisão → Revisar entrega") — mesmo estado oficial já lido
    // acima pro resolvedor de "Próxima ação", só filtrado aqui por quem
    // ainda não tem aceite registrado.
    for (const relatorio of relatoriosEntrega) {
      if (relatorio.status !== 'gerado' || !relatorio.cliente_id) continue;
      if (aceitePorImplementacao.has(relatorio.implementacao_id)) continue;
      const cliente = clientes.find((c) => c.id === relatorio.cliente_id);
      if (!cliente) continue;
      itens.push({
        id: `entrega:${relatorio.id}`,
        clienteId: cliente.id,
        clienteNome: cliente.nome_empresa,
        motivo: 'Relatório de entrega final gerado, aguardando revisão antes de apresentar',
        acaoLabel: 'Revisar entrega',
        to: `/implementacoes/${relatorio.implementacao_id}/entrega`,
      });
    }

    // Pendência sem responsável definido (seção 30 — "Pendência sem
    // responsável → Definir responsável") — campo já existente
    // (consultor_responsavel_id), nenhuma regra nova.
    for (const ocorrencia of ocorrenciasAbertas) {
      if (ocorrencia.consultor_responsavel_id) continue;
      const cliente = clientes.find((c) => c.id === ocorrencia.cliente_id);
      if (!cliente) continue;
      itens.push({
        id: `responsavel:${ocorrencia.id}`,
        clienteId: cliente.id,
        clienteNome: cliente.nome_empresa,
        motivo: `Pendência sem responsável: ${ocorrencia.descricao}`,
        acaoLabel: 'Definir responsável',
        to: `/clientes/${cliente.id}?aba=resumo`,
      });
    }

    return itens;
  }, [atasPendentes, acoesPendentesComAta, mapeamentos, relatoriosEntrega, aceitePorImplementacao, ocorrenciasAbertas, clientes]);

  const kpis = useMemo(
    () => ({
      clientesAtivos: resumos.filter((r) => r.saude !== 'concluido').length,
      implementacoesEmAndamento: implementacoes.filter((i) => !['concluida', 'cancelada'].includes(i.status)).length,
      clientesEmRisco: resumos.filter((r) => r.saude === 'atencao' || r.saude === 'critico').length,
      acoesHoje: itensHoje.length,
    }),
    [resumos, implementacoes, itensHoje],
  );

  const meuConsultor = useMemo(() => consultores.find((c) => c.user_id === user?.id) ?? null, [consultores, user]);

  // "Minha carteira" (seção 18/20) — os clientes mais relevantes primeiro
  // (risco → atraso → Trial perto de vencer), vista reduzida; a lista
  // completa com filtros vive em /clientes (seção 19).
  const carteiraResumida = useMemo(
    () => [...resumos].sort(compararPrioridadeCarteira).slice(0, MAX_CARTEIRA_VISIVEL),
    [resumos],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Operação CRM</h1>
          <p className="field-hint">
            Acompanhe o que exige atenção, os próximos compromissos e as ações prioritárias da sua
            carteira.
          </p>
          {meuConsultor && (
            <p className="field-hint ops-saudacao">
              {saudacaoPorHorario(new Date().getHours())}, {meuConsultor.nome.split(' ')[0]}.
            </p>
          )}
        </div>
        <Link to="/clientes/novo" className="btn btn-primary">
          + Novo cliente
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && clientes.length === 0 && (
        <div className="empty-state">
          <p>Você ainda não cadastrou nenhum cliente.</p>
          <Link to="/clientes/novo" className="btn btn-primary">
            Cadastrar o primeiro cliente
          </Link>
        </div>
      )}

      {!loading && clientes.length > 0 && (
        <>
          <div className="ops-kpi-grid ops-kpi-grid-compact">
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.clientesAtivos}</span>
              <span className="ops-kpi-label">Clientes ativos</span>
            </div>
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.implementacoesEmAndamento}</span>
              <span className="ops-kpi-label">Em implementação</span>
            </div>
            <div className={`ops-kpi-card ops-kpi-card-compact${kpis.clientesEmRisco > 0 ? ' ops-kpi-card-risco' : ''}`}>
              <span className="ops-kpi-value">{kpis.clientesEmRisco}</span>
              <span className="ops-kpi-label">Em risco</span>
            </div>
            <div className="ops-kpi-card ops-kpi-card-compact">
              <span className="ops-kpi-value">{kpis.acoesHoje}</span>
              <span className="ops-kpi-label">Ações para hoje</span>
            </div>
          </div>

          <div className="ops-cockpit-grid">
            <section className="ops-section ops-attention-section">
              <div className="ops-section-head">
                <h2>Precisa da sua atenção</h2>
                <span className="ops-section-count">{alertas.length}</span>
              </div>
              {alertas.length === 0 ? (
                <p className="ops-empty-hint">Tudo sob controle por enquanto.</p>
              ) : (
                <>
                  {resumoDaAtencao && <p className="ops-breakdown-line">{resumoDaAtencao}</p>}
                  <ul className="ops-alert-list ops-alert-list-static">
                    {alertasVisiveis.map((a) => (
                      <AlertaCard
                        key={`${a.clienteId}-${a.motivo}`}
                        alerta={a}
                        resumo={resumoPorCliente.get(a.clienteId)}
                        acao={acaoPorCliente.get(a.clienteId) ?? { label: 'Ver detalhes', to: `/clientes/${a.clienteId}?aba=resumo`, tipo: 'detalhes' }}
                      />
                    ))}
                  </ul>
                  {!mostrarTodaAtencao && alertas.length > MAX_ATENCAO_VISIVEL && (
                    <button type="button" className="btn btn-ghost btn-auto" onClick={() => setMostrarTodaAtencao(true)}>
                      Ver todos os {alertas.length} itens
                    </button>
                  )}
                </>
              )}
            </section>

            <aside className="ops-side-column">
              {itensDecisao.length > 0 && (
                <section className="ops-section ops-decision-section">
                  <div className="ops-section-head">
                    <h2>Precisa da sua decisão</h2>
                    <span className="ops-section-count">{itensDecisao.length}</span>
                  </div>
                  <ul className="ops-decision-list">
                    {itensDecisao.map((d) => (
                      <li key={d.id} className="ops-decision-item">
                        <Link to={`/clientes/${d.clienteId}`}>{d.clienteNome}</Link>
                        <p className="field-hint">{d.motivo}</p>
                        <Link to={d.to} className="btn btn-secondary btn-auto">
                          {d.acaoLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="ops-section ops-agenda-rapida">
                <div className="ops-section-head">
                  <h2>Agenda rápida</h2>
                </div>

                <div className="ops-agenda-bloco">
                  <h3>Hoje</h3>
                  {itensHoje.length === 0 ? (
                    <p className="ops-empty-hint">Nenhuma ação para hoje.</p>
                  ) : (
                    <ul className="ops-today-list">
                      {itensHoje.slice(0, 5).map((item) => (
                        <li key={item.id}>
                          <Link to={`/clientes/${item.clienteId}`}>{item.clienteNome}</Link>
                          <span className="field-hint"> — {TIPO_ITEM_AGENDA_LABELS[item.tipo]}: {item.titulo}</span>
                          {item.atrasado && <span className="ops-prazo-atrasado"> · atrasado</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="ops-agenda-bloco">
                  <h3>Amanhã</h3>
                  {itensAmanha.length === 0 ? (
                    <p className="ops-empty-hint">Nada previsto para amanhã.</p>
                  ) : (
                    <p className="ops-summary-line">{resumoContagemPorTipo(itensAmanha).join(' · ')}</p>
                  )}
                </div>

                <div className="ops-agenda-bloco">
                  <h3>Próximos 7 dias</h3>
                  {itensProximos7.length === 0 ? (
                    <p className="ops-empty-hint">Nada previsto por enquanto.</p>
                  ) : (
                    <p className="ops-summary-line">{resumoContagemPorTipo(itensProximos7).join(' · ')}</p>
                  )}
                </div>

                <div className="ops-agenda-bloco">
                  <h3>Próximos compromissos</h3>
                  {proximasReunioes.length === 0 ? (
                    <p className="ops-empty-hint">Nada previsto nos próximos dias.</p>
                  ) : (
                    <ul className="ops-compromissos-list">
                      {proximasReunioes.map((r) => {
                        const cliente = clientes.find((c) => c.id === r.cliente_id);
                        const data = new Date(r.data_hora!);
                        return (
                          <li key={r.id}>
                            <span className="ops-compromisso-quando">
                              {rotuloDiaRelativo(data, hoje)} ·{' '}
                              {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="ops-compromisso-tipo">{TIPO_REUNIAO_LABELS[r.tipo]}</span>
                            <span className="ops-compromisso-cliente">{cliente?.nome_empresa ?? 'Cliente'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <Link to="/agenda" className="btn btn-ghost btn-auto">
                  Ver Agenda
                </Link>
              </section>
            </aside>
          </div>

          <section className="ops-section">
            <div className="ops-section-head">
              <h2>Minha carteira</h2>
              <Link to="/clientes" className="btn btn-ghost btn-auto">
                Ver todos os clientes
              </Link>
            </div>

            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table ops-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Saúde</th>
                    <th>Dia/Ciclo</th>
                    <th>Trial</th>
                    <th>Próxima ação</th>
                    <th>Prazo</th>
                    {souAdministrador && <th>Consultor</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {carteiraResumida.map((r) => (
                    <LinhaCarteira
                      key={r.cliente.id}
                      resumo={r}
                      navigate={navigate}
                      mostrarConsultor={souAdministrador}
                      acao={acaoPorCliente.get(r.cliente.id) ?? { label: 'Ver detalhes', to: `/clientes/${r.cliente.id}?aba=resumo`, tipo: 'detalhes' }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AlertaCard({
  alerta,
  resumo,
  acao,
}: {
  alerta: AlertaOperacao;
  resumo: ClienteResumo | undefined;
  acao: AcaoOperacional;
}) {
  const contexto = contextoPrazoAlerta(alerta, resumo);
  const critico = alerta.severidade === 'critico';

  return (
    <li className={`ops-alert-card ops-alert-${alerta.severidade}`}>
      <p className="ops-alert-cliente">{alerta.clienteNome}</p>
      <p className="ops-alert-status-linha">
        <span className="ops-severity-icon" aria-hidden="true">
          {critico ? '▲' : '●'}
        </span>
        <span className={`status-badge status-tone-${critico ? 'danger' : 'warning'}`}>
          {critico ? 'Crítico' : 'Atenção'}
        </span>
        {contexto && <span className="ops-alert-prazo"> · {contexto}</span>}
      </p>
      <p className="ops-alert-motivo">{alerta.motivo}</p>
      <p className="ops-alert-meta">
        Próxima ação: <strong>{alerta.proximaAcao}</strong>
        {alerta.consultor && ` · ${alerta.consultor}`}
      </p>
      <Link to={acao.to} className="btn btn-secondary btn-auto ops-alert-cta">
        {acao.label}
      </Link>
    </li>
  );
}

function LinhaCarteira({
  resumo,
  navigate,
  mostrarConsultor,
  acao,
}: {
  resumo: ClienteResumo;
  navigate: ReturnType<typeof useNavigate>;
  mostrarConsultor: boolean;
  acao: AcaoOperacional;
}) {
  const { cliente, saude, trial, consultor } = resumo;
  const prazoLabel = prazoHumanizado(resumo);
  const prazoAtrasado = estaAtrasado(resumo);

  return (
    <tr className="ops-table-row" onClick={() => navigate(`/clientes/${cliente.id}`)}>
      <td data-label="Cliente">
        <Link to={`/clientes/${cliente.id}`} className="row-name-link">
          {cliente.nome_empresa}
        </Link>
        {(cliente.nome_contato || cliente.segmento) && (
          <span className="mapeamento-card-data" style={{ display: 'block' }}>
            {[cliente.nome_contato, cliente.segmento].filter(Boolean).join(' · ')}
          </span>
        )}
      </td>
      <td data-label="Saúde">
        <span className={`status-badge status-tone-${SAUDE_TONE[saude]}`}>{SAUDE_LABELS[saude]}</span>
      </td>
      <td data-label="Dia/Ciclo">{diaCicloLabel(resumo)}</td>
      <td data-label="Trial">
        {trial ? (
          <span className={`status-badge status-tone-${STATUS_TRIAL_TONE[trial.status]}`}>
            {trialHumanizado(trial.diasRestantes)}
          </span>
        ) : (
          <span className="dash" title="Sem Trial Kommo iniciado">
            —
          </span>
        )}
      </td>
      <td data-label="Próxima ação">
        <Link to={acao.to} onClick={(e) => e.stopPropagation()}>
          {acao.label}
        </Link>
      </td>
      <td data-label="Prazo">
        {prazoLabel ? (
          <span className={prazoAtrasado ? 'ops-prazo-atrasado' : 'ops-prazo-ok'}>{prazoLabel}</span>
        ) : (
          <span className="dash">—</span>
        )}
      </td>
      {mostrarConsultor && <td data-label="Consultor">{consultor ?? <span className="dash">—</span>}</td>}
      <td data-label="">
        <Link to={`/clientes/${cliente.id}`} className="btn btn-secondary btn-auto" onClick={(e) => e.stopPropagation()}>
          Ver
        </Link>
      </td>
    </tr>
  );
}
