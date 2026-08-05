// Cliente mínimo da API do Kommo (v4) pra criar um pipeline com etapas e os
// campos personalizados associados, a partir da estrutura de etapas que a
// Edge Function gerar-funil já produz (ver supabase/functions/gerar-funil/prompt.ts).

export type CampoEtapaInput = {
  nome: string;
  tipo: string;
  opcoes?: string[];
  entidade?: 'LEAD' | 'CONTATO';
};

export type EtapaFunilInput = {
  nome: string;
  campos_obrigatorios?: CampoEtapaInput[];
  campos_desejaveis?: CampoEtapaInput[];
};

export interface KommoCriacaoResultado {
  pipelineId: number;
  statusIds: { id: number; nome: string }[];
  campoIds: { id: number; nome: string; entidade: 'LEAD' | 'CONTATO' }[];
}

export interface ApagarFunilPadraoResultado {
  apagado: boolean;
  pipelineId?: number;
  motivo?: string;
}

// Vocabulário de tipo usado no JSON gerado pela IA (mesmo de campos_padrao)
// -> tipo de custom field aceito pela API do Kommo.
const TIPO_CAMPO_KOMMO: Record<string, string> = {
  lista_suspensa: 'select',
  texto_curto: 'text',
  texto_longo: 'textarea',
  numero: 'numeric',
  data: 'date',
  checkbox: 'checkbox',
  // Kommo não tem um tipo "telefone" simples pra custom field genérico (o
  // telefone "de verdade" no Kommo é um multitext com código de país
  // específico do contato); simplificação: cai como texto.
  telefone: 'text',
};

const TIPOS_COM_OPCOES = new Set(['select', 'multiselect', 'radiobutton']);

// entidade -> caminho da API de custom fields correspondente.
const ENTIDADE_PATH: Record<'LEAD' | 'CONTATO', string> = {
  LEAD: '/leads/custom_fields',
  CONTATO: '/contacts/custom_fields',
};

async function kommoRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const detail =
      body?.['validation-errors']?.map((e: unknown) => JSON.stringify(e)).join('; ') ??
      body?.title ??
      res.statusText;
    throw new Error(`Kommo API ${res.status}: ${detail}`);
  }

  return body as T;
}

type CampoDeduplicado = {
  nome: string;
  tipo: string;
  opcoes?: string[];
  entidade: 'LEAD' | 'CONTATO';
  obrigatorio: boolean;
};

/**
 * Junta campos_obrigatorios/desejaveis de todas as etapas, sem repetir nome
 * dentro da mesma entidade (obrigatório vence sobre desejável). Campos sem
 * "entidade" definida (funis gerados antes desse campo existir) caem em LEAD.
 */
function deduplicarCampos(etapas: EtapaFunilInput[]): CampoDeduplicado[] {
  const mapa = new Map<string, CampoDeduplicado>();

  function registrar(campo: CampoEtapaInput, obrigatorio: boolean) {
    const entidade = campo.entidade === 'CONTATO' ? 'CONTATO' : 'LEAD';
    const chave = `${entidade}:${campo.nome.trim().toLowerCase()}`;
    const existente = mapa.get(chave);
    if (!existente || (obrigatorio && !existente.obrigatorio)) {
      mapa.set(chave, { nome: campo.nome.trim(), tipo: campo.tipo, opcoes: campo.opcoes, entidade, obrigatorio });
    }
  }

  for (const etapa of etapas) {
    for (const campo of etapa.campos_obrigatorios ?? []) registrar(campo, true);
    for (const campo of etapa.campos_desejaveis ?? []) registrar(campo, false);
  }

  return [...mapa.values()];
}

async function criarCamposDaEntidade(
  baseUrl: string,
  token: string,
  entidade: 'LEAD' | 'CONTATO',
  campos: CampoDeduplicado[],
): Promise<{ id: number; name: string; entidade: 'LEAD' | 'CONTATO' }[]> {
  if (campos.length === 0) return [];

  const payload = campos.map((campo) => {
    const tipoKommo = TIPO_CAMPO_KOMMO[campo.tipo] ?? 'text';
    return {
      name: campo.nome,
      type: tipoKommo,
      is_required: campo.obrigatorio,
      ...(campo.opcoes && campo.opcoes.length > 0 && TIPOS_COM_OPCOES.has(tipoKommo)
        ? { enums: campo.opcoes.map((valor, i) => ({ value: valor, sort: (i + 1) * 10 })) }
        : {}),
    };
  });

  const data = await kommoRequest<{ _embedded?: { custom_fields?: { id: number; name: string }[] } }>(
    baseUrl,
    token,
    ENTIDADE_PATH[entidade],
    { method: 'POST', body: JSON.stringify(payload) },
  );

  return (data._embedded?.custom_fields ?? []).map((c) => ({ ...c, entidade }));
}

