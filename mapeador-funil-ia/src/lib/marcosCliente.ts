// Marcos do ciclo de vida do cliente, na ordem em que costumam acontecer, e
// as métricas de duração entre eles (usadas na linha do tempo da ficha do
// cliente). checkpoint_30d_respondido_em não é campo de MarcosCliente — vem
// de checkpoints_adocao.respondido_em, passado à parte pra quem monta a
// timeline.
import type { MarcosCliente } from '../types/database';

export type CampoMarco = keyof MarcosCliente;

// true = data (sem hora, ex: "contratado em"), false = timestamp completo.
export const MARCOS_ORDENADOS: { campo: CampoMarco; label: string; apenasData: boolean }[] = [
  { campo: 'contratado_em', label: 'Contratação', apenasData: true },
  { campo: 'formulario_enviado_em', label: 'Formulário enviado', apenasData: false },
  { campo: 'formulario_respondido_em', label: 'Formulário respondido', apenasData: false },
  { campo: 'funil_gerado_em', label: 'Funil gerado', apenasData: false },
  { campo: 'funil_revisado_em', label: 'Funil revisado internamente', apenasData: false },
  { campo: 'funil_validado_em', label: 'Funil validado', apenasData: false },
  { campo: 'kickoff_agendado_para', label: 'Kickoff agendado para', apenasData: true },
  { campo: 'kickoff_realizado_em', label: 'Kickoff realizado', apenasData: false },
  { campo: 'conta_kommo_solicitada_em', label: 'Conta Kommo solicitada', apenasData: false },
  { campo: 'conta_kommo_criada_em', label: 'Conta Kommo criada', apenasData: false },
  { campo: 'treinamento_agendado_para', label: 'Treinamento agendado para', apenasData: true },
  { campo: 'treinamento_realizado_em', label: 'Treinamento realizado', apenasData: false },
  { campo: 'extensao_14_solicitada_em', label: 'Extensão de 14 dias solicitada', apenasData: true },
  { campo: 'extensao_14_aprovada_em', label: 'Extensão de 14 dias aprovada', apenasData: true },
  { campo: 'extensao_7_solicitada_em', label: 'Extensão de 7 dias solicitada', apenasData: true },
  { campo: 'extensao_7_aprovada_em', label: 'Extensão de 7 dias aprovada', apenasData: true },
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
