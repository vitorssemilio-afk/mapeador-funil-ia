// Central operacional da implementação: reúne automaticamente tudo que o
// implementador precisa olhar num dia — reuniões, tarefas, prazos de Trial,
// pendências (do cliente e internas), alertas e atrasos — num formato só,
// organizado por urgência. Itens sem data não desaparecem: entram no grupo
// "sem_data", com o texto "Aguardando <marco>" quando é isso que falta.
import { resolverAtividade, resolverMarcoAgendavel, type AtividadeResolvida } from './atividadesCronograma';
import { nomeConsultor } from './operacaoResumo';
import { MAPEAMENTO_STATUS_LABELS } from './statusFluxo';
import { resolverResumoTrialKommo } from './trialKommo';
import type {
  AtividadeCronograma,
  AtividadeStatusRow,
  Cliente,
  Consultor,
  ImplementacaoCrm,
  ImplementacaoStatusHistorico,
  Mapeamento,
} from '../types/database';

export type TipoItemAgenda =
  | 'reuniao'
  | 'tarefa'
  | 'trial'
  | 'pendencia_cliente'
  | 'pendencia_interna'
  | 'alerta';

export const TIPO_ITEM_AGENDA_LABELS: Record<TipoItemAgenda, string> = {
  reuniao: 'Reunião',
  tarefa: 'Tarefa',
  trial: 'Trial Kommo',
  pendencia_cliente: 'Pendência do cliente',
  pendencia_interna: 'Pendência interna',
  alerta: 'Alerta',
};

export type BucketAgenda = 'atrasados' | 'hoje' | 'amanha' | 'proximos7' | 'sem_data';

export const BUCKET_AGENDA_LABELS: Record<BucketAgenda, string> = {
  atrasados: 'Atrasados',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  proximos7: 'Próximos 7 dias',
  sem_data: 'Sem data definida',
};

export type ItemAgendaOperacional = {
  id: string;
  clienteId: string;
  clienteNome: string;
  tipo: TipoItemAgenda;
  titulo: string;
  responsavel: string | null;
  data: Date | null;
  aguardando: string | null;
  status: string;
  acaoRecomendada: string;
  atrasado: boolean;
  implementacaoId: string | null;
  // Só preenchido pra tipo 'tarefa' com atividade real (não virtual) — dá
  // pra marcar como concluída direto na Agenda.
  atividadeId: string | null;
};

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function diferencaEmDias(depois: Date, antes: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((inicioDoDia(depois).getTime() - inicioDoDia(antes).getTime()) / MS_POR_DIA);
}

function diasDesde(iso: string, hoje: Date): number {
  return Math.max(0, diferencaEmDias(hoje, new Date(iso)));
}

export function bucketDeItem(item: ItemAgendaOperacional, hoje: Date): BucketAgenda {
  if (!item.data) return 'sem_data';
  const dias = diferencaEmDias(item.data, hoje);
  if (dias < 0) return 'atrasados';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanha';
  return 'proximos7';
}

