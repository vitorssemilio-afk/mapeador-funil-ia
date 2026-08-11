import { useEffect, useMemo, useState } from 'react';
import type { BlocoFormulario, OpcaoPergunta, Pergunta } from '../data/formSchema';
import { carregarFormSchema } from '../lib/formSchemaService';
import { supabase } from '../lib/supabaseClient';
import type { MapeamentoRespostaFlat } from '../types/database';

type ItemFrequencia = { valor: string; label: string; contagem: number };

type ResumoEscolha = {
  tipo: 'escolha';
  pergunta: Pergunta;
  itens: ItemFrequencia[];
  totalRespondentes: number;
};

type ResumoNumero = {
  tipo: 'numero';
  pergunta: Pergunta;
  totalRespondentes: number;
  media: number;
  minimo: number;
  maximo: number;
};

type ResumoPergunta = ResumoEscolha | ResumoNumero;

function labelDaOpcao(opcoes: OpcaoPergunta[] | undefined, valor: string): string {
  return opcoes?.find((o) => o.value === valor)?.label ?? valor;
}

function resumirEscolha(pergunta: Pergunta, linhas: MapeamentoRespostaFlat[]): ResumoEscolha {
  const contagens = new Map<string, number>();

  for (const linha of linhas) {
    const bruta = linha.resposta_bruta;
    const valores = Array.isArray(bruta) ? (bruta as string[]) : [String(bruta)];
    for (const valor of valores) {
      if (!valor) continue;
      contagens.set(valor, (contagens.get(valor) ?? 0) + 1);
    }
  }

  const itens: ItemFrequencia[] = [...contagens.entries()]
    .map(([valor, contagem]) => ({ valor, label: labelDaOpcao(pergunta.opcoes, valor), contagem }))
    .sort((a, b) => b.contagem - a.contagem);

  return { tipo: 'escolha', pergunta, itens, totalRespondentes: linhas.length };
}

function resumirNumero(pergunta: Pergunta, linhas: MapeamentoRespostaFlat[]): ResumoNumero | null {
  const valores = linhas
    .map((linha) => Number(linha.resposta_bruta))
    .filter((n) => Number.isFinite(n));

  if (valores.length === 0) return null;

  const soma = valores.reduce((s, v) => s + v, 0);

  return {
    tipo: 'numero',
    pergunta,
    totalRespondentes: valores.length,
    media: soma / valores.length,
    minimo: Math.min(...valores),
    maximo: Math.max(...valores),
  };
}

function formatarNumero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

export function RelatorioRespostas() {
  const [blocos, setBlocos] = useState<BlocoFormulario[]>([]);
  const [linhas, setLinhas] = useState<MapeamentoRespostaFlat[]>([]);
  const [totalEnviados, setTotalEnviados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setError(null);

      try {
        const [schema, { data: linhasData, error: linhasError }, { count }] = await Promise.all([
          carregarFormSchema(),
          supabase.from('mapeamentos_respostas_flat').select('*').eq('enviado_pelo_cliente', true),
          supabase
            .from('mapeamentos')
            .select('id', { count: 'exact', head: true })
            .eq('enviado_pelo_cliente', true),
        ]);

        if (cancelled) return;
        if (linhasError) throw linhasError;

        setBlocos(schema);
        setLinhas(linhasData ?? []);
        setTotalEnviados(count ?? 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar o relatório.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    carregar();
    return () => {
      cancelled = true;
    };
  }, []);

  const resumosPorBloco = useMemo(() => {
    const linhasPorPergunta = new Map<string, MapeamentoRespostaFlat[]>();
    for (const linha of linhas) {
      const lista = linhasPorPergunta.get(linha.pergunta_id) ?? [];
      lista.push(linha);
      linhasPorPergunta.set(linha.pergunta_id, lista);
    }

    return blocos
      .map((bloco) => {
        const resumos: ResumoPergunta[] = [];
        for (const pergunta of bloco.perguntas) {
          const linhasDaPergunta = linhasPorPergunta.get(pergunta.id) ?? [];
          if (linhasDaPergunta.length === 0) continue;

          if (pergunta.tipo === 'escolha_unica' || pergunta.tipo === 'escolha_multipla') {
            resumos.push(resumirEscolha(pergunta, linhasDaPergunta));
          } else if (pergunta.tipo === 'numero') {
            const resumo = resumirNumero(pergunta, linhasDaPergunta);
            if (resumo) resumos.push(resumo);
          }
        }
        return { titulo: bloco.titulo, resumos };
      })
      .filter((bloco) => bloco.resumos.length > 0);
  }, [blocos, linhas]);

  const totalPerguntasAnalisadas = resumosPorBloco.reduce((soma, bloco) => soma + bloco.resumos.length, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Relatório de Respostas</h1>
          <p className="field-hint">
            Padrões de resposta entre os {totalEnviados} cliente{totalEnviados === 1 ? '' : 's'} que já
            enviaram o formulário. Só perguntas de múltipla escolha e número entram aqui — texto livre
            precisa de leitura manual.
          </p>
        </div>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && totalEnviados === 0 && (
        <div className="empty-state">
          <p>Ainda não há formulários enviados pelos clientes pra gerar esse relatório.</p>
        </div>
      )}

      {!loading && !error && totalEnviados > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{totalEnviados}</span>
            <span className="stat-label">Clientes considerados</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{totalPerguntasAnalisadas}</span>
            <span className="stat-label">Perguntas analisadas</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{resumosPorBloco.length}</span>
            <span className="stat-label">Blocos do formulário</span>
          </div>
        </div>
      )}

      {!loading &&
        !error &&
        resumosPorBloco.map((bloco) => (
          <section key={bloco.titulo} className="freq-bloco">
            <h2>{bloco.titulo}</h2>
            <div className="freq-grid">
              {bloco.resumos.map((resumo) => (
                <div key={resumo.pergunta.id} className="card freq-card">
                  <div className="freq-card-header">
                    <p className="freq-card-title">{resumo.pergunta.label}</p>
                    <p className="freq-card-subtitle">
                      {resumo.totalRespondentes} de {totalEnviados} responderam
                    </p>
                  </div>

                  {resumo.tipo === 'escolha' ? (
                    <div className="freq-bar-list">
                      {resumo.itens.map((item, indice) => {
                        const maiorContagem = resumo.itens[0]?.contagem ?? 1;
                        const percentual = Math.round((item.contagem / resumo.totalRespondentes) * 100);
                        return (
                          <div key={item.valor} className="freq-bar-row">
                            <span className="freq-bar-label" title={item.label}>
                              {item.label}
                            </span>
                            <span className="freq-bar-track">
                              <span
                                className={`freq-bar-fill${indice === 0 ? ' freq-bar-fill-top' : ''}`}
                                style={{ width: `${(item.contagem / maiorContagem) * 100}%` }}
                              />
                            </span>
                            <span className="freq-bar-count">
                              {item.contagem} ({percentual}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="stats-grid">
                      <div className="stat-card">
                        <span className="stat-value">{formatarNumero(resumo.media)}</span>
                        <span className="stat-label">Média</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{formatarNumero(resumo.minimo)}</span>
                        <span className="stat-label">Mínimo</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{formatarNumero(resumo.maximo)}</span>
                        <span className="stat-label">Máximo</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
