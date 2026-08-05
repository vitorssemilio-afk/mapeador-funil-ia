import type { CampoEtapa, EtapaFunil, TipoCampo } from '../types/database';

export type CampoEtapaKey = Exclude<keyof EtapaFunil, 'nome'>;

export type CampoEtapaConfig = {
  key: CampoEtapaKey;
  label: string;
  lista: boolean;
  // campos_obrigatorios / campos_desejaveis: cada linha vira um objeto
  // { nome, tipo, opcoes } em vez de texto solto — ver formatCampoEtapaLinha.
  estruturado?: boolean;
};

export const CAMPOS_ETAPA: CampoEtapaConfig[] = [
  { key: 'objetivo', label: 'Objetivo', lista: false },
  { key: 'gatilho_entrada', label: 'Gatilho de Entrada', lista: false },
  { key: 'gatilho_saida', label: 'Gatilho de Saída', lista: false },
  { key: 'tarefas', label: 'Tarefas', lista: true },
  { key: 'campos_obrigatorios', label: 'Campos Obrigatórios', lista: true, estruturado: true },
  { key: 'campos_desejaveis', label: 'Campos Desejáveis', lista: true, estruturado: true },
  { key: 'sla', label: 'SLA', lista: false },
  { key: 'regras_negocio', label: 'Regras de Negócio', lista: true },
  { key: 'regras_perda', label: 'Regras de Perda', lista: true },
  { key: 'responsavel', label: 'Responsável', lista: false },
  { key: 'automacao', label: 'Automação', lista: true },
  { key: 'script_sugerido', label: 'Script Sugerido', lista: false },
];

const TIPOS_CAMPO_VALIDOS = new Set<TipoCampo>([
  'lista_suspensa',
  'texto_curto',
  'texto_longo',
  'numero',
  'data',
  'checkbox',
  'telefone',
]);

export const TIPO_CAMPO_LABELS: Record<TipoCampo, string> = {
  lista_suspensa: 'Lista suspensa',
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  data: 'Data',
  checkbox: 'Checkbox',
  telefone: 'Telefone',
};

function isTipoCampo(valor: string): valor is TipoCampo {
  return TIPOS_CAMPO_VALIDOS.has(valor as TipoCampo);
}

// Formata um CampoEtapa como uma linha editável de texto: "Nome (tipo)" ou,
// pra lista_suspensa, "Nome (lista_suspensa: opção1, opção2)". Quando o
// campo é de CONTATO (não LEAD, o padrão), aparece um sufixo " · Contato" —
// omitido pra LEAD, já que é a entidade mais comum e não vale poluir a
// leitura. Dados legados (funis gerados antes desta mudança) guardam
// string pura — nesse caso a linha é o próprio texto.
export function formatCampoEtapaLinha(item: CampoEtapa | string): string {
  if (typeof item === 'string') return item;
  const opcoes = item.tipo === 'lista_suspensa' && item.opcoes?.length ? `: ${item.opcoes.join(', ')}` : '';
  const entidade = item.entidade === 'CONTATO' ? ' · Contato' : '';
  return `${item.nome} (${item.tipo}${opcoes})${entidade}`;
}

const LINHA_CAMPO_ESTRUTURADO = /^(.*?)\s*\(([a-z_]+)(?::\s*(.+))?\)\s*(?:·\s*(contato|lead))?\s*$/i;

export function parseCampoEtapaLinha(linha: string): CampoEtapa {
  const match = linha.match(LINHA_CAMPO_ESTRUTURADO);
  if (!match) return { nome: linha.trim(), tipo: 'texto_curto' };

  const [, nome, tipoRaw, opcoesRaw, entidadeRaw] = match;
  const tipo: TipoCampo = isTipoCampo(tipoRaw) ? tipoRaw : 'texto_curto';
  const opcoes = opcoesRaw
    ? opcoesRaw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : undefined;
  const entidade = entidadeRaw?.toLowerCase() === 'contato' ? 'CONTATO' : undefined;

  return {
    nome: nome.trim() || linha.trim(),
    tipo,
    ...(opcoes && opcoes.length > 0 ? { opcoes } : {}),
    ...(entidade ? { entidade } : {}),
  };
}

// Rótulo legível pra exibição (relatório, resumo) — não é o formato de edição.
export function formatCampoEtapaLabel(item: CampoEtapa | string): string {
  if (typeof item === 'string') return item;
  const tipoLabel = TIPO_CAMPO_LABELS[item.tipo as TipoCampo] ?? item.tipo;
  const opcoes = item.opcoes?.length ? ` (${item.opcoes.join(', ')})` : '';
  const entidade = item.entidade === 'CONTATO' ? ' — Contato' : '';
  return `${item.nome} · ${tipoLabel}${opcoes}${entidade}`;
}

export function valorEtapaParaTexto(
  valor: string[] | CampoEtapa[] | string | null,
  estruturado = false,
): string {
  if (Array.isArray(valor)) {
    if (estruturado) return valor.map((item) => formatCampoEtapaLinha(item)).join('\n');
    return (valor as string[]).join('\n');
  }
  return valor ?? '';
}

export function textoParaValorEtapa(
  texto: string,
  lista: boolean,
  estruturado = false,
): string[] | CampoEtapa[] | string {
  if (!lista) return texto;
  const linhas = texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
  return estruturado ? linhas.map(parseCampoEtapaLinha) : linhas;
}
