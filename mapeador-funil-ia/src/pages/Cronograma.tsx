import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GanttRuler } from '../components/GanttRuler';
import { ImplementacaoStatusBadge, IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { PX_POR_DIA, calcularEscala, diaParaPx, fasesImplementacao, type FaseCronograma } from '../lib/cronograma';
import { supabase } from '../lib/supabaseClient';
import type { ImplementacaoCrm, ImplementacaoStatus, ImplementacaoStatusHistorico } from '../types/database';

const CORES_FASE: Record<ImplementacaoStatus, string> = {
  pre_requisito: '#fbbf24',
  semana_1: '#5b9dff',
  semana_2: '#8b5cf6',
  semana_3: '#22d3ee',
  semana_4: '#34d399',
  concluida: '#34d399',
  cancelada: '#f87171',
};

export function Cronograma() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setError(null);

      const { data: implData, error: implError } = await supabase
        .from('implementacoes_crm')
        .select('*')
        .order('nome_cliente', { ascending: true });

      if (implError) {
        setError(implError.message);
        setLoading(false);
        return;
      }

      const implementacoesData = implData ?? [];
      setImplementacoes(implementacoesData);

      if (implementacoesData.length === 0) {
        setHistorico([]);
        setLoading(false);
        return;
      }

      const ids = implementacoesData.map((i) => i.id);
      const { data: historicoData, error: historicoError } = await supabase
        .from('implementacao_status_historico')
        .select('*')
        .in('implementacao_id', ids);

      if (historicoError) {
        setError(historicoError.message);
        setLoading(false);
        return;
      }

      setHistorico(historicoData ?? []);
      setLoading(false);
    }

    carregar();
  }, []);

  const hoje = useMemo(() => inicioDoDia(new Date()), []);

  const fasesPorImplementacao = useMemo(() => {
    const mapa = new Map<string, FaseCronograma[]>();
    for (const implementacao of implementacoes) {
      mapa.set(implementacao.id, fasesImplementacao(implementacao, historico));
    }
    return mapa;
  }, [implementacoes, historico]);

  const escala = useMemo(() => {
    const datas = Array.from(fasesPorImplementacao.values())
      .flat()
      .flatMap((fase) => [fase.inicio, fase.fim ?? hoje]);
    return calcularEscala(datas, hoje);
  }, [fasesPorImplementacao, hoje]);

  const larguraTotal = escala.totalDias * PX_POR_DIA;
  const hojePx = diaParaPx(hoje, escala);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cronograma</h1>
          <p className="field-hint">
            Linha do tempo de todas as implementações — cada bloco é uma fase (Pré-requisito, Semana
            1-4) com a data real de início e fim. A fase em andamento aparece com a borda tracejada,
            indo até hoje.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && implementacoes.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma implementação cadastrada ainda.</p>
        </div>
      )}

      {!loading && implementacoes.length > 0 && (
        <>
          <div className="gantt-legenda">
            {(['pre_requisito', 'semana_1', 'semana_2', 'semana_3', 'semana_4'] as ImplementacaoStatus[]).map(
              (status) => (
                <span key={status} className="gantt-legenda-item">
                  <span className="gantt-legenda-cor" style={{ background: CORES_FASE[status] }} />
                  {IMPLEMENTACAO_STATUS_LABELS[status]}
                </span>
              ),
            )}
          </div>

          <div className="gantt-scroll">
            <div className="gantt-inner" style={{ minWidth: larguraTotal + 200 }}>
              <div className="gantt-row gantt-row-ruler">
                <div className="gantt-row-label" />
                <div className="gantt-row-track" style={{ width: larguraTotal }}>
                  <GanttRuler escala={escala} />
                </div>
              </div>

              {implementacoes.map((implementacao) => {
                const fases = fasesPorImplementacao.get(implementacao.id) ?? [];
                return (
                  <div key={implementacao.id} className="gantt-row">
                    <div className="gantt-row-label">
                      <Link to={`/implementacoes/${implementacao.id}`}>{implementacao.nome_cliente}</Link>
                      <ImplementacaoStatusBadge status={implementacao.status} />
                    </div>
                    <div className="gantt-row-track" style={{ width: larguraTotal }}>
                      <div className="gantt-hoje-tick" style={{ left: hojePx }} />
                      {fases.map((fase) => {
                        const inicioPx = diaParaPx(fase.inicio, escala);
                        const fimPx = diaParaPx(fase.fim ?? hoje, escala);
                        const largura = Math.max(PX_POR_DIA * 0.6, fimPx - inicioPx);
                        return (
                          <div
                            key={fase.status}
                            className={`gantt-bar${fase.fim === null ? ' gantt-bar-andamento' : ''}`}
                            style={{ left: inicioPx, width: largura, background: CORES_FASE[fase.status] }}
                            title={`${fase.titulo}: ${fase.inicio.toLocaleDateString('pt-BR')} — ${
                              fase.fim ? fase.fim.toLocaleDateString('pt-BR') : 'em andamento'
                            }`}
                          >
                            {fase.titulo}
                          </div>
                        );
                      })}
                      {fases.length === 0 && (
                        <span className="field-hint gantt-sem-fase">Sem histórico de fase ainda.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
