// Módulo de Relatórios e Entrega Final (núcleo, Fase 1) — tela de
// visualização/impressão de um documento gerado. Mesma estratégia já usada
// em RelatorioFunil.tsx (window.print(), nada de lib de PDF nova): layout
// próprio de documento (não de slide), pensado pra impressão em A4.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  STATUS_RELATORIO_LABELS,
  STATUS_RELATORIO_TONE,
  TIPO_RELATORIO_LABELS,
  VISAO_RELATORIO_LABELS,
  type SnapshotConsolidadoImplementacao,
  type SnapshotDocumentoFunil,
} from '../lib/relatoriosEntrega';
import { supabase } from '../lib/supabaseClient';
import type { ConfiguracaoOperacao, RelatorioImplementacao } from '../types/database';
import './RelatorioImplementacao.css';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="doc-secao">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function ListaOuVazio({ itens, vazio }: { itens: string[]; vazio: string }) {
  if (itens.length === 0) return <p className="doc-vazio">{vazio}</p>;
  return (
    <ul className="doc-lista">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function RelatorioConsolidadoDoc({
  relatorio,
  snapshot,
}: {
  relatorio: RelatorioImplementacao;
  snapshot: SnapshotConsolidadoImplementacao;
}) {
  const textoEditavel = relatorio.texto_editavel as { resumoExecutivo?: string; proximosPassos?: string };

  return (
    <>
      <Secao titulo="Resumo executivo">
        {textoEditavel.resumoExecutivo ? (
          <p className="doc-paragrafo">{textoEditavel.resumoExecutivo}</p>
        ) : (
          <p className="doc-vazio">Nenhum resumo executivo foi escrito para esta versão.</p>
        )}
      </Secao>

      <Secao titulo="Linha do tempo">
        <ListaOuVazio
          itens={snapshot.linhaDoTempo.filter((m) => m.dataIso).map((m) => `${m.marco}: ${formatarData(m.dataIso)}`)}
          vazio="Nenhum marco registrado ainda."
        />
      </Secao>

      <Secao titulo="Cronograma">
        <p>
          <strong>Dia inicial:</strong> {formatarData(snapshot.cronograma.diaInicial)} ·{' '}
          <strong>Conclusão:</strong> {formatarData(snapshot.cronograma.conclusao)}
        </p>
        <h3>Atividades principais</h3>
        <ListaOuVazio
          itens={snapshot.cronograma.atividadesPrincipais.map((a) => `${a.nome} (${a.ciclo})`)}
          vazio="Nenhuma atividade concluída registrada."
        />
        {snapshot.cronograma.atrasosRelevantes.length > 0 && (
          <>
            <h3>Atrasos relevantes</h3>
            <ListaOuVazio
              itens={snapshot.cronograma.atrasosRelevantes.map((a) => `${a.nome} — ${a.atrasoDias} dia(s) de atraso`)}
              vazio=""
            />
          </>
        )}
      </Secao>

      <Secao titulo="Reuniões">
        {snapshot.reunioes.length === 0 ? (
          <p className="doc-vazio">Nenhuma reunião registrada.</p>
        ) : (
          <table className="doc-tabela">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Status</th>
                <th>Data/hora</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.reunioes.map((r, i) => (
                <tr key={i}>
                  <td>{r.tipo}</td>
                  <td>{r.status}</td>
                  <td>{formatarDataHora(r.dataHoraIso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      {snapshot.ocorrencias.length > 0 && (
        <Secao titulo="Pendências e ocorrências">
          <table className="doc-tabela">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.ocorrencias.map((o, i) => (
                <tr key={i}>
                  <td>{o.descricao}</td>
                  <td>{o.status === 'resolvida' ? 'Resolvida' : 'Aberta'}</td>
                  <td>{formatarData(o.dataOcorrenciaIso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      )}

      <Secao titulo="Entregáveis">
        <ListaOuVazio itens={snapshot.entregaveis} vazio="Nenhum entregável confirmado ainda." />
      </Secao>

      <Secao titulo="Critérios">
        {snapshot.criterios.length === 0 ? (
          <p className="doc-vazio">Nenhum critério cadastrado.</p>
        ) : (
          <table className="doc-tabela">
            <thead>
              <tr>
                <th>Critério</th>
                <th>Status</th>
                <th>Evidência</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.criterios.map((c, i) => (
                <tr key={i}>
                  <td>{c.titulo}</td>
                  <td>
                    {c.status}
                    {c.justificativaNaoAplica ? ` — ${c.justificativaNaoAplica}` : ''}
                  </td>
                  <td>{c.evidencia ?? '—'}</td>
                  <td>{c.responsavel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Próximos passos recomendados">
        {textoEditavel.proximosPassos ? (
          <p className="doc-paragrafo">{textoEditavel.proximosPassos}</p>
        ) : (
          <p className="doc-vazio">Nenhum próximo passo registrado.</p>
        )}
      </Secao>
    </>
  );
}

function DocumentoFunilDoc({ relatorio, snapshot }: { relatorio: RelatorioImplementacao; snapshot: SnapshotDocumentoFunil }) {
  const tecnica = relatorio.visao === 'tecnica';

  return (
    <>
      <Secao titulo="Processo">
        <p>
          <strong>Versão aprovada:</strong> v{snapshot.versao} · <strong>Aprovada em:</strong>{' '}
          {formatarDataHora(snapshot.aprovadaEmIso)}
          {snapshot.aprovadaPorEmail ? ` por ${snapshot.aprovadaPorEmail}` : ''}
        </p>
      </Secao>

      {snapshot.etapas.map((etapa, i) => (
        <Secao key={i} titulo={`Etapa ${i + 1} — ${etapa.nome}`}>
          {etapa.objetivo && <p className="doc-paragrafo">{etapa.objetivo}</p>}
          <table className="doc-tabela">
            <tbody>
              <tr>
                <th>Entrada</th>
                <td>{etapa.entrada || '—'}</td>
              </tr>
              <tr>
                <th>Saída</th>
                <td>{etapa.saida || '—'}</td>
              </tr>
              <tr>
                <th>Responsável</th>
                <td>{etapa.responsavel || '—'}</td>
              </tr>
              <tr>
                <th>SLA</th>
                <td>{etapa.sla || '—'}</td>
              </tr>
            </tbody>
          </table>

          {etapa.camposObrigatorios.length > 0 && (
            <>
              <h3>Campos obrigatórios</h3>
              <ListaOuVazio itens={etapa.camposObrigatorios} vazio="" />
            </>
          )}

          {tecnica && (
            <>
              {etapa.camposDesejaveis.length > 0 && (
                <>
                  <h3>Campos desejáveis</h3>
                  <ListaOuVazio itens={etapa.camposDesejaveis} vazio="" />
                </>
              )}
              {etapa.automacao.length > 0 && (
                <>
                  <h3>Automação</h3>
                  <ListaOuVazio itens={etapa.automacao} vazio="" />
                </>
              )}
              {etapa.regrasNegocio.length > 0 && (
                <>
                  <h3>Regras de negócio</h3>
                  <ListaOuVazio itens={etapa.regrasNegocio} vazio="" />
                </>
              )}
              {etapa.regrasPerda.length > 0 && (
                <>
                  <h3>Regras de perda</h3>
                  <ListaOuVazio itens={etapa.regrasPerda} vazio="" />
                </>
              )}
              {etapa.tarefas.length > 0 && (
                <>
                  <h3>Tarefas</h3>
                  <ListaOuVazio itens={etapa.tarefas} vazio="" />
                </>
              )}
              {etapa.script && <p className="doc-quote">"{etapa.script}"</p>}
            </>
          )}
        </Secao>
      ))}
    </>
  );
}

export function RelatorioImplementacaoView() {
  const { id, relatorioId } = useParams<{ id: string; relatorioId: string }>();
  const [relatorio, setRelatorio] = useState<RelatorioImplementacao | null>(null);
  const [configOperacao, setConfigOperacao] = useState<ConfiguracaoOperacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relatorioId) return;
    Promise.all([
      supabase.from('relatorios_implementacao').select('*').eq('id', relatorioId).single(),
      supabase.from('configuracoes_operacao').select('*').eq('id', true).maybeSingle(),
    ]).then(([{ data, error: fetchError }, { data: configData }]) => {
      if (fetchError || !data) {
        setError(fetchError?.message ?? 'Relatório não encontrado.');
      } else {
        setRelatorio(data);
      }
      setConfigOperacao(configData ?? null);
      setLoading(false);
    });
  }, [relatorioId]);

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error || !relatorio) return <p className="form-error">{error ?? 'Relatório não encontrado.'}</p>;

  const ehFunil = relatorio.tipo === 'funil_vendas' || relatorio.tipo === 'funil_pos_venda';

  return (
    <div className="doc-viewport" style={configOperacao?.cor_principal ? ({ '--doc-accent': configOperacao.cor_principal } as CSSProperties) : undefined}>
      <div className="doc-toolbar no-print">
        <Link to={`/implementacoes/${id}/entrega`} className="btn btn-secondary">
          ← Voltar
        </Link>
        <span className="doc-toolbar-info">
          {TIPO_RELATORIO_LABELS[relatorio.tipo]} · v{relatorio.versao} ·{' '}
          <span className={`status-badge status-tone-${STATUS_RELATORIO_TONE[relatorio.status]}`}>
            {STATUS_RELATORIO_LABELS[relatorio.status]}
          </span>
        </span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF
        </button>
      </div>

      <article className="doc-page">
        <section className="doc-capa">
          {configOperacao?.logo_url && <img src={configOperacao.logo_url} alt="" className="doc-logo" />}
          <div className="doc-capa-tag">{configOperacao?.nome_operacao ?? 'Implementação de CRM'}</div>
          <h1>{relatorio.titulo}</h1>
          {relatorio.visao && <p className="doc-sub">{VISAO_RELATORIO_LABELS[relatorio.visao]}</p>}
          <p className="doc-sub">
            Versão {relatorio.versao} · {relatorio.gerado_em ? formatarDataHora(relatorio.gerado_em) : ''}
          </p>
        </section>

        {ehFunil ? (
          <DocumentoFunilDoc relatorio={relatorio} snapshot={relatorio.conteudo_snapshot as unknown as SnapshotDocumentoFunil} />
        ) : (
          <RelatorioConsolidadoDoc
            relatorio={relatorio}
            snapshot={relatorio.conteudo_snapshot as unknown as SnapshotConsolidadoImplementacao}
          />
        )}

        {configOperacao?.texto_padrao_rodape && <footer className="doc-rodape">{configOperacao.texto_padrao_rodape}</footer>}
      </article>
    </div>
  );
}
