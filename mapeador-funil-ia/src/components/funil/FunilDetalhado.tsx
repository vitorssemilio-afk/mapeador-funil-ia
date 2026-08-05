import { useRef, useState } from 'react';
import {
  CAMPOS_ETAPA_ANTES_DOS_CAMPOS,
  CAMPOS_ETAPA_DEPOIS_DOS_CAMPOS,
  mesclarCamposPorEntidade,
  textoCamposPorEntidade,
  textoParaValorEtapa,
  valorEtapaParaTexto,
} from '../../data/etapaCampos';
import { supabase } from '../../lib/supabaseClient';
import type { EtapaFunil, FunilGerado } from '../../types/database';

type CampoEntidadeKey = 'campos_obrigatorios' | 'campos_desejaveis';

const LINHAS_CAMPOS_POR_ENTIDADE: { campoKey: CampoEntidadeKey; label: string; entidade: 'LEAD' | 'CONTATO' }[] = [
  { campoKey: 'campos_obrigatorios', label: 'Campos Obrigatórios · Lead', entidade: 'LEAD' },
  { campoKey: 'campos_obrigatorios', label: 'Campos Obrigatórios · Contato', entidade: 'CONTATO' },
  { campoKey: 'campos_desejaveis', label: 'Campos Desejáveis · Lead', entidade: 'LEAD' },
  { campoKey: 'campos_desejaveis', label: 'Campos Desejáveis · Contato', entidade: 'CONTATO' },
];

const AUTOSAVE_DELAY_MS = 1000;

const ETAPA_VAZIA: EtapaFunil = {
  nome: 'Nova etapa',
  objetivo: '',
  gatilho_entrada: '',
  gatilho_saida: '',
  tarefas: [],
  campos_obrigatorios: [],
  campos_desejaveis: [],
  sla: '',
  regras_negocio: [],
  regras_perda: [],
  responsavel: '',
  automacao: [],
  script_sugerido: null,
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  funil: FunilGerado;
  onChange: (funilId: string, etapas: EtapaFunil[]) => void;
  somenteLeitura?: boolean;
};

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case 'saving':
      return 'Salvando…';
    case 'saved':
      return 'Alterações salvas';
    case 'error':
      return 'Não foi possível salvar';
    default:
      return '';
  }
}

