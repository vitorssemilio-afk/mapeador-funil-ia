// supabase-js, quando uma Edge Function responde com status não-2xx, só
// devolve a mensagem genérica "Edge Function returned a non-2xx status
// code" no error.message — o corpo de verdade da resposta (onde a função
// manda o motivo real, ex: "Credenciais da API Kommo não cadastradas")
// fica em error.context, que é o Response cru da chamada HTTP. Sem ler
// esse corpo, qualquer erro de negócio vira essa mesma mensagem inútil.
export async function extrairMensagemErroEdgeFunction(erro: unknown): Promise<string | null> {
  if (!(erro instanceof Error)) return null;

  const contexto = (erro as { context?: unknown }).context;
  if (!(contexto instanceof Response)) return null;

  try {
    const corpo = await contexto.clone().json();
    if (typeof corpo?.message === 'string') return corpo.message;
    if (typeof corpo?.error === 'string') return corpo.error;
    return null;
  } catch {
    return null;
  }
}
