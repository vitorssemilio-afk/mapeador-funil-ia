// Diagnóstico de adoção calculado a partir das respostas do Checkpoint de
// Adoção — 30 dias. Nunca persistido: sempre recalculado a partir dos
// campos crus, pra nunca ter duas fontes de verdade que podem divergir se a
// regra mudar. Só mede adoção pós-entrega — nunca conta como critério de
// qualidade técnica da implementação (ver src/lib/criteriosEntrega.ts).
import type { CheckpointAdocao } from '../types/database';

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
