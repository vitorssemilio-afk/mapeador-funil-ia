import type { EtapaFunil } from '../../../src/types/database.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

export type FunilIA = {
  nome_funil: string;
  tipo_funil: string;
  justificativa: string;
  etapas: EtapaFunil[];
};

type GeminiTurn = {
  role: 'user' | 'model';
  content: string;
};

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TENTATIVAS = 2;

async function chamarGemini(turns: GeminiTurn[]): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada nas secrets da função.');
  }

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.content }] })),
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API respondeu ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
): Promise<FunilIA[]> {
  const turns: GeminiTurn[] = [
    { role: 'user', content: `Negócio: ${nomeNegocio}\n\n${respostasTexto}` },
  ];

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const textoResposta = await chamarGemini(turns);
    const funis = parseRespostaIA(textoResposta);
    if (funis) return funis;

    turns.push({ role: 'model', content: textoResposta });
    turns.push({
      role: 'user',
      content:
        'Sua resposta anterior não era um JSON válido. Responda apenas com JSON válido, sem texto adicional.',
    });
  }

  throw new Error('A IA não retornou um JSON válido após nova tentativa.');
}
