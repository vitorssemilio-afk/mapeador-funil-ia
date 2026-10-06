import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabaseClient';
import type { AtividadeCronograma } from '../types/database';

// Admin do template global do cronograma (implementacao_id nulo) — atividades
// derivadas automaticamente do funil de um cliente (botão "Gerar itens a
// partir do funil" na tela de cada implementação) não aparecem aqui, só o
// que é compartilhado entre todo mundo.
export function ImplementacaoChecklistAdmin() {
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [atividades, setAtividades] = useState<AtividadeCronograma[]>([]);
  const [souAdministrador, setSouAdministrador] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
  }, []);

  const [mostrarFormCiclo, setMostrarFormCiclo] = useState(false);
  const [nomeNovoCiclo, setNomeNovoCiclo] = useState('');

  const [formAtividade, setFormAtividade] = useState<{
    id: string | null;
    ciclo: string;
    nome: string;
    chave: string;
    categoria: string;
    responsavel_padrao: string;
    depende_de: string;
    prazo_dias: string;
    requer_evidencia: boolean;
  } | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('atividades_cronograma')
      .select('*')
      .is('implementacao_id', null)
      .order('ordem', { ascending: true });

    if (fetchError) setError(fetchError.message);
    else setAtividades(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const ciclos = useMemo(() => {
    // Ordem dos ciclos = ordem da primeira atividade de cada um (já vem
    // ordenado por `ordem` na query), sem duplicar.
    const vistos: string[] = [];
    for (const atividade of atividades) {
      if (!vistos.includes(atividade.ciclo)) vistos.push(atividade.ciclo);
    }
    return vistos;
  }, [atividades]);

  function atividadesDoCiclo(ciclo: string): AtividadeCronograma[] {
    return atividades.filter((a) => a.ciclo === ciclo).sort((a, b) => a.ordem - b.ordem);
  }

  function proximaOrdem(ciclo: string): number {
    const ordens = atividadesDoCiclo(ciclo).map((a) => a.ordem);
    return ordens.length > 0 ? Math.max(...ordens) + 1 : 0;
  }

  async function handleCriarCiclo(e: FormEvent) {
    e.preventDefault();
    if (!nomeNovoCiclo.trim()) return;
    if (ciclos.includes(nomeNovoCiclo.trim())) {
      setError('Já existe um ciclo com esse nome.');
      return;
    }

    setFormAtividade({
      id: null,
      ciclo: nomeNovoCiclo.trim(),
      nome: '',
      chave: '',
      categoria: '',
      responsavel_padrao: '',
      depende_de: '',
      prazo_dias: '',
      requer_evidencia: false,
    });
    setNomeNovoCiclo('');
    setMostrarFormCiclo(false);
  }

  async function handleRenomearCiclo(ciclo: string) {
    const novoNome = window.prompt('Novo nome do ciclo:', ciclo);
    if (!novoNome || !novoNome.trim() || novoNome.trim() === ciclo) return;

    const { error: updateError } = await supabase
      .from('atividades_cronograma')
      .update({ ciclo: novoNome.trim() })
      .eq('ciclo', ciclo)
      .is('implementacao_id', null);

    if (updateError) setError(updateError.message);
    else carregar();
  }

  async function handleExcluirCiclo(ciclo: string) {
    const qtd = atividadesDoCiclo(ciclo).length;
    const confirmado = await confirmar({
      titulo: `Excluir o ciclo "${ciclo}"?`,
      descricao: `Isso também apaga as ${qtd} atividade(s) do template dentro dele. Esta ação não pode ser desfeita.`,
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase
      .from('atividades_cronograma')
      .delete()
      .eq('ciclo', ciclo)
      .is('implementacao_id', null);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Ciclo excluído.');
      carregar();
    }
  }

  function abrirNovaAtividade(ciclo: string) {
    setFormAtividade({
      id: null,
      ciclo,
      nome: '',
      chave: '',
      categoria: '',
      responsavel_padrao: '',
      depende_de: '',
      prazo_dias: '',
      requer_evidencia: false,
    });
  }

  function abrirEdicaoAtividade(atividade: AtividadeCronograma) {
    setFormAtividade({
      id: atividade.id,
      ciclo: atividade.ciclo,
      nome: atividade.nome,
      chave: atividade.chave ?? '',
      categoria: atividade.categoria ?? '',
      responsavel_padrao: atividade.responsavel_padrao ?? '',
      depende_de: atividade.depende_de ?? '',
      prazo_dias: atividade.prazo_dias != null ? String(atividade.prazo_dias) : '',
      requer_evidencia: atividade.requer_evidencia,
    });
  }

  function fecharFormAtividade() {
    setFormAtividade(null);
  }

  async function handleSalvarAtividade(e: FormEvent) {
    e.preventDefault();
    if (!formAtividade || !formAtividade.nome.trim()) return;

    setSalvando(true);
    const prazoDias = formAtividade.prazo_dias ? Number(formAtividade.prazo_dias) : null;

    const payload = {
      nome: formAtividade.nome.trim(),
      chave: formAtividade.chave.trim() || null,
      categoria: formAtividade.categoria.trim() || null,
      responsavel_padrao: formAtividade.responsavel_padrao.trim() || null,
      depende_de: formAtividade.depende_de.trim() || null,
      prazo_dias: prazoDias,
      requer_evidencia: formAtividade.requer_evidencia,
    };

    const { error: saveError } = formAtividade.id
      ? await supabase.from('atividades_cronograma').update(payload).eq('id', formAtividade.id)
      : await supabase.from('atividades_cronograma').insert({
          ...payload,
          ciclo: formAtividade.ciclo,
          ordem: proximaOrdem(formAtividade.ciclo),
        });

    setSalvando(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }

    fecharFormAtividade();
    carregar();
  }

  async function handleMoverAtividade(atividade: AtividadeCronograma, direcao: -1 | 1) {
    const ordenadas = atividadesDoCiclo(atividade.ciclo);
    const index = ordenadas.findIndex((a) => a.id === atividade.id);
    const vizinha = ordenadas[index + direcao];
    if (!vizinha) return;

    const { error: e1 } = await supabase
      .from('atividades_cronograma')
      .update({ ordem: vizinha.ordem })
      .eq('id', atividade.id);
    const { error: e2 } = await supabase
      .from('atividades_cronograma')
      .update({ ordem: atividade.ordem })
      .eq('id', vizinha.id);

    if (e1 || e2) setError((e1 ?? e2)!.message);
    carregar();
  }

  async function handleExcluirAtividade(atividade: AtividadeCronograma) {
    const confirmado = await confirmar({
      titulo: `Excluir a atividade "${atividade.nome}"?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      destrutivo: true,
    });
    if (!confirmado) return;

    const { error: deleteError } = await supabase.from('atividades_cronograma').delete().eq('id', atividade.id);
    if (deleteError) setError(deleteError.message);
    else {
      mostrarToast('Atividade excluída.');
      carregar();
    }
  }

  if (souAdministrador === false) {
    return (
      <div className="page">
        <p className="form-error">Esta tela é restrita a administradores.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Template do Cronograma</h1>
          <p className="field-hint">
            Template global de atividades do cronograma (dependências, prazos e responsáveis
            padrão). Alterar aqui vale pra próxima vez que alguém abrir o cronograma de uma
            implementação — atividades já com status marcado em implementações existentes não são
            afetadas por edição de texto. Atividades geradas automaticamente a partir do funil de um
            cliente (botão "Gerar itens a partir do funil" na tela de cada implementação) são
            específicas daquele cliente e não aparecem aqui.
          </p>
        </div>
        {!mostrarFormCiclo && (
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormCiclo(true)}>
            + Novo ciclo
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mostrarFormCiclo && (
        <form onSubmit={handleCriarCiclo} className="card form-card">
          <h2>Novo ciclo</h2>
          <label className="field">
            <span>Nome do ciclo</span>
            <input
              type="text"
              required
              autoFocus
              value={nomeNovoCiclo}
              onChange={(e) => setNomeNovoCiclo(e.target.value)}
              placeholder="Ex: Acompanhamento pós-entrega"
            />
          </label>
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMostrarFormCiclo(false);
                setNomeNovoCiclo('');
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Continuar — criar a 1ª atividade
            </button>
          </div>
        </form>
      )}

      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && ciclos.length === 0 && !mostrarFormCiclo && (
        <div className="empty-state">
          <p>Nenhum ciclo cadastrado ainda.</p>
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormCiclo(true)}>
            Criar o primeiro ciclo
          </button>
        </div>
      )}

      {!loading &&
        ciclos.map((ciclo) => (
          <section key={ciclo} className="card form-card">
            <div className="page-header">
              <h2 style={{ marginBottom: 0 }}>{ciclo}</h2>
              <div className="page-header-actions">
                <button type="button" className="btn btn-secondary" onClick={() => handleRenomearCiclo(ciclo)}>
                  Renomear
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleExcluirCiclo(ciclo)}>
                  Excluir ciclo
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Atividade</th>
                    <th>Grupo</th>
                    <th>Dependência</th>
                    <th>Prazo</th>
                    <th>Responsável</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {atividadesDoCiclo(ciclo).map((atividade, index, lista) => (
                    <tr key={atividade.id}>
                      <td>
                        {atividade.nome}
                        {atividade.requer_evidencia && (
                          <span className="requer-evidencia-badge"> · exige evidência</span>
                        )}
                      </td>
                      <td>{atividade.categoria ?? '—'}</td>
                      <td>{atividade.depende_de ?? '—'}</td>
                      <td>{atividade.prazo_dias != null ? `${atividade.prazo_dias}d` : '—'}</td>
                      <td>{atividade.responsavel_padrao ?? '—'}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverAtividade(atividade, -1)}
                          disabled={index === 0}
                          title="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverAtividade(atividade, 1)}
                          disabled={index === lista.length - 1}
                          title="Mover para baixo"
                        >
                          ↓
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => abrirEdicaoAtividade(atividade)}
                        >
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-danger" onClick={() => handleExcluirAtividade(atividade)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {atividadesDoCiclo(ciclo).length === 0 && (
                    <tr>
                      <td colSpan={6} className="field-hint">
                        Nenhuma atividade neste ciclo ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {formAtividade && formAtividade.ciclo === ciclo ? (
              <form onSubmit={handleSalvarAtividade} className="card form-card">
                <h3>{formAtividade.id ? 'Editar atividade' : 'Nova atividade'}</h3>
                <label className="field">
                  <span>Nome da atividade</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={formAtividade.nome}
                    onChange={(e) => setFormAtividade({ ...formAtividade, nome: e.target.value })}
                    placeholder="Ex: Configuração dos relatórios de desempenho de vendas"
                  />
                </label>
                <label className="field">
                  <span>Grupo (opcional)</span>
                  <input
                    type="text"
                    list="grupos-atividade-sugeridos"
                    value={formAtividade.categoria}
                    onChange={(e) => setFormAtividade({ ...formAtividade, categoria: e.target.value })}
                    placeholder="Ex: Estruturação do CRM"
                  />
                  <span className="field-hint">
                    Agrupa esta atividade com outras de mesma finalidade na tela da implementação (ex: "Pré-requisitos
                    e Acessos", "Estruturação do CRM", "Treinamento e Orientação", "Automações Iniciais"). Em branco =
                    aparece numa lista única, sem grupo.
                  </span>
                  <datalist id="grupos-atividade-sugeridos">
                    <option value="Pré-requisitos e Acessos" />
                    <option value="Estruturação do CRM" />
                    <option value="Treinamento e Orientação" />
                    <option value="Automações Iniciais" />
                  </datalist>
                </label>
                <label className="field">
                  <span>Dependência (opcional)</span>
                  <input
                    type="text"
                    value={formAtividade.depende_de}
                    onChange={(e) => setFormAtividade({ ...formAtividade, depende_de: e.target.value })}
                    placeholder="marco:kickoff_realizado_em ou ciclo:preparacao_crm"
                  />
                  <span className="field-hint">
                    "marco:&lt;campo do cliente&gt;" (ex: marco:conta_kommo_criada_em) ou
                    "ciclo:&lt;status da implementação&gt;" (ex: ciclo:crm_em_configuracao). Em
                    branco = sem dependência, libera desde o início.
                  </span>
                </label>
                <label className="field">
                  <span>Prazo (dias corridos após a dependência liberar)</span>
                  <input
                    type="number"
                    min={0}
                    value={formAtividade.prazo_dias}
                    onChange={(e) => setFormAtividade({ ...formAtividade, prazo_dias: e.target.value })}
                    placeholder="Em branco = sem data planejada"
                  />
                </label>
                <label className="field">
                  <span>Responsável padrão (opcional)</span>
                  <input
                    type="text"
                    value={formAtividade.responsavel_padrao}
                    onChange={(e) => setFormAtividade({ ...formAtividade, responsavel_padrao: e.target.value })}
                  />
                </label>
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={formAtividade.requer_evidencia}
                    onChange={(e) => setFormAtividade({ ...formAtividade, requer_evidencia: e.target.checked })}
                  />
                  <span>
                    Exige evidência pra concluir (link, print ou nota — pra atividades que pedem
                    verificação, não só configuração)
                  </span>
                </label>
                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharFormAtividade}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : 'Salvar atividade'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={() => abrirNovaAtividade(ciclo)}
              >
                + Nova atividade
              </button>
            )}
          </section>
        ))}
    </div>
  );
}
