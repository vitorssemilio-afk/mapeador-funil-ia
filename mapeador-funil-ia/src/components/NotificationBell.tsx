import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  agruparPorData,
  carregarNotificacoes,
  CATEGORIA_LABELS,
  GRUPO_DATA_LABELS,
  marcarComoLida,
  marcarTodasComoLidas,
  PRIORIDADE_TONE,
  type NotificacaoComStatus,
} from '../lib/notificacoes';

const INTERVALO_ATUALIZACAO_MS = 60_000;

function formatarHorario(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState<NotificacaoComStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  async function carregar() {
    const { notificacoes: dados } = await carregarNotificacoes(50);
    setNotificacoes(dados.filter((n) => !n.arquivada));
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  // P2 da mini auditoria: alerta auto-resolvido não conta como urgência nem
  // entra no badge, mesmo que o usuário nunca tenha aberto a notificação.
  const naoLidas = notificacoes.filter((n) => !n.lida && !n.resolvida_em);
  const recentes = notificacoes.slice(0, 20);
  const grupos = agruparPorData(recentes);

  async function handleAbrirNotificacao(n: NotificacaoComStatus) {
    if (!n.lida) {
      setNotificacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      await marcarComoLida(n.id);
    }
    setAberto(false);
    if (n.rota) navigate(n.rota);
  }

  async function handleMarcarTodasComoLidas() {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    await marcarTodasComoLidas();
  }

  function renderGrupo(chave: 'hoje' | 'ontem' | 'anteriores') {
    const itens = grupos[chave];
    if (itens.length === 0) return null;
    return (
      <div className="notification-panel-grupo" key={chave}>
        <div className="notification-panel-grupo-titulo">{GRUPO_DATA_LABELS[chave]}</div>
        {itens.map((n) => (
          <button
            type="button"
            key={n.id}
            className={`notification-item${n.lida || n.resolvida_em ? '' : ' notification-item-nao-lida'}`}
            onClick={() => handleAbrirNotificacao(n)}
          >
            <span
              className={`notification-item-dot notification-tone-${n.resolvida_em ? 'success' : PRIORIDADE_TONE[n.prioridade]}`}
            />
            <span className="notification-item-corpo">
              <span className="notification-item-titulo">{n.titulo}</span>
              {n.descricao && <span className="notification-item-descricao">{n.descricao}</span>}
              <span className="notification-item-meta">
                {CATEGORIA_LABELS[n.categoria]} · {formatarHorario(n.created_at)}
                {n.resolvida_em && ' · Resolvida automaticamente'}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-trigger"
        onClick={() => setAberto((v) => !v)}
        title="Notificações"
        aria-label="Notificações"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidas.length > 0 && (
          <span className="notification-bell-badge">{naoLidas.length > 99 ? '99+' : naoLidas.length}</span>
        )}
      </button>

      {aberto && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <span>Notificações</span>
            {naoLidas.length > 0 && (
              <button type="button" className="link-button" onClick={handleMarcarTodasComoLidas}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="notification-panel-lista">
            {loading && <p className="field-hint notification-panel-vazio">Carregando…</p>}
            {!loading && recentes.length === 0 && (
              <p className="field-hint notification-panel-vazio">Nenhuma notificação por aqui.</p>
            )}
            {!loading && (
              <>
                {renderGrupo('hoje')}
                {renderGrupo('ontem')}
                {renderGrupo('anteriores')}
              </>
            )}
          </div>

          <button
            type="button"
            className="notification-panel-ver-todas"
            onClick={() => {
              setAberto(false);
              navigate('/notificacoes');
            }}
          >
            Ver todas as notificações
          </button>
        </div>
      )}
    </div>
  );
}
