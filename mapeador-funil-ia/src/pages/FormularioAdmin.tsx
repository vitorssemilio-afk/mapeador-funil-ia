import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  BlocoFormularioRow,
  OpcaoPergunta,
  PerguntaFormularioRow,
  PerguntaTipo,
} from '../types/database';

const TIPO_LABELS: Record<PerguntaTipo, string> = {
  texto_curto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  escolha_unica: 'Escolha única',
  escolha_multipla: 'Escolha múltipla',
};

const TIPOS_COM_OPCOES: PerguntaTipo[] = ['escolha_unica', 'escolha_multipla'];

const TIPOS_COM_CONDICAO: PerguntaTipo[] = ['escolha_unica', 'escolha_multipla'];

type FormPerguntaState = {
  id: string | null;
  bloco_id: string;
  tipo: PerguntaTipo;
  label: string;
  helper: string;
  prefixo: string;
  obrigatoria: boolean;
  opcoesTexto: string;
  condicaoPerguntaId: string;
  condicaoValores: string[];
  incluirNaGeracaoIa: boolean;
};

const FORM_PERGUNTA_VAZIO: Omit<FormPerguntaState, 'bloco_id'> = {
  id: null,
  tipo: 'texto_curto',
  label: '',
  helper: '',
  prefixo: '',
  obrigatoria: false,
  opcoesTexto: '',
  condicaoPerguntaId: '',
  condicaoValores: [],
  incluirNaGeracaoIa: true,
};

// Faixa Unicode de acentos combinantes (U+0300–U+036F), usada após normalize('NFD')
// pra tirar acento das letras na hora de gerar o slug.
const DIACRITICOS_REGEX = new RegExp('[̀-ͯ]', 'g');

function slugify(texto: string): string {
  const base = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'opcao';
}

function gerarPerguntaId(label: string, existentes: string[]): string {
  const base = `q_${slugify(label)}`;
  let candidato = base;
  let i = 2;
  while (existentes.includes(candidato)) {
    candidato = `${base}_${i}`;
    i += 1;
  }
  return candidato;
}

function parseOpcoesTexto(texto: string): OpcaoPergunta[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const partes = linha.split('|').map((p) => p.trim());
      if (partes.length >= 2) {
        const [value, label, extra] = partes;
        const campoLivre = extra?.startsWith('livre:')
          ? { placeholder: extra.slice('livre:'.length).trim() || 'Detalhe' }
          : undefined;
        return { value: value || slugify(label), label, ...(campoLivre ? { campoLivre } : {}) };
      }
      const label = partes[0];
      return { value: slugify(label), label };
    });
}

function formatOpcoesTexto(opcoes: OpcaoPergunta[] | null): string {
  return (opcoes ?? [])
    .map((o) => `${o.value}|${o.label}${o.campoLivre ? `|livre:${o.campoLivre.placeholder}` : ''}`)
    .join('\n');
}

