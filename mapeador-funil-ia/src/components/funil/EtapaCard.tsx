import { useState } from 'react';
import {
  formatCampoEtapaLabel,
  textoCamposPorEntidade,
  valorEtapaParaTexto,
} from '../../data/etapaCampos';
import { extrairMensagemErroEdgeFunction } from '../../lib/edgeFunctionError';
import { supabase } from '../../lib/supabaseClient';
import type { CampoEtapa, EtapaFunil } from '../../types/database';

type CampoEntidadeKey = 'campos_obrigatorios' | 'campos_desejaveis';

const CAMPOS_TEXTO: { key: keyof EtapaFunil; label: string; lista: boolean }[] = [
  { key: 'objetivo', label: 'Objetivo', lista: false },
  { key: 'gatilho_entrada', label: 'Gatilho de entrada', lista: false },
  { key: 'gatilho_saida', label: 'Gatilho de saída', lista: false },
  { key: 'sla', label: 'SLA', lista: false },
  { key: 'responsavel', label: 'Responsável', lista: false },
  { key: 'tarefas', label: 'Tarefas', lista: true },
  { key: 'regras_negocio', label: 'Regras de negócio', lista: true },
  { key: 'regras_perda', label: 'Motivos de perda', lista: true },
  { key: 'automacao', label: 'Automações', lista: true },
  { key: 'script_sugerido', label: 'Script sugerido', lista: false },
];

const LINHAS_CAMPOS_POR_ENTIDADE: { campoKey: CampoEntidadeKey; label: string; entidade: 'LEAD' | 'CONTATO' }[] = [
  { campoKey: 'campos_obrigatorios', label: 'Campos obrigatórios · Lead', entidade: 'LEAD' },
  { campoKey: 'campos_obrigatorios', label: 'Campos obrigatórios · Contato', entidade: 'CONTATO' },
  { campoKey: 'campos_desejaveis', label: 'Campos desejáveis · Lead', entidade: 'LEAD' },
  { campoKey: 'campos_desejaveis', label: 'Campos desejáveis · Contato', entidade: 'CONTATO' },
];

