import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type {
  CheckpointPublico,
  FrequenciaUsoCheckpoint,
  IntencaoManutencaoCheckpoint,
  UsoDiarioCheckpoint,
} from '../types/database';

const OPCOES_USO_DIARIO: { value: UsoDiarioCheckpoint; label: string }[] = [
  { value: 'so_kommo', label: 'Só Kommo' },
  { value: 'kommo_mais_planilha', label: 'Kommo + planilha ainda' },
  { value: 'voltou_planilha', label: 'Voltamos pra planilha' },
];

const OPCOES_FREQUENCIA: { value: FrequenciaUsoCheckpoint; label: string }[] = [
  { value: 'diariamente', label: 'Diariamente' },
  { value: 'semanalmente', label: 'Semanalmente' },
  { value: 'raramente', label: 'Raramente' },
  { value: 'nao_uso', label: 'Não uso' },
];

const OPCOES_INTENCAO: { value: IntencaoManutencaoCheckpoint; label: string }[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'talvez', label: 'Talvez' },
  { value: 'nao', label: 'Não' },
];

export function CheckpointAdocao() {
  const { codigo } = useParams<{ codigo: string }>();
  const [checkpoint, setCheckpoint] = useState<CheckpointPublico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [usoDiario, setUsoDiario] = useState<UsoDiarioCheckpoint | ''>('');
  const [frequenciaUso, setFrequenciaUso] = useState<FrequenciaUsoCheckpoint | ''>('');
  const [obstaculo, setObstaculo] = useState('');
  const [intencaoManutencao, setIntencaoManutencao] = useState<IntencaoManutencaoCheckpoint | ''>('');

  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = 'Checkpoint de Adoção — 30 dias';
    return () => {
      document.title = tituloAnterior;
    };
  }, []);

  useEffect(() => {
    if (!codigo) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc('public_get_checkpoint_by_codigo', {
        p_codigo: codigo as string,
      });

      if (cancelled) return;

      if (fetchError || !data || data.length === 0) {
        setError('Não conseguimos encontrar este checkpoint. Verifique se o link está correto.');
        setLoading(false);
        return;
      }

      const registro = data[0];
      setCheckpoint(registro);
      setEnviado(registro.ja_respondido);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [codigo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!codigo || !usoDiario || !frequenciaUso || !intencaoManutencao) return;

    setEnviando(true);
    setError(null);

    const { error: saveError } = await supabase.rpc('public_save_checkpoint', {
      p_codigo: codigo,
      p_uso_diario: usoDiario,
      p_frequencia_uso: frequenciaUso,
      p_obstaculo: obstaculo || null,
      p_intencao_manutencao: intencaoManutencao,
    });

    setEnviando(false);

    if (saveError) {
      setError('Não foi possível enviar suas respostas. Tente novamente.');
      return;
    }

    setEnviado(true);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            V4
          </span>
          Checkpoint de Adoção — 30 dias
        </span>
      </header>
      <main className="app-main">
        <div className="page">
          {loading && <div className="page-loading">Carregando…</div>}
          {!loading && error && <p className="form-error">{error}</p>}

          {!loading && !error && checkpoint && enviado && (
            <section className="card">
              <h2>Obrigado!</h2>
              <p className="field-hint">
                Recebemos suas respostas. Elas nos ajudam a entender como o Kommo está sendo usado
                no dia a dia da equipe.
              </p>
            </section>
          )}

          {!loading && !error && checkpoint && !enviado && (
            <>
              <div className="page-header">
                <div>
                  <h1>{checkpoint.nome_cliente}</h1>
                  <p className="field-hint">
                    Já se passaram 30 dias desde a entrega do CRM. Nos conte rapidamente como está
                    o uso da ferramenta.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="card form-card">
                <fieldset className="field">
                  <legend>
                    Sua equipe está registrando os leads diretamente no Kommo, ou ainda usa
                    planilha/WhatsApp em paralelo?
                  </legend>
                  <div className="options-list">
                    {OPCOES_USO_DIARIO.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="uso_diario"
                          value={opcao.value}
                          checked={usoDiario === opcao.value}
                          onChange={() => setUsoDiario(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="field">
                  <legend>Com que frequência o gestor acessa os relatórios do Kommo?</legend>
                  <div className="options-list">
                    {OPCOES_FREQUENCIA.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="frequencia_uso"
                          value={opcao.value}
                          checked={frequenciaUso === opcao.value}
                          onChange={() => setFrequenciaUso(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="field">
                  <span>O que está dificultando o uso completo da ferramenta hoje? (opcional)</span>
                  <textarea
                    rows={3}
                    value={obstaculo}
                    onChange={(e) => setObstaculo(e.target.value)}
                  />
                </label>

                <fieldset className="field">
                  <legend>Contrataria manutenção/suporte contínuo do CRM?</legend>
                  <div className="options-list">
                    {OPCOES_INTENCAO.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="intencao_manutencao"
                          value={opcao.value}
                          checked={intencaoManutencao === opcao.value}
                          onChange={() => setIntencaoManutencao(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="wizard-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={enviando || !usoDiario || !frequenciaUso || !intencaoManutencao}
                  >
                    {enviando ? 'Enviando…' : 'Enviar respostas'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
