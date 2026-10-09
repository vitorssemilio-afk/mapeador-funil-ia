// Webhook de integração com o App de Atas (MVP) — recebe a ata já
// finalizada/aprovada lá, identifica cliente/implementação/reunião no
// Mapeador (nunca só pelo nome — prioridade reuniao_id > implementacao_id >
// cliente_id > revisão manual) e salva. NUNCA cria pendência automaticamente
// — isso só acontece depois, quando o consultor revisa as ações na tela da
// reunião.
//
// Autenticação: header `Authorization: Bearer <ATAS_WEBHOOK_SECRET>` — um
// segredo único por ambiente, guardado só como secret da Edge Function
// (nunca em frontend, nunca logado). Sem relação com o login dos usuários
// do Mapeador — é uma chamada servidor-a-servidor, por isso usa a service
// role internamente (não existe sessão de usuário aqui).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

type ParticipanteInput = { nome?: unknown; papel?: unknown };
type DecisaoInput = { titulo?: unknown; descricao?: unknown };
type AcaoInput = {
  titulo?: unknown;
  descricao?: unknown;
  responsavel_nome?: unknown;
  responsavel_tipo?: unknown;
  prazo_sugerido?: unknown;
};

type MinutePayload = {
  external_minute_id?: unknown;
  integration_source?: unknown;
  cliente_id?: unknown;
  implementacao_id?: unknown;
  reuniao_id?: unknown;
  tipo_reuniao?: unknown;
  titulo?: unknown;
  data_reuniao?: unknown;
  participantes?: unknown;
  resumo?: unknown;
  decisoes?: unknown;
  acoes?: unknown;
  conteudo_original?: unknown;
  gerada_em?: unknown;
};

async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

