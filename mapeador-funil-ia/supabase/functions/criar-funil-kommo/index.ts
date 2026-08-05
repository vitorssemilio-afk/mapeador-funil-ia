import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import { apagarFunilPadraoSeVazio, criarFunilNoKommo, type EtapaFunilInput } from './kommoClient.ts';

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

  let payload: {
    implementacao_id?: unknown;
    funil_id?: unknown;
    confirmar?: unknown;
    apagar_funil_padrao?: unknown;
  } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const implementacaoId = payload?.implementacao_id;
  const funilId = payload?.funil_id;
  const confirmar = payload?.confirmar === true;
  const apagarFunilPadrao = payload?.apagar_funil_padrao === true;

  if (typeof implementacaoId !== 'string' || !implementacaoId) {
    return jsonResponse({ error: 'implementacao_id é obrigatório.' }, 400);
  }
  if (typeof funilId !== 'string' || !funilId) {
    return jsonResponse({ error: 'funil_id é obrigatório.' }, 400);
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

  const { data: funil, error: funilError } = await supabase
    .from('funis_gerados')
    .select('id, nome_funil, etapas')
    .eq('id', funilId)
    .single();

  if (funilError || !funil) {
    return jsonResponse({ error: 'Funil não encontrado.' }, 404);
  }

  const { data: credenciais, error: credError } = await supabase.rpc('obter_credencial_api_kommo', {
    p_implementacao_id: implementacaoId,
  });

  if (credError) {
    return jsonResponse({ error: credError.message }, 500);
  }

  const credencial = credenciais?.[0];
  if (!credencial) {
    return jsonResponse(
      { error: 'Credenciais da API Kommo não cadastradas para esta implementação.' },
      400,
    );
  }

  const { data: jaExiste } = await supabase
    .from('funis_kommo_criacoes')
    .select('id, criado_em, kommo_pipeline_id')
    .eq('funil_gerado_id', funilId)
    .maybeSingle();

  if (jaExiste && !confirmar) {
    return jsonResponse(
      {
        error: 'ja_criado',
        message: `Este funil já foi criado no Kommo (pipeline ${jaExiste.kommo_pipeline_id}) em ${jaExiste.criado_em}. Envie confirmar=true para recriar mesmo assim.`,
        criado_em: jaExiste.criado_em,
        kommo_pipeline_id: jaExiste.kommo_pipeline_id,
      },
      409,
    );
  }

  let resultado;
  try {
    resultado = await criarFunilNoKommo(
      credencial.subdominio,
      credencial.token,
      funil.nome_funil as string,
      (funil.etapas ?? []) as EtapaFunilInput[],
    );
  } catch (kommoError) {
    console.error('Erro ao criar funil no Kommo', kommoError);
    return jsonResponse(
      { error: kommoError instanceof Error ? kommoError.message : String(kommoError) },
      502,
    );
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error: upsertError } = await supabase.from('funis_kommo_criacoes').upsert(
    {
      funil_gerado_id: funilId,
      implementacao_id: implementacaoId,
      user_id: userData.user?.id,
      kommo_pipeline_id: resultado.pipelineId,
      kommo_status_ids: resultado.statusIds,
      kommo_campos_ids: resultado.campoIds,
      criado_em: new Date().toISOString(),
    },
    { onConflict: 'funil_gerado_id' },
  );

  if (upsertError) {
    console.error('Erro ao salvar funis_kommo_criacoes', upsertError);
  }

  let funilPadrao: { apagado: boolean; motivo?: string; pipelineId?: number } | undefined;
  if (apagarFunilPadrao) {
    try {
      funilPadrao = await apagarFunilPadraoSeVazio(credencial.subdominio, credencial.token);
    } catch (limpezaError) {
      console.error('Erro ao tentar apagar o funil padrão do Kommo', limpezaError);
      funilPadrao = {
        apagado: false,
        motivo: limpezaError instanceof Error ? limpezaError.message : String(limpezaError),
      };
    }
  }

  return jsonResponse({ ok: true, ...resultado, funil_padrao: funilPadrao });
});
