import type { EtapaFunil, TransicaoEntreFunis } from '../../../src/types/database.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

export type FunilIA = {
  nome_funil: string;
  tipo_funil: string;
  justificativa: string;
  etapas: EtapaFunil[];
};

export type EstimativaIA = {
  nivel_complexidade: string;
  semanas_estimadas: number;
  observacao: string | null;
};

export type ResultadoIA =
  | {
      tipo: 'funis';
      funis: FunilIA[];
      pontos_para_validar: string[];
      transicoes_entre_funis: TransicaoEntreFunis[];
      estimativa: EstimativaIA | null;
    }
  | { tipo: 'perguntas'; perguntas: string[] };

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TENTATIVAS = 2;

async function chamarAnthropic(messages: ChatMessage[]): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada nas secrets da função.');
  }

  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorText}`);
  }

   const data = await response.json();
  const textBlock = Array.isArray(data.content)
    ? data.content.find((block: { type?: string; text?: string }) => typeof block?.text === 'string')
    : undefined;
  const texto = textBlock?.text;

  if (!texto) {
    throw new Error(`Resposta da IA não contém texto. Resposta bruta: ${JSON.stringify(data)}`);
  }

  return texto as string;
}

function extrairJson(texto: string): string {
  const semEspacos = texto.trim();
  const fenceMatch = semEspacos.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : semEspacos;
}

function isCampoEtapaIA(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const c = item as Record<string, unknown>;
  return (
    typeof c.nome === 'string' &&
    typeof c.tipo === 'string' &&
    (c.opcoes === undefined ||
      (Array.isArray(c.opcoes) && c.opcoes.every((o) => typeof o === 'string')))
  );
}

function isEtapaIA(item: unknown): item is EtapaFunil {
  if (typeof item !== 'object' || item === null) return false;
  const e = item as Record<string, unknown>;
  return (
    typeof e.nome === 'string' &&
    typeof e.objetivo === 'string' &&
    typeof e.gatilho_entrada === 'string' &&
    typeof e.gatilho_saida === 'string' &&
    Array.isArray(e.tarefas) &&
    Array.isArray(e.campos_obrigatorios) &&
    e.campos_obrigatorios.every(isCampoEtapaIA) &&
    Array.isArray(e.campos_desejaveis) &&
    e.campos_desejaveis.every(isCampoEtapaIA) &&
    typeof e.sla === 'string' &&
    Array.isArray(e.regras_negocio) &&
    Array.isArray(e.regras_perda) &&
    typeof e.responsavel === 'string' &&
    Array.isArray(e.automacao) &&
    (typeof e.script_sugerido === 'string' || e.script_sugerido === null)
  );
}

function isFunilIA(item: unknown): item is FunilIA {
  if (typeof item !== 'object' || item === null) return false;
  const f = item as Record<string, unknown>;
  return (
    typeof f.nome_funil === 'string' &&
    typeof f.tipo_funil === 'string' &&
    typeof f.justificativa === 'string' &&
    Array.isArray(f.etapas) &&
    f.etapas.length > 0 &&
    f.etapas.every(isEtapaIA)
  );
}

function extrairPontosParaValidar(json: Record<string, unknown>): string[] {
  const valor = json.pontos_para_validar;
  if (Array.isArray(valor) && valor.every((p) => typeof p === 'string')) {
    return valor as string[];
  }
  return [];
}

function extrairTransicoesEntreFunis(json: Record<string, unknown>): TransicaoEntreFunis[] {
  const valor = json.transicoes_entre_funis;
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is TransicaoEntreFunis => {
    if (typeof item !== 'object' || item === null) return false;
    const t = item as Record<string, unknown>;
    return (
      typeof t.de_funil === 'string' &&
      typeof t.para_funil === 'string' &&
      typeof t.condicao === 'string'
    );
  });
}

const NIVEIS_COMPLEXIDADE = new Set(['baixa', 'media', 'alta']);

function extrairEstimativa(json: Record<string, unknown>): EstimativaIA | null {
  const valor = json.estimativa;
  if (typeof valor !== 'object' || valor === null) return null;
  const e = valor as Record<string, unknown>;
  if (typeof e.nivel_complexidade !== 'string' || !NIVEIS_COMPLEXIDADE.has(e.nivel_complexidade)) {
    return null;
  }
  if (typeof e.semanas_estimadas !== 'number') return null;
  return {
    nivel_complexidade: e.nivel_complexidade,
    semanas_estimadas: e.semanas_estimadas,
    observacao: typeof e.observacao === 'string' ? e.observacao : null,
  };
}

function isPerguntasIA(json: Record<string, unknown>): string[] | null {
  const perguntas = json.perguntas_esclarecimento;
  if (
    Array.isArray(perguntas) &&
    perguntas.length > 0 &&
    perguntas.every((p) => typeof p === 'string')
  ) {
    return perguntas as string[];
  }
  return null;
}

function parseRespostaIA(texto: string): ResultadoIA | null {
  let json: unknown;
  try {
    json = JSON.parse(extrairJson(texto));
  } catch {
    return null;
  }

  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;

  const perguntas = isPerguntasIA(obj);
  if (perguntas) return { tipo: 'perguntas', perguntas };

  const funis = obj.funis;
  if (!Array.isArray(funis) || funis.length === 0) return null;
  if (!funis.every(isFunilIA)) return null;

  return {
    tipo: 'funis',
    funis,
    pontos_para_validar: extrairPontosParaValidar(obj),
    transicoes_entre_funis: extrairTransicoesEntreFunis(obj),
    estimativa: extrairEstimativa(obj),
  };
}

export async function gerarFunisComIA(
  respostasTexto: string,
  nomeNegocio: string,
  camposPadraoTexto?: string,
  instrucoesExtras?: string,
): Promise<ResultadoIA> {
  let conteudo = `Negócio: ${nomeNegocio}\n\n${respostasTexto}`;

  if (camposPadraoTexto) {
    conteudo += `\n\n## Vocabulário de referência (campos já padronizados em outros funis — reaproveite esses nomes quando fizer sentido, em vez de inventar variações)\n${camposPadraoTexto}`;
  }

  if (instrucoesExtras) {
    conteudo += `\n\n## Instruções adicionais para esta geração (pedidas pelo usuário que está revisando o funil)\n${instrucoesExtras}`;
  }

  const messages: ChatMessage[] = [{ role: 'user', content: conteudo }];

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const textoResposta = await chamarAnthropic(messages);
    const resultado = parseRespostaIA(textoResposta);
    if (resultado) return resultado;

    console.error('Resposta da IA não era JSON válido:', textoResposta.slice(0, 3000));
    messages.push({ role: 'assistant', content: textoResposta });
    messages.push({
      role: 'user',
      content:
        'Sua resposta anterior não era um JSON válido. Responda apenas com JSON válido, sem texto adicional.',
    });
  }

  throw new Error('A IA não retornou um JSON válido após nova tentativa.');
}
