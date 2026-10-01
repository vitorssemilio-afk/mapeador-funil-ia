// Área administrativa de Configurações (Fase 1): Implementação, Trial,
// Pipefy e Histórico. Retira duração/ciclos/prazo de treinamento/dia
// recomendado do pós-venda e os 3 períodos de Trial + alertas do código
// hardcoded (ver src/lib/configuracaoImplementacao.ts) — editável aqui por
// administradores, sem precisar alterar código.
//
// IMPORTANTE: alterar aqui NUNCA recalcula implementações já em andamento —
// cada uma usa o snapshot capturado no próprio Kickoff dela (migration
// 0073). Só afeta quem ainda não teve Kickoff e implementações futuras.
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import type { CicloConfiguravel, ConfiguracaoHistoricoItem, ConfiguracaoImplementacao, ConfiguracaoPipefy } from '../types/database';

type AbaConfiguracoes = 'implementacao' | 'trial' | 'pipefy' | 'historico';

const ABAS: { valor: AbaConfiguracoes; label: string }[] = [
  { valor: 'implementacao', label: 'Implementação' },
  { valor: 'trial', label: 'Trial' },
  { valor: 'pipefy', label: 'Pipefy' },
  { valor: 'historico', label: 'Histórico' },
];

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function urlValida(url: string): boolean {
  if (!url.trim()) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

type FormImplementacao = {
  duracao_total_dias: string;
  ciclos: CicloConfiguravel[];
  prazo_treinamento_dia: string;
  dia_recomendado_formulario_pos_venda: string;
};

function paraFormImplementacao(c: ConfiguracaoImplementacao): FormImplementacao {
  return {
    duracao_total_dias: String(c.duracao_total_dias),
    ciclos: c.ciclos.map((ciclo) => ({ ...ciclo })),
    prazo_treinamento_dia: String(c.prazo_treinamento_dia),
    dia_recomendado_formulario_pos_venda: String(c.dia_recomendado_formulario_pos_venda),
  };
}

type FormTrial = {
  trial_inicial_dias: string;
  trial_extensao_14_dias: string;
  trial_extensao_7_dias: string;
  trial_alertas_dias: string; // "5, 3, 1, 0"
};

function paraFormTrial(c: ConfiguracaoImplementacao): FormTrial {
  return {
    trial_inicial_dias: String(c.trial_inicial_dias),
    trial_extensao_14_dias: String(c.trial_extensao_14_dias),
    trial_extensao_7_dias: String(c.trial_extensao_7_dias),
    trial_alertas_dias: c.trial_alertas_dias.join(', '),
  };
}

type FormPipefy = {
  url_criacao_conta: string;
  url_extensao_14: string;
  url_extensao_7: string;
  url_contratacao_definitiva: string;
};

function paraFormPipefy(c: ConfiguracaoPipefy): FormPipefy {
  return {
    url_criacao_conta: c.url_criacao_conta ?? '',
    url_extensao_14: c.url_extensao_14 ?? '',
    url_extensao_7: c.url_extensao_7 ?? '',
    url_contratacao_definitiva: c.url_contratacao_definitiva ?? '',
  };
}

export function Configuracoes() {
  const { user } = useAuth();
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [aba, setAba] = useState<AbaConfiguracoes>('implementacao');

  const [configImplementacao, setConfigImplementacao] = useState<ConfiguracaoImplementacao | null>(null);
  const [formImplementacao, setFormImplementacao] = useState<FormImplementacao | null>(null);
  const [formTrial, setFormTrial] = useState<FormTrial | null>(null);
  const [configPipefy, setConfigPipefy] = useState<ConfiguracaoPipefy | null>(null);
  const [formPipefy, setFormPipefy] = useState<FormPipefy | null>(null);
  const [historico, setHistorico] = useState<ConfiguracaoHistoricoItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [{ data: souAdmin }, { data: implData, error: implError }, { data: pipefyData }, { data: historicoData }] =
      await Promise.all([
        supabase.rpc('sou_administrador'),
        supabase.from('configuracoes_implementacao').select('*').eq('id', true).single(),
        supabase.from('configuracoes_pipefy').select('*').eq('id', true).maybeSingle(),
        supabase.from('configuracoes_historico').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

    setSouAdministrador(souAdmin === true);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setConfigImplementacao(implData);
    setFormImplementacao(paraFormImplementacao(implData));
    setFormTrial(paraFormTrial(implData));
    setConfigPipefy(pipefyData ?? null);
    if (pipefyData) setFormPipefy(paraFormPipefy(pipefyData));
    setHistorico(historicoData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function patchComparado<T extends Record<string, unknown>>(original: T, atual: T): Partial<T> {
    const patch: Partial<T> = {};
    for (const chave of Object.keys(atual) as (keyof T)[]) {
      if (JSON.stringify(atual[chave]) !== JSON.stringify(original[chave])) {
        patch[chave] = atual[chave];
      }
    }
    return patch;
  }

  async function handleSalvarImplementacao(e: FormEvent) {
    e.preventDefault();
    if (!formImplementacao || !configImplementacao) return;

    const duracao = Number(formImplementacao.duracao_total_dias);
    const prazoTreinamento = Number(formImplementacao.prazo_treinamento_dia);
    const diaPosVenda = Number(formImplementacao.dia_recomendado_formulario_pos_venda);

    if (!Number.isInteger(duracao) || duracao <= 0) {
      setError('Duração total precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(prazoTreinamento) || prazoTreinamento <= 0) {
      setError('Prazo de treinamento precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(diaPosVenda) || diaPosVenda <= 0) {
      setError('Dia recomendado do pós-venda precisa ser um número inteiro positivo.');
      return;
    }
    for (let i = 0; i < formImplementacao.ciclos.length; i++) {
      const c = formImplementacao.ciclos[i];
      if (!Number.isInteger(c.dia_inicio) || !Number.isInteger(c.dia_fim) || c.dia_inicio <= 0 || c.dia_fim <= 0) {
        setError(`Os dias do ${c.nome} precisam ser números inteiros positivos.`);
        return;
      }
      if (c.dia_fim < c.dia_inicio) {
        setError(`O dia final do ${c.nome} não pode ser antes do dia inicial.`);
        return;
      }
      if (i > 0 && c.dia_inicio <= formImplementacao.ciclos[i - 1].dia_fim) {
        setError(`Os ciclos precisam estar em ordem e não podem se sobrepor (${c.nome} começa antes do fim do ciclo anterior).`);
        return;
      }
    }
    if (formImplementacao.ciclos[formImplementacao.ciclos.length - 1].dia_fim > duracao) {
      setError('O último ciclo ultrapassa a duração total — ajuste um dos dois.');
      return;
    }

    if (
      !window.confirm(
        'Esta alteração será aplicada apenas a novas implementações iniciadas após esta mudança. ' +
          'Implementações já em andamento continuam com as regras vigentes no momento do Kickoff delas. Confirmar?',
      )
    ) {
      return;
    }

    const atual = {
      duracao_total_dias: duracao,
      ciclos: formImplementacao.ciclos,
      prazo_treinamento_dia: prazoTreinamento,
      dia_recomendado_formulario_pos_venda: diaPosVenda,
    };
    const original = {
      duracao_total_dias: configImplementacao.duracao_total_dias,
      ciclos: configImplementacao.ciclos,
      prazo_treinamento_dia: configImplementacao.prazo_treinamento_dia,
      dia_recomendado_formulario_pos_venda: configImplementacao.dia_recomendado_formulario_pos_venda,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_implementacao', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigImplementacao(data);
    setFormImplementacao(paraFormImplementacao(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarTrial(e: FormEvent) {
    e.preventDefault();
    if (!formTrial || !configImplementacao) return;

    const inicial = Number(formTrial.trial_inicial_dias);
    const ext14 = Number(formTrial.trial_extensao_14_dias);
    const ext7 = Number(formTrial.trial_extensao_7_dias);
    const alertas = formTrial.trial_alertas_dias
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);

    if (!Number.isInteger(inicial) || inicial <= 0) {
      setError('Trial inicial precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(ext14) || ext14 <= 0) {
      setError('A primeira extensão precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(ext7) || ext7 <= 0) {
      setError('A segunda extensão precisa ser um número inteiro positivo.');
      return;
    }
    if (alertas.length === 0 || alertas.some((d) => !Number.isInteger(d) || d < 0)) {
      setError('Os alertas de Trial precisam ser uma lista de números inteiros não-negativos separados por vírgula.');
      return;
    }
    // Evitar configuração que gere spam: no máximo 6 marcos de alerta.
    if (alertas.length > 6) {
      setError('No máximo 6 marcos de alerta de Trial — mais que isso vira spam de notificação.');
      return;
    }

    if (
      !window.confirm(
        'Esta alteração será aplicada apenas a novas implementações iniciadas após esta mudança. ' +
          'Clientes com Trial já iniciado continuam com as regras vigentes quando o Kickoff deles aconteceu. Confirmar?',
      )
    ) {
      return;
    }

    const atual = {
      trial_inicial_dias: inicial,
      trial_extensao_14_dias: ext14,
      trial_extensao_7_dias: ext7,
      trial_alertas_dias: [...alertas].sort((a, b) => b - a),
    };
    const original = {
      trial_inicial_dias: configImplementacao.trial_inicial_dias,
      trial_extensao_14_dias: configImplementacao.trial_extensao_14_dias,
      trial_extensao_7_dias: configImplementacao.trial_extensao_7_dias,
      trial_alertas_dias: configImplementacao.trial_alertas_dias,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_implementacao', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigImplementacao(data);
    setFormTrial(paraFormTrial(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarPipefy(e: FormEvent) {
    e.preventDefault();
    if (!formPipefy) return;

    for (const [campo, valor] of Object.entries(formPipefy)) {
      if (!urlValida(valor)) {
        setError(`URL inválida em "${campo}".`);
        return;
      }
    }

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { error: updateError } = await supabase
      .from('configuracoes_pipefy')
      .update({
        url_criacao_conta: formPipefy.url_criacao_conta.trim() || null,
        url_extensao_14: formPipefy.url_extensao_14.trim() || null,
        url_extensao_7: formPipefy.url_extensao_7.trim() || null,
        url_contratacao_definitiva: formPipefy.url_contratacao_definitiva.trim() || null,
      })
      .eq('id', true);

    setSalvando(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  function atualizarCiclo(index: number, campo: 'dia_inicio' | 'dia_fim', valor: string) {
    if (!formImplementacao) return;
    const numero = Number(valor);
    const novosCiclos = formImplementacao.ciclos.map((c, i) => (i === index ? { ...c, [campo]: numero } : c));
    setFormImplementacao({ ...formImplementacao, ciclos: novosCiclos });
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p className="field-hint">
            Regras operacionais da implementação, Trial, Pipefy e histórico de alterações — editáveis aqui sem
            precisar mexer em código. Alterar aqui nunca recalcula implementações já em andamento: cada uma
            preserva as regras que valiam no momento do próprio Kickoff.
          </p>
        </div>
      </div>

      {!souAdministrador && (
        <p className="field-hint">
          Você pode visualizar as configurações vigentes, mas só administradores podem alterá-las.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {ABAS.filter((a) => a.valor !== 'historico' || souAdministrador).map((a) => (
          <button
            key={a.valor}
            type="button"
            className={`tab-button${aba === a.valor ? ' active' : ''}`}
            onClick={() => setAba(a.valor)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'implementacao' && formImplementacao && configImplementacao && (
        <form onSubmit={handleSalvarImplementacao} className="card form-card">
          <h2>Implementação</h2>
          <p className="field-hint">
            {configImplementacao.atualizado_por_email
              ? `Última alteração por ${configImplementacao.atualizado_por_email} em ${formatarDataHora(configImplementacao.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>

          <label className="field">
            <span>Duração padrão da implementação (dias)</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.duracao_total_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormImplementacao({ ...formImplementacao, duracao_total_dias: e.target.value })}
            />
          </label>

          <h3>Ciclos</h3>
          {formImplementacao.ciclos.map((ciclo, i) => (
            <div className="form-grid" key={ciclo.numero}>
              <label className="field">
                <span>{ciclo.nome} — Dia inicial</span>
                <input
                  type="number"
                  min={1}
                  value={ciclo.dia_inicio}
                  disabled={!souAdministrador}
                  onChange={(e) => atualizarCiclo(i, 'dia_inicio', e.target.value)}
                />
              </label>
              <label className="field">
                <span>{ciclo.nome} — Dia final</span>
                <input
                  type="number"
                  min={1}
                  value={ciclo.dia_fim}
                  disabled={!souAdministrador}
                  onChange={(e) => atualizarCiclo(i, 'dia_fim', e.target.value)}
                />
              </label>
            </div>
          ))}

          <label className="field">
            <span>Prazo recomendado para o treinamento (até o dia)</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.prazo_treinamento_dia}
              disabled={!souAdministrador}
              onChange={(e) => setFormImplementacao({ ...formImplementacao, prazo_treinamento_dia: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Dia recomendado para envio do formulário de pós-venda</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.dia_recomendado_formulario_pos_venda}
              disabled={!souAdministrador}
              onChange={(e) =>
                setFormImplementacao({ ...formImplementacao, dia_recomendado_formulario_pos_venda: e.target.value })
              }
            />
            <span className="field-hint">
              Hoje é só uma referência exibida aqui — não dispara nenhum alerta automático ainda.
            </span>
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'trial' && formTrial && configImplementacao && (
        <form onSubmit={handleSalvarTrial} className="card form-card">
          <h2>Trial Kommo</h2>
          <p className="field-hint">
            {configImplementacao.atualizado_por_email
              ? `Última alteração por ${configImplementacao.atualizado_por_email} em ${formatarDataHora(configImplementacao.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>

          <label className="field">
            <span>Trial inicial (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_inicial_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_inicial_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Primeira extensão (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_extensao_14_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_extensao_14_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Segunda extensão (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_extensao_7_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_extensao_7_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Alertas (dias antes do vencimento, separados por vírgula)</span>
            <input
              type="text"
              placeholder="5, 3, 1, 0"
              value={formTrial.trial_alertas_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_alertas_dias: e.target.value })}
            />
            <span className="field-hint">Máximo de 6 marcos, pra não virar spam de notificação.</span>
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'pipefy' && formPipefy && (
        <form onSubmit={handleSalvarPipefy} className="card form-card">
          <h2>Links do Pipefy</h2>
          <p className="field-hint">
            Essas URLs aparecem como botão de ação na seção Trial Kommo de toda implementação — sem integração
            com a API do Pipefy nesta versão, só o link direto.
          </p>

          {(
            [
              { campo: 'url_criacao_conta', label: 'URL de solicitação da criação da conta Kommo' },
              { campo: 'url_extensao_14', label: 'URL de solicitação de +14 dias' },
              { campo: 'url_extensao_7', label: 'URL de solicitação de +7 dias' },
              { campo: 'url_contratacao_definitiva', label: 'URL de contratação definitiva' },
            ] as const
          ).map(({ campo, label }) => (
            <label className="field" key={campo}>
              <span>{label}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="url"
                  value={formPipefy[campo]}
                  disabled={!souAdministrador}
                  onChange={(e) => setFormPipefy({ ...formPipefy, [campo]: e.target.value })}
                  placeholder="https://app.pipefy.com/..."
                  style={{ flex: 1 }}
                />
                {formPipefy[campo] && urlValida(formPipefy[campo]) && (
                  <a href={formPipefy[campo]} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    Abrir
                  </a>
                )}
              </div>
              {formPipefy[campo] && !urlValida(formPipefy[campo]) && (
                <span className="form-error">URL inválida.</span>
              )}
            </label>
          ))}

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'pipefy' && !formPipefy && !configPipefy && (
        <div className="empty-state">
          <p>Nenhuma configuração de Pipefy encontrada.</p>
        </div>
      )}

      {aba === 'historico' && souAdministrador && (
        <section className="card">
          <h2>Histórico de alterações</h2>
          {historico.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma alteração registrada ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Novo valor</th>
                    <th>Usuário</th>
                    <th>Data/hora</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Campo">{h.campo}</td>
                      <td data-label="Valor anterior">{JSON.stringify(h.valor_anterior)}</td>
                      <td data-label="Novo valor">{JSON.stringify(h.valor_novo)}</td>
                      <td data-label="Usuário">{h.alterado_por_email ?? '—'}</td>
                      <td data-label="Data/hora">{formatarDataHora(h.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
