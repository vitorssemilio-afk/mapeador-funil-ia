// Módulo de Relatórios e Entrega Final (núcleo, Fase 1) — tela de
// visualização/impressão de um documento gerado. Mesma estratégia já usada
// em RelatorioFunil.tsx (window.print(), nada de lib de PDF nova): layout
// próprio de documento (não de slide), pensado pra impressão em A4.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  STATUS_DIAGNOSTICO_LABELS,
  STATUS_DIAGNOSTICO_TONE,
} from '../lib/diagnosticoAdocao';
import {
  ordemPlaybook,
  SECOES_PLAYBOOK,
  type PlaybookTextoEditavel,
  type SecaoPlaybookChave,
  type SnapshotPlaybook,
} from '../lib/playbook';
import {
  STATUS_RELATORIO_LABELS,
  STATUS_RELATORIO_TONE,
  TIPO_RELATORIO_LABELS,
  VISAO_RELATORIO_LABELS,
  type SnapshotConsolidadoImplementacao,
  type SnapshotDocumentoFunil,
  type SnapshotRelatorioAdocao,
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
  const textoEditavel = relatorio.texto_editavel as { resumoExecutivo?: string; proximosPassos?: string | string[] };
  // Compatibilidade com relatórios gerados na Fase 1 (próximos passos era um
  // texto corrido) — a Fase 2 passou a guardar uma lista de itens (seção 21).
  const proximosPassos = Array.isArray(textoEditavel.proximosPassos)
    ? textoEditavel.proximosPassos
    : textoEditavel.proximosPassos
      ? [textoEditavel.proximosPassos]
      : [];

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
          <ListaOuVazio itens={proximosPassos} vazio="" />
        ) : (
          <p className="doc-vazio">Nenhum próximo passo registrado.</p>
        )}
      </Secao>
    </>
  );
}