export function FormularioAdmin() {
  const [blocos, setBlocos] = useState<BlocoFormularioRow[]>([]);
  const [perguntas, setPerguntas] = useState<PerguntaFormularioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [mostrarFormBloco, setMostrarFormBloco] = useState(false);
  const [tituloNovoBloco, setTituloNovoBloco] = useState('');

  const [formPergunta, setFormPergunta] = useState<FormPerguntaState | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [{ data: blocosData, error: blocosError }, { data: perguntasData, error: perguntasError }] =
      await Promise.all([
        supabase.from('blocos_formulario').select('*').order('ordem', { ascending: true }),
        supabase.from('perguntas_formulario').select('*').order('ordem', { ascending: true }),
      ]);

    if (blocosError) setError(blocosError.message);
    else if (perguntasError) setError(perguntasError.message);
    else {
      setBlocos(blocosData ?? []);
      setPerguntas(perguntasData ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function perguntasDoBloco(blocoId: string): PerguntaFormularioRow[] {
    return perguntas.filter((p) => p.bloco_id === blocoId).sort((a, b) => a.ordem - b.ordem);
  }

  async function handleCriarBloco(e: FormEvent) {
    e.preventDefault();
    if (!tituloNovoBloco.trim()) return;

    setSalvando(true);
    const proximaOrdem = blocos.length > 0 ? Math.max(...blocos.map((b) => b.ordem)) + 1 : 0;
    const { error: insertError } = await supabase
      .from('blocos_formulario')
      .insert({ titulo: tituloNovoBloco.trim(), ordem: proximaOrdem });
    setSalvando(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setTituloNovoBloco('');
    setMostrarFormBloco(false);
    carregar();
  }

  async function handleRenomearBloco(bloco: BlocoFormularioRow) {
    const novoTitulo = window.prompt('Novo título do bloco:', bloco.titulo);
    if (!novoTitulo || !novoTitulo.trim() || novoTitulo.trim() === bloco.titulo) return;

    const { error: updateError } = await supabase
      .from('blocos_formulario')
      .update({ titulo: novoTitulo.trim() })
      .eq('id', bloco.id);

    if (updateError) setError(updateError.message);
    else carregar();
  }

  async function handleMoverBloco(bloco: BlocoFormularioRow, direcao: -1 | 1) {
    const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem);
    const index = ordenados.findIndex((b) => b.id === bloco.id);
    const vizinho = ordenados[index + direcao];
    if (!vizinho) return;

    const { error: e1 } = await supabase
      .from('blocos_formulario')
      .update({ ordem: vizinho.ordem })
      .eq('id', bloco.id);
    const { error: e2 } = await supabase
      .from('blocos_formulario')
      .update({ ordem: bloco.ordem })
      .eq('id', vizinho.id);

    if (e1 || e2) setError((e1 ?? e2)!.message);
    carregar();
  }

  async function handleExcluirBloco(bloco: BlocoFormularioRow) {
    const qtdPerguntas = perguntasDoBloco(bloco.id).length;
    const aviso =
      qtdPerguntas > 0
        ? `Excluir o bloco "${bloco.titulo}"? Isso também apaga as ${qtdPerguntas} pergunta(s) dentro dele.`
        : `Excluir o bloco "${bloco.titulo}"?`;
    if (!window.confirm(aviso)) return;

    const { error: deleteError } = await supabase.from('blocos_formulario').delete().eq('id', bloco.id);
    if (deleteError) setError(deleteError.message);
    else carregar();
  }

  function abrirNovaPergunta(blocoId: string) {
    setFormPergunta({ ...FORM_PERGUNTA_VAZIO, bloco_id: blocoId });
  }

  function abrirEdicaoPergunta(pergunta: PerguntaFormularioRow) {
    setFormPergunta({
      id: pergunta.id,
      bloco_id: pergunta.bloco_id,
      tipo: pergunta.tipo,
      label: pergunta.label,
      helper: pergunta.helper ?? '',
      prefixo: pergunta.prefixo ?? '',
      obrigatoria: pergunta.obrigatoria,
      opcoesTexto: formatOpcoesTexto(pergunta.opcoes),
      condicaoPerguntaId: pergunta.condicao_pergunta_id ?? '',
      condicaoValores: pergunta.condicao_valores ?? [],
      incluirNaGeracaoIa: pergunta.incluir_na_geracao_ia,
    });
  }

  function condicaoLabel(pergunta: PerguntaFormularioRow): string | null {
    if (!pergunta.condicao_pergunta_id) return null;
    const origem = perguntas.find((p) => p.pergunta_id === pergunta.condicao_pergunta_id);
    if (!origem) return null;
    const valores = pergunta.condicao_valores ?? [];
    const labels = valores.map((v) => origem.opcoes?.find((o) => o.value === v)?.label ?? v);
    return `Só se "${origem.label}" for ${labels.join(' ou ')}`;
  }

  function fecharFormPergunta() {
    setFormPergunta(null);
  }

  async function handleSalvarPergunta(e: FormEvent) {
    e.preventDefault();
    if (!formPergunta || !formPergunta.label.trim()) return;

    setSalvando(true);

    const opcoes = TIPOS_COM_OPCOES.includes(formPergunta.tipo)
      ? parseOpcoesTexto(formPergunta.opcoesTexto)
      : null;
    const condicaoPerguntaId = formPergunta.condicaoPerguntaId || null;
    const condicaoValores = condicaoPerguntaId ? formPergunta.condicaoValores : null;

    if (formPergunta.id) {
      const { error: updateError } = await supabase
        .from('perguntas_formulario')
        .update({
          tipo: formPergunta.tipo,
          label: formPergunta.label.trim(),
          helper: formPergunta.helper.trim() || null,
          prefixo: formPergunta.prefixo.trim() || null,
          obrigatoria: formPergunta.obrigatoria,
          opcoes,
          condicao_pergunta_id: condicaoPerguntaId,
          condicao_valores: condicaoValores,
          incluir_na_geracao_ia: formPergunta.incluirNaGeracaoIa,
        })
        .eq('id', formPergunta.id);

      setSalvando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    } else {
      const perguntaId = gerarPerguntaId(
        formPergunta.label,
        perguntas.map((p) => p.pergunta_id),
      );
      const perguntasDesteBloco = perguntasDoBloco(formPergunta.bloco_id);
      const proximaOrdem =
        perguntasDesteBloco.length > 0 ? Math.max(...perguntasDesteBloco.map((p) => p.ordem)) + 1 : 0;

      const { error: insertError } = await supabase.from('perguntas_formulario').insert({
        bloco_id: formPergunta.bloco_id,
        pergunta_id: perguntaId,
        ordem: proximaOrdem,
        tipo: formPergunta.tipo,
        label: formPergunta.label.trim(),
        helper: formPergunta.helper.trim() || null,
        prefixo: formPergunta.prefixo.trim() || null,
        obrigatoria: formPergunta.obrigatoria,
        opcoes,
        condicao_pergunta_id: condicaoPerguntaId,
        condicao_valores: condicaoValores,
        incluir_na_geracao_ia: formPergunta.incluirNaGeracaoIa,
      });

      setSalvando(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
    }

    fecharFormPergunta();
    carregar();
  }

  async function handleMoverPergunta(pergunta: PerguntaFormularioRow, direcao: -1 | 1) {
    const ordenadas = perguntasDoBloco(pergunta.bloco_id);
    const index = ordenadas.findIndex((p) => p.id === pergunta.id);
    const vizinha = ordenadas[index + direcao];
    if (!vizinha) return;

    const { error: e1 } = await supabase
      .from('perguntas_formulario')
      .update({ ordem: vizinha.ordem })
      .eq('id', pergunta.id);
    const { error: e2 } = await supabase
      .from('perguntas_formulario')
      .update({ ordem: pergunta.ordem })
      .eq('id', vizinha.id);

    if (e1 || e2) setError((e1 ?? e2)!.message);
    carregar();
  }

  async function handleExcluirPergunta(pergunta: PerguntaFormularioRow) {
    if (!window.confirm(`Excluir a pergunta "${pergunta.label}"?`)) return;

    const { error: deleteError } = await supabase
      .from('perguntas_formulario')
      .delete()
      .eq('id', pergunta.id);

    if (deleteError) setError(deleteError.message);
    else carregar();
  }

  const blocosOrdenados = [...blocos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Formulário</h1>
          <p className="field-hint">
            Perguntas que o cliente responde no formulário público. Adicionar, editar ou excluir
            uma pergunta aqui vale pra todos os próximos mapeamentos — mapeamentos já respondidos
            não são alterados.
          </p>
        </div>
        {!mostrarFormBloco && (
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormBloco(true)}>
            + Novo bloco
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mostrarFormBloco && (
        <form onSubmit={handleCriarBloco} className="card form-card">
          <h2>Novo bloco</h2>
          <label className="field">
            <span>Título do bloco</span>
            <input
              type="text"
              required
              autoFocus
              value={tituloNovoBloco}
              onChange={(e) => setTituloNovoBloco(e.target.value)}
              placeholder="Ex: Atendimento e Suporte"
            />
          </label>
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMostrarFormBloco(false);
                setTituloNovoBloco('');
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Criar bloco'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="page-loading">Carregando…</p>}

      {!loading && blocosOrdenados.length === 0 && !mostrarFormBloco && (
        <div className="empty-state">
          <p>Nenhum bloco de perguntas cadastrado ainda.</p>
          <button type="button" className="btn btn-primary" onClick={() => setMostrarFormBloco(true)}>
            Criar o primeiro bloco
          </button>
        </div>
      )}

      {!loading &&
        blocosOrdenados.map((bloco, blocoIndex) => (
          <section key={bloco.id} className="card form-card">
            <div className="page-header">
              <h2 style={{ marginBottom: 0 }}>{bloco.titulo}</h2>
              <div className="page-header-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleMoverBloco(bloco, -1)}
                  disabled={blocoIndex === 0}
                  title="Mover bloco para cima"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleMoverBloco(bloco, 1)}
                  disabled={blocoIndex === blocosOrdenados.length - 1}
                  title="Mover bloco para baixo"
                >
                  ↓
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleRenomearBloco(bloco)}>
                  Renomear
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => handleExcluirBloco(bloco)}>
                  Excluir bloco
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pergunta</th>
                    <th>Tipo</th>
                    <th>Obrigatória</th>
                    <th>Condição</th>
                    <th>Usada na IA</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {perguntasDoBloco(bloco.id).map((pergunta, perguntaIndex, lista) => (
                    <tr key={pergunta.id}>
                      <td>{pergunta.label}</td>
                      <td>{TIPO_LABELS[pergunta.tipo]}</td>
                      <td>{pergunta.obrigatoria ? 'Sim' : '—'}</td>
                      <td className="field-hint">{condicaoLabel(pergunta) ?? '—'}</td>
                      <td>{pergunta.incluir_na_geracao_ia ? 'Sim' : 'Não'}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverPergunta(pergunta, -1)}
                          disabled={perguntaIndex === 0}
                          title="Mover para cima"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleMoverPergunta(pergunta, 1)}
                          disabled={perguntaIndex === lista.length - 1}
                          title="Mover para baixo"
                        >
                          ↓
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => abrirEdicaoPergunta(pergunta)}
                        >
                          Editar
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleExcluirPergunta(pergunta)}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {perguntasDoBloco(bloco.id).length === 0 && (
                    <tr>
                      <td colSpan={6} className="field-hint">
                        Nenhuma pergunta neste bloco ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {formPergunta && formPergunta.bloco_id === bloco.id ? (
              <form onSubmit={handleSalvarPergunta} className="card form-card">
                <h3>{formPergunta.id ? 'Editar pergunta' : 'Nova pergunta'}</h3>

                <label className="field">
                  <span>Tipo</span>
                  <select
                    value={formPergunta.tipo}
                    onChange={(e) =>
                      setFormPergunta({ ...formPergunta, tipo: e.target.value as PerguntaTipo })
                    }
                  >
                    {Object.entries(TIPO_LABELS).map(([valor, label]) => (
                      <option key={valor} value={valor}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Pergunta (label)</span>
                  <input
                    type="text"
                    required
                    value={formPergunta.label}
                    onChange={(e) => setFormPergunta({ ...formPergunta, label: e.target.value })}
                    placeholder="Ex: Qual o prazo médio de entrega?"
                  />
                </label>

                <label className="field">
                  <span>Texto de ajuda (opcional)</span>
                  <input
                    type="text"
                    value={formPergunta.helper}
                    onChange={(e) => setFormPergunta({ ...formPergunta, helper: e.target.value })}
                    placeholder="Ex: Pode ser uma estimativa."
                  />
                </label>

                {formPergunta.tipo === 'numero' && (
                  <label className="field">
                    <span>Prefixo (opcional)</span>
                    <input
                      type="text"
                      value={formPergunta.prefixo}
                      onChange={(e) => setFormPergunta({ ...formPergunta, prefixo: e.target.value })}
                      placeholder="Ex: R$"
                    />
                  </label>
                )}

                {TIPOS_COM_OPCOES.includes(formPergunta.tipo) && (
                  <label className="field">
                    <span>Opções (uma por linha)</span>
                    <textarea
                      rows={5}
                      value={formPergunta.opcoesTexto}
                      onChange={(e) => setFormPergunta({ ...formPergunta, opcoesTexto: e.target.value })}
                      placeholder={'ate_100|Até 100\nmais_100|Mais de 100\noutro|Outro|livre:Qual?'}
                    />
                    <p className="field-hint">
                      Formato: <code>valor|Rótulo</code> por linha (ou só o rótulo, que a gente gera
                      o valor). Pra opção com campo de texto livre (tipo "Outro"), acrescente{' '}
                      <code>|livre:Placeholder</code>.
                    </p>
                  </label>
                )}

                <label className="field">
                  <span>Só aparece se… (opcional)</span>
                  <select
                    value={formPergunta.condicaoPerguntaId}
                    onChange={(e) =>
                      setFormPergunta({
                        ...formPergunta,
                        condicaoPerguntaId: e.target.value,
                        condicaoValores: [],
                      })
                    }
                  >
                    <option value="">Sempre visível (sem condição)</option>
                    {perguntas
                      .filter(
                        (p) =>
                          TIPOS_COM_CONDICAO.includes(p.tipo) &&
                          p.id !== formPergunta.id &&
                          (p.opcoes?.length ?? 0) > 0,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.pergunta_id}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                  <p className="field-hint">
                    Escolha uma pergunta anterior de escolha única/múltipla. Esta pergunta só será
                    exibida quando a resposta daquela pergunta bater com um dos valores marcados
                    abaixo.
                  </p>
                </label>

                {formPergunta.condicaoPerguntaId && (
                  <fieldset className="field">
                    <legend>Aparece quando a resposta for:</legend>
                    <div className="options-list">
                      {perguntas
                        .find((p) => p.pergunta_id === formPergunta.condicaoPerguntaId)
                        ?.opcoes?.map((opcao) => {
                          const checked = formPergunta.condicaoValores.includes(opcao.value);
                          return (
                            <label key={opcao.value} className="option-checkbox">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...formPergunta.condicaoValores, opcao.value]
                                    : formPergunta.condicaoValores.filter((v) => v !== opcao.value);
                                  setFormPergunta({ ...formPergunta, condicaoValores: next });
                                }}
                              />
                              <span>{opcao.label}</span>
                            </label>
                          );
                        })}
                    </div>
                  </fieldset>
                )}

                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={formPergunta.obrigatoria}
                    onChange={(e) => setFormPergunta({ ...formPergunta, obrigatoria: e.target.checked })}
                  />
                  <span>Resposta obrigatória</span>
                </label>

                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={formPergunta.incluirNaGeracaoIa}
                    onChange={(e) =>
                      setFormPergunta({ ...formPergunta, incluirNaGeracaoIa: e.target.checked })
                    }
                  />
                  <span>
                    Usar essa resposta na geração do funil por IA — desmarque pra coletar a
                    informação sem influenciar o funil gerado
                  </span>
                </label>

                <div className="wizard-actions">
                  <button type="button" className="btn btn-secondary" onClick={fecharFormPergunta}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : 'Salvar pergunta'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-auto"
                onClick={() => abrirNovaPergunta(bloco.id)}
              >
                + Nova pergunta
              </button>
            )}
          </section>
        ))}
    </div>
  );
}