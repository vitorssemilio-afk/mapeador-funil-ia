import type { EtapaFunil } from '../../../src/types/database.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

export type FunilIA = {
  nome_funil: string;
  tipo_funil: string;
  justificativa: string;
  etapas: EtapaFunil[];
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TENTATIVAS = 2;

async function chamarGroq(messages: ChatMessage[]): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY não configurada nas secrets da função.');
  }

  const model = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API respondeu ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const texto = data.choices?.[0]?.message?.content;

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

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: conteudo },
  ];

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const textoResposta = await chamarGroq(messages);
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
