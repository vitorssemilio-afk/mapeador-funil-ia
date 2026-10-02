// Diagnóstico de adoção calculado a partir das respostas do Checkpoint de
// Adoção — 30 dias. Nunca persistido: sempre recalculado a partir dos
// campos crus, pra nunca ter duas fontes de verdade que podem divergir se a
// regra mudar. Só mede adoção pós-entrega — nunca conta como critério de
// qualidade técnica da implementação (ver src/lib/criteriosEntrega.ts).
import type {
  AtividadesForaKommoCheckpoint,
  AutonomiaEquipeCheckpoint,
  CheckpointAdocao,
  FrequenciaUsoCheckpoint,
  IntencaoManutencaoCheckpoint,
  PercentualProcessoKommo,
  UsoDiarioCheckpoint,
  UsoRelatoriosDecisaoCheckpoint,
} from '../types/database';

// Labels dos campos crus do Checkpoint de Adoção — compartilhados entre a
// tela da implementação e o Relatório de Adoção (módulo de Relatórios e
// Entrega, Fase 2) pra nunca divergir o texto exibido em um lugar e no
// outro.
export const USO_DIARIO_LABELS: Record<UsoDiarioCheckpoint, string> = {
  so_kommo: 'Só Kommo',
  kommo_mais_planilha: 'Kommo + planilha ainda',
  voltou_planilha: 'Voltaram pra planilha',
};

export const FREQUENCIA_USO_LABELS: Record<FrequenciaUsoCheckpoint, string> = {
  diariamente: 'Diariamente',
  semanalmente: 'Semanalmente',
  raramente: 'Raramente',
  nao_uso: 'Não uso',
};

export const INTENCAO_MANUTENCAO_LABELS: Record<IntencaoManutencaoCheckpoint, string> = {
  sim: 'Sim',
  talvez: 'Talvez',
  nao: 'Não',
};

export const PERCENTUAL_PROCESSO_LABELS: Record<PercentualProcessoKommo, string> = {
  praticamente_tudo: 'Praticamente tudo',
  maior_parte: 'A maior parte',
  cerca_metade: 'Cerca da metade',
  pouco: 'Pouco',
  quase_nada: 'Quase nada',
};

export const AUTONOMIA_EQUIPE_LABELS: Record<AutonomiaEquipeCheckpoint, string> = {
  sim_totalmente: 'Sim, totalmente',
  maior_parte_vezes: 'Na maior parte das vezes',
  precisamos_ajuda_frequente: 'Ainda precisamos de ajuda com frequência',
  nao_conseguimos_sem_ajuda: 'Não conseguimos operar sem ajuda',
};

export const USO_RELATORIOS_DECISAO_LABELS: Record<UsoRelatoriosDecisaoCheckpoint, string> = {
  sim_mais_uma_vez: 'Sim, mais de uma vez',
  sim_uma_vez: 'Sim, uma vez',
  ainda_nao: 'Ainda não',
  nao_sei_utilizar: 'Não sei utilizar os relatórios',
};

export const ATIVIDADES_FORA_KOMMO_LABELS: Record<AtividadesForaKommoCheckpoint, string> = {
  nao_tudo_no_kommo: 'Não, praticamente tudo está no Kommo',
  sim_algumas: 'Sim, algumas atividades',
  sim_varias: 'Sim, várias atividades',
  voltou_processo_antigo: 'A equipe praticamente voltou ao processo antigo',
};

export type StatusDiagnosticoAdocao = 'saudavel' | 'atencao' | 'critico';

export const STATUS_DIAGNOSTICO_LABELS: Record<StatusDiagnosticoAdocao, string> = {
  saudavel: 'Adoção saudável',
  atencao: 'Atenção',
  critico: 'Adoção crítica',
};

export const STATUS_DIAGNOSTICO_TONE: Record<StatusDiagnosticoAdocao, 'success' | 'warning' | 'danger'> = {
  saudavel: 'success',
  atencao: 'warning',
  critico: 'danger',
};

export type DiagnosticoAdocao = {
  status: StatusDiagnosticoAdocao;
  sinais: string[];
  recomendacoes: string[];
};

