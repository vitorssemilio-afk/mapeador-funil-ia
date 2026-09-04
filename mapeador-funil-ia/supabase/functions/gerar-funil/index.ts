import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { formatRespostasTexto, formatValorPergunta } from '../../../src/data/formatRespostas.ts';
import type { BlocoFormulario, FormularioTipo, Pergunta } from '../../../src/data/formSchema.ts';
import type { EtapaFunil } from '../../../src/types/database.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { sincronizarLinhaGoogleSheets } from '../_shared/googleSheets.ts';
import { gerarFunisComIA } from './ia.ts';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_POS_VENDA } from './prompt.ts';

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

  const systemPrompt = tipo === 'pos_venda' ? SYSTEM_PROMPT_POS_VENDA : SYSTEM_PROMPT;

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

    const { data: funisVendas } = await supabase
      .from('funis_gerados')
      .select('nome_funil, tipo_funil, etapas, versao')
      .eq('mapeamento_id', mapeamento.mapeamento_origem_id as string)
      .order('versao', { ascending: false })
      .limit(20);

    if (funisVendas && funisVendas.length > 0) {
      const versaoMaisRecente = Math.max(...funisVendas.map((f: { versao: number }) => f.versao));
      const funisDaVersao = funisVendas.filter(
        (f: { versao: number }) => f.versao === versaoMaisRecente,
      );
      partesContexto.push(
        `## Funil de vendas já mapeado para este cliente (a última etapa é o gatilho de entrada do pós-venda)\n${formatFunisResumoTexto(funisDaVersao)}`,
      );
    }

    if (partesContexto.length > 0) {
      contextoAdicional = partesContexto.join('\n\n');
    }
  }

  let resultado;
  try {
    resultado = await gerarFunisComIA(
      respostasTexto,
      mapeamento.nome_negocio as string,
      camposPadraoTexto,
      instrucoesExtras,
      systemPrompt,
      contextoAdicional,
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
    indicadores_dashboard: resultado.indicadores_dashboard,
  });

  if (metaError) {
    console.error('Erro ao salvar geracoes_meta', metaError);
  }

  const { data: mapeamentoConcluido } = await supabase
    .from('mapeamentos')
    .update({ status: 'concluido', respostas: respostasBase })
    .eq('id', mapeamentoId)
    .select()
    .single();

  if (mapeamentoConcluido && tipo === 'vendas') {
    await sincronizarComGoogleSheetsSeConfigurado(mapeamentoConcluido, blocos);
  }

  return jsonResponse({ ok: true, funis: rows });
});