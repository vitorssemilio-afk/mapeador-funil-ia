import { useRef, useState } from 'react';
import { mesclarCamposPorEntidade, textoParaValorEtapa } from '../../data/etapaCampos';
import { supabase } from '../../lib/supabaseClient';
import type { EtapaFunil, FunilGerado } from '../../types/database';
import { EtapaCard } from './EtapaCard';

type CampoEntidadeKey = 'campos_obrigatorios' | 'campos_desejaveis';

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
  // true quando a versão exibida está aprovada — nesse caso somenteLeitura
  // também vem true (o banco recusa a edição de qualquer forma, ver
  // migration 0060), mas aqui precisamos saber o MOTIVO pra mostrar a
  // mensagem certa e o CTA de criar nova versão, em vez do rótulo genérico
  // de "versão anterior".
  versaoAprovada?: boolean;
  onSolicitarNovaVersaoParaEdicao?: () => void;
  criandoNovaVersao?: boolean;
  modo?: 'tecnica' | 'apresentacao';
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

export function FunilDetalhado({
  funil,
  onChange,
  somenteLeitura = false,
  versaoAprovada = false,
  onSolicitarNovaVersaoParaEdicao,
  criandoNovaVersao = false,
  modo = 'tecnica',
}: Props) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set([0]));
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

  function toggleExpandir(etapaIndex: number) {
    setExpandidos((prev) => {
      const copia = new Set(prev);
      if (copia.has(etapaIndex)) copia.delete(etapaIndex);
      else copia.add(etapaIndex);
      return copia;
    });
  }

  function handleNomeEtapaChange(etapaIndex: number, novoNome: string) {
    commit(funil.etapas.map((etapa, i) => (i === etapaIndex ? { ...etapa, nome: novoNome } : etapa)));
  }

  function handleCellChange(etapaIndex: number, campoKey: keyof EtapaFunil, texto: string, lista: boolean) {
    let novoValor: ReturnType<typeof textoParaValorEtapa> | null = textoParaValorEtapa(texto, lista, false);
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
    // Entra antes de "Perdido/Desqualificado" se ela for a última etapa
    // (a IA sempre inclui essa etapa no final) — senão a etapa nova nasceria
    // depois do "Perdido", fora de ordem.
    const ultima = funil.etapas[funil.etapas.length - 1];
    const indiceInsercao =
      ultima && /perdid|desqualificad/i.test(ultima.nome) ? funil.etapas.length - 1 : funil.etapas.length;

    const novasEtapas = [...funil.etapas];
    novasEtapas.splice(indiceInsercao, 0, { ...ETAPA_VAZIA });
    commit(novasEtapas);
    setExpandidos((prev) => new Set(prev).add(indiceInsercao));
  }

  function handleDuplicarEtapa(etapaIndex: number) {
    const original = funil.etapas[etapaIndex];
    const copia: EtapaFunil = { ...original, nome: `${original.nome} (cópia)` };
    const novasEtapas = [...funil.etapas];
    novasEtapas.splice(etapaIndex + 1, 0, copia);
    commit(novasEtapas);
  }

  function handleRemoverEtapa(etapaIndex: number) {
    if (funil.etapas.length <= 1) return;
    const nome = funil.etapas[etapaIndex].nome || `Etapa ${etapaIndex + 1}`;
    if (!window.confirm(`Remover a etapa "${nome}"? Essa ação não pode ser desfeita.`)) return;
    commit(funil.etapas.filter((_, i) => i !== etapaIndex));
  }

  function handleMoverEtapa(etapaIndex: number, direcao: -1 | 1) {
    const novoIndex = etapaIndex + direcao;
    if (novoIndex < 0 || novoIndex >= funil.etapas.length) return;
    const novasEtapas = [...funil.etapas];
    [novasEtapas[etapaIndex], novasEtapas[novoIndex]] = [novasEtapas[novoIndex], novasEtapas[etapaIndex]];
    commit(novasEtapas);
  }

  function handleAceitarRegeneracao(etapaIndex: number, novaEtapa: EtapaFunil) {
    commit(funil.etapas.map((etapa, i) => (i === etapaIndex ? novaEtapa : etapa)));
  }

  return (
    <section className="card funil-detalhado">
      <div className="funil-detalhado-header">
        <div>
          <h2>{funil.nome_funil}</h2>
          <span className="tipo-funil-badge">{funil.tipo_funil}</span>
        </div>
        {modo === 'tecnica' && !versaoAprovada && (
          <span className="save-status">
            {somenteLeitura ? 'Versão anterior — somente leitura' : saveStatusLabel(saveStatus)}
          </span>
        )}
      </div>

      {modo === 'tecnica' && versaoAprovada && (
        <div className="funil-versao-aprovada-aviso">
          <p className="field-hint">
            Esta versão está aprovada e não pode ser editada diretamente.
          </p>
          {onSolicitarNovaVersaoParaEdicao && (
            <button
              type="button"
              className="btn btn-secondary btn-auto"
              onClick={onSolicitarNovaVersaoParaEdicao}
              disabled={criandoNovaVersao}
            >
              {criandoNovaVersao ? 'Criando nova versão…' : 'Criar nova versão para edição'}
            </button>
          )}
        </div>
      )}

      {funil.justificativa && modo === 'tecnica' && <p className="field-hint">{funil.justificativa}</p>}

      <div className="etapa-card-lista-container">
        {funil.etapas.map((etapa, i) => (
          <EtapaCard
            key={i}
            etapa={etapa}
            index={i}
            total={funil.etapas.length}
            funilId={funil.id}
            modo={modo}
            somenteLeitura={somenteLeitura}
            expandido={expandidos.has(i)}
            onToggleExpandir={() => toggleExpandir(i)}
            onChangeNome={(novoNome) => handleNomeEtapaChange(i, novoNome)}
            onChangeCampo={(campoKey, texto, lista) => handleCellChange(i, campoKey, texto, lista)}
            onChangeCamposEntidade={(campoKey, entidade, texto) =>
              handleCamposEntidadeChange(i, campoKey, entidade, texto)
            }
            onDuplicar={() => handleDuplicarEtapa(i)}
            onExcluir={() => handleRemoverEtapa(i)}
            onMover={(direcao) => handleMoverEtapa(i, direcao)}
            onAceitarRegeneracao={(novaEtapa) => handleAceitarRegeneracao(i, novaEtapa)}
          />
        ))}
      </div>

      {modo === 'tecnica' && !somenteLeitura && (
        <button type="button" className="btn btn-secondary btn-auto" onClick={handleAdicionarEtapa}>
          + Etapa
        </button>
      )}

      {modo === 'tecnica' && !somenteLeitura && funil.etapas.length > 0 && (
        <p className="field-hint funil-estruturado-hint">
          Campos obrigatórios/desejáveis: uma linha por campo, no formato "Nome (tipo)" — ex:
          "Orçamento (numero)" — ou "Nome (lista_suspensa: opção 1, opção 2)" quando o tipo tiver
          opções.
        </p>
      )}
    </section>
  );
}