function ListaOuTexto({ itens }: { itens: string[] | string | null }) {
  if (!itens || (Array.isArray(itens) && itens.length === 0)) return <span className="field-hint">—</span>;
  if (!Array.isArray(itens)) return <p>{itens}</p>;
  return (
    <ul className="etapa-card-lista">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function CamposEntidade({ itens }: { itens: (CampoEtapa | string)[] }) {
  if (itens.length === 0) return <span className="field-hint">—</span>;
  return (
    <ul className="etapa-card-lista">
      {itens.map((item, i) => (
        <li key={i}>{formatCampoEtapaLabel(item)}</li>
      ))}
    </ul>
  );
}

type Props = {
  etapa: EtapaFunil;
  index: number;
  total: number;
  funilId: string;
  modo: 'tecnica' | 'apresentacao';
  somenteLeitura: boolean;
  expandido: boolean;
  onToggleExpandir: () => void;
  onChangeNome: (novoNome: string) => void;
  onChangeCampo: (campoKey: keyof EtapaFunil, texto: string, lista: boolean, estruturado: boolean) => void;
  onChangeCamposEntidade: (campoKey: CampoEntidadeKey, entidade: 'LEAD' | 'CONTATO', texto: string) => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onMover: (direcao: -1 | 1) => void;
  onAceitarRegeneracao: (novaEtapa: EtapaFunil) => void;
};

export function EtapaCard({
  etapa,
  index,
  total,
  funilId,
  modo,
  somenteLeitura,
  expandido,
  onToggleExpandir,
  onChangeNome,
  onChangeCampo,
  onChangeCamposEntidade,
  onDuplicar,
  onExcluir,
  onMover,
  onAceitarRegeneracao,
}: Props) {
  const [regenerando, setRegenerando] = useState(false);
  const [regenerarDemorando, setRegenerarDemorando] = useState(false);
  const [regenerarAberto, setRegenerarAberto] = useState(false);
  const [instrucoesRegerar, setInstrucoesRegerar] = useState('');
  const [erroRegerar, setErroRegerar] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<EtapaFunil | null>(null);

  async function handleRegenerar() {
    setRegenerando(true);
    setRegenerarDemorando(false);
    setErroRegerar(null);
    const avisoDemoraId = setTimeout(() => setRegenerarDemorando(true), 20000);
    const { data, error } = await supabase.functions.invoke<{ etapa?: EtapaFunil; error?: string }>(
      'regenerar-etapa-funil',
      { body: { funil_id: funilId, etapa_index: index, instrucoes_extras: instrucoesRegerar.trim() } },
    );
    clearTimeout(avisoDemoraId);
    setRegenerando(false);
    setRegenerarDemorando(false);

    if (error || !data?.etapa) {
      const mensagemDetalhada = error ? await extrairMensagemErroEdgeFunction(error) : null;
      setErroRegerar(
        data?.error ?? mensagemDetalhada ?? 'Não foi possível regenerar esta etapa. Tente novamente em instantes.',
      );
      return;
    }
    setSugestao(data.etapa);
  }

  function aceitarSugestao() {
    if (!sugestao) return;
    onAceitarRegeneracao(sugestao);
    setSugestao(null);
    setRegenerarAberto(false);
    setInstrucoesRegerar('');
  }

  function cancelarSugestao() {
    setSugestao(null);
  }

  if (modo === 'apresentacao') {
    return (
      <section className="etapa-card etapa-card-apresentacao">
        <header className="etapa-card-header">
          <span className="etapa-card-numero">{index + 1}</span>
          <h3>{etapa.nome}</h3>
        </header>
        <div className="etapa-card-apresentacao-grid">
          <div>
            <span className="etapa-card-label">Objetivo</span>
            <p>{etapa.objetivo || '—'}</p>
          </div>
          <div>
            <span className="etapa-card-label">Entrada</span>
            <p>{etapa.gatilho_entrada || '—'}</p>
          </div>
          <div>
            <span className="etapa-card-label">Saída</span>
            <p>{etapa.gatilho_saida || '—'}</p>
          </div>
          <div>
            <span className="etapa-card-label">SLA</span>
            <p>{etapa.sla || '—'}</p>
          </div>
        </div>
        {etapa.automacao.length > 0 && (
          <div>
            <span className="etapa-card-label">Principais automações</span>
            <ListaOuTexto itens={etapa.automacao} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`etapa-card${expandido ? ' etapa-card-expandido' : ''}`}>
      <header className="etapa-card-header">
        <span className="etapa-card-numero">{index + 1}</span>
        {somenteLeitura ? (
          <h3 className="etapa-card-titulo">{etapa.nome}</h3>
        ) : (
          <input
            className="etapa-card-titulo-input"
            value={etapa.nome}
            onChange={(e) => onChangeNome(e.target.value)}
          />
        )}
        <div className="etapa-card-acoes">
          {!somenteLeitura && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-mover-etapa"
                title="Mover pra esquerda"
                disabled={index === 0}
                onClick={() => onMover(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-mover-etapa"
                title="Mover pra direita"
                disabled={index === total - 1}
                onClick={() => onMover(1)}
              >
                ›
              </button>
              <button type="button" className="btn btn-ghost btn-auto" onClick={onDuplicar}>
                Duplicar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-auto"
                onClick={() => setRegenerarAberto((v) => !v)}
              >
                Regenerar com IA
              </button>
              {total > 1 && (
                <button type="button" className="btn btn-ghost btn-auto" onClick={onExcluir}>
                  Excluir
                </button>
              )}
            </>
          )}
          <button type="button" className="btn btn-secondary btn-auto" onClick={onToggleExpandir}>
            {expandido ? 'Recolher' : 'Editar'}
          </button>
        </div>
      </header>

      {!expandido && (
        <p className="field-hint etapa-card-resumo">{etapa.objetivo || 'Sem objetivo descrito.'}</p>
      )}

      {regenerarAberto && (
        <div className="etapa-card-regenerar">
          {!sugestao ? (
            <>
              <label className="field">
                <span>Instruções para a IA (opcional)</span>
                <textarea
                  rows={2}
                  value={instrucoesRegerar}
                  onChange={(e) => setInstrucoesRegerar(e.target.value)}
                  placeholder="Ex: deixar o SLA mais curto, incluir uma automação de WhatsApp..."
                />
              </label>
              {erroRegerar && <p className="form-error">{erroRegerar}</p>}
              {regenerarDemorando && (
                <p className="field-hint">A geração está demorando mais que o esperado. Continue aguardando ou tente novamente mais tarde.</p>
              )}
              <div className="wizard-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRegenerarAberto(false);
                    setErroRegerar(null);
                  }}
                >
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleRegenerar} disabled={regenerando}>
                  {regenerando ? 'Gerando sugestão…' : 'Gerar sugestão'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="field-hint">
                Sugestão da IA para esta etapa — as demais etapas não são afetadas. Revise antes de aceitar.
              </p>
              <div className="etapa-card-sugestao">
                <p>
                  <strong>{sugestao.nome}</strong>
                </p>
                <p>{sugestao.objetivo}</p>
                <p className="field-hint">
                  Entrada: {sugestao.gatilho_entrada} · Saída: {sugestao.gatilho_saida} · SLA: {sugestao.sla}
                </p>
              </div>
              <div className="wizard-actions">
                <button type="button" className="btn btn-secondary" onClick={cancelarSugestao}>
                  Cancelar sugestão
                </button>
                <button type="button" className="btn btn-primary" onClick={aceitarSugestao}>
                  Aceitar sugestão
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {expandido && !somenteLeitura && (
        <div className="etapa-card-corpo">
          {CAMPOS_TEXTO.map(({ key, label, lista }) => (
            <label key={key} className="field">
              <span>{label}</span>
              <textarea
                rows={lista ? 3 : 2}
                value={valorEtapaParaTexto(etapa[key], false)}
                onChange={(e) => onChangeCampo(key, e.target.value, lista, false)}
              />
            </label>
          ))}
          {LINHAS_CAMPOS_POR_ENTIDADE.map(({ campoKey, label, entidade }) => (
            <label key={`${campoKey}-${entidade}`} className="field">
              <span>{label}</span>
              <textarea
                rows={3}
                value={textoCamposPorEntidade(etapa[campoKey], entidade)}
                onChange={(e) => onChangeCamposEntidade(campoKey, entidade, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      {expandido && somenteLeitura && (
        <div className="etapa-card-corpo-leitura">
          {CAMPOS_TEXTO.map(({ key, label }) => (
            <div key={key}>
              <span className="etapa-card-label">{label}</span>
              <ListaOuTexto itens={etapa[key] as string[] | string | null} />
            </div>
          ))}
          {LINHAS_CAMPOS_POR_ENTIDADE.map(({ campoKey, label, entidade }) => (
            <div key={`${campoKey}-${entidade}-leitura`}>
              <span className="etapa-card-label">{label}</span>
              <CamposEntidade itens={etapa[campoKey].filter((item) => (typeof item === 'string' ? true : (item.entidade ?? 'LEAD') === entidade))} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