export function FunilDetalhado({ funil, onChange, somenteLeitura = false }: Props) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(etapas: EtapaFunil[]) {
    setSaveStatus('saving');
    supabase
      .from('funis_gerados')
      .update({ etapas })
      .eq('id', funil.id)
      .then(({ error }) => setSaveStatus(error ? 'error' : 'saved'));
  }

  function commit(novasEtapas: EtapaFunil[]) {
    onChange(funil.id, novasEtapas);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null;
      persist(novasEtapas);
    }, AUTOSAVE_DELAY_MS);
  }

  function handleNomeEtapaChange(etapaIndex: number, novoNome: string) {
    commit(funil.etapas.map((etapa, i) => (i === etapaIndex ? { ...etapa, nome: novoNome } : etapa)));
  }

  function handleCellChange(
    etapaIndex: number,
    campoKey: keyof EtapaFunil,
    texto: string,
    lista: boolean,
    estruturado: boolean,
  ) {
    let novoValor: ReturnType<typeof textoParaValorEtapa> | null = textoParaValorEtapa(
      texto,
      lista,
      estruturado,
    );
    if (campoKey === 'script_sugerido' && typeof novoValor === 'string' && novoValor.trim() === '') {
      novoValor = null;
    }

    commit(
      funil.etapas.map((etapa, i) =>
        i === etapaIndex ? ({ ...etapa, [campoKey]: novoValor } as EtapaFunil) : etapa,
      ),
    );
  }

  function handleCamposEntidadeChange(
    etapaIndex: number,
    campoKey: CampoEntidadeKey,
    entidade: 'LEAD' | 'CONTATO',
    texto: string,
  ) {
    commit(
      funil.etapas.map((etapa, i) =>
        i === etapaIndex
          ? { ...etapa, [campoKey]: mesclarCamposPorEntidade(etapa[campoKey], entidade, texto) }
          : etapa,
      ),
    );
  }

  function handleAdicionarEtapa() {
    commit([...funil.etapas, { ...ETAPA_VAZIA }]);
  }

  function handleRemoverEtapa(etapaIndex: number) {
    if (funil.etapas.length <= 1) return;
    const nome = funil.etapas[etapaIndex].nome || `Etapa ${etapaIndex + 1}`;
    if (!window.confirm(`Remover a etapa "${nome}"? Essa ação não pode ser desfeita.`)) return;
    commit(funil.etapas.filter((_, i) => i !== etapaIndex));
  }

  return (
    <section className="card funil-detalhado">
      <div className="funil-detalhado-header">
        <div>
          <h2>{funil.nome_funil}</h2>
          <span className="tipo-funil-badge">{funil.tipo_funil}</span>
        </div>
        <span className="save-status">
          {somenteLeitura ? 'Versão anterior — somente leitura' : saveStatusLabel(saveStatus)}
        </span>
      </div>

      {funil.justificativa && <p className="field-hint">{funil.justificativa}</p>}

      <div className="funil-table-wrap">
        <table className="funil-etapas-table">
          <thead>
            <tr>
              <th className="campo-label-cell">Etapa</th>
              {funil.etapas.map((etapa, i) => (
                <th key={i}>
                  <div className="etapa-nome-cell">
                    <input
                      className="etapa-nome-input"
                      value={etapa.nome}
                      onChange={(e) => handleNomeEtapaChange(i, e.target.value)}
                      readOnly={somenteLeitura}
                    />
                    {!somenteLeitura && funil.etapas.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-remover-etapa"
                        title="Remover etapa"
                        onClick={() => handleRemoverEtapa(i)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {!somenteLeitura && (
                <th>
                  <button type="button" className="btn btn-secondary btn-auto" onClick={handleAdicionarEtapa}>
                    + Etapa
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {CAMPOS_ETAPA_ANTES_DOS_CAMPOS.map((campo) => (
              <tr key={campo.key}>
                <th scope="row" className="campo-label-cell">
                  {campo.label}
                </th>
                {funil.etapas.map((etapa, i) => (
                  <td key={i}>
                    <textarea
                      className="etapa-cell-input"
                      rows={2}
                      value={valorEtapaParaTexto(etapa[campo.key], campo.estruturado)}
                      onChange={(e) =>
                        handleCellChange(i, campo.key, e.target.value, campo.lista, !!campo.estruturado)
                      }
                      readOnly={somenteLeitura}
                    />
                  </td>
                ))}
                {!somenteLeitura && <td />}
              </tr>
            ))}

            {LINHAS_CAMPOS_POR_ENTIDADE.map(({ campoKey, label, entidade }) => (
              <tr key={`${campoKey}-${entidade}`}>
                <th scope="row" className="campo-label-cell">
                  {label}
                </th>
                {funil.etapas.map((etapa, i) => (
                  <td key={i}>
                    <textarea
                      className="etapa-cell-input"
                      rows={2}
                      value={textoCamposPorEntidade(etapa[campoKey], entidade)}
                      onChange={(e) => handleCamposEntidadeChange(i, campoKey, entidade, e.target.value)}
                      readOnly={somenteLeitura}
                    />
                  </td>
                ))}
                {!somenteLeitura && <td />}
              </tr>
            ))}

            {CAMPOS_ETAPA_DEPOIS_DOS_CAMPOS.map((campo) => (
              <tr key={campo.key}>
                <th scope="row" className="campo-label-cell">
                  {campo.label}
                </th>
                {funil.etapas.map((etapa, i) => (
                  <td key={i}>
                    <textarea
                      className="etapa-cell-input"
                      rows={2}
                      value={valorEtapaParaTexto(etapa[campo.key], campo.estruturado)}
                      onChange={(e) =>
                        handleCellChange(i, campo.key, e.target.value, campo.lista, !!campo.estruturado)
                      }
                      readOnly={somenteLeitura}
                    />
                  </td>
                ))}
                {!somenteLeitura && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {funil.etapas.length > 0 && (
        <p className="field-hint funil-estruturado-hint">
          Campos Obrigatórios/Desejáveis: uma linha por campo, no formato "Nome (tipo)" — ex:
          "Orçamento (numero)" — ou "Nome (lista_suspensa: opção 1, opção 2)" quando o tipo tiver
          opções. Cada campo já entra na linha certa (Lead ou Contato) — mover um campo de entidade
          é só recortar a linha e colar na outra.
        </p>
      )}
    </section>
  );
}
