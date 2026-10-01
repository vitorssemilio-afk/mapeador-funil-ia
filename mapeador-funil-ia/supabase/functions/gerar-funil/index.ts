import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { formatRespostasTexto, formatValorPergunta } from '../../../src/data/formatRespostas.ts';
import type { BlocoFormulario, FormularioTipo, Pergunta } from '../../../src/data/formSchema.ts';
import type { EtapaFunil } from '../../../src/types/database.ts';
import { ErroTimeoutIA, modeloAnthropicAtual } from '../_shared/anthropic.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { sincronizarLinhaGoogleSheets } from '../_shared/googleSheets.ts';
import { ErroRespostaInvalidaIA, gerarFunisComIA } from './ia.ts';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_POS_VENDA } from './prompt.ts';

// Mensagem amigável pro usuário — nunca expõe detalhe técnico (status HTTP,
// stack trace, corpo de erro da Anthropic). O detalhe técnico vai só pro
// log (console.error) e pra ia_operacoes.erro_mensagem_tecnica.
function mensagemAmigavelErroIA(erro: unknown): { codigo: string; amigavel: string } {
  if (erro instanceof ErroTimeoutIA) {
    return { codigo: 'timeout', amigavel: 'A geração está demorando mais que o esperado. Tente novamente em instantes.' };
  }
  if (erro instanceof ErroRespostaInvalidaIA) {
    return {
      codigo: 'resposta_invalida',
      amigavel: 'Não foi possível interpretar a resposta da IA. Nenhuma informação foi perdida — tente novamente.',
    };
  }
  return {
    codigo: 'erro_ia',
    amigavel: 'Não conseguimos gerar o funil agora. Seus dados continuam salvos e você pode tentar novamente.',
  };
}

// Não deixa a geração do funil falhar por causa da planilha — a integração
// com o Sheets é um bônus, o funil em si é o que importa de verdade.
async function sincronizarComGoogleSheetsSeConfigurado(
  mapeamento: { id: string; nome_negocio: string; status: string; respostas: unknown; updated_at: string },
  blocos: BlocoFormulario[],
): Promise<void> {
  const serviceAccountRaw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  const spreadsheetId = Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID');
  if (!serviceAccountRaw || !spreadsheetId) {
    console.error(
      `Sincronização com Google Sheets pulada: secret(s) ausente(s) — ${[
        !serviceAccountRaw && 'GOOGLE_SERVICE_ACCOUNT_JSON',
        !spreadsheetId && 'GOOGLE_SHEETS_SPREADSHEET_ID',
      ]
        .filter(Boolean)
        .join(', ')}.`,
    );
    return;
  }

  try {
    const credenciais = JSON.parse(serviceAccountRaw);
    const perguntas = blocos.flatMap((b) => b.perguntas);
    const respostas = (mapeamento.respostas ?? {}) as Record<string, unknown>;

    const cabecalho = [
      'ID do Mapeamento',
      'Nome do Negócio',
      'Status',
      'Concluído em',
      ...perguntas.map((p) => p.label),
    ];
    const linha = [
      mapeamento.id,
      mapeamento.nome_negocio,
      mapeamento.status,
      mapeamento.updated_at,
      ...perguntas.map((p) => formatValorPergunta(p, respostas)),
    ];

    await sincronizarLinhaGoogleSheets({
      credenciais,
      spreadsheetId,
      cabecalho,
      idUnico: mapeamento.id,
      linha,
    });
  } catch (err) {
    console.error('Falha ao sincronizar com o Google Sheets', err);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function carregarBlocosFormulario(
  supabase: ReturnType<typeof createClient>,
  tipo: FormularioTipo,
): Promise<BlocoFormulario[]> {
  const { data: blocosRows } = await supabase
    .from('blocos_formulario')
    .select('id, titulo, ordem')
    .eq('formulario_tipo', tipo)
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
          incluir_na_geracao_ia: boolean;
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
          incluirNaGeracaoIa: p.incluir_na_geracao_ia,
        }),
      ),
  }));
}

