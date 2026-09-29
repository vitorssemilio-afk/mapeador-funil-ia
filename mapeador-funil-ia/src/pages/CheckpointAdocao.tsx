import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type {
  AtividadesForaKommoCheckpoint,
  AutonomiaEquipeCheckpoint,
  CheckpointPublico,
  FrequenciaUsoCheckpoint,
  IntencaoManutencaoCheckpoint,
  PercentualProcessoKommo,
  UsoDiarioCheckpoint,
  UsoRelatoriosDecisaoCheckpoint,
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

const OPCOES_PERCENTUAL: { value: PercentualProcessoKommo; label: string }[] = [
  { value: 'praticamente_tudo', label: 'Praticamente tudo' },
  { value: 'maior_parte', label: 'A maior parte' },
  { value: 'cerca_metade', label: 'Cerca da metade' },
  { value: 'pouco', label: 'Pouco' },
  { value: 'quase_nada', label: 'Quase nada' },
];

const OPCOES_AUTONOMIA: { value: AutonomiaEquipeCheckpoint; label: string }[] = [
  { value: 'sim_totalmente', label: 'Sim, totalmente' },
  { value: 'maior_parte_vezes', label: 'Na maior parte das vezes' },
  { value: 'precisamos_ajuda_frequente', label: 'Ainda precisamos de ajuda com frequência' },
  { value: 'nao_conseguimos_sem_ajuda', label: 'Não conseguimos operar sem ajuda' },
];

const OPCOES_USO_RELATORIOS: { value: UsoRelatoriosDecisaoCheckpoint; label: string }[] = [
  { value: 'sim_mais_uma_vez', label: 'Sim, mais de uma vez' },
  { value: 'sim_uma_vez', label: 'Sim, uma vez' },
  { value: 'ainda_nao', label: 'Ainda não' },
  { value: 'nao_sei_utilizar', label: 'Não sei utilizar os relatórios' },
];

const OPCOES_ATIVIDADES_FORA: { value: AtividadesForaKommoCheckpoint; label: string }[] = [
  { value: 'nao_tudo_no_kommo', label: 'Não, praticamente tudo está no Kommo' },
  { value: 'sim_algumas', label: 'Sim, algumas atividades' },
  { value: 'sim_varias', label: 'Sim, várias atividades' },
  { value: 'voltou_processo_antigo', label: 'A equipe praticamente voltou ao processo antigo' },
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
  const [percentualProcesso, setPercentualProcesso] = useState<PercentualProcessoKommo | ''>('');
  const [autonomiaEquipe, setAutonomiaEquipe] = useState<AutonomiaEquipeCheckpoint | ''>('');
  const [usoRelatoriosDecisao, setUsoRelatoriosDecisao] = useState<UsoRelatoriosDecisaoCheckpoint | ''>('');
  const [atividadesForaKommo, setAtividadesForaKommo] = useState<AtividadesForaKommoCheckpoint | ''>('');
  const [quaisAtividadesFora, setQuaisAtividadesFora] = useState('');
  const [principalDificuldade, setPrincipalDificuldade] = useState('');

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

  const formCompleto =
    !!usoDiario &&
    !!frequenciaUso &&
    !!intencaoManutencao &&
    !!percentualProcesso &&
    !!autonomiaEquipe &&
    !!usoRelatoriosDecisao &&
    !!atividadesForaKommo;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!codigo || !formCompleto) return;

    setEnviando(true);
    setError(null);

    const { error: saveError } = await supabase.rpc('public_save_checkpoint', {
      p_codigo: codigo,
      p_uso_diario: usoDiario,
      p_frequencia_uso: frequenciaUso,
      p_obstaculo: obstaculo || null,
      p_intencao_manutencao: intencaoManutencao,
      p_percentual_processo_kommo: percentualProcesso,
      p_autonomia_equipe: autonomiaEquipe,
      p_uso_relatorios_decisao: usoRelatoriosDecisao,
      p_atividades_fora_kommo: atividadesForaKommo,
      p_quais_atividades_fora_kommo: atividadesForaKommo !== 'nao_tudo_no_kommo' ? quaisAtividadesFora || null : null,
      p_principal_dificuldade: principalDificuldade || null,
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

                <fieldset className="field">
                  <legend>Hoje, aproximadamente quanto do processo comercial acontece dentro do Kommo?</legend>
                  <div className="options-list">
                    {OPCOES_PERCENTUAL.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="percentual_processo"
                          value={opcao.value}
                          checked={percentualProcesso === opcao.value}
                          onChange={() => setPercentualProcesso(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="field">
                  <legend>
                    Hoje sua equipe consegue realizar as atividades do dia a dia no Kommo sem
                    precisar pedir ajuda ao consultor?
                  </legend>
                  <div className="options-list">
                    {OPCOES_AUTONOMIA.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="autonomia_equipe"
                          value={opcao.value}
                          checked={autonomiaEquipe === opcao.value}
                          onChange={() => setAutonomiaEquipe(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="field">
                  <legend>
                    Nos últimos 30 dias, você utilizou algum relatório do Kommo para tomar uma
                    decisão sobre vendas, equipe ou leads?
                  </legend>
                  <div className="options-list">
                    {OPCOES_USO_RELATORIOS.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="uso_relatorios_decisao"
                          value={opcao.value}
                          checked={usoRelatoriosDecisao === opcao.value}
                          onChange={() => setUsoRelatoriosDecisao(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="field">
                  <legend>Existem atividades que sua equipe voltou a fazer fora do Kommo?</legend>
                  <div className="options-list">
                    {OPCOES_ATIVIDADES_FORA.map((opcao) => (
                      <label key={opcao.value} className="option-radio">
                        <input
                          type="radio"
                          name="atividades_fora_kommo"
                          value={opcao.value}
                          checked={atividadesForaKommo === opcao.value}
                          onChange={() => setAtividadesForaKommo(opcao.value)}
                          required
                        />
                        <span>{opcao.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {atividadesForaKommo && atividadesForaKommo !== 'nao_tudo_no_kommo' && (
                  <label className="field">
                    <span>Quais atividades ainda estão sendo feitas fora do Kommo?</span>
                    <textarea
                      rows={2}
                      value={quaisAtividadesFora}
                      onChange={(e) => setQuaisAtividadesFora(e.target.value)}
                    />
                  </label>
                )}

                <label className="field">
                  <span>Qual é hoje a principal dificuldade da equipe com o CRM? (opcional)</span>
                  <textarea
                    rows={3}
                    value={principalDificuldade}
                    onChange={(e) => setPrincipalDificuldade(e.target.value)}
                  />
                </label>

                <div className="wizard-actions">
                  <button type="submit" className="btn btn-primary" disabled={enviando || !formCompleto}>
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
