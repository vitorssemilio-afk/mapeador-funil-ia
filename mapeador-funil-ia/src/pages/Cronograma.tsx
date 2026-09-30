import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GanttRuler } from '../components/GanttRuler';
import { ImplementacaoStatusBadge, IMPLEMENTACAO_STATUS_LABELS } from '../components/ImplementacaoStatusBadge';
import { inicioDoDia } from '../lib/agendaImplementacao';
import { calcularDiaCiclo } from '../lib/atividadesCronograma';
import {
  ALTURA_RAIA,
  PX_POR_DIA,
  calcularEscala,
  diaParaPx,
  empacotarFasesEmRaias,
  fasesImplementacao,
  type FaseCronograma,
} from '../lib/cronograma';
import { supabase } from '../lib/supabaseClient';
import type { Cliente, ImplementacaoCrm, ImplementacaoStatus, ImplementacaoStatusHistorico } from '../types/database';

// Abaixo disso o título não cabe legível dentro da barra — sai como um
// rótulo ao lado dela em vez de cortar o texto.
const LARGURA_MINIMA_TEXTO_INTERNO = 90;

const CORES_FASE: Record<ImplementacaoStatus, string> = {
  preparacao_crm: '#fbbf24',
  crm_em_configuracao: '#5b9dff',
  treinamento_agendado: '#8b5cf6',
  automacoes: '#22d3ee',
  entrega: '#34d399',
  adocao: '#34d399',
  concluida: '#34d399',
  cancelada: '#f87171',
};

export function Cronograma() {
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [historico, setHistorico] = useState<ImplementacaoStatusHistorico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
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
      const clienteIds = [...new Set(implementacoesData.map((i) => i.cliente_id).filter((id): id is string => !!id))];
      const [{ data: historicoData, error: historicoError }, { data: clientesData }] = await Promise.all([
        supabase.from('implementacao_status_historico').select('*').in('implementacao_id', ids),
        clienteIds.length > 0
          ? supabase.from('clientes').select('*').in('id', clienteIds)
          : Promise.resolve({ data: [] as Cliente[] }),
      ]);

      if (historicoError) {
        setError(historicoError.message);
        setLoading(false);
        return;
      }

      setHistorico(historicoData ?? []);
      setClientes(clientesData ?? []);
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
            {(
              [
                'preparacao_crm',
                'crm_em_configuracao',
                'treinamento_agendado',
                'automacoes',
                'entrega',
              ] as ImplementacaoStatus[]
            ).map(
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
                const fasesComRaia = empacotarFasesEmRaias(fases, escala, hoje);
                const numRaias = Math.max(1, ...fasesComRaia.map((f) => f.raia + 1));
                const alturaTrack = numRaias * ALTURA_RAIA + 16;
                const cliente = clientes.find((c) => c.id === implementacao.cliente_id) ?? null;
                const diaCiclo = calcularDiaCiclo(cliente?.kickoff_realizado_em ?? null, hoje);
                const diasAtrasoGeral = diaCiclo && diaCiclo.dia > 40 ? diaCiclo.dia - 40 : 0;
                return (
                  <div key={implementacao.id} className="gantt-row">
                    <div className="gantt-row-label">
                      <Link to={`/implementacoes/${implementacao.id}`}>{implementacao.nome_cliente}</Link>
                      <ImplementacaoStatusBadge status={implementacao.status} />
                      {diasAtrasoGeral > 0 && (
                        <span className="badge-danger" title="Passou do Dia 40 dos 40 dias da implementação">
                          {diasAtrasoGeral}d atrasada
                        </span>
                      )}
                    </div>
                    <div className="gantt-row-track" style={{ width: larguraTotal, minHeight: alturaTrack }}>
                      <div className="gantt-hoje-tick" style={{ left: hojePx }} />
                      {fasesComRaia.map(({ fase, raia, left, width }) => {
                        const legendaFora = width < LARGURA_MINIMA_TEXTO_INTERNO;
                        const titulo = `${fase.titulo}: ${fase.inicio.toLocaleDateString('pt-BR')} — ${
                          fase.fim ? fase.fim.toLocaleDateString('pt-BR') : 'em andamento'
                        }`;
                        const top = 8 + raia * ALTURA_RAIA;
                        return (
                          <Fragment key={fase.status}>
                            <div
                              className={`gantt-bar${fase.fim === null ? ' gantt-bar-andamento' : ''}`}
                              style={{ left, width, top, background: CORES_FASE[fase.status] }}
                              title={titulo}
                            >
                              {!legendaFora && fase.titulo}
                            </div>
                            {legendaFora && (
                              <span
                                className="gantt-bar-legenda-externa"
                                style={{ left: left + width + 6, top }}
                                title={titulo}
                              >
                                {fase.titulo}
                              </span>
                            )}
                          </Fragment>
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
