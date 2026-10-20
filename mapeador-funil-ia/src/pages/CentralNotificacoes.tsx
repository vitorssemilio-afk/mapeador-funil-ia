import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  arquivarNotificacao,
  carregarNotificacoes,
  CATEGORIA_LABELS,
  marcarComoLida,
  marcarComoNaoLida,
  marcarTodasComoLidas,
  PRIORIDADE_LABELS,
  PRIORIDADE_TONE,
  type NotificacaoComStatus,
} from '../lib/notificacoes';
import { supabase } from '../lib/supabaseClient';
import type { CategoriaNotificacao, Cliente, Consultor } from '../types/database';

type FiltroRapido = 'todas' | 'nao_lidas' | 'resolvidas' | 'criticas' | CategoriaNotificacao;

// Prompt 60, seção 35 — "Não lidas | Todas | Resolvidas" são os três
// estados principais e ficam sempre visíveis; o resto (prioridade e
// categorias) vai pro mesmo drawer de filtros secundários no mobile.
const FILTROS_PRINCIPAIS: { valor: FiltroRapido; label: string }[] = [
  { valor: 'nao_lidas', label: 'Não lidas' },
  { valor: 'todas', label: 'Todas' },
  { valor: 'resolvidas', label: 'Resolvidas' },
];

const FILTROS_SECUNDARIOS: { valor: FiltroRapido; label: string }[] = [
  { valor: 'criticas', label: 'Críticas' },
  { valor: 'implementacao', label: 'Implementação' },
  { valor: 'trial', label: 'Trial' },
  { valor: 'formulario', label: 'Formulário' },
  { valor: 'funil', label: 'Funil' },
  { valor: 'reuniao', label: 'Reunião' },
  { valor: 'pendencia', label: 'Pendência' },
  { valor: 'sistema', label: 'Sistema' },
];

