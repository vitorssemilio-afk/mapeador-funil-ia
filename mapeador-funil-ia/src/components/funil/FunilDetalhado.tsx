import { useRef, useState } from 'react';
import { CAMPOS_ETAPA, textoParaValorEtapa, valorEtapaParaTexto } from '../../data/etapaCampos';
import { supabase } from '../../lib/supabaseClient';
import type { EtapaFunil, FunilGerado } from '../../types/database';

const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  funil: FunilGerado;
  onChange: (funilId: string, etapas: EtapaFunil[]) => void;
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

export function FunilDetalhado({ funil, onChange }: Props) {
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
  ) {
    let novoValor: string | string[] | null = textoParaValorEtapa(texto, lista);
    if (campoKey === 'script_sugerido' && typeof novoValor === 'string' && novoValor.trim() === '') {
      novoValor = null;
    }

    commit(
      funil.etapas.map((etapa, i) =>
        i === etapaIndex ? ({ ...etapa, [campoKey]: novoValor } as EtapaFunil) : etapa,
      ),
    );
  }

  return (
    <section className="card funil-detalhado">
      <div className="funil-detalhado-header">
        <div>
          <h2>{funil.nome_funil}</h2>
          <span className="tipo-funil-badge">{funil.tipo_funil}</span>
        </div>
        <span className="save-status">{saveStatusLabel(saveStatus)}</span>
      </div>

      {funil.justificativa && <p className="field-hint">{funil.justificativa}</p>}

      <div className="funil-table-wrap">
        <table className="funil-etapas-table">
          <thead>
            <tr>
              <th className="campo-label-cell">Etapa</th>
              {funil.etapas.map((etapa, i) => (
                <th key={i}>
                  <input
                    className="etapa-nome-input"
                    value={etapa.nome}
                    onChange={(e) => handleNomeEtapaChange(i, e.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAMPOS_ETAPA.map((campo) => (
              <tr key={campo.key}>
                <th scope="row" className="campo-label-cell">
                  {campo.label}
                </th>
                {funil.etapas.map((etapa, i) => (
                  <td key={i}>
                    <textarea
                      className="etapa-cell-input"
                      rows={2}
                      value={valorEtapaParaTexto(etapa[campo.key])}
                      onChange={(e) => handleCellChange(i, campo.key, e.target.value, campo.lista)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
