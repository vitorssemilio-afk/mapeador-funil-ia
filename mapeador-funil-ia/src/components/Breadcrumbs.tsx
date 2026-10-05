// Breadcrumbs do header — só pras rotas onde isso de fato ajuda a
// orientação (seção 23 do prompt: "adicionar quando útil", "não usar na
// Home"). Pras rotas de detalhe (cliente/implementação/template) busca o
// nome de exibição real; qualquer outra rota mostra só o rótulo estático
// do item correspondente da sidebar, sem inventar hierarquia pra rotas que
// não estão nela.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { SIDEBAR_GROUPS } from './sidebarConfig';

type Crumb = { label: string; to?: string };

const LABEL_POR_ROTA = new Map<string, string>(
  SIDEBAR_GROUPS.flatMap((g) => g.itens).map((item) => [item.to, item.label]),
);

// Cache simples em memória (sobrevive à navegação, não ao reload) — evita
// refazer a mesma consulta ao ir e voltar entre a lista e o detalhe.
const cacheNomes = new Map<string, string>();

async function buscarNomeCliente(id: string): Promise<string | null> {
  const chave = `cliente:${id}`;
  if (cacheNomes.has(chave)) return cacheNomes.get(chave)!;
  const { data } = await supabase.from('clientes').select('nome_empresa').eq('id', id).maybeSingle();
  if (!data?.nome_empresa) return null;
  cacheNomes.set(chave, data.nome_empresa);
  return data.nome_empresa;
}

async function buscarNomeImplementacao(id: string): Promise<string | null> {
  const chave = `implementacao:${id}`;
  if (cacheNomes.has(chave)) return cacheNomes.get(chave)!;
  const { data } = await supabase.from('implementacoes_crm').select('nome_cliente').eq('id', id).maybeSingle();
  if (!data?.nome_cliente) return null;
  cacheNomes.set(chave, data.nome_cliente);
  return data.nome_cliente;
}

async function buscarTemplate(id: string): Promise<{ nome: string; versao: number } | null> {
  const chave = `template:${id}`;
  const cacheado = cacheNomes.get(chave);
  if (cacheado) {
    const [nome, versao] = cacheado.split('\u0000');
    return { nome, versao: Number(versao) };
  }
  const { data } = await supabase
    .from('templates_implementacao')
    .select('nome, versao')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  cacheNomes.set(chave, `${data.nome}\u0000${data.versao}`);
  return { nome: data.nome, versao: data.versao };
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const params = useParams();
  const [nomeEntidade, setNomeEntidade] = useState<string | null>(null);
  const [versaoTemplate, setVersaoTemplate] = useState<number | null>(null);
  const pedidoAtual = useRef<string | null>(null);

  const segmentos = pathname.split('/').filter(Boolean);

  useEffect(() => {
    setNomeEntidade(null);
    setVersaoTemplate(null);
    pedidoAtual.current = pathname;

    async function carregar() {
      if (segmentos[0] === 'clientes' && params.id) {
        const nome = await buscarNomeCliente(params.id);
        if (pedidoAtual.current === pathname) setNomeEntidade(nome);
      } else if (segmentos[0] === 'implementacoes' && params.id) {
        const nome = await buscarNomeImplementacao(params.id);
        if (pedidoAtual.current === pathname) setNomeEntidade(nome);
      } else if (segmentos[0] === 'templates' && params.id) {
        const info = await buscarTemplate(params.id);
        if (pedidoAtual.current === pathname) {
          setNomeEntidade(info?.nome ?? null);
          setVersaoTemplate(info?.versao ?? null);
        }
      }
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (pathname === '/') return null;

  const crumbs = montarCrumbs(segmentos, params, nomeEntidade, versaoTemplate);
  if (crumbs.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Trilha de navegação">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="breadcrumb-segmento">
          {i > 0 && <span className="breadcrumb-separador">/</span>}
          {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function montarCrumbs(
  segmentos: string[],
  params: Readonly<Record<string, string | undefined>>,
  nomeEntidade: string | null,
  versaoTemplate: number | null,
): Crumb[] {
  const raiz = segmentos[0];

  if (raiz === 'clientes' && params.id) {
    return [
      { label: 'Clientes', to: '/clientes' },
      { label: nomeEntidade ?? 'Cliente' },
    ];
  }
  if (raiz === 'clientes' && segmentos[1] === 'novo') {
    return [{ label: 'Clientes', to: '/clientes' }, { label: 'Novo cliente' }];
  }
  if (raiz === 'implementacoes' && params.id) {
    const crumbs: Crumb[] = [
      { label: 'Implementações', to: '/implementacoes' },
      { label: nomeEntidade ?? 'Implementação', to: segmentos[2] ? `/implementacoes/${params.id}` : undefined },
    ];
    if (segmentos[2] === 'entrega') crumbs.push({ label: 'Entrega' });
    return crumbs;
  }
  if (raiz === 'implementacoes' && segmentos[1] === 'checklist') {
    return [{ label: 'Implementações', to: '/implementacoes' }, { label: 'Checklist padrão' }];
  }
  if (raiz === 'templates' && params.id) {
    const crumbs: Crumb[] = [{ label: 'Templates', to: '/templates' }, { label: nomeEntidade ?? 'Template' }];
    if (versaoTemplate != null) crumbs.push({ label: `v${versaoTemplate}` });
    return crumbs;
  }
  if (raiz === 'configuracoes' && segmentos[1] === 'pipefy') {
    return [{ label: 'Configurações', to: '/configuracoes' }, { label: 'Pipefy' }];
  }

  const rotaBase = `/${raiz}`;
  const label = LABEL_POR_ROTA.get(rotaBase);
  return label ? [{ label }] : [];
}
