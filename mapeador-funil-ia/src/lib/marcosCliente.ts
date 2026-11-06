// Marcos do ciclo de vida do cliente, na ordem em que costumam acontecer, e
// as métricas de duração entre eles (usadas na linha do tempo da ficha do
// cliente). checkpoint_30d_respondido_em não é campo de MarcosCliente — vem
// de checkpoints_adocao.respondido_em, passado à parte pra quem monta a
// timeline.
import type { Cliente, MarcosCliente, Reuniao } from '../types/database';

export type CampoMarco = keyof MarcosCliente;

// Prompt 64, Bloco 2 (seção 13: "agendar não é realizar") — extraída de
// ImplementacaoDetalhe.tsx (sincronizarMarcoCliente) só pra poder testar
// isoladamente a regra mais sensível da jornada: o Dia 1 dos 40 dias (e do
// treinamento) só nasce de uma reunião com status 'realizada' E data, e
// NUNCA sobrescreve um marco de "realizado" já preenchido — uma vez
// registrado, nenhuma remarcação, edição ou nova reunião do mesmo tipo
// consegue tocá-lo. `*_agendado_para` já segue outra regra (mais solta:
// acompanha a data da reunião atual enquanto ela não for cancelada).
type CampoMarcoReuniao = 'kickoff_realizado_em' | 'kickoff_agendado_para' | 'treinamento_realizado_em' | 'treinamento_agendado_para';

export function resolverPatchMarcoReuniao(
  reuniao: Pick<Reuniao, 'tipo' | 'status' | 'data_hora'>,
  clienteAtual: Pick<Cliente, CampoMarcoReuniao>,
): Partial<Pick<Cliente, CampoMarcoReuniao>> {
  if (reuniao.tipo !== 'kickoff' && reuniao.tipo !== 'treinamento') return {};

  const campoRealizado: CampoMarcoReuniao = reuniao.tipo === 'kickoff' ? 'kickoff_realizado_em' : 'treinamento_realizado_em';
  const campoAgendado: CampoMarcoReuniao = reuniao.tipo === 'kickoff' ? 'kickoff_agendado_para' : 'treinamento_agendado_para';

  const patch: Partial<Pick<Cliente, CampoMarcoReuniao>> = {};

  if (reuniao.status === 'realizada' && reuniao.data_hora && !clienteAtual[campoRealizado]) {
    patch[campoRealizado] = reuniao.data_hora;
  }
  if (reuniao.data_hora && reuniao.status !== 'cancelada') {
    patch[campoAgendado] = reuniao.data_hora;
  }

  return patch;
}

// true = data (sem hora, ex: "contratado em"), false = timestamp completo.
export const MARCOS_ORDENADOS: { campo: CampoMarco; label: string; apenasData: boolean }[] = [
  { campo: 'contratado_em', label: 'Contratação', apenasData: true },
  { campo: 'formulario_enviado_em', label: 'Formulário enviado', apenasData: false },
  { campo: 'formulario_respondido_em', label: 'Formulário respondido', apenasData: false },
  { campo: 'funil_gerado_em', label: 'Funil gerado', apenasData: false },
  { campo: 'funil_revisado_em', label: 'Funil revisado internamente', apenasData: false },
  { campo: 'funil_validado_em', label: 'Funil validado', apenasData: false },
  { campo: 'kickoff_agendado_para', label: 'Kickoff agendado para', apenasData: false },
  { campo: 'kickoff_realizado_em', label: 'Kickoff realizado', apenasData: false },
  { campo: 'conta_kommo_solicitada_em', label: 'Conta Kommo solicitada', apenasData: false },
  { campo: 'conta_kommo_criada_em', label: 'Conta Kommo criada', apenasData: false },
  { campo: 'treinamento_agendado_para', label: 'Treinamento agendado para', apenasData: false },
  { campo: 'treinamento_realizado_em', label: 'Treinamento realizado', apenasData: false },
  // Ordem real de concessão: 1ª extensão = +7 dias, 2ª extensão = +14 dias
  // (ver src/lib/trialKommo.ts) — os nomes dos campos (extensao_14/
  // extensao_7) seguem a duração, não a ordem.
  { campo: 'extensao_7_solicitada_em', label: 'Extensão de 7 dias (1ª) solicitada', apenasData: true },
  { campo: 'extensao_7_aprovada_em', label: 'Extensão de 7 dias (1ª) aprovada', apenasData: true },
  { campo: 'extensao_14_solicitada_em', label: 'Extensão de 14 dias (2ª) solicitada', apenasData: true },
  { campo: 'extensao_14_aprovada_em', label: 'Extensão de 14 dias (2ª) aprovada', apenasData: true },
  { campo: 'contratacao_kommo_solicitada_em', label: 'Contratação definitiva do Kommo solicitada', apenasData: false },
  { campo: 'implementacao_concluida_em', label: 'Implementação concluída', apenasData: false },
];

export type MetricaDuracao = {
  label: string;
  dias: number | null;
};

function diasEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / MS_POR_DIA);
}

// As 8 métricas pedidas — cada uma só aparece preenchida se os dois marcos
// que a compõem já existirem.
export function calcularMetricas(marcos: MarcosCliente): MetricaDuracao[] {
  return [
    { label: 'Contratação → envio do formulário', dias: diasEntre(marcos.contratado_em, marcos.formulario_enviado_em) },
    { label: 'Envio → resposta do formulário', dias: diasEntre(marcos.formulario_enviado_em, marcos.formulario_respondido_em) },
    { label: 'Resposta → geração do funil', dias: diasEntre(marcos.formulario_respondido_em, marcos.funil_gerado_em) },
    { label: 'Geração do funil → Kickoff', dias: diasEntre(marcos.funil_gerado_em, marcos.kickoff_realizado_em) },
    { label: 'Kickoff → criação da conta Kommo', dias: diasEntre(marcos.kickoff_realizado_em, marcos.conta_kommo_criada_em) },
    { label: 'Criação da conta → treinamento', dias: diasEntre(marcos.conta_kommo_criada_em, marcos.treinamento_realizado_em) },
    { label: 'Kickoff → treinamento', dias: diasEntre(marcos.kickoff_realizado_em, marcos.treinamento_realizado_em) },
    { label: 'Kickoff → conclusão da implementação', dias: diasEntre(marcos.kickoff_realizado_em, marcos.implementacao_concluida_em) },
  ];
}
