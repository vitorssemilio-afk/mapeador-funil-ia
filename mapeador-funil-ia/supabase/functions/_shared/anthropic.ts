// Chamada compartilhada à API da Anthropic, usada por gerar-funil e
// regenerar-etapa-funil — antes cada uma tinha sua própria cópia quase
// idêntica desse código, sem timeout nenhum (uma chamada travada na IA
// ficava presa até o limite da própria Edge Function, sem nenhum
// tratamento específico). Agora tem um timeout próprio e sinaliza timeout
// como um erro distinto, pra quem chama poder mostrar uma mensagem
// diferente de "deu erro" pra "demorou demais".
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Bem abaixo do limite de execução da Edge Function — o objetivo é a
// própria function conseguir responder com um erro estruturado e amigável
// antes de ser matada de forma abrupta pela plataforma (que não devolveria
// corpo nenhum pro cliente).
export const TIMEOUT_IA_MS = 55_000;

export class ErroTimeoutIA extends Error {
  constructor() {
    super('A geração está demorando mais que o esperado.');
    this.name = 'ErroTimeoutIA';
  }
}

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function modeloAnthropicAtual(): string {
  return Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';
}

export async function chamarAnthropic(
  messages: ChatMessage[],
  systemPrompt: string,
  maxTokens: number,
  temperatura?: number | null,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada nas secrets da função.');
  }

  const model = modeloAnthropicAtual();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_IA_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        system: systemPrompt,
        messages,
        stream: true,
        ...(temperatura != null ? { temperature: temperatura } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ErroTimeoutIA();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorText}`);
  }

  try {
    const texto = await lerRespostaStream(response, controller.signal);
    if (!texto) {
      throw new Error('Resposta da IA não contém texto.');
    }
    return texto;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ErroTimeoutIA();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function lerRespostaStream(response: Response, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Resposta da IA sem corpo para leitura em stream.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let texto = '';
  let stopReason: string | null = null;

  while (true) {
    if (signal.aborted) {
      throw new DOMException('Timeout lendo resposta da IA.', 'AbortError');
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() ?? '';

    for (const linha of linhas) {
      if (!linha.startsWith('data: ')) continue;
      const dados = linha.slice('data: '.length).trim();
      if (!dados) continue;

      let evento: Record<string, unknown>;
      try {
        evento = JSON.parse(dados);
      } catch {
        continue;
      }

      if (
        evento.type === 'content_block_delta' &&
        typeof evento.delta === 'object' &&
        evento.delta !== null &&
        (evento.delta as Record<string, unknown>).type === 'text_delta'
      ) {
        texto += String((evento.delta as Record<string, unknown>).text ?? '');
      }

      if (evento.type === 'message_delta' && typeof evento.delta === 'object' && evento.delta !== null) {
        const delta = evento.delta as Record<string, unknown>;
        if (typeof delta.stop_reason === 'string') {
          stopReason = delta.stop_reason;
        }
      }
    }
  }

  if (stopReason === 'max_tokens') {
    console.error('Resposta da IA foi cortada por atingir max_tokens.');
  }

  return texto;
}

export function extrairJson(texto: string): string {
  const semEspacos = texto.trim();
  const fenceMatch = semEspacos.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : semEspacos;
}
