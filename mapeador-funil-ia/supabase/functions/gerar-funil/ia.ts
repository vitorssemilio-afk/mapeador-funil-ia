import type { EtapaFunil } from '../../../src/types/database.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

export type FunilIA = {
  nome_funil: string;
  tipo_funil: string;
  justificativa: string;
  etapas: EtapaFunil[];
};

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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const texto = data.content?.[0]?.text;

  if (!texto) {
    throw new Error('Resposta da IA não contém texto.');
  }

  return texto as string;
}

function extrairJson(texto: string): string {
  const semEspacos = texto.trim();
  const fenceMatch = semEspacos.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : semEspacos;
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
    Array.isArray(e.campos_desejaveis) &&
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

function parseRespostaIA(texto: string): FunilIA[] | null {
  let json: unknown;
  try {
    json = JSON.parse(extrairJson(texto));
  } catch {
    return null;
  }

  if (typeof json !== 'object' || json === null) return null;
  const funis = (json as Record<string, unknown>).funis;
  if (!Array.isArray(funis) || funis.length === 0) return null;
  if (!funis.every(isFunilIA)) return null;

  return funis;
}

export async function gerarFunisComIA(
  respostasTexto: string,
  nomeNegocio: string,
  camposPadraoTexto?: string,
  instrucoesExtras?: string,
): Promise<FunilIA[]> {
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
    const funis = parseRespostaIA(textoResposta);
    if (funis) return funis;

    messages.push({ role: 'assistant', content: textoResposta });
    messages.push({
      role: 'user',
      content:
        'Sua resposta anterior não era um JSON válido. Responda apenas com JSON válido, sem texto adicional.',
    });
  }

  throw new Error('A IA não retornou um JSON válido após nova tentativa.');
}