function RelatorioAdocaoDoc({ snapshot }: { snapshot: SnapshotRelatorioAdocao }) {
  return (
    <>
      <Secao titulo="Diagnóstico">
        <p>
          <span className={`status-badge status-tone-${STATUS_DIAGNOSTICO_TONE[snapshot.status]}`}>
            {STATUS_DIAGNOSTICO_LABELS[snapshot.status]}
          </span>{' '}
          · Checkpoint respondido em {formatarDataHora(snapshot.respondidoEmIso)}
        </p>
        <h3>Sinais observados</h3>
        <ListaOuVazio itens={snapshot.sinais} vazio="Nenhum sinal registrado." />
        <h3>Recomendações</h3>
        <ListaOuVazio itens={snapshot.recomendacoes} vazio="Nenhuma recomendação registrada." />
      </Secao>

      <Secao titulo="Respostas do checkpoint">
        <table className="doc-tabela">
          <tbody>
            <tr>
              <th>Percentual do processo no Kommo</th>
              <td>{snapshot.percentualProcessoKommo ?? '—'}</td>
            </tr>
            <tr>
              <th>Autonomia da equipe</th>
              <td>{snapshot.autonomiaEquipe ?? '—'}</td>
            </tr>
            <tr>
              <th>Uso de relatórios para decisão</th>
              <td>{snapshot.usoRelatoriosDecisao ?? '—'}</td>
            </tr>
            <tr>
              <th>Atividades fora do Kommo</th>
              <td>
                {snapshot.atividadesForaKommo ?? '—'}
                {snapshot.quaisAtividadesForaKommo ? ` — ${snapshot.quaisAtividadesForaKommo}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
        {snapshot.principalDificuldade && (
          <>
            <h3>Principal dificuldade relatada</h3>
            <p className="doc-paragrafo">{snapshot.principalDificuldade}</p>
          </>
        )}
      </Secao>
    </>
  );
}

function DocumentoFunilDoc({ relatorio, snapshot }: { relatorio: RelatorioImplementacao; snapshot: SnapshotDocumentoFunil }) {
  return <FunilEtapasDoc tecnica={relatorio.visao === 'tecnica'} snapshot={snapshot} />;
}

// Extraído de DocumentoFunilDoc pra ser reaproveitado pelo Playbook (seção
// "Funil de vendas"/"Pós-venda" — seção 44 do pedido: "usar o mesmo funil
// visual já existente, não gerar um diferente"), que sempre mostra a visão
// técnica completa (não tem o conceito de visão executiva/técnica à parte).
function FunilEtapasDoc({ tecnica, snapshot }: { tecnica: boolean; snapshot: SnapshotDocumentoFunil }) {
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

// Conteúdo de cada seção 'automatica' do Playbook — só formata o que já
// está no snapshot (nunca inventa um texto novo). Seções sem dado nenhum
// retornam null — o chamador decide a mensagem de "sem dados" caso precise.
function conteudoSecaoPlaybook(chave: SecaoPlaybookChave, snapshot: SnapshotPlaybook): ReactNode {
  switch (chave) {
    case 'visaoGeral':
      return (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th>Componente</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.visaoGeral.map((v, i) => (
              <tr key={i}>
                <td>{v.componente}</td>
                <td>{v.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'jornadaComercial':
      return snapshot.jornadaComercial.length > 0 ? (
        <p className="doc-paragrafo">{snapshot.jornadaComercial.join(' → ')}</p>
      ) : null;
    case 'funilVendas':
      return snapshot.funilVendas ? <FunilEtapasDoc tecnica snapshot={snapshot.funilVendas} /> : null;
    case 'funilPosVenda':
      return snapshot.funilPosVenda ? <FunilEtapasDoc tecnica snapshot={snapshot.funilPosVenda} /> : null;
    case 'camposPersonalizados':
      return snapshot.camposPersonalizados.length > 0 ? (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Etapa</th>
              <th>Obrigatório?</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.camposPersonalizados.map((c, i) => (
              <tr key={i}>
                <td>{c.campo}</td>
                <td>{c.etapa}</td>
                <td>{c.obrigatorio ? 'Sim' : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null;
    case 'automacoes':
      return snapshot.automacoes.length > 0 ? (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th>Automação</th>
              <th>Etapa</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.automacoes.map((a, i) => (
              <tr key={i}>
                <td>{a.automacao}</td>
                <td>{a.etapa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null;
    case 'responsabilidades':
      return snapshot.responsabilidades.length > 0 ? (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th>Atividade</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.responsabilidades.map((r, i) => (
              <tr key={i}>
                <td>{r.atividade}</td>
                <td>{r.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null;
    case 'usuarios':
      return snapshot.usuarios.length > 0 ? (
        <table className="doc-tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Papel</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.usuarios.map((u, i) => (
              <tr key={i}>
                <td>{u.nome}</td>
                <td>{u.papel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null;
    case 'treinamentos':
      return snapshot.treinamentos.length > 0 ? (
        <ListaOuVazio
          itens={snapshot.treinamentos.map((t) => `${formatarDataHora(t.dataHoraIso)} — ${t.status}`)}
          vazio=""
        />
      ) : null;
    case 'entregasRealizadas':
      return snapshot.entregasRealizadas.length > 0 ? (
        <ListaOuVazio itens={snapshot.entregasRealizadas.map((e) => `${e.item} — ${e.status}`)} vazio="" />
      ) : null;
    case 'pendenciasRessalvas':
      return snapshot.pendenciasRessalvas.length > 0 ? (
        <ListaOuVazio itens={snapshot.pendenciasRessalvas.map((p) => `${p.item} — ${p.status}`)} vazio="" />
      ) : null;
    case 'aceite':
      return snapshot.aceite.status ? (
        <>
          <p>
            <strong>Status:</strong> {snapshot.aceite.status}
          </p>
          {snapshot.aceite.ressalvas.length > 0 && <ListaOuVazio itens={snapshot.aceite.ressalvas} vazio="" />}
        </>
      ) : null;
    default:
      return null;
  }
}

function PlaybookDoc({
  snapshot,
  textoEditavel,
}: {
  snapshot: SnapshotPlaybook;
  textoEditavel: PlaybookTextoEditavel;
}) {
  const ordem = ordemPlaybook(textoEditavel).filter((chave) => !textoEditavel.ocultas.includes(chave));

  return (
    <>
      {ordem.map((chave) => {
        const manifesto = SECOES_PLAYBOOK.find((s) => s.chave === chave);
        if (!manifesto) return null;

        if (manifesto.origem === 'manual') {
          const texto = textoEditavel.overrides[chave];
          if (!texto?.trim()) return null;
          return (
            <Secao key={chave} titulo={manifesto.titulo}>
              <p className="doc-paragrafo" style={{ whiteSpace: 'pre-wrap' }}>
                {texto}
              </p>
            </Secao>
          );
        }

        const override = textoEditavel.overrides[chave];
        const conteudoAutomatico = conteudoSecaoPlaybook(chave, snapshot);
        if (!override && !conteudoAutomatico) return null;

        return (
          <Secao key={chave} titulo={manifesto.titulo}>
            {override && (
              <p className="doc-paragrafo" style={{ whiteSpace: 'pre-wrap' }}>
                {override}
              </p>
            )}
            {conteudoAutomatico}
          </Secao>
        );
      })}
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
        ) : relatorio.tipo === 'adocao' ? (
          <RelatorioAdocaoDoc snapshot={relatorio.conteudo_snapshot as unknown as SnapshotRelatorioAdocao} />
        ) : relatorio.tipo === 'playbook' ? (
          <PlaybookDoc
            snapshot={relatorio.conteudo_snapshot as unknown as SnapshotPlaybook}
            textoEditavel={relatorio.texto_editavel as unknown as PlaybookTextoEditavel}
          />
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