function asString(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

// O App de Atas manda o tipo de reunião como rótulo em português (o mesmo
// que aparece na tela de Reuniões, ex: "Tira-dúvidas"), não como o slug
// interno (`tira_duvidas`) que fica salvo em `reunioes.tipo`. Sem
// normalizar aqui, o fallback de vínculo automático por tipo+data (seção
// 10) nunca bate — toda ata cai em requer_revisao mesmo quando a reunião
// certa já existe. Aceita também o próprio slug (caso ele venha a mudar a
// integração no futuro), comparando sem acento/maiúsculas para tolerar
// pequenas variações de grafia.
const SLUGS_TIPO_REUNIAO = [
  'kickoff',
  'treinamento',
  'checkin_1',
  'checkin_2',
  'tira_duvidas',
  'reuniao_final',
  'extraordinaria',
] as const;

const ROTULOS_TIPO_REUNIAO: Record<string, (typeof SLUGS_TIPO_REUNIAO)[number]> = {
  kickoff: 'kickoff',
  treinamento: 'treinamento',
  'check-in 1': 'checkin_1',
  'checkin 1': 'checkin_1',
  'check-in 2': 'checkin_2',
  'checkin 2': 'checkin_2',
  'tira-duvidas': 'tira_duvidas',
  'tira duvidas': 'tira_duvidas',
  'reuniao final / entrega': 'reuniao_final',
  'reuniao final': 'reuniao_final',
  entrega: 'reuniao_final',
  'reuniao extraordinaria': 'extraordinaria',
  extraordinaria: 'extraordinaria',
};

function normalizarTextoSimples(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizarTipoReuniao(valor: string | null): string | null {
  if (!valor) return null;
  const normalizado = normalizarTextoSimples(valor);
  if ((SLUGS_TIPO_REUNIAO as readonly string[]).includes(normalizado)) return normalizado;
  return ROTULOS_TIPO_REUNIAO[normalizado] ?? valor;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, status: 'error', message: 'Método não suportado.' }, 405);
  }

  const secretEsperado = Deno.env.get('ATAS_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  const tokenRecebido = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!secretEsperado || !tokenRecebido || tokenRecebido !== secretEsperado) {
    return jsonResponse({ success: false, status: 'error', message: 'Não autenticado.' }, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  async function registrarLog(params: {
    externalMinuteId: string | null;
    integrationSource: string;
    ataId: string | null;
    evento: string;
    sucesso: boolean;
    mensagemErro?: string | null;
    detalhes?: Record<string, unknown>;
  }) {
    await supabase.from('atas_integracao_log').insert({
      external_minute_id: params.externalMinuteId,
      integration_source: params.integrationSource,
      ata_id: params.ataId,
      evento: params.evento,
      sucesso: params.sucesso,
      mensagem_erro: params.mensagemErro ?? null,
      detalhes: params.detalhes ?? {},
    });
  }

  let payload: MinutePayload | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, status: 'error', message: 'Corpo da requisição inválido.' }, 400);
  }

  const externalMinuteId = asString(payload?.external_minute_id);
  const integrationSource = asString(payload?.integration_source) ?? 'app_atas';
  const resumo = asString(payload?.resumo);
  const conteudoOriginal = asString(payload?.conteudo_original);

  if (!externalMinuteId) {
    return jsonResponse({ success: false, status: 'error', message: 'external_minute_id é obrigatório.' }, 400);
  }
  if (!resumo && !conteudoOriginal) {
    return jsonResponse(
      { success: false, status: 'error', message: 'Informe ao menos resumo ou conteudo_original.' },
      400,
    );
  }

  const clienteIdInput = isUuid(payload?.cliente_id) ? (payload!.cliente_id as string) : null;
  const implementacaoIdInput = isUuid(payload?.implementacao_id) ? (payload!.implementacao_id as string) : null;
  const reuniaoIdInput = isUuid(payload?.reuniao_id) ? (payload!.reuniao_id as string) : null;
  const tipoReuniao = normalizarTipoReuniao(asString(payload?.tipo_reuniao));
  const titulo = asString(payload?.titulo);
  const dataReuniao = asString(payload?.data_reuniao);
  const geradaEm = asString(payload?.gerada_em);

  // ============================================================
  // Diagnóstico temporário (vínculo da Colégio Ieprol, 09/10/2026) — o App
  // de Atas mostrou cliente_id/implementacao_id/tipo_reuniao preenchidos
  // na própria tela antes de enviar, mas eles chegaram null aqui. Grava o
  // payload bruto (chaves recebidas + valor exato desses 4 campos, antes
  // de qualquer validação/normalização) pra provar com dado real o que de
  // fato está sendo mandado, já que não temos acesso ao código do App de
  // Atas. Remover quando a causa do lado de lá estiver confirmada e
  // corrigida.
  await registrarLog({
    externalMinuteId,
    integrationSource,
    ataId: null,
    evento: 'diagnostico_payload_recebido',
    sucesso: true,
    detalhes: {
      chaves_recebidas: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      cliente_id_bruto: payload?.cliente_id ?? null,
      implementacao_id_bruto: payload?.implementacao_id ?? null,
      reuniao_id_bruto: payload?.reuniao_id ?? null,
      tipo_reuniao_bruto: payload?.tipo_reuniao ?? null,
    },
  });

  const participantes: ParticipanteInput[] = Array.isArray(payload?.participantes) ? (payload!.participantes as ParticipanteInput[]) : [];
  const decisoes: DecisaoInput[] = Array.isArray(payload?.decisoes) ? (payload!.decisoes as DecisaoInput[]) : [];
  const acoesInput: AcaoInput[] = Array.isArray(payload?.acoes) ? (payload!.acoes as AcaoInput[]) : [];

  // ============================================================
  // Idempotência (seção 7) — mesmo external_minute_id + mesmo conteúdo =
  // already_processed, sem inserir nada de novo. Conteúdo diferente =
  // nova versão (o trigger definir_versao_ata_reuniao calcula o número).
  // ============================================================
  const conteudoHash = await sha256Hex(
    JSON.stringify({ resumo, decisoes, acoes: acoesInput, conteudo_original: conteudoOriginal }),
  );

  const { data: versaoAnterior } = await supabase
    .from('atas_reuniao')
    .select('id, conteudo_hash, status, cliente_id, implementacao_id, reuniao_id, tipo_reuniao')
    .eq('integration_source', integrationSource)
    .eq('external_minute_id', externalMinuteId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Reenvio só pra corrigir o vínculo (seções 10/30) — o hash de conteúdo
  // (resumo/decisões/ações/conteúdo original) não muda quando o App de
  // Atas apenas corrige cliente_id/implementacao_id/reuniao_id/
  // tipo_reuniao num reenvio, então sem este caso especial a ata ficava
  // presa pra sempre em requer_revisao: o reenvio caía direto no
  // "already_processed" abaixo, e a correção nunca chegava a ser
  // aplicada (foi exatamente o que aconteceu com a ata do Colégio
  // Ieprol). Só reabre a tentativa de vínculo quando a ata anterior ainda
  // não estava resolvida E o reenvio trouxe algum identificador
  // novo/diferente do que já estava salvo — nunca mexe numa ata que já
  // está 'vinculada'/'processada'.
  const statusAnteriorPendente =
    versaoAnterior?.status === 'requer_revisao' || versaoAnterior?.status === 'erro_vinculo';
  const trouxeNovaInformacaoDeVinculo =
    !!versaoAnterior &&
    statusAnteriorPendente &&
    ((!!clienteIdInput && clienteIdInput !== versaoAnterior.cliente_id) ||
      (!!implementacaoIdInput && implementacaoIdInput !== versaoAnterior.implementacao_id) ||
      (!!reuniaoIdInput && reuniaoIdInput !== versaoAnterior.reuniao_id));

  if (versaoAnterior && versaoAnterior.conteudo_hash === conteudoHash && !trouxeNovaInformacaoDeVinculo) {
    await registrarLog({
      externalMinuteId,
      integrationSource,
      ataId: versaoAnterior.id,
      evento: 'reenvio_idempotente',
      sucesso: true,
    });
    return jsonResponse({ success: true, status: 'already_processed', minute_id: versaoAnterior.id });
  }

  const revinculandoAtaExistente = trouxeNovaInformacaoDeVinculo && versaoAnterior!.conteudo_hash === conteudoHash;

  // ============================================================
  // Identificação do vínculo (seções 2/9/10) — nunca só pelo nome.
  // Prioridade: reuniao_id > implementacao_id/cliente_id com fallback por
  // tipo+data > nada (requer_revisao). Num re-vínculo, um identificador
  // que não veio de novo no reenvio continua valendo o que já estava
  // salvo na ata anterior.
  // ============================================================
  let clienteId: string | null = clienteIdInput ?? (revinculandoAtaExistente ? versaoAnterior!.cliente_id : null);
  let implementacaoId: string | null =
    implementacaoIdInput ?? (revinculandoAtaExistente ? versaoAnterior!.implementacao_id : null);
  const reuniaoIdParaResolver = reuniaoIdInput ?? (revinculandoAtaExistente ? versaoAnterior!.reuniao_id : null);
  const tipoReuniaoParaResolver = tipoReuniao ?? (revinculandoAtaExistente ? versaoAnterior!.tipo_reuniao : null);
  let reuniaoId: string | null = null;
  let status: string = 'requer_revisao';
  let vinculoTipo: string | null = null;
  let erroMensagem: string | null = null;

  if (reuniaoIdParaResolver) {
    const { data: reuniao } = await supabase
      .from('reunioes')
      .select('id, cliente_id, implementacao_id')
      .eq('id', reuniaoIdParaResolver)
      .maybeSingle();

    if (!reuniao) {
      status = 'erro_vinculo';
      erroMensagem = 'reuniao_id informado não existe.';
    } else if (
      (clienteId && reuniao.cliente_id !== clienteId) ||
      (implementacaoId && reuniao.implementacao_id !== implementacaoId)
    ) {
      status = 'erro_vinculo';
      erroMensagem = 'reuniao_id não pertence ao cliente/implementação informados.';
    } else {
      reuniaoId = reuniao.id;
      clienteId = reuniao.cliente_id;
      implementacaoId = reuniao.implementacao_id;
      status = 'vinculada';
      vinculoTipo = 'automatico_id';
    }
  } else if (implementacaoId && tipoReuniaoParaResolver && dataReuniao) {
    // Fallback sem reuniao_id (seção 10): tipo + data aproximada (±48h).
    const dataAlvo = new Date(dataReuniao);
    const janelaInicio = new Date(dataAlvo.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const janelaFim = new Date(dataAlvo.getTime() + 48 * 60 * 60 * 1000).toISOString();

    const { data: candidatas } = await supabase
      .from('reunioes')
      .select('id, cliente_id, implementacao_id')
      .eq('implementacao_id', implementacaoId)
      .eq('tipo', tipoReuniaoParaResolver)
      .gte('data_hora', janelaInicio)
      .lte('data_hora', janelaFim);

    if (candidatas && candidatas.length === 1) {
      reuniaoId = candidatas[0].id;
      clienteId = candidatas[0].cliente_id;
      status = 'vinculada';
      vinculoTipo = 'automatico_sugerido';
    } else {
      status = 'requer_revisao';
      erroMensagem =
        candidatas && candidatas.length > 1
          ? 'Mais de uma reunião compatível encontrada — vínculo precisa ser escolhido manualmente.'
          : 'Nenhuma reunião compatível encontrada automaticamente.';
    }
  } else if (implementacaoId || clienteId) {
    status = 'requer_revisao';
    erroMensagem = 'Sem reuniao_id e sem dados suficientes (tipo + data) para sugerir vínculo automático.';
  } else {
    status = 'requer_revisao';
    erroMensagem = 'Nenhum identificador de cliente/implementação/reunião informado.';
  }

  let ataInserida: { id: string } | null;
  let insertError: { message: string } | null;

  if (revinculandoAtaExistente) {
    const { data, error } = await supabase
      .from('atas_reuniao')
      .update({
        cliente_id: clienteId,
        implementacao_id: implementacaoId,
        reuniao_id: reuniaoId,
        tipo_reuniao: tipoReuniaoParaResolver,
        status,
        vinculo_tipo: vinculoTipo,
        erro_mensagem: erroMensagem,
        processado_em: new Date().toISOString(),
      })
      .eq('id', versaoAnterior!.id)
      .select('id')
      .single();
    ataInserida = data;
    insertError = error;
  } else {
    const { data, error } = await supabase
      .from('atas_reuniao')
      .insert({
        external_minute_id: externalMinuteId,
        integration_source: integrationSource,
        cliente_id: clienteId,
        implementacao_id: implementacaoId,
        reuniao_id: reuniaoId,
        tipo_reuniao: tipoReuniaoParaResolver,
        titulo,
        data_reuniao: dataReuniao,
        participantes,
        resumo,
        decisoes,
        conteudo_original: conteudoOriginal,
        conteudo_hash: conteudoHash,
        gerada_em: geradaEm,
        status,
        vinculo_tipo: vinculoTipo,
        erro_mensagem: erroMensagem,
        processado_em: new Date().toISOString(),
      })
      .select('id')
      .single();
    ataInserida = data;
    insertError = error;
  }

  if (insertError || !ataInserida) {
    await registrarLog({
      externalMinuteId,
      integrationSource,
      ataId: null,
      evento: 'erro_insercao',
      sucesso: false,
      mensagemErro: insertError?.message ?? 'Falha desconhecida ao salvar a ata.',
    });
    return jsonResponse(
      { success: false, status: 'error', message: 'Não foi possível salvar a ata.' },
      500,
    );
  }

  // Ações identificadas (seção 15/22) — sempre pendente_revisao; NUNCA
  // viram pendência aqui. Num re-vínculo (conteúdo idêntico ao que já
  // estava salvo), as ações já foram gravadas na tentativa anterior — só
  // conta quantas ainda estão pendentes de revisão pra decidir a
  // notificação abaixo, sem inserir de novo (duplicaria a mesma ação).
  let acoesPendentes = 0;
  if (revinculandoAtaExistente) {
    const { count } = await supabase
      .from('ata_acoes_identificadas')
      .select('id', { count: 'exact', head: true })
      .eq('ata_id', ataInserida.id)
      .eq('status', 'pendente_revisao');
    acoesPendentes = count ?? 0;
  } else if (acoesInput.length > 0) {
    const linhasAcoes = acoesInput
      .map((acao, indice) => ({
        ata_id: ataInserida.id,
        titulo: asString(acao.titulo),
        descricao: asString(acao.descricao),
        responsavel_nome: asString(acao.responsavel_nome),
        responsavel_tipo:
          acao.responsavel_tipo === 'cliente' || acao.responsavel_tipo === 'interna' ? acao.responsavel_tipo : null,
        prazo_sugerido: asString(acao.prazo_sugerido),
        ordem: indice,
      }))
      .filter((linha) => !!linha.titulo);

    if (linhasAcoes.length > 0) {
      const { error: acoesError } = await supabase.from('ata_acoes_identificadas').insert(linhasAcoes);
      if (acoesError) {
        await registrarLog({
          externalMinuteId,
          integrationSource,
          ataId: ataInserida.id,
          evento: 'erro_acoes',
          sucesso: false,
          mensagemErro: acoesError.message,
        });
      } else {
        acoesPendentes = linhasAcoes.length;
      }
    }
  }

  // Notificação única (seção 27) — só quando há pelo menos uma ação
  // aguardando revisão e já existe um dono claro (cliente/implementação).
  if (acoesPendentes > 0 && (clienteId || implementacaoId)) {
    await supabase
      .from('notificacoes')
      .upsert(
        {
          categoria: 'reuniao',
          tipo: 'ata_aguardando_revisao',
          titulo: `${titulo ?? 'Reunião'} possui ${acoesPendentes} ação(ões) aguardando revisão`,
          descricao: 'A ata foi recebida do App de Atas e tem ações que ainda precisam ser revisadas.',
          cliente_id: clienteId,
          implementacao_id: implementacaoId,
          prioridade: 'atencao',
          rota: implementacaoId ? `/implementacoes/${implementacaoId}` : null,
          entidade_tipo: 'ata_integracao',
          entidade_id: ataInserida.id,
          chave_idempotencia: `ata_revisao_${ataInserida.id}`,
        },
        { onConflict: 'chave_idempotencia', ignoreDuplicates: true },
      );
  }

  await supabase.from('auditoria_eventos').insert({
    acao: status === 'vinculada' ? 'ata_recebida_vinculada' : status === 'erro_vinculo' ? 'ata_erro_vinculo' : 'ata_recebida_requer_revisao',
    entidade: 'ata_integracao',
    entidade_id: ataInserida.id,
    cliente_id: clienteId,
    implementacao_id: implementacaoId,
    detalhes: { external_minute_id: externalMinuteId, acoes: acoesPendentes },
  });

  await registrarLog({
    externalMinuteId,
    integrationSource,
    ataId: ataInserida.id,
    evento: 'ata_processada',
    sucesso: status !== 'erro_vinculo',
    mensagemErro: erroMensagem,
    detalhes: { status, vinculo_tipo: vinculoTipo, acoes: acoesPendentes, revinculado: revinculandoAtaExistente },
  });

  if (status === 'erro_vinculo') {
    return jsonResponse({
      success: false,
      status: 'requires_link',
      minute_id: ataInserida.id,
      message: erroMensagem,
    });
  }

  if (status === 'requer_revisao') {
    return jsonResponse({
      success: true,
      status: 'requires_link',
      minute_id: ataInserida.id,
      message: erroMensagem,
    });
  }

  return jsonResponse({
    success: true,
    status: 'received',
    minute_id: ataInserida.id,
    meeting_id: reuniaoId,
  });
});