export async function criarFunilNoKommo(
  subdominio: string,
  token: string,
  nomeFunil: string,
  etapas: EtapaFunilInput[],
): Promise<KommoCriacaoResultado> {
  const baseUrl = `https://${subdominio}.kommo.com/api/v4`;

  // O Kommo sempre cria "Entrada de leads" no início e "Ganho"/"Perdido" no
  // fim automaticamente — a etapa final "Perdido/Desqualificado" que a IA
  // sempre inclui (regra 3 do prompt) já é coberta por isso, então não
  // criamos ela como etapa intermediária duplicada.
  const etapasIntermediarias = etapas.filter((etapa) => !/perdid|desqualificad/i.test(etapa.nome));

  if (etapasIntermediarias.length === 0) {
    throw new Error('O funil não tem etapas intermediárias além de "Perdido" pra criar no Kommo.');
  }

    // sort/is_main/is_unsorted_on são obrigatórios na API do Kommo (400
  // FieldMissing se omitidos), mesmo não tendo default óbvio no dashboard.
  // is_main=false e is_unsorted_on=false pra não mexer no pipeline
  // principal nem na captação automática de leads da conta; sort é
  // calculado a partir da quantidade de pipelines já existentes, só pra
  // esse aparecer depois dos demais na listagem.
  const pipelinesExistentes = await kommoRequest<{
    _embedded?: { pipelines?: unknown[] };
  }>(baseUrl, token, '/leads/pipelines');
  const proximoSort = ((pipelinesExistentes._embedded?.pipelines?.length ?? 0) + 1) * 10;

  const pipelinePayload = [
    {
      name: nomeFunil,
      sort: proximoSort,
      is_main: false,
      is_unsorted_on: false,
      _embedded: {
        statuses: etapasIntermediarias.map((etapa, index) => ({
          name: etapa.nome,
          sort: (index + 1) * 10,
        })),
      },
    },
  ];

  const pipelineData = await kommoRequest<{
    _embedded?: {
      pipelines?: { id: number; _embedded?: { statuses?: { id: number; name: string }[] } }[];
    };
  }>(baseUrl, token, '/leads/pipelines', { method: 'POST', body: JSON.stringify(pipelinePayload) });

  const pipeline = pipelineData._embedded?.pipelines?.[0];
  if (!pipeline) {
    throw new Error('Kommo não retornou o pipeline criado.');
  }

  const camposUnicos = deduplicarCampos(etapasIntermediarias);
  const camposLead = camposUnicos.filter((c) => c.entidade === 'LEAD');
  const camposContato = camposUnicos.filter((c) => c.entidade === 'CONTATO');

  const [criadosLead, criadosContato] = await Promise.all([
    criarCamposDaEntidade(baseUrl, token, 'LEAD', camposLead),
    criarCamposDaEntidade(baseUrl, token, 'CONTATO', camposContato),
  ]);

  return {
    pipelineId: pipeline.id,
    statusIds: (pipeline._embedded?.statuses ?? []).map((s) => ({ id: s.id, nome: s.name })),
    campoIds: [...criadosLead, ...criadosContato].map((c) => ({
      id: c.id,
      nome: c.name,
      entidade: c.entidade,
    })),
  };
}

/**
 * Apaga o pipeline padrão que o Kommo cria sozinho em toda conta nova
 * (is_main=true) — SOMENTE se ele ainda não tiver nenhuma negociação, pra
 * nunca destruir dado real do cliente. Se a conta já tiver mais de um
 * pipeline, ou o "principal" já tiver leads, não faz nada (não é erro,
 * só não há o que limpar com segurança).
 */
export async function apagarFunilPadraoSeVazio(
  subdominio: string,
  token: string,
): Promise<ApagarFunilPadraoResultado> {
  const baseUrl = `https://${subdominio}.kommo.com/api/v4`;

  const pipelinesData = await kommoRequest<{
    _embedded?: { pipelines?: { id: number; name: string; is_main: boolean }[] };
  }>(baseUrl, token, '/leads/pipelines');

  const principal = (pipelinesData._embedded?.pipelines ?? []).find((p) => p.is_main);
  if (!principal) {
    return { apagado: false, motivo: 'Nenhum pipeline principal encontrado na conta.' };
  }

  const leadsData = await kommoRequest<{ _embedded?: { leads?: unknown[] } }>(
    baseUrl,
    token,
    `/leads?filter[pipeline_id]=${principal.id}&limit=1`,
  ).catch(() => ({ _embedded: { leads: [] } }));

  if ((leadsData._embedded?.leads?.length ?? 0) > 0) {
    return {
      apagado: false,
      pipelineId: principal.id,
      motivo: `O funil principal "${principal.name}" já tem negociações — não foi apagado por segurança.`,
    };
  }

  await kommoRequest(baseUrl, token, `/leads/pipelines/${principal.id}`, { method: 'DELETE' });

  return { apagado: true, pipelineId: principal.id };
}
