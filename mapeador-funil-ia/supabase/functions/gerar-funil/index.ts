import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { formatRespostasTexto } from '../../../src/data/formatRespostas.ts';
import type { BlocoFormulario, Pergunta } from '../../../src/data/formSchema.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { gerarFunisComIA } from './ia.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function carregarBlocosFormulario(
  supabase: ReturnType<typeof createClient>,
): Promise<BlocoFormulario[]> {
  const { data: blocosRows } = await supabase
    .from('blocos_formulario')
    .select('id, titulo, ordem')
    .order('ordem', { ascending: true });

  const { data: perguntasRows } = await supabase
    .from('perguntas_formulario')
    .select('*')
    .order('ordem', { ascending: true });

  return (blocosRows ?? []).map((bloco: { id: string; titulo: string }) => ({
    titulo: bloco.titulo,
    perguntas: (perguntasRows ?? [])
      .filter((p: { bloco_id: string }) => p.bloco_id === bloco.id)
      .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      .map(
        (p: {
          pergunta_id: string;
          tipo: Pergunta['tipo'];
          label: string;
          helper: string | null;
          opcoes: Pergunta['opcoes'];
          prefixo: string | null;
          obrigatoria: boolean;
          condicao_pergunta_id: string | null;
          condicao_valores: string[] | null;
        }): Pergunta => ({
          id: p.pergunta_id,
          tipo: p.tipo,
          label: p.label,
          helper: p.helper ?? undefined,
          opcoes: p.opcoes ?? undefined,
          prefixo: p.prefixo ?? undefined,
          obrigatoria: p.obrigatoria,
          condicao: p.condicao_pergunta_id
            ? { perguntaId: p.condicao_pergunta_id, valores: p.condicao_valores ?? [] }
            : undefined,
        }),
      ),
  }));
}

function formatCamposPadraoTexto(
  campos: { entidade: string; nome_campo: string; tipo: string; opcoes: string[] | null }[],
): string {
  if (campos.length === 0) return '';

  return campos
    .map((campo) => {
      const opcoes = campo.opcoes && campo.opcoes.length > 0 ? `: ${campo.opcoes.join(', ')}` : '';
      return `- [${campo.entidade}] ${campo.nome_campo} (${campo.tipo}${opcoes})`;
    })
    .join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { mapeamento_id?: unknown; instrucoes_extras?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const mapeamentoId = payload?.mapeamento_id;
  if (typeof mapeamentoId !== 'string' || !mapeamentoId) {
    return jsonResponse({ error: 'mapeamento_id é obrigatório.' }, 400);
  }

  const instrucoesExtras =
    typeof payload?.instrucoes_extras === 'string' ? payload.instrucoes_extras.trim() : undefined;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Não autenticado.' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: mapeamento, error: fetchError } = await supabase
    .from('mapeamentos')
    .select('*')
    .eq('id', mapeamentoId)
    .single();

  if (fetchError || !mapeamento) {
    return jsonResponse({ error: 'Mapeamento não encontrado.' }, 404);
  }

  await supabase.from('mapeamentos').update({ status: 'processando_ia' }).eq('id', mapeamentoId);

  const blocos = await carregarBlocosFormulario(supabase);
  const respostasTexto = formatRespostasTexto(
    blocos,
    (mapeamento.respostas ?? {}) as Record<string, unknown>,
  );

  const { data: camposPadrao } = await supabase
    .from('campos_padrao')
    .select('entidade, nome_campo, tipo, opcoes');
  const camposPadraoTexto = formatCamposPadraoTexto(camposPadrao ?? []);

  let resultado;
  try {
    resultado = await gerarFunisComIA(
      respostasTexto,
      mapeamento.nome_negocio as string,
      camposPadraoTexto,
      instrucoesExtras,
    );
  } catch (iaError) {
    console.error('Erro ao gerar funil com IA', iaError);
    await supabase
      .from('mapeamentos')
      .update({
        status: 'erro',
        respostas: {
          ...(mapeamento.respostas as Record<string, unknown> | null),
          _erro_ia: String(iaError instanceof Error ? iaError.message : iaError),
        },
      })
      .eq('id', mapeamentoId);
    return jsonResponse({ error: 'Falha ao gerar funil com IA.' }, 502);
  }

  const respostasBase = { ...(mapeamento.respostas as Record<string, unknown> | null) };
  delete respostasBase._erro_ia;

  if (resultado.tipo === 'perguntas') {
    await supabase
      .from('mapeamentos')
      .update({
        status: 'aguardando_esclarecimento',
        respostas: { ...respostasBase, _perguntas_ia: resultado.perguntas },
      })
      .eq('id', mapeamentoId);

    return jsonResponse({ ok: true, perguntas: resultado.perguntas });
  }

  delete respostasBase._perguntas_ia;
  const funis = resultado.funis;

  const { data: versaoAtual } = await supabase
    .from('funis_gerados')
    .select('versao')
    .eq('mapeamento_id', mapeamentoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximaVersao = (versaoAtual?.versao ?? 0) + 1;

  const rows = funis.map((funil, index) => ({
    mapeamento_id: mapeamentoId,
    user_id: mapeamento.user_id as string,
    nome_funil: funil.nome_funil,
    tipo_funil: funil.tipo_funil,
    justificativa: funil.justificativa,
    etapas: funil.etapas,
    ordem: index,
    versao: proximaVersao,
  }));

  const { error: insertError } = await supabase.from('funis_gerados').insert(rows);

  if (insertError) {
    console.error('Erro ao salvar funis_gerados', insertError);
    await supabase.from('mapeamentos').update({ status: 'erro' }).eq('id', mapeamentoId);
    return jsonResponse({ error: insertError.message }, 500);
  }

  const { error: metaError } = await supabase.from('geracoes_meta').insert({
    mapeamento_id: mapeamentoId,
    user_id: mapeamento.user_id as string,
    versao: proximaVersao,
    pontos_para_validar: resultado.pontos_para_validar,
    transicoes_entre_funis: resultado.transicoes_entre_funis,
    nivel_complexidade: resultado.estimativa?.nivel_complexidade ?? null,
    semanas_estimadas: resultado.estimativa?.semanas_estimadas ?? null,
    observacao_estimativa: resultado.estimativa?.observacao ?? null,
  });

  if (metaError) {
    console.error('Erro ao salvar geracoes_meta', metaError);
  }

  await supabase
    .from('mapeamentos')
    .update({ status: 'concluido', respostas: respostasBase })
    .eq('id', mapeamentoId);

  return jsonResponse({ ok: true, funis: rows });
});