export function resolverDiagnosticoAdocao(checkpoint: CheckpointAdocao): DiagnosticoAdocao {
  const sinais: string[] = [];
  const recomendacoes: string[] = [];
  let critico = false;
  let atencao = false;

  // Percentual do processo dentro do Kommo.
  if (checkpoint.percentual_processo_kommo === 'quase_nada') {
    critico = true;
    sinais.push('quase nada do processo comercial acontece dentro do Kommo');
    recomendacoes.push('Investigar com urgência por que o time não está usando o Kommo no dia a dia');
  } else if (checkpoint.percentual_processo_kommo === 'pouco' || checkpoint.percentual_processo_kommo === 'cerca_metade') {
    atencao = true;
    sinais.push('só parte do processo comercial acontece dentro do Kommo');
    recomendacoes.push('Reforçar treinamento nas etapas do processo que ainda ficam fora do Kommo');
  }

  // Autonomia da equipe.
  if (checkpoint.autonomia_equipe === 'nao_conseguimos_sem_ajuda') {
    critico = true;
    sinais.push('a equipe não consegue operar o Kommo sem ajuda do consultor');
    recomendacoes.push('Agendar uma sessão extra de treinamento operacional');
  } else if (checkpoint.autonomia_equipe === 'precisamos_ajuda_frequente') {
    atencao = true;
    sinais.push('a equipe ainda precisa de ajuda com frequência para operar o Kommo');
  } else if (checkpoint.autonomia_equipe === 'maior_parte_vezes') {
    sinais.push('equipe consegue operar sem ajuda na maior parte das vezes');
  }

  // Uso de relatórios para decisão.
  if (checkpoint.uso_relatorios_decisao === 'nao_sei_utilizar') {
    atencao = true;
    sinais.push('gestor não sabe usar os relatórios do Kommo');
    recomendacoes.push('Fazer uma sessão dedicada mostrando os relatórios e como usá-los na rotina de gestão');
  } else if (checkpoint.uso_relatorios_decisao === 'ainda_nao') {
    atencao = true;
    sinais.push('gestor ainda não utiliza relatórios para tomar decisões');
  }

  // Retorno a processos fora do Kommo.
  if (checkpoint.atividades_fora_kommo === 'voltou_processo_antigo') {
    critico = true;
    sinais.push('a equipe praticamente voltou ao processo antigo, fora do Kommo');
    recomendacoes.push('Tratar como risco de churn — priorizar contato imediato com o cliente');
  } else if (checkpoint.atividades_fora_kommo === 'sim_varias') {
    atencao = true;
    sinais.push('várias atividades voltaram a ser feitas fora do Kommo');
  } else if (checkpoint.atividades_fora_kommo === 'sim_algumas') {
    atencao = true;
    sinais.push('a equipe ainda utiliza ferramentas fora do CRM para algumas atividades');
  }

  // Uso diário (pergunta original) — mesmo sinal de risco de churn que já existia.
  if (checkpoint.uso_diario === 'voltou_planilha') {
    critico = true;
    sinais.push('equipe ainda utiliza planilha/WhatsApp fora do CRM');
  } else if (checkpoint.uso_diario === 'kommo_mais_planilha') {
    atencao = true;
    sinais.push('equipe ainda usa planilha em paralelo ao Kommo');
  }

  // Frequência de acesso a relatórios (pergunta original).
  if (checkpoint.frequencia_uso === 'nao_uso') {
    atencao = true;
    sinais.push('gestor não acessa os relatórios do Kommo');
  } else if (checkpoint.frequencia_uso === 'raramente') {
    atencao = true;
    sinais.push('gestor raramente acessa os relatórios do Kommo');
  }

  if (checkpoint.principal_dificuldade?.trim()) {
    recomendacoes.push(`Endereçar a dificuldade relatada: "${checkpoint.principal_dificuldade.trim()}"`);
  }

  const status: StatusDiagnosticoAdocao = critico ? 'critico' : atencao ? 'atencao' : 'saudavel';

  if (status === 'saudavel' && sinais.length === 0) {
    sinais.push('processo rodando dentro do Kommo, equipe autônoma e relatórios em uso');
  }
  if (recomendacoes.length === 0) {
    recomendacoes.push('Nenhuma ação necessária — seguir o acompanhamento normal');
  }

  return { status, sinais, recomendacoes };
}