type Periodo = 'todos' | '7dias' | '30dias';

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function CentralNotificacoes() {
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState<NotificacaoComStatus[]>([]);
  const [clientes, setClientes] = useState<Pick<Cliente, 'id' | 'nome_empresa' | 'consultor_responsavel_id'>[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todas');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<Periodo>('todos');
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [drawerFiltrosAberto, setDrawerFiltrosAberto] = useState(false);
  // "•••" por card, só pra largura mobile (Prompt 60, seção 41) — desktop
  // continua mostrando os 3 botões lado a lado, sem nenhuma mudança.
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [{ notificacoes: dados, error: notifError }, { data: clientesData }, { data: consultoresData }] =
      await Promise.all([
        carregarNotificacoes(500),
        supabase.from('clientes').select('id, nome_empresa, consultor_responsavel_id'),
        supabase.from('consultores').select('*').order('nome', { ascending: true }),
      ]);

    if (notifError) setError(notifError);
    setNotificacoes(dados);
    setClientes(clientesData ?? []);
    setConsultores(consultoresData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const nomeCliente = useMemo(() => {
    const mapa = new Map(clientes.map((c) => [c.id, c.nome_empresa]));
    return (id: string | null) => (id ? (mapa.get(id) ?? 'Cliente') : '—');
  }, [clientes]);

  const clientesDoConsultor = useMemo(() => {
    if (!filtroConsultor) return null;
    return new Set(clientes.filter((c) => c.consultor_responsavel_id === filtroConsultor).map((c) => c.id));
  }, [clientes, filtroConsultor]);

  const notificacoesFiltradas = useMemo(() => {
    const limiteData = (() => {
      if (filtroPeriodo === 'todos') return null;
      const dias = filtroPeriodo === '7dias' ? 7 : 30;
      const limite = new Date();
      limite.setDate(limite.getDate() - dias);
      return limite;
    })();

    return notificacoes.filter((n) => {
      if (n.arquivada !== mostrarArquivadas) return false;

      if (filtroRapido === 'nao_lidas' && (n.lida || n.resolvida_em)) return false;
      else if (filtroRapido === 'resolvidas' && !n.resolvida_em) return false;
      else if (filtroRapido === 'criticas' && n.prioridade !== 'critica') return false;
      else if (
        filtroRapido !== 'todas' &&
        filtroRapido !== 'nao_lidas' &&
        filtroRapido !== 'resolvidas' &&
        filtroRapido !== 'criticas' &&
        n.categoria !== filtroRapido
      )
        return false;

      if (filtroCliente && n.cliente_id !== filtroCliente) return false;
      if (clientesDoConsultor && (!n.cliente_id || !clientesDoConsultor.has(n.cliente_id))) return false;
      if (limiteData && new Date(n.created_at) < limiteData) return false;

      return true;
    });
  }, [notificacoes, filtroRapido, filtroCliente, clientesDoConsultor, filtroPeriodo, mostrarArquivadas]);

  function atualizarLocal(id: string, patch: Partial<NotificacaoComStatus>) {
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  async function handleMarcarLida(n: NotificacaoComStatus) {
    atualizarLocal(n.id, { lida: true });
    await marcarComoLida(n.id);
  }

  async function handleMarcarNaoLida(n: NotificacaoComStatus) {
    atualizarLocal(n.id, { lida: false });
    await marcarComoNaoLida(n.id);
  }

  async function handleArquivar(n: NotificacaoComStatus) {
    atualizarLocal(n.id, { arquivada: true, lida: true });
    await arquivarNotificacao(n.id);
  }

  async function handleAbrir(n: NotificacaoComStatus) {
    if (!n.lida) {
      atualizarLocal(n.id, { lida: true });
      await marcarComoLida(n.id);
    }
    if (n.rota) navigate(n.rota);
  }

  async function handleMarcarTodasComoLidas() {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    await marcarTodasComoLidas();
  }

  const naoLidasCount = notificacoes.filter((n) => !n.lida && !n.arquivada && !n.resolvida_em).length;

  // Contagem só do que mora dentro do drawer mobile (sem os 3 chips
  // principais, que ficam fora dele e sempre visíveis) — mostrada no botão
  // "Filtros (N)", mesmo padrão já usado em Clientes.tsx.
  const quantidadeFiltrosExtra = [
    FILTROS_SECUNDARIOS.some((f) => f.valor === filtroRapido),
    !!filtroCliente,
    !!filtroConsultor,
    filtroPeriodo !== 'todos',
    mostrarArquivadas,
  ].filter(Boolean).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Central de Notificações</h1>
          <p className="field-hint">
            Acontecimentos, riscos e ações que exigem atenção — tudo num só lugar, sem precisar entrar em
            cada tela pra descobrir o que precisa fazer.
          </p>
        </div>
        {naoLidasCount > 0 && (
          <button type="button" className="btn btn-secondary" onClick={handleMarcarTodasComoLidas}>
            Marcar todas como lidas ({naoLidasCount})
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {/* Três estados principais sempre visíveis (Prompt 60, seção 35); o
          resto (prioridade, categorias, cliente/consultor/período) mora no
          mesmo drawer "Filtros" do mobile — no desktop o drawer já aparece
          todo aberto, sem nenhuma mudança de comportamento. */}
      <div className="notification-filtros-rapidos notification-filtros-principais">
        {FILTROS_PRINCIPAIS.map((f) => (
          <button
            key={f.valor}
            type="button"
            className={`filtro-chip${filtroRapido === f.valor ? ' filtro-chip-ativo' : ''}`}
            onClick={() => setFiltroRapido(f.valor)}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-secondary mobile-filtros-trigger"
          onClick={() => setDrawerFiltrosAberto(true)}
        >
          Filtros{quantidadeFiltrosExtra > 0 ? ` (${quantidadeFiltrosExtra})` : ''}
        </button>
      </div>

      {drawerFiltrosAberto && (
        <button
          type="button"
          className="mobile-filtros-drawer-backdrop"
          aria-label="Fechar filtros"
          onClick={() => setDrawerFiltrosAberto(false)}
        />
      )}

      <div className={`notification-filtros-secundarios${drawerFiltrosAberto ? ' mobile-filtros-drawer-aberta' : ''}`}>
        <div className="notification-filtros-rapidos">
          {FILTROS_SECUNDARIOS.map((f) => (
            <button
              key={f.valor}
              type="button"
              className={`filtro-chip${filtroRapido === f.valor ? ' filtro-chip-ativo' : ''}`}
              onClick={() => setFiltroRapido(f.valor)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="form-grid notification-filtros-extra">
          <label className="field">
            <span>Cliente</span>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
              <option value="">Todos</option>
              {clientes
                .slice()
                .sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_empresa}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Consultor</span>
            <select value={filtroConsultor} onChange={(e) => setFiltroConsultor(e.target.value)}>
              <option value="">Todos</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Período</span>
            <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value as Periodo)}>
              <option value="todos">Todo o período</option>
              <option value="7dias">Últimos 7 dias</option>
              <option value="30dias">Últimos 30 dias</option>
            </select>
          </label>
          <label className="option-checkbox notification-filtro-arquivadas">
            <input
              type="checkbox"
              checked={mostrarArquivadas}
              onChange={(e) => setMostrarArquivadas(e.target.checked)}
            />
            <span>Mostrar arquivadas</span>
          </label>
        </div>
        {drawerFiltrosAberto && (
          <div className="mobile-filtros-drawer-acoes">
            <button type="button" className="btn btn-primary" onClick={() => setDrawerFiltrosAberto(false)}>
              Aplicar filtros
            </button>
          </div>
        )}
      </div>

      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && notificacoesFiltradas.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma notificação encontrada com esses filtros.</p>
        </div>
      )}

      {!loading && notificacoesFiltradas.length > 0 && (
        <div className="notification-lista-completa">
          {notificacoesFiltradas.map((n) => (
            <div
              key={n.id}
              className={`card notification-card${n.lida || n.resolvida_em ? '' : ' notification-card-nao-lida'}`}
            >
              <div className="notification-card-header">
                {n.resolvida_em ? (
                  <span className="status-badge status-tone-success">Resolvida</span>
                ) : (
                  <span className={`status-badge status-tone-${PRIORIDADE_TONE[n.prioridade]}`}>
                    {PRIORIDADE_LABELS[n.prioridade]}
                  </span>
                )}
                <span className="field-hint">{CATEGORIA_LABELS[n.categoria]}</span>
                <span className="field-hint">{formatarDataHora(n.created_at)}</span>
              </div>
              <h3 className="notification-card-titulo">{n.titulo}</h3>
              {n.descricao && <p className="notification-card-descricao">{n.descricao}</p>}
              {n.resolvida_em && (
                <p className="field-hint">Resolvida automaticamente em {formatarDataHora(n.resolvida_em)}.</p>
              )}
              {n.cliente_id && (
                <p className="field-hint">
                  Cliente: <strong>{nomeCliente(n.cliente_id)}</strong>
                </p>
              )}
              {/* Desktop intacto: os 3 botões continuam lado a lado. */}
              <div className="notification-card-acoes notification-card-acoes-desktop">
                {n.rota && (
                  <button type="button" className="btn btn-primary" onClick={() => handleAbrir(n)}>
                    Abrir
                  </button>
                )}
                {n.lida ? (
                  <button type="button" className="btn btn-ghost" onClick={() => handleMarcarNaoLida(n)}>
                    Marcar como não lida
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => handleMarcarLida(n)}>
                    Marcar como lida
                  </button>
                )}
                {!n.arquivada && (
                  <button type="button" className="btn btn-ghost" onClick={() => handleArquivar(n)}>
                    Arquivar
                  </button>
                )}
              </div>

              {/* Mobile: só a ação principal + "•••" com o resto (seção 41). */}
              <div className="notification-card-acoes notification-card-acoes-mobile">
                {n.rota && (
                  <button type="button" className="btn btn-primary" onClick={() => handleAbrir(n)}>
                    Abrir
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary entity-card-menu-toggle"
                  aria-label={menuAbertoId === n.id ? 'Fechar ações' : 'Mais ações'}
                  onClick={() => setMenuAbertoId((atual) => (atual === n.id ? null : n.id))}
                >
                  •••
                </button>
              </div>
              {menuAbertoId === n.id && (
                <div className="entity-card-menu-painel notification-card-acoes-mobile">
                  {n.lida ? (
                    <button type="button" className="btn btn-secondary" onClick={() => handleMarcarNaoLida(n)}>
                      Marcar como não lida
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => handleMarcarLida(n)}>
                      Marcar como lida
                    </button>
                  )}
                  {!n.arquivada && (
                    <button type="button" className="btn btn-secondary" onClick={() => handleArquivar(n)}>
                      Arquivar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
