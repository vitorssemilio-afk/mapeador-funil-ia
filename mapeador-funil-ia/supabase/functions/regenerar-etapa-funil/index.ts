// Regera só UMA etapa de um funil já existente, sem tocar nas demais — a
// tela de revisão (Mapeamento.tsx / EtapaCard.tsx) mostra o resultado como
// sugestão, o consultor decide se aceita (substitui a etapa localmente,
// entra no autosave normal do funil) ou cancela (nada muda). Esta function
// nunca grava no banco — só devolve o JSON da etapa sugerida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import type { EtapaFunil } from '../../../src/types/database.ts';
import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

async function chamarAnthropic(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada nas secrets da função.');

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
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API respondeu ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Resposta da IA sem corpo para leitura em stream.');

  const decoder = new TextDecoder();
  let buffer = '';
  let texto = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() ?? '';
    for (const linha of linhas) {
      if (!linha.startsWith('data: ')) continue;
      const dados = linha.slice('data: '.length).trim();
      if (!dados) continue;
      try {
        const evento = JSON.parse(dados);
        if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
          texto += String(evento.delta.text ?? '');
        }
      } catch {
        continue;
      }
    }
  }

  if (!texto) throw new Error('Resposta da IA não contém texto.');
  return texto;
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
    (c.opcoes === undefined || (Array.isArray(c.opcoes) && c.opcoes.every((o) => typeof o === 'string')))
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

const SYSTEM_PROMPT = `Você é um arquiteto de funis de vendas e CRM. Você vai receber o contexto de um funil já modelado (as etapas vizinhas, pra manter coerência de fluxo) e uma etapa específica pra REFAZER — só essa etapa, sem tocar nas outras.

Responda SOMENTE com um objeto JSON (sem markdown, sem texto fora do JSON) no formato exato:

{
  "nome": "string",
  "objetivo": "string",
  "gatilho_entrada": "string",
  "gatilho_saida": "string",
  "tarefas": ["string", ...],
  "campos_obrigatorios": [{ "nome": "string", "tipo": "texto_curto|texto_longo|numero|data|checkbox|telefone|lista_suspensa", "opcoes": ["string", ...] (só se tipo=lista_suspensa) }, ...],
  "campos_desejaveis": [mesmo formato de campos_obrigatorios],
  "sla": "string",
  "regras_negocio": ["string", ...],
  "regras_perda": ["string", ...],
  "responsavel": "string",
  "automacao": ["string", ...],
  "script_sugerido": "string ou null"
}

Mantenha o gatilho_entrada coerente com o gatilho_saida da etapa anterior (se houver) e o gatilho_saida coerente com o gatilho_entrada da próxima (se houver) — a etapa precisa continuar encaixando no fluxo do funil como um todo, mesmo sendo reformulada.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { funil_id?: unknown; etapa_index?: unknown; instrucoes_extras?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const funilId = payload?.funil_id;
  const etapaIndex = payload?.etapa_index;
  if (typeof funilId !== 'string' || !funilId) {
    return jsonResponse({ error: 'funil_id é obrigatório.' }, 400);
  }
  if (typeof etapaIndex !== 'number' || etapaIndex < 0) {
    return jsonResponse({ error: 'etapa_index é obrigatório.' }, 400);
  }
  const instrucoesExtras = typeof payload?.instrucoes_extras === 'string' ? payload.instrucoes_extras.trim() : '';

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Não autenticado.' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: funil, error: funilError } = await supabase
    .from('funis_gerados')
    .select('id, nome_funil, tipo_funil, etapas')
    .eq('id', funilId)
    .single();

  if (funilError || !funil) {
    return jsonResponse({ error: 'Funil não encontrado.' }, 404);
  }

  const etapas = funil.etapas as EtapaFunil[];
  const etapaAlvo = etapas[etapaIndex];
  if (!etapaAlvo) {
    return jsonResponse({ error: 'Etapa não encontrada nesse índice.' }, 404);
  }

  const contexto = etapas
    .map((e, i) => {
      const marcador = i === etapaIndex ? '>>> ETAPA A REFAZER <<<' : '';
      return `${i + 1}. ${e.nome} ${marcador}\n   Objetivo: ${e.objetivo}\n   Entrada: ${e.gatilho_entrada}\n   Saída: ${e.gatilho_saida}`;
    })
    .join('\n\n');

  const prompt = `Funil: ${funil.nome_funil} (${funil.tipo_funil})

Etapas do funil, na ordem (contexto — não as reescreva, só a marcada):
${contexto}

Conteúdo atual completo da etapa a refazer:
${JSON.stringify(etapaAlvo, null, 2)}

${instrucoesExtras ? `Instruções específicas para esta etapa: ${instrucoesExtras}` : 'Sem instruções extras — refaça com o mesmo objetivo geral, melhorando clareza e completude.'}`;

  try {
    const respostaTexto = await chamarAnthropic(prompt, SYSTEM_PROMPT);
    const json = JSON.parse(extrairJson(respostaTexto));
    if (!isEtapaIA(json)) {
      return jsonResponse({ error: 'A IA respondeu num formato inesperado. Tente novamente.' }, 502);
    }
    return jsonResponse({ etapa: json });
  } catch (err) {
    console.error('Erro ao regenerar etapa', err);
    return jsonResponse({ error: 'Não foi possível regenerar esta etapa. Tente novamente em instantes.' }, 500);
  }
});