function horarioDe(data: Date | null): string | null {
  if (!data) return null;
  if (data.getHours() === 0 && data.getMinutes() === 0) return null;
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatarItemAgenda(item: ItemAgendaOperacional): string {
  const hora = horarioDe(item.data);
  const partes = [hora, item.titulo, item.clienteNome].filter(Boolean);
  return partes.join(' — ');
}

function itemDeAtividade(
  atividade: AtividadeResolvida,
  cliente: Cliente,
  implementacao: ImplementacaoCrm,
  consultores: Consultor[],
): ItemAgendaOperacional | null {
  if (atividade.status === 'concluido' || atividade.status === 'bloqueado_cliente') return null;

  const tipo: TipoItemAgenda = atividade.ciclo === 'Marcos' ? 'reuniao' : 'tarefa';
  const aguardando =
    atividade.status === 'aguardando_etapa_anterior' ? atividade.dependenciaLabel : null;

  return {
    id: `atividade:${implementacao.id}:${atividade.id ?? atividade.nome}`,
    clienteId: cliente.id,
    clienteNome: cliente.nome_empresa,
    tipo,
    titulo: atividade.nome,
    responsavel: nomeConsultor(implementacao.consultor_responsavel_id, consultores),
    data: atividade.dataPlanejada,
    aguardando,
    status: atividade.status,
    acaoRecomendada:
      aguardando != null
        ? `Aguardando ${aguardando}`
        : atividade.status === 'agendado'
          ? `Confirmar ${atividade.nome.toLowerCase()}`
          : `Concluir "${atividade.nome}"`,
    atrasado: atividade.status === 'atrasado',
    implementacaoId: implementacao.id,
    atividadeId: tipo === 'tarefa' ? atividade.id : null,
  };
}

// Pendências internas do lado do MAPEAMENTO (revisão/kickoff/ajustes) — o
// funil já foi gerado pela IA mas depende de uma ação manual do time antes
// de virar implementação. Nenhuma tem data própria (são etapas manuais, não
// agendadas), então caem sempre no grupo "sem_data".
function itensDePendenciaInternaVendas(
  cliente: Cliente,
  vendas: Mapeamento,
): ItemAgendaOperacional | null {
  const acoesPorStatus: Partial<Record<Mapeamento['status'], string>> = {
    funil_gerado: 'Revisar funil internamente',
    em_revisao_interna: 'Concluir revisão interna e liberar para Kickoff',
    pronto_kickoff: 'Agendar Kickoff com o cliente',
    ajustes_solicitados: 'Aplicar os ajustes solicitados no funil',
  };

  const acao = acoesPorStatus[vendas.status];
  if (!acao) return null;

  return {
    id: `pendencia-interna:${vendas.id}`,
    clienteId: cliente.id,
    clienteNome: cliente.nome_empresa,
    tipo: 'pendencia_interna',
    titulo: acao,
    responsavel: null,
    data: null,
    aguardando: null,
    status: MAPEAMENTO_STATUS_LABELS[vendas.status],
    acaoRecomendada: acao,
    atrasado: false,
    implementacaoId: null,
    atividadeId: null,
  };
}

const DIAS_SEM_RESPOSTA_PARA_ALERTAR = 3;

function itemDePendenciaClienteFormulario(
  cliente: Cliente,
  vendas: Mapeamento,
  hoje: Date,
): ItemAgendaOperacional | null {
  if (vendas.status !== 'em_preenchimento' || vendas.enviado_pelo_cliente) return null;

  const dias = diasDesde(vendas.created_at, hoje);
  if (dias < DIAS_SEM_RESPOSTA_PARA_ALERTAR) return null;

  return {
    id: `pendencia-cliente:formulario:${vendas.id}`,
    clienteId: cliente.id,
    clienteNome: cliente.nome_empresa,
    tipo: 'pendencia_cliente',
    titulo: `Formulário ainda não respondido — ${dias}d`,
    responsavel: null,
    data: null,
    aguardando: null,
    status: 'Aguardando resposta do cliente',
    acaoRecomendada: 'Cobrar resposta do formulário com o cliente',
    atrasado: false,
    implementacaoId: null,
    atividadeId: null,
  };
}

function itensDeTrial(
  cliente: Cliente,
  implementacao: ImplementacaoCrm | null,
  consultores: Consultor[],
  hoje: Date,
): ItemAgendaOperacional[] {
  const resumo = resolverResumoTrialKommo(cliente, hoje);
  if (!resumo) return [];

  const itens: ItemAgendaOperacional[] = [];

  if (resumo.proximaExtensao && resumo.precisaAlerta) {
    itens.push({
      id: `trial-extensao:${cliente.id}`,
      clienteId: cliente.id,
      clienteNome: cliente.nome_empresa,
      tipo: 'trial',
      titulo: `Solicitar extensão ${resumo.proximaExtensao.rotulo}`,
      responsavel: nomeConsultor(implementacao?.consultor_responsavel_id ?? null, consultores),
      data: resumo.vencimento,
      aguardando: null,
      status: `Vence em ${resumo.diasRestantes}d`,
      acaoRecomendada: `Solicitar extensão ${resumo.proximaExtensao.rotulo} antes do vencimento`,
      atrasado: resumo.diasRestantes < 0,
      implementacaoId: implementacao?.id ?? null,
      atividadeId: null,
    });
  }

  return itens;
}

// "Cliente está no dia 37/40" — proximidade do prazo geral de 40 dias, sem
// já estar formalmente atrasado (isso já vira alerta em operacaoResumo.ts).
// Não tem data própria (é sobre o estado atual, não um evento futuro).
const DIAS_RESTANTES_PARA_ALERTAR_PRAZO = 3;

function itemDeProximidadePrazoGeral(
  cliente: Cliente,
  implementacao: ImplementacaoCrm,
  consultores: Consultor[],
  diaAtual: number,
): ItemAgendaOperacional | null {
  const diasRestantes = 40 - diaAtual;
  if (diasRestantes < 0 || diasRestantes > DIAS_RESTANTES_PARA_ALERTAR_PRAZO) return null;

  return {
    id: `alerta-prazo-geral:${implementacao.id}`,
    clienteId: cliente.id,
    clienteNome: cliente.nome_empresa,
    tipo: 'alerta',
    titulo: `Cliente está no dia ${diaAtual}/40`,
    responsavel: nomeConsultor(implementacao.consultor_responsavel_id, consultores),
    data: null,
    aguardando: null,
    status: `${diasRestantes}d restantes no prazo geral`,
    acaoRecomendada: 'Revisar o que falta pra concluir dentro do prazo',
    atrasado: false,
    implementacaoId: implementacao.id,
    atividadeId: null,
  };
}

export function construirAgendaOperacional(params: {
  clientes: Cliente[];
  mapeamentosVendas: Mapeamento[];
  implementacoes: ImplementacaoCrm[];
  atividades: AtividadeCronograma[];
  atividadesStatus: AtividadeStatusRow[];
  historico: ImplementacaoStatusHistorico[];
  consultores: Consultor[];
  hoje: Date;
}): ItemAgendaOperacional[] {
  const { clientes, mapeamentosVendas, implementacoes, atividades, atividadesStatus, historico, consultores, hoje } =
    params;

  const itens: ItemAgendaOperacional[] = [];

  for (const cliente of clientes) {
    const vendas = mapeamentosVendas.find((m) => m.cliente_id === cliente.id) ?? null;
    const implementacao = implementacoes.find((i) => i.cliente_id === cliente.id) ?? null;

    if (vendas && !implementacao) {
      const pendenciaInterna = itensDePendenciaInternaVendas(cliente, vendas);
      if (pendenciaInterna) itens.push(pendenciaInterna);

      const pendenciaCliente = itemDePendenciaClienteFormulario(cliente, vendas, hoje);
      if (pendenciaCliente) itens.push(pendenciaCliente);
    }

    if (!implementacao) continue;

    const historicoDaImplementacao = historico.filter((h) => h.implementacao_id === implementacao.id);
    const atividadesVisiveis = atividades.filter(
      (a) => a.implementacao_id === null || a.implementacao_id === implementacao.id,
    );

    for (const atividade of atividadesVisiveis) {
      const resolvida = resolverAtividade({
        atividade,
        statusRow: atividadesStatus.find((s) => s.atividade_id === atividade.id) ?? null,
        historico: historicoDaImplementacao,
        cliente,
        hoje,
      });
      const item = itemDeAtividade(resolvida, cliente, implementacao, consultores);
      if (item) itens.push(item);
    }

    // Reuniões (Kickoff/Treinamento) — mesma lógica de src/pages/ImplementacaoDetalhe.tsx.
    const kickoff = resolverMarcoAgendavel({
      nome: 'Kickoff',
      ciclo: 'Marcos',
      agendadoPara: cliente.kickoff_agendado_para,
      realizadoEm: cliente.kickoff_realizado_em,
      remarcacoes: [],
      kickoffRealizadoEm: cliente.kickoff_realizado_em,
      diaLimiteCiclo: 0,
      dependenciaLabel: null,
      hoje,
    });
    const itemKickoff = itemDeAtividade(kickoff, cliente, implementacao, consultores);
    if (itemKickoff) itens.push(itemKickoff);

    const treinamento = resolverMarcoAgendavel({
      nome: 'Treinamento',
      ciclo: 'Marcos',
      agendadoPara: cliente.treinamento_agendado_para,
      realizadoEm: cliente.treinamento_realizado_em,
      remarcacoes: [],
      kickoffRealizadoEm: cliente.kickoff_realizado_em,
      diaLimiteCiclo: 10,
      hoje,
    });
    const itemTreinamento = itemDeAtividade(treinamento, cliente, implementacao, consultores);
    if (itemTreinamento) itens.push(itemTreinamento);

    itens.push(...itensDeTrial(cliente, implementacao, consultores, hoje));

    if (cliente.kickoff_realizado_em) {
      const diaAtual = diferencaEmDias(hoje, new Date(cliente.kickoff_realizado_em)) + 1;
      const alerta = itemDeProximidadePrazoGeral(cliente, implementacao, consultores, diaAtual);
      if (alerta) itens.push(alerta);
    }
  }

  // Trial pode alertar mesmo sem implementação ainda criada (conta Kommo já
  // pode ter sido criada antes — caso raro, mas não deve desaparecer).
  for (const cliente of clientes) {
    if (implementacoes.some((i) => i.cliente_id === cliente.id)) continue;
    itens.push(...itensDeTrial(cliente, null, consultores, hoje));
  }

  return itens;
}
