import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { formatRespostasTexto } from '../../../src/data/formatRespostas.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { gerarFunisComIA } from './ia.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { mapeamento_id?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const mapeamentoId = payload?.mapeamento_id;
  if (typeof mapeamentoId !== 'string' || !mapeamentoId) {
    return jsonResponse({ error: 'mapeamento_id é obrigatório.' }, 400);
  }

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

  const respostasTexto = formatRespostasTexto((mapeamento.respostas ?? {}) as Record<string, unknown>);

  let funis;
  try {
    funis = await gerarFunisComIA(respostasTexto, mapeamento.nome_negocio as string);
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

  const rows = funis.map((funil, index) => ({
    mapeamento_id: mapeamentoId,
    user_id: mapeamento.user_id as string,
    nome_funil: funil.nome_funil,
    tipo_funil: funil.tipo_funil,
    justificativa: funil.justificativa,
    etapas: funil.etapas,
    ordem: index,
  }));

  // Remove gerações anteriores (ex: nova tentativa após um erro).
  await supabase.from('funis_gerados').delete().eq('mapeamento_id', mapeamentoId);

  const { error: insertError } = await supabase.from('funis_gerados').insert(rows);

  if (insertError) {
    console.error('Erro ao salvar funis_gerados', insertError);
    await supabase.from('mapeamentos').update({ status: 'erro' }).eq('id', mapeamentoId);
    return jsonResponse({ error: insertError.message }, 500);
  }

  await supabase.from('mapeamentos').update({ status: 'concluido' }).eq('id', mapeamentoId);

  return jsonResponse({ ok: true, funis: rows });
});
