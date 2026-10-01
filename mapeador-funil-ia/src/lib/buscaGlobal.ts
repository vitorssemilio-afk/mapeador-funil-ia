// Busca Global (Command Palette, Ctrl/Cmd+K) — núcleo (Fase 1) + mais 4
// entidades e filtros (Fase 2). A busca em si roda inteira no Postgres
// (migrations 0075 + 0076, funções busca_*), já respeitando a RLS por
// vínculo de cada tabela — este arquivo só chama as RPCs e cuida do
// estado client-side (recentes, por usuário, em localStorage — nunca
// sincronizado entre usuários nem com o backend).
import { supabase } from './supabaseClient';
import type { BuscaGlobalCategoria, BuscaGlobalResultado } from '../types/database';

export type CategoriaBusca = BuscaGlobalCategoria;
export type ResultadoBusca = BuscaGlobalResultado;

export const CATEGORIAS_ORDEM: CategoriaBusca[] = [
  'cliente',
  'contato',
  'implementacao',
  'criterio',
  'funil',
  'formulario',
  'reuniao',
  'ata',
  'pendencia',
  'ocorrencia',
  'arquivo',
  'consultor',
];

export const CATEGORIA_LABELS: Record<CategoriaBusca, string> = {
  cliente: 'Clientes',
  contato: 'Contatos',
  implementacao: 'Implementações',
  criterio: 'Critérios de entrega',
  funil: 'Funis',
  formulario: 'Formulários',
  reuniao: 'Reuniões',
  ata: 'Atas',
  pendencia: 'Pendências',
  ocorrencia: 'Ocorrências',
  arquivo: 'Arquivos',
  consultor: 'Consultores',
};

const RPC_POR_CATEGORIA: Record<CategoriaBusca, string> = {
  cliente: 'busca_clientes',
  contato: 'busca_contatos',
  implementacao: 'busca_implementacoes',
  criterio: 'busca_criterios_entrega',
  funil: 'busca_funis',
  formulario: 'busca_formularios',
  reuniao: 'busca_reunioes',
  ata: 'busca_atas',
  pendencia: 'busca_pendencias',
  ocorrencia: 'busca_ocorrencias',
  arquivo: 'busca_arquivos',
  consultor: 'busca_consultores',
};

const LIMITE_PADRAO_POR_CATEGORIA = 5;
const LIMITE_VER_TODOS = 25;

export async function buscarGlobal(termo: string, limitePorCategoria = LIMITE_PADRAO_POR_CATEGORIA): Promise<ResultadoBusca[]> {
  if (!termo.trim()) return [];
  const { data, error } = await supabase.rpc('busca_global', {
    p_termo: termo,
    p_limite_por_categoria: limitePorCategoria,
  });
  if (error) {
    console.error('Erro na busca global', error);
    return [];
  }
  return (data ?? []) as ResultadoBusca[];
}

export async function buscarCategoria(
  categoria: CategoriaBusca,
  termo: string,
  limite = LIMITE_VER_TODOS,
  offset = 0,
): Promise<ResultadoBusca[]> {
  if (!termo.trim()) return [];
  const { data, error } = await supabase.rpc(RPC_POR_CATEGORIA[categoria] as 'busca_clientes', {
    p_termo: termo,
    p_limite: limite,
    p_offset: offset,
  });
  if (error) {
    console.error(`Erro na busca de ${categoria}`, error);
    return [];
  }
  return (data ?? []) as ResultadoBusca[];
}

// ============================================================
// Recentes — só no navegador do próprio usuário (localStorage), nunca
// misturado entre usuários nem enviado ao backend.
// ============================================================
const MAX_RECENTES = 8;

function chaveRecentes(userId: string): string {
  return `busca_recentes:${userId}`;
}

export function carregarRecentes(userId: string): ResultadoBusca[] {
  try {
    const bruto = localStorage.getItem(chaveRecentes(userId));
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function registrarRecente(userId: string, item: ResultadoBusca): void {
  try {
    const atuais = carregarRecentes(userId).filter(
      (r) => !(r.categoria === item.categoria && r.entidade_id === item.entidade_id),
    );
    const novaLista = [item, ...atuais].slice(0, MAX_RECENTES);
    localStorage.setItem(chaveRecentes(userId), JSON.stringify(novaLista));
  } catch {
    // localStorage indisponível (modo privado, etc.) — não é crítico, só
    // significa que "Recentes" fica vazio nesta sessão.
  }
}

// ============================================================
// Analytics interno (Fase 2, seção 24) — reaproveita a auditoria que já
// existe (registrar_auditoria, migration 0050) em vez de criar um módulo
// novo. Registra só qual entidade foi aberta via busca, nunca o termo
// digitado (evita guardar o que o usuário pesquisou).
// ============================================================
export function registrarAberturaViaBusca(item: ResultadoBusca): void {
  supabase
    .rpc('registrar_auditoria', {
      p_acao: 'abrir_resultado_busca',
      p_entidade: item.categoria,
      p_entidade_id: item.entidade_id,
      p_cliente_id: item.cliente_id,
      p_implementacao_id: item.categoria === 'implementacao' ? item.entidade_id : null,
    })
    .then(({ error }) => {
      if (error) console.error('Erro ao registrar auditoria de busca', error);
    });
}

// ============================================================
// Normalização pra destaque do termo buscado — mesma ideia da
// buscar_normalizar() do banco (minúsculo, sem acento), só que no cliente,
// usada apenas pra decidir ONDE destacar, nunca pra filtrar resultados
// (isso é feito inteiramente no servidor).
// ============================================================
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
