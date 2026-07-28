import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { ChecklistGrupoImplementacao, ChecklistItemImplementacao } from '../types/database';

export function ImplementacaoChecklistAdmin() {
  const [grupos, setGrupos] = useState<ChecklistGrupoImplementacao[]>([]);
  const [itens, setItens] = useState<ChecklistItemImplementacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [mostrarFormGrupo, setMostrarFormGrupo] = useState(false);
  const [tituloNovoGrupo, setTituloNovoGrupo] = useState('');
  const [chaveNovoGrupo, setChaveNovoGrupo] = useState('');

  const [formItem, setFormItem] = useState<{ id: string | null; grupo_id: string; texto: string } | null>(
    null,
  );

  async function carregar() {
    setLoading(true);
    setError(null);

    const [{ data: gruposData, error: gruposError }, { data: itensData, error: itensError }] =
      await Promise.all([
        supabase.from('checklist_grupos_implementacao').select('*').order('ordem', { ascending: true }),
        supabase.from('checklist_itens_implementacao').select('*').order('ordem', { ascending: true }),
      ]);

    if (gruposError) setError(gruposError.message);
    else if (itensError) setError(itensError.message);
    else {
      setGrupos(gruposData ?? []);
      setItens(itensData ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function itensDoGrupo(grupoId: string): ChecklistItemImplementacao[] {
    return itens.filter((item) => item.grupo_id === grupoId).sort((a, b) => a.ordem - b.ordem);
  }

  function gerarChave(titulo: string): string {
    return (
      titulo
        .toLowerCase()
        .normalize('NFD')
        .replace(new RegExp('[̀-ͯ]', 'g'), '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'grupo'
    );
  }

  async function handleCriarGrupo(e: FormEvent) {
    e.preventDefault();
    if (!tituloNovoGrupo.trim()) return;

    setSalvando(true);
    const proximaOrdem = grupos.length > 0 ? Math.max(...grupos.map((g) => g.ordem)) + 1 : 0;
    const chave = chaveNovoGrupo.trim() || gerarChave(tituloNovoGrupo);

    const { error: insertError } = await supabase
      .from('checklist_grupos_implementacao')
      .insert({ titulo: tituloNovoGrupo.trim(), chave, ordem: proximaOrdem });
    setSalvando(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setTituloNovoGrupo('');
    setChaveNovoGrupo('');
    setMostrarFormGrupo(false);
    carregar();
  }

  async function handleRenomearGrupo(grupo: ChecklistGrupoImplementacao) {
    const novoTitulo = window.prompt('Novo título do grupo:', grupo.titulo);
    if (!novoTitulo || !novoTitulo.trim() || novoTitulo.trim() === grupo.titulo) return;

    const { error: updateError } = await supabase
      .from('checklist_grupos_implementacao')
      .update({ titulo: novoTitulo.trim() })
      .eq('id', grupo.id);

    if (updateError) setError(updateError.message);
    else carregar();
  }

  async function handleMoverGrupo(grupo: ChecklistGrupoImplementacao, direcao: -1 | 1) {
    const ordenados = [...grupos].sort((a, b) => a.ordem - b.ordem);
    const index = ordenados.findIndex((g) => g.id === grupo.id);
    const vizinho = ordenados[index + direcao];
    if (!vizinho) return;

    const { error: e1 } = await supabase
      .from('checklist_grupos_implementacao')
      .update({ ordem: vizinho.ordem })
      .eq('id', grupo.id);
    const { error: e2 } = await supabase
      .from('checklist_grupos_implementacao')
      .update({ ordem: grupo.ordem })
      .eq('id', vizinho.id);

    if (e1 || e2) setError((e1 ?? e2)!.message);
    carregar();
  }

  async function handleExcluirGrupo(grupo: ChecklistGrupoImplementacao) {
    const qtdItens = itensDoGrupo(grupo.id).length;
    const aviso =
      qtdItens > 0
        ? `Excluir o grupo "${grupo.titulo}"? Isso também apaga os ${qtdItens} item(ns) dentro dele.`
        : `Excluir o grupo "${grupo.titulo}"?`;
    if (!window.confirm(aviso)) return;

    const { error: deleteError } = await supabase
      .from('checklist_grupos_implementacao')
      .delete()
      .eq('id', grupo.id);
    if (deleteError) setError(deleteError.message);
    else carregar();
  }

  function abrirNovoItem(grupoId: string) {
    setFormItem({ id: null, grupo_id: grupoId, texto: '' });
  }

  function abrirEdicaoItem(item: ChecklistItemImplementacao) {
    setFormItem({ id: item.id, grupo_id: item.grupo_id, texto: item.texto });
  }

  function fecharFormItem() {
    setFormItem(null);
  }

  async function handleSalvarItem(e: FormEvent) {
    e.preventDefault();
    if (!formItem || !formItem.texto.trim()) return;

    setSalvando(true);

    if (formItem.id) {
      const { error: updateError } = await supabase
        .from('checklist_itens_implementacao')
        .update({ texto: formItem.texto.trim() })
        .eq('id', formItem.id);

      setSalvando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const itensDoGrupoAtual = itensDoGrupo(formItem.grupo_id);
      const proximaOrdem =
        itensDoGrupoAtual.length > 0 ? Math.max(...itensDoGrupoAtual.map((i) => i.ordem)) + 1 : 0;

      const { error: insertError } = await supabase.from('checklist_itens_implementacao').insert({
        grupo_id: formItem.grupo_id,
        texto: formItem.texto.trim(),
        ordem: proximaOrdem,
      });

      setSalvando(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    fecharFormItem();
    carregar();
  }

  async function handleMoverItem(item: ChecklistItemImplementacao, direcao: -1 | 1) {
    const ordenados = itensDoGrupo(item.grupo_id);
    const index = ordenados.findIndex((i) => i.id === item.id);
    const vizinho = ordenados[index + direcao];
    if (!vizinho) return;

    const { error: e1 } = await supabase
      .from('checklist_itens_implementacao')
      .update({ ordem: vizinho.ordem })
      .eq('id', item.id);
    const { error: e2 } = await supabase
      .from('checklist_itens_implementacao')
      .update({ ordem: item.ordem })
      .eq('id', vizinho.id);

    if (e1 || e2) setError((e1 ?? e2)!.message);
    carregar();
  }

  async function handleExcluirItem(item: ChecklistItemImplementacao) {
    if (!window.confirm(`Excluir o item "${item.texto}"?`)) return;

    const { error: deleteError } = await supabase
      .from('checklist_itens_implementacao')
      .delete()
      .eq('id', item.id);
    if (deleteError) setError(deleteError.message);
    else carregar();
  }

  const gruposOrdenados = [...grupos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Checklist de Implementação</h1>
          <p className="field-hint">
            Itens do POP de implementação de CRM (pré-requisito, semanas, critérios de sucesso).
            Alterar aqui vale pra próxima vez que alguém marcar um item numa implementação — os
            itens já marcados em implementações existentes não são afetados por edição de texto.
          </p>
        </div>
        {!mostrarFormGrupo && (
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormGrupo(true)}>
            + Novo grupo
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mostrarFormGrupo && (
        <form onSubmit={handleCriarGrupo} className="card form-card">
          <h2>Novo grupo</h2>
          <label className="field">
            <span>Título do grupo</span>
            <input
              type="text"
              required
              autoFocus
              value={tituloNovoGrupo}
              onChange={(e) => setTituloNovoGrupo(e.target.value)}
              placeholder="Ex: Semana 5 — Acompanhamento"
            />
          </label>
          <label className="field">
            <span>Chave interna (opcional)</span>
            <input
              type="text"
              value={chaveNovoGrupo}
              onChange={(e) => setChaveNovoGrupo(e.target.value)}
              placeholder="Gerada automaticamente a partir do título se deixar em branco"
            />
          </label>
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMostrarFormGrupo(false);
                setTituloNovoGrupo('');
                setChaveNovoGrupo('');
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Criar grupo'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && gruposOrdenados.length === 0 && !mostrarFormGrupo && (
        <div className="empty-state">
          <p>Nenhum grupo de checklist cadastrado ainda.</p>
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormGrupo(true)}>
            Criar o primeiro grupo
          </button>
        </div>
      )}

      {!loading &&
        gruposOrdenados.map((grupo, grupoIndex) => (
          <section key={grupo.id} className="card form-card">
            <div className="page-header">
              <h2 style={{ marginBottom: 0 }}>{grupo.titulo}</h2>
              <div className="page-header-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleMoverGrupo(grupo, -1)}
                  disabled={grupoIndex === 0}
                  title="Mover grupo para cima"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleMoverGrupo(grupo, 1)}
                  disabled={grupoIndex === gruposOrdenados.length - 1}
                  title="Mover grupo para baixo"
                >
                  ↓
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleRenomearGrupo(grupo)}>
                  Renomear
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => handleExcluirGrupo(grupo)}>
                  Excluir grupo
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itensDoGrupo(grupo.id).map((item, itemIndex, lista) => (
                    <tr key={item.id}>
                      <td>{item.texto}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverItem(item, -1)}
                          disabled={itemIndex === 0}
                          title="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverItem(item, 1)}
                          disabled={itemIndex === lista.length - 1}
                          title="Mover para baixo"
                        >
                          ↓
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => abrirEdicaoItem(item)}
                        >
                          Editar
                        </button>{' '}
                        <button type="button" className="btn btn-ghost" onClick={() => handleExcluirItem(item)}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {itensDoGrupo(grupo.id).length === 0 && (
                    <tr>
                      <td colSpan={2} className="field-hint">
                        Nenhum item neste grupo ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {formItem && formItem.grupo_id === grupo.id ? (
              <form onSubmit={handleSalvarItem} className="card form-card">
                <h3>{formItem.id ? 'Editar item' : 'Novo item'}</h3>
                <label className="field">
                  <span>Texto do item</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={formItem.texto}
                    onChange={(e) => setFormItem({ ...formItem, texto: e.target.value })}
                    placeholder="Ex: Configuração dos relatórios de desempenho de vendas"
                  />
                </label>
                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharFormItem}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : 'Salvar item'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={() => abrirNovoItem(grupo.id)}
              >
                + Novo item
              </button>
            )}
          </section>
        ))}
    </div>
  );
}
