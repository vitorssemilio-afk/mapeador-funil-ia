// Cliente mínimo da API do Kommo (v4) pra criar um pipeline com etapas e os
// campos personalizados associados, a partir da estrutura de etapas que a
// Edge Function gerar-funil já produz (ver supabase/functions/gerar-funil/prompt.ts).

export type CampoEtapaInput = {
  nome: string;
  tipo: string;
  opcoes?: string[];
};

export type EtapaFunilInput = {
  nome: string;
  campos_obrigatorios?: CampoEtapaInput[];
  campos_desejaveis?: CampoEtapaInput[];
};

export interface KommoCriacaoResultado {
  pipelineId: number;
  statusIds: { id: number; nome: string }[];
  campoIds: { id: number; nome: string }[];
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
  // Kommo não tem um tipo "telefone" simples pra custom field de lead (o
  // telefone "de verdade" vive no contato, como multitext com código de
  // país); simplificação: cai como texto.
  telefone: 'text',
};

const TIPOS_COM_OPCOES = new Set(['select', 'multiselect', 'radiobutton']);

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

/** Junta campos_obrigatorios/desejaveis de todas as etapas, sem repetir nome (obrigatório vence). */
function deduplicarCampos(
  etapas: EtapaFunilInput[],
): { nome: string; tipo: string; opcoes?: string[]; obrigatorio: boolean }[] {
  const mapa = new Map<string, { nome: string; tipo: string; opcoes?: string[]; obrigatorio: boolean }>();

  for (const etapa of etapas) {
    for (const campo of etapa.campos_obrigatorios ?? []) {
      const chave = campo.nome.trim().toLowerCase();
      mapa.set(chave, { nome: campo.nome.trim(), tipo: campo.tipo, opcoes: campo.opcoes, obrigatorio: true });
    }
    for (const campo of etapa.campos_desejaveis ?? []) {
      const chave = campo.nome.trim().toLowerCase();
      if (!mapa.has(chave)) {
        mapa.set(chave, { nome: campo.nome.trim(), tipo: campo.tipo, opcoes: campo.opcoes, obrigatorio: false });
      }
    }
  }

  return [...mapa.values()];
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
  let camposCriados: { id: number; name: string }[] = [];

  if (camposUnicos.length > 0) {
    const camposPayload = camposUnicos.map((campo) => {
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

    const camposData = await kommoRequest<{
      _embedded?: { custom_fields?: { id: number; name: string }[] };
    }>(baseUrl, token, '/leads/custom_fields', { method: 'POST', body: JSON.stringify(camposPayload) });

    camposCriados = camposData._embedded?.custom_fields ?? [];
  }

  return {
    pipelineId: pipeline.id,
    statusIds: (pipeline._embedded?.statuses ?? []).map((s) => ({ id: s.id, nome: s.name })),
    campoIds: camposCriados.map((c) => ({ id: c.id, nome: c.name })),
  };
}
