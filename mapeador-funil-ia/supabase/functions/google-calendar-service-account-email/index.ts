// Endpoint minúsculo só pra UI mostrar, pro consultor, qual e-mail ele
// precisa compartilhar o Google Calendar dele — o client_email de uma conta
// de serviço não é segredo (é o mesmo e-mail que se compartilha com
// qualquer app/planilha), só a private_key é sensível e nunca sai daqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Não autenticado.' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Não autenticado.' }, 401);
  }

  const serviceAccountRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountRaw) {
    return jsonResponse({ error: 'Secret GOOGLE_SERVICE_ACCOUNT_JSON não configurado.' }, 500);
  }

  try {
    const { client_email } = JSON.parse(serviceAccountRaw);
    return jsonResponse({ email: client_email });
  } catch {
    return jsonResponse({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.' }, 500);
  }
});
