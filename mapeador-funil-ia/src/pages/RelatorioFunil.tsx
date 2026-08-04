import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCampoEtapaLabel } from '../data/etapaCampos';
import { supabase } from '../lib/supabaseClient';
import type { EtapaFunil, FunilGerado, GeracaoMeta, Mapeamento } from '../types/database';
import './RelatorioFunil.css';

const TIPO_FUNIL_LABELS: Record<string, string> = {
  qualificacao: 'Qualificação',
  vendas: 'Vendas',
  comparecimento: 'Comparecimento',
  pos_venda: 'Pós-venda',
  outro: 'Outro',
};

const NIVEL_COMPLEXIDADE_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

function ItemList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="relatorio-items">
      {items.map((item, i) => (
        <div key={i} className="relatorio-item">
          {item}
        </div>
      ))}
    </div>
  );
}

function EtapaSlide({ etapa, index }: { etapa: EtapaFunil; index: number }) {
  const semConteudoAdicional =
    etapa.tarefas.length === 0 &&
    etapa.automacao.length === 0 &&
    etapa.regras_negocio.length === 0 &&
    etapa.regras_perda.length === 0 &&
    !etapa.script_sugerido;

  return (
    <section className="relatorio-slide relatorio-etapa">
      <div className="relatorio-eyebrow">Etapa {index + 1}</div>
      <h2>{etapa.nome}</h2>
      <div className="relatorio-header-meta">
        {etapa.sla && <div className="relatorio-sla-badge">SLA: {etapa.sla}</div>}
        {etapa.responsavel && (
          <div className="relatorio-sla-badge relatorio-resp-badge">
            Responsável: <span>{etapa.responsavel}</span>
          </div>
        )}
      </div>
      <div className="relatorio-inner">
        <div className="relatorio-col relatorio-col-left">
          {etapa.objetivo && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Objetivo</div>
              <p className="relatorio-paragraph">{etapa.objetivo}</p>
            </div>
          )}

          {etapa.gatilho_entrada && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Gatilho de Entrada</div>
              <ItemList items={[etapa.gatilho_entrada]} />
            </div>
          )}

          {etapa.gatilho_saida && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Gatilho de Saída</div>
              <ItemList items={[etapa.gatilho_saida]} />
            </div>
          )}

          {etapa.campos_obrigatorios.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Campos Obrigatórios</div>
              <ItemList items={etapa.campos_obrigatorios.map(formatCampoEtapaLabel)} />
            </div>
          )}

          {etapa.campos_desejaveis.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Campos Desejáveis</div>
              <ItemList items={etapa.campos_desejaveis.map(formatCampoEtapaLabel)} />
            </div>
          )}
        </div>

        <div className="relatorio-col relatorio-col-right">
          {etapa.tarefas.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Tarefas</div>
              <ItemList items={etapa.tarefas} />
            </div>
          )}

          {etapa.automacao.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Automação</div>
              <ItemList items={etapa.automacao} />
            </div>
          )}

          {etapa.regras_negocio.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Regras de Negócio</div>
              <ItemList items={etapa.regras_negocio} />
            </div>
          )}

          {etapa.regras_perda.length > 0 && (
            <div className="relatorio-section">
              <div className="relatorio-col-title">Regras de Perda</div>
              <ItemList items={etapa.regras_perda} />
            </div>
          )}

          {etapa.script_sugerido && (
            <div className="relatorio-quote">"{etapa.script_sugerido}"</div>
          )}

          {semConteudoAdicional && (
            <p className="relatorio-empty-col">Nenhuma informação adicional cadastrada.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function VisaoGeralSlide({
  funil,
  indice,
  total,
}: {
  funil: FunilGerado;
  indice: number;
  total: number;
}) {
  return (
    <section className="relatorio-slide">
      <div className="relatorio-header">
        <div className="relatorio-eyebrow">
          Funil {indice + 1} de {total} · {TIPO_FUNIL_LABELS[funil.tipo_funil] ?? funil.tipo_funil}
        </div>
        <h2>{funil.nome_funil}</h2>
        {funil.justificativa && <p className="relatorio-sub">{funil.justificativa}</p>}
      </div>
      <div className="relatorio-pipeline">
        {funil.etapas.map((etapa, i) => (
          <div key={i} className="relatorio-pc">
            <div className="relatorio-pc-head">
              <div className="relatorio-pc-num">Etapa {i + 1}</div>
              <div className="relatorio-pc-name">{etapa.nome}</div>
              {etapa.sla && <div className="relatorio-pc-sla">SLA: {etapa.sla}</div>}
            </div>
            <div className="relatorio-pc-body">
              {etapa.gatilho_entrada && (
                <>
                  <div className="relatorio-pc-label">Entrada</div>
                  <div className="relatorio-pc-tag">{etapa.gatilho_entrada}</div>
                </>
              )}
              {etapa.responsavel && (
                <>
                  <div className="relatorio-pc-label">Responsável</div>
                  <div className="relatorio-pc-tag">{etapa.responsavel}</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetaSlide({ meta }: { meta: GeracaoMeta }) {
  const temConteudo =
    meta.pontos_para_validar.length > 0 ||
    meta.transicoes_entre_funis.length > 0 ||
    meta.nivel_complexidade;

  if (!temConteudo) return null;

  return (
    <section className="relatorio-slide">
      <div className="relatorio-eyebrow">Antes de implementar</div>
      <h2>Pontos de atenção</h2>
      <div className="relatorio-inner">
        <div className="relatorio-col relatorio-col-left">
          {meta.nivel_complexidade && (
            <>
              <div className="relatorio-sla-badge">
                Complexidade {NIVEL_COMPLEXIDADE_LABELS[meta.nivel_complexidade] ?? meta.nivel_complexidade}
                {meta.semanas_estimadas != null &&
                  ` · ~${meta.semanas_estimadas} ${meta.semanas_estimadas === 1 ? 'semana' : 'semanas'}`}
              </div>
              {meta.observacao_estimativa && (
                <p className="relatorio-paragraph">{meta.observacao_estimativa}</p>
              )}
            </>
          )}

          {meta.transicoes_entre_funis.length > 0 && (
            <>
              <div className="relatorio-col-title">Transições entre funis</div>
              <ItemList
                items={meta.transicoes_entre_funis.map(
                  (t) => `${t.de_funil} → ${t.para_funil}: ${t.condicao}`,
                )}
              />
            </>
          )}
        </div>

        <div className="relatorio-col relatorio-col-right">
          {meta.pontos_para_validar.length > 0 && (
            <>
              <div className="relatorio-col-title">Pontos para validar com o cliente</div>
              <ItemList items={meta.pontos_para_validar} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function RelatorioFunil() {
  const { id } = useParams<{ id: string }>();
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null);
  const [funis, setFunis] = useState<FunilGerado[]>([]);
  const [geracaoMeta, setGeracaoMeta] = useState<GeracaoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setError(null);

      const { data: mapeamentoData, error: mapeamentoError } = await supabase
        .from('mapeamentos')
        .select('*')
        .eq('id', id as string)
        .single();

      if (cancelled) return;

      if (mapeamentoError || !mapeamentoData) {
        setError('Mapeamento não encontrado.');
        setLoading(false);
        return;
      }

      const { data: versaoAtual } = await supabase
        .from('funis_gerados')
        .select('versao')
        .eq('mapeamento_id', id as string)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versaoAtual) {
        const { data: funisData, error: funisError } = await supabase
          .from('funis_gerados')
          .select('*')
          .eq('mapeamento_id', id as string)
          .eq('versao', versaoAtual.versao)
          .order('ordem', { ascending: true });

        if (cancelled) return;

        if (funisError) {
          setError(funisError.message);
          setLoading(false);
          return;
        }

        setFunis(funisData ?? []);

        const { data: metaData } = await supabase
          .from('geracoes_meta')
          .select('*')
          .eq('mapeamento_id', id as string)
          .eq('versao', versaoAtual.versao)
          .maybeSingle();

        if (cancelled) return;
        setGeracaoMeta(metaData ?? null);
      }

      setMapeamento(mapeamentoData);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!mapeamento) return <p className="form-error">Mapeamento não encontrado.</p>;

  const totalEtapas = funis.reduce((soma, f) => soma + f.etapas.length, 0);

  return (
    <div className="relatorio-viewport">
      <div className="relatorio-toolbar no-print">
        <Link to={`/mapeamento/${mapeamento.id}`} className="btn btn-secondary">
          ← Voltar ao mapeamento
        </Link>
        <span className="relatorio-toolbar-info">
          {funis.length} funil(is) · {totalEtapas} etapa(s)
        </span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF
        </button>
      </div>

      <div className="relatorio-slides">
        <section className="relatorio-slide relatorio-capa">
          <div className="relatorio-tag">Playbook de Vendas</div>
          <h1>{mapeamento.nome_negocio}</h1>
          <p className="relatorio-sub">
            {funis.length} funil{funis.length === 1 ? '' : 's'} · {totalEtapas} etapas ·{' '}
            {new Date().toLocaleDateString('pt-BR')}
          </p>
          <span className="brand-mark" aria-hidden="true">
            V4
          </span>
        </section>

        {funis.length === 0 && (
          <section className="relatorio-slide">
            <p className="relatorio-paragraph">Nenhum funil gerado para este mapeamento ainda.</p>
          </section>
        )}

        {geracaoMeta && <MetaSlide meta={geracaoMeta} />}

        {funis.map((funil, indice) => (
          <div key={funil.id} style={{ display: 'contents' }}>
            <VisaoGeralSlide funil={funil} indice={indice} total={funis.length} />
            {funil.etapas.map((etapa, i) => (
              <EtapaSlide key={i} etapa={etapa} index={i} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}