function formatFunisResumoTexto(
  funis: { nome_funil: string; tipo_funil: string; etapas: EtapaFunil[] }[],
): string {
  return funis
    .map((funil) => {
      const etapas = funil.etapas.map((e) => `  - ${e.nome}: ${e.objetivo}`).join('\n');
      return `### ${funil.nome_funil} (${funil.tipo_funil})\n${etapas}`;
    })
    .join('\n\n');
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

  // Evita disparar duas gerações em paralelo pro mesmo mapeamento (clique
  // duplo, aba duplicada) — usa o índice parcial em ia_operacoes.
  const { data: operacaoEmAndamento } = await supabase
    .from('ia_operacoes')
    .select('id')
    .eq('tipo_operacao', 'gerar_funil')
    .eq('mapeamento_id', mapeamentoId)
    .in('status', ['processando', 'tentando_novamente'])
    .limit(1)
    .maybeSingle();

  if (operacaoEmAndamento) {
    return jsonResponse(
      { error: 'Já existe uma geração em andamento para este mapeamento. Aguarde ela terminar.' },
      409,
    );
  }

  await supabase.from('mapeamentos').update({ status: 'processando_ia' }).eq('id', mapeamentoId);

  const tipo: FormularioTipo = (mapeamento.tipo as FormularioTipo | undefined) ?? 'vendas';
  const blocos = await carregarBlocosFormulario(supabase, tipo);
  const respostasTexto = formatRespostasTexto(
    blocos,
    (mapeamento.respostas ?? {}) as Record<string, unknown>,
  );

  const { data: camposPadrao } = await supabase
    .from('campos_padrao')
    .select('entidade, nome_campo, tipo, opcoes');
  const camposPadraoTexto = formatCamposPadraoTexto(camposPadrao ?? []);

  let systemPrompt = tipo === 'pos_venda' ? SYSTEM_PROMPT_POS_VENDA : SYSTEM_PROMPT;

  // Config de IA (Fase 2 de Configurações) — só parâmetros não sensíveis.
  // Se não houver linha de config ainda, mantém o comportamento atual
  // (perguntas de esclarecimento permitidas, temperatura padrão do modelo).
  const { data: configIA } = await supabase
    .from('configuracoes_ia')
    .select('temperatura, permitir_perguntas_esclarecimento')
    .eq('id', true)
    .maybeSingle();

  if (configIA?.permitir_perguntas_esclarecimento === false) {
    systemPrompt += `\n\n## Override de configuração\nNão faça perguntas de esclarecimento nesta geração, mesmo que a Regra 0 do prompt acima normalmente peça isso. Gere os funis diretamente com as informações disponíveis, assumindo o cenário mais provável quando faltar algum detalhe.`;
  }

  const temperaturaIA = typeof configIA?.temperatura === 'number' ? configIA.temperatura : null;

  let contextoAdicional: string | undefined;
  if (tipo === 'pos_venda' && mapeamento.mapeamento_origem_id) {
    const partesContexto: string[] = [];

    const { data: mapeamentoVendas } = await supabase
      .from('mapeamentos')
      .select('respostas')
      .eq('id', mapeamento.mapeamento_origem_id as string)
      .maybeSingle();

    if (mapeamentoVendas) {
      const blocosVendas = await carregarBlocosFormulario(supabase, 'vendas');
      const respostasVendasTexto = formatRespostasTexto(
        blocosVendas,
        (mapeamentoVendas.respostas ?? {}) as Record<string, unknown>,
      );
      if (respostasVendasTexto) {
        partesContexto.push(
          `## Respostas do formulário de mapeamento de vendas já preenchido por este cliente (use isso — não peça de novo nenhuma informação que já esteja aqui)\n${respostasVendasTexto}`,
        );
      }
    }

    // Prioriza a versão do funil de vendas já APROVADA pelo cliente (ver
    // funil_versoes / aprovarVersaoAtual em src/lib/funilVersoes.ts) — só cai
    // pra última versão gerada (rascunho) quando nenhuma versão foi aprovada
    // ainda, pra não alimentar o pós-venda com um funil de vendas que ainda
    // pode mudar antes da aprovação do cliente.
    const { data: versaoAprovada } = await supabase
      .from('funil_versoes')
      .select('versao')
      .eq('mapeamento_id', mapeamento.mapeamento_origem_id as string)
      .eq('status', 'aprovada')
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();

    let versaoAlvo = versaoAprovada?.versao ?? null;
    const versaoEstaAprovada = versaoAlvo !== null;

    if (versaoAlvo === null) {
      const { data: versaoMaisRecenteRow } = await supabase
        .from('funis_gerados')
        .select('versao')
        .eq('mapeamento_id', mapeamento.mapeamento_origem_id as string)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle();
      versaoAlvo = versaoMaisRecenteRow?.versao ?? null;
    }

    if (versaoAlvo !== null) {
      const { data: funisVendas } = await supabase
        .from('funis_gerados')
        .select('nome_funil, tipo_funil, etapas, versao')
        .eq('mapeamento_id', mapeamento.mapeamento_origem_id as string)
        .eq('versao', versaoAlvo);

      if (funisVendas && funisVendas.length > 0) {
        const rotulo = versaoEstaAprovada
          ? 'Funil de vendas já mapeado e APROVADO pelo cliente (a última etapa é o gatilho de entrada do pós-venda)'
          : 'Funil de vendas já mapeado para este cliente, ainda não aprovado formalmente (a última etapa é o gatilho de entrada do pós-venda)';
        partesContexto.push(`## ${rotulo}\n${formatFunisResumoTexto(funisVendas)}`);
      }
    }

    if (partesContexto.length > 0) {
      contextoAdicional = partesContexto.join('\n\n');
    }
  }

  const modelo = modeloAnthropicAtual();
  const inicioMs = Date.now();
  const { data: iaOperacaoId } = await supabase.rpc('registrar_inicio_ia_operacao', {
    p_tipo_operacao: 'gerar_funil',
    p_cliente_id: (mapeamento.cliente_id as string | null) ?? null,
    p_mapeamento_id: mapeamentoId,
    p_funil_id: null,
    p_implementacao_id: null,
    p_etapa_index: null,
    p_tentativa: 1,
    p_modelo: modelo,
  });

  let resultado;
  try {
    resultado = await gerarFunisComIA(
      respostasTexto,
      mapeamento.nome_negocio as string,
      camposPadraoTexto,
      instrucoesExtras,
      systemPrompt,
      contextoAdicional,
      temperaturaIA,
    );
  } catch (iaError) {
    console.error('Erro ao gerar funil com IA', iaError);
    const { codigo, amigavel } = mensagemAmigavelErroIA(iaError);
    if (iaOperacaoId) {
      await supabase.rpc('registrar_fim_ia_operacao', {
        p_id: iaOperacaoId,
        p_status: codigo === 'resposta_invalida' ? 'resposta_invalida' : 'falhou',
        p_duracao_ms: Date.now() - inicioMs,
        p_erro_codigo: codigo,
        p_erro_mensagem_tecnica: String(iaError instanceof Error ? iaError.message : iaError),
        p_erro_mensagem_amigavel: amigavel,
      });
    }
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
    return jsonResponse({ error: amigavel }, 502);
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

    if (iaOperacaoId) {
      await supabase.rpc('registrar_fim_ia_operacao', {
        p_id: iaOperacaoId,
        p_status: 'concluido',
        p_duracao_ms: Date.now() - inicioMs,
      });
    }

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
    if (iaOperacaoId) {
      await supabase.rpc('registrar_fim_ia_operacao', {
        p_id: iaOperacaoId,
        p_status: 'falhou',
        p_duracao_ms: Date.now() - inicioMs,
        p_erro_codigo: 'erro_gravacao',
        p_erro_mensagem_tecnica: insertError.message,
        p_erro_mensagem_amigavel:
          'Não conseguimos salvar o funil gerado agora. Seus dados continuam salvos e você pode tentar novamente.',
      });
    }
    await supabase.from('mapeamentos').update({ status: 'erro' }).eq('id', mapeamentoId);
    return jsonResponse({ error: 'Não foi possível concluir esta operação. Seus dados continuam salvos — tente novamente.' }, 500);
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
    indicadores_dashboard: resultado.indicadores_dashboard,
    classificacao_modelo_negocio: resultado.classificacao_modelo_negocio,
  });

  // Versionamento (ver migration 0045) — uma linha por versão, com quem
  // gerou (o usuário logado que chamou esta function, não necessariamente
  // o dono do mapeamento). Nunca bloqueia a geração do funil em si: se essa
  // gravação falhar, só loga.
  const { data: userData } = await supabase.auth.getUser();
  const { error: versaoError } = await supabase.from('funil_versoes').insert({
    mapeamento_id: mapeamentoId,
    versao: proximaVersao,
    origem: 'ia',
    gerado_por_email: userData?.user?.email ?? null,
  });
  if (versaoError) {
    console.error('Erro ao registrar funil_versoes', versaoError);
  }

  if (metaError) {
    console.error('Erro ao salvar geracoes_meta', metaError);
  }

  const { data: mapeamentoConcluido } = await supabase
    .from('mapeamentos')
    .update({ status: 'funil_gerado', respostas: respostasBase })
    .eq('id', mapeamentoId)
    .select()
    .single();

  if (iaOperacaoId) {
    await supabase.rpc('registrar_fim_ia_operacao', {
      p_id: iaOperacaoId,
      p_status: 'concluido',
      p_duracao_ms: Date.now() - inicioMs,
    });
  }

  if (mapeamentoConcluido && tipo === 'vendas') {
    await sincronizarComGoogleSheetsSeConfigurado(mapeamentoConcluido, blocos);
  }

  return jsonResponse({ ok: true, funis: rows });
});