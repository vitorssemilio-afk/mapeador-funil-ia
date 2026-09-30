// Regera só UMA etapa de um funil já existente, sem tocar nas demais — a
// tela de revisão (Mapeamento.tsx / EtapaCard.tsx) mostra o resultado como
// sugestão, o consultor decide se aceita (substitui a etapa localmente,
// entra no autosave normal do funil) ou cancela (nada muda). Esta function
// nunca grava no banco — só devolve o JSON da etapa sugerida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import type { EtapaFunil } from '../../../src/types/database.ts';
import { chamarAnthropic, ErroTimeoutIA, extrairJson, modeloAnthropicAtual, type ChatMessage } from '../_shared/anthropic.ts';
import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

const MAX_TENTATIVAS = 2;
const MAX_TOKENS = 8000;

class ErroRespostaInvalidaEtapa extends Error {
  constructor() {
    super('A IA não retornou um JSON válido após nova tentativa.');
    this.name = 'ErroRespostaInvalidaEtapa';
  }
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

async function regenerarEtapaComIA(prompt: string): Promise<EtapaFunil> {
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const textoResposta = await chamarAnthropic(messages, SYSTEM_PROMPT, MAX_TOKENS);
    let json: unknown;
    try {
      json = JSON.parse(extrairJson(textoResposta));
    } catch {
      json = null;
    }
    if (json && isEtapaIA(json)) return json;

    console.error('Resposta da IA não era uma etapa válida:', textoResposta.slice(0, 3000));
    messages.push({ role: 'assistant', content: textoResposta });
    messages.push({
      role: 'user',
      content:
        'Sua resposta anterior não era um JSON válido no formato pedido. Responda apenas com o JSON da etapa, sem texto adicional.',
    });
  }

  throw new ErroRespostaInvalidaEtapa();
}

function mensagemAmigavelErro(erro: unknown): { codigo: string; amigavel: string } {
  if (erro instanceof ErroTimeoutIA) {
    return { codigo: 'timeout', amigavel: 'A geração está demorando mais que o esperado. Tente novamente em instantes.' };
  }
  if (erro instanceof ErroRespostaInvalidaEtapa) {
    return {
      codigo: 'resposta_invalida',
      amigavel: 'Não foi possível interpretar a resposta da IA. A etapa atual não foi alterada — tente novamente.',
    };
  }
  return {
    codigo: 'erro_ia',
    amigavel: 'Não foi possível regenerar esta etapa agora. A etapa atual não foi alterada — tente novamente em instantes.',
  };
}

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
    .select('id, mapeamento_id, nome_funil, tipo_funil, etapas')
    .eq('id', funilId)
    .single();

  if (funilError || !funil) {
    return jsonResponse({ error: 'Funil não encontrado.' }, 404);
  }

  const { data: mapeamentoDoFunil } = await supabase
    .from('mapeamentos')
    .select('cliente_id')
    .eq('id', funil.mapeamento_id as string)
    .maybeSingle();
  const clienteId = mapeamentoDoFunil?.cliente_id ?? null;

  const etapas = funil.etapas as EtapaFunil[];
  const etapaAlvo = etapas[etapaIndex];
  if (!etapaAlvo) {
    return jsonResponse({ error: 'Etapa não encontrada nesse índice.' }, 404);
  }

  // Evita duas regenerações simultâneas da mesma etapa (clique duplo).
  const { data: operacaoEmAndamento } = await supabase
    .from('ia_operacoes')
    .select('id')
    .eq('tipo_operacao', 'regenerar_etapa')
    .eq('funil_id', funilId)
    .eq('etapa_index', etapaIndex)
    .in('status', ['processando', 'tentando_novamente'])
    .limit(1)
    .maybeSingle();

  if (operacaoEmAndamento) {
    return jsonResponse(
      { error: 'Já existe uma regeneração em andamento para esta etapa. Aguarde ela terminar.' },
      409,
    );
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

  const inicioMs = Date.now();
  const { data: iaOperacaoId } = await supabase.rpc('registrar_inicio_ia_operacao', {
    p_tipo_operacao: 'regenerar_etapa',
    p_cliente_id: clienteId,
    p_mapeamento_id: (funil.mapeamento_id as string | null) ?? null,
    p_funil_id: funilId,
    p_implementacao_id: null,
    p_etapa_index: etapaIndex,
    p_tentativa: 1,
    p_modelo: modeloAnthropicAtual(),
  });

  try {
    const etapa = await regenerarEtapaComIA(prompt);
    if (iaOperacaoId) {
      await supabase.rpc('registrar_fim_ia_operacao', {
        p_id: iaOperacaoId,
        p_status: 'concluido',
        p_duracao_ms: Date.now() - inicioMs,
      });
    }
    return jsonResponse({ etapa });
  } catch (err) {
    console.error('Erro ao regenerar etapa', err);
    const { codigo, amigavel } = mensagemAmigavelErro(err);
    if (iaOperacaoId) {
      await supabase.rpc('registrar_fim_ia_operacao', {
        p_id: iaOperacaoId,
        p_status: codigo === 'resposta_invalida' ? 'resposta_invalida' : 'falhou',
        p_duracao_ms: Date.now() - inicioMs,
        p_erro_codigo: codigo,
        p_erro_mensagem_tecnica: String(err instanceof Error ? err.message : err),
        p_erro_mensagem_amigavel: amigavel,
      });
    }
    return jsonResponse({ error: amigavel }, 502);
  }
});
