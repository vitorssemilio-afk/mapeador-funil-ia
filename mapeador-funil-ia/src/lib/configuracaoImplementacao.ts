// Área de Configurações (Fase 1) — resolve qual conjunto de regras vale
// pra cada cliente: o snapshot capturado no Kickoff dele, se já existir, ou
// a configuração global vigente (só pra clientes que ainda não tiveram
// Kickoff — depois disso o snapshot é a única fonte, pra nunca recalcular
// silenciosamente uma implementação em andamento).
//
// CONFIGURACAO_PADRAO abaixo são os valores que, até esta feature existir,
// estavam hardcoded em atividadesCronograma.ts (CICLOS_OPERACIONAIS) e
// trialKommo.ts (DIAS_TRIAL_INICIAL/DIAS_EXTENSAO_14/DIAS_EXTENSAO_7) — é o
// fallback de último recurso (configuracoes_implementacao não carregada
// ainda, ou erro de rede), nunca o caminho normal.
import type { CicloConfiguravel, ConfiguracaoImplementacao, ImplementacaoSettingsSnapshot } from '../types/database';

export type CicloOperacional = { numero: number; nome: string; diaInicio: number; diaFim: number };

export type ConfiguracaoResolvida = {
  duracaoTotalDias: number;
  ciclos: CicloOperacional[];
  prazoTreinamentoDia: number;
  diaRecomendadoFormularioPosVenda: number;
  trialInicialDias: number;
  trialExtensao14Dias: number;
  trialExtensao7Dias: number;
  trialAlertasDias: number[];
  // De onde essa configuração veio — só informativo (ex: badge na ficha do
  // cliente "regras vigentes no Kickoff" vs "configuração atual").
  origem: 'snapshot' | 'global' | 'padrao';
};

export const CONFIGURACAO_PADRAO: ConfiguracaoResolvida = {
  duracaoTotalDias: 40,
  ciclos: [
    { numero: 1, nome: 'Ciclo 1 — Setup e Treinamento', diaInicio: 1, diaFim: 10 },
    { numero: 2, nome: 'Ciclo 2 — Automações I e Check-in 1', diaInicio: 11, diaFim: 20 },
    { numero: 3, nome: 'Ciclo 3 — Automações II e Check-in 2', diaInicio: 21, diaFim: 30 },
    { numero: 4, nome: 'Ciclo 4 — Finalização e Entrega', diaInicio: 31, diaFim: 40 },
  ],
  prazoTreinamentoDia: 10,
  diaRecomendadoFormularioPosVenda: 8,
  trialInicialDias: 14,
  trialExtensao14Dias: 14,
  trialExtensao7Dias: 7,
  trialAlertasDias: [5, 3, 1, 0],
  origem: 'padrao',
};

function converterCiclos(ciclos: CicloConfiguravel[]): CicloOperacional[] {
  return ciclos
    .map((c) => ({ numero: c.numero, nome: c.nome, diaInicio: c.dia_inicio, diaFim: c.dia_fim }))
    .sort((a, b) => a.numero - b.numero);
}

function converter(
  row: {
    duracao_total_dias: number;
    ciclos: CicloConfiguravel[];
    prazo_treinamento_dia: number;
    dia_recomendado_formulario_pos_venda: number;
    trial_inicial_dias: number;
    trial_extensao_14_dias: number;
    trial_extensao_7_dias: number;
    trial_alertas_dias: number[];
  },
  origem: ConfiguracaoResolvida['origem'],
): ConfiguracaoResolvida {
  return {
    duracaoTotalDias: row.duracao_total_dias,
    ciclos: converterCiclos(row.ciclos),
    prazoTreinamentoDia: row.prazo_treinamento_dia,
    diaRecomendadoFormularioPosVenda: row.dia_recomendado_formulario_pos_venda,
    trialInicialDias: row.trial_inicial_dias,
    trialExtensao14Dias: row.trial_extensao_14_dias,
    trialExtensao7Dias: row.trial_extensao_7_dias,
    trialAlertasDias: row.trial_alertas_dias,
    origem,
  };
}

export function construirMapaSnapshots(snapshots: ImplementacaoSettingsSnapshot[]): Map<string, ImplementacaoSettingsSnapshot> {
  return new Map(snapshots.map((s) => [s.cliente_id, s]));
}

// Fonte única de resolução — qualquer tela que precise saber "que regras
// valem pra este cliente" chama isto, nunca lê configuracoes_implementacao
// direto ignorando o snapshot (seria reabrir a brecha de recalcular
// implementação em andamento).
export function resolverConfiguracaoCliente(
  clienteId: string,
  snapshotsPorClienteId: Map<string, ImplementacaoSettingsSnapshot>,
  configGlobal: ConfiguracaoImplementacao | null,
): ConfiguracaoResolvida {
  const snapshot = snapshotsPorClienteId.get(clienteId);
  if (snapshot) return converter(snapshot, 'snapshot');
  if (configGlobal) return converter(configGlobal, 'global');
  return CONFIGURACAO_PADRAO;
}

// Constrói o mapa cliente_id -> configuração resolvida de uma vez, pra
// telas que processam uma lista de clientes (Dashboard, Gestão, Agenda).
export function construirMapaConfiguracoes(
  clienteIds: string[],
  snapshots: ImplementacaoSettingsSnapshot[],
  configGlobal: ConfiguracaoImplementacao | null,
): Map<string, ConfiguracaoResolvida> {
  const snapshotsPorClienteId = construirMapaSnapshots(snapshots);
  return new Map(clienteIds.map((id) => [id, resolverConfiguracaoCliente(id, snapshotsPorClienteId, configGlobal)]));
}
