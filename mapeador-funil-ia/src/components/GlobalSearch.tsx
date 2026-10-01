// Busca Global (Command Palette) — Ctrl/Cmd+K abre, Esc fecha, ↑/↓
// navegam, Enter abre o resultado focado. Busca em si é 100% server-side
// (ver src/lib/buscaGlobal.ts e migration 0075) — este componente só
// orquestra UI: debounce, agrupamento por categoria, destaque do termo,
// "Ver todos" por categoria e a lista de recentes (local ao navegador).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  buscarCategoria,
  buscarGlobal,
  CATEGORIA_LABELS,
  CATEGORIAS_ORDEM,
  carregarRecentes,
  normalizarTexto,
  registrarRecente,
  type CategoriaBusca,
  type ResultadoBusca,
} from '../lib/buscaGlobal';

const DEBOUNCE_MS = 250;

function destacar(texto: string, termo: string): React.ReactNode {
  const termoNormalizado = normalizarTexto(termo.trim());
  if (!termoNormalizado) return texto;

  const textoNormalizado = normalizarTexto(texto);
  const indice = textoNormalizado.indexOf(termoNormalizado);
  if (indice === -1) return texto;

  return (
    <>
      {texto.slice(0, indice)}
      <mark className="busca-destaque">{texto.slice(indice, indice + termoNormalizado.length)}</mark>
      {texto.slice(indice + termoNormalizado.length)}
    </>
  );
}

type GrupoResultados = { categoria: CategoriaBusca; itens: ResultadoBusca[] };

export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [loading, setLoading] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [categoriaExpandida, setCategoriaExpandida] = useState<CategoriaBusca | null>(null);
  const [recentes, setRecentes] = useState<ResultadoBusca[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termoBuscaRef = useRef('');

  // Atalho global Ctrl/Cmd+K — funciona em qualquer tela logada.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberto((prev) => !prev);
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  useEffect(() => {
    if (aberto) {
      setTermo('');
      setResultados([]);
      setIndiceAtivo(0);
      setCategoriaExpandida(null);
      if (user) setRecentes(carregarRecentes(user.id));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [aberto, user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!termo.trim()) {
      setResultados([]);
      setLoading(false);
      setCategoriaExpandida(null);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      termoBuscaRef.current = termo;
      const dados = await buscarGlobal(termo);
      if (termoBuscaRef.current === termo) {
        setResultados(dados);
        setCategoriaExpandida(null);
        setLoading(false);
        setIndiceAtivo(0);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [termo]);

  async function handleVerTodos(categoria: CategoriaBusca) {
    setLoading(true);
    const dados = await buscarCategoria(categoria, termo);
    setResultados((prev) => [...prev.filter((r) => r.categoria !== categoria), ...dados]);
    setCategoriaExpandida(categoria);
    setLoading(false);
  }

  const grupos: GrupoResultados[] = useMemo(() => {
    const porCategoria = new Map<CategoriaBusca, ResultadoBusca[]>();
    for (const r of resultados) {
      if (!porCategoria.has(r.categoria)) porCategoria.set(r.categoria, []);
      porCategoria.get(r.categoria)!.push(r);
    }
    return CATEGORIAS_ORDEM.filter((c) => porCategoria.has(c)).map((categoria) => ({
      categoria,
      itens: porCategoria.get(categoria)!,
    }));
  }, [resultados]);

  const listaPlanaAtiva = useMemo(() => {
    if (!termo.trim()) return recentes;
    return grupos.flatMap((g) => g.itens);
  }, [termo, grupos, recentes]);

  function handleAbrir(item: ResultadoBusca) {
    if (user) registrarRecente(user.id, item);
    setAberto(false);
    navigate(item.rota);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setAberto(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(i + 1, listaPlanaAtiva.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = listaPlanaAtiva[indiceAtivo];
      if (alvo) handleAbrir(alvo);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="global-search-trigger"
        onClick={() => setAberto(true)}
        aria-label="Busca global"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
        </svg>
        <span>Buscar…</span>
        <kbd className="global-search-kbd">Ctrl K</kbd>
      </button>
    );
  }

  let indiceCorrente = -1;

  return (
    <div className="modal-overlay" onMouseDown={() => setAberto(false)} role="dialog" aria-modal="true" aria-label="Busca global">
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="command-palette-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" className="command-palette-icon">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Buscar clientes, reuniões, funis, pendências…"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            aria-label="Termo de busca"
          />
          <kbd className="global-search-kbd">Esc</kbd>
        </div>

        <div className="command-palette-results">
          {loading && <div className="command-palette-loading">Buscando…</div>}

          {!loading && !termo.trim() && recentes.length > 0 && (
            <div className="command-palette-grupo">
              <div className="command-palette-grupo-titulo">Recentes</div>
              {recentes.map((item) => {
                indiceCorrente += 1;
                const ativo = indiceCorrente === indiceAtivo;
                return (
                  <ResultadoItem
                    key={`recente-${item.categoria}-${item.entidade_id}`}
                    item={item}
                    termo=""
                    ativo={ativo}
                    onClick={() => handleAbrir(item)}
                    onMouseEnter={() => setIndiceAtivo(indiceCorrente)}
                  />
                );
              })}
            </div>
          )}

          {!loading && !termo.trim() && recentes.length === 0 && (
            <div className="command-palette-vazio">Digite pra buscar clientes, reuniões, funis, pendências e mais.</div>
          )}

          {!loading && termo.trim() && grupos.length === 0 && (
            <div className="command-palette-vazio">Nenhum resultado encontrado.</div>
          )}

          {!loading &&
            grupos.map((grupo) => (
              <div className="command-palette-grupo" key={grupo.categoria}>
                <div className="command-palette-grupo-titulo">{CATEGORIA_LABELS[grupo.categoria]}</div>
                {grupo.itens.map((item) => {
                  indiceCorrente += 1;
                  const ativo = indiceCorrente === indiceAtivo;
                  return (
                    <ResultadoItem
                      key={`${item.categoria}-${item.entidade_id}`}
                      item={item}
                      termo={termo}
                      ativo={ativo}
                      onClick={() => handleAbrir(item)}
                      onMouseEnter={() => setIndiceAtivo(indiceCorrente)}
                    />
                  );
                })}
                {grupo.itens.length >= 5 && categoriaExpandida !== grupo.categoria && (
                  <button type="button" className="command-palette-ver-todos" onClick={() => handleVerTodos(grupo.categoria)}>
                    Ver todos em {CATEGORIA_LABELS[grupo.categoria]}
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function ResultadoItem({
  item,
  termo,
  ativo,
  onClick,
  onMouseEnter,
}: {
  item: ResultadoBusca;
  termo: string;
  ativo: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      className={`command-palette-item${ativo ? ' active' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="command-palette-item-texto">
        <span className="command-palette-item-titulo">{destacar(item.titulo, termo)}</span>
        {item.subtitulo && <span className="command-palette-item-subtitulo">{item.subtitulo}</span>}
      </div>
      {item.badge && <span className="command-palette-item-badge">{item.badge}</span>}
    </button>
  );
}
