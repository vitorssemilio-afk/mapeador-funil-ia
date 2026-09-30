import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { IaOperacao, IaOperacaoStatus, IaOperacaoTipo } from '../types/database';

const TIPO_LABELS: Record<IaOperacaoTipo, string> = {
  gerar_funil: 'Gerar funil',
  regenerar_etapa: 'Regenerar etapa',
  criar_funil_kommo: 'Criar funil no Kommo',
};

const STATUS_LABELS: Record<IaOperacaoStatus, string> = {
  aguardando: 'Aguardando',
  processando: 'Processando',
  concluido: 'Concluído',
  falhou: 'Falhou',
  resposta_invalida: 'Resposta inválida',
  cancelado: 'Cancelado',
  tentando_novamente: 'Tentando novamente',
};

const STATUS_TONE: Record<IaOperacaoStatus, string> = {
  aguardando: 'warning',
  processando: 'warning',
  concluido: 'success',
  falhou: 'danger',
  resposta_invalida: 'danger',
  cancelado: 'warning',
  tentando_novamente: 'warning',
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function formatarDuracao(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Tela de observabilidade só-leitura sobre ia_operacoes (ver migration 0059)
// — só o essencial pra diagnosticar uma falha de IA sem precisar entrar no
// banco: operação, cliente, quando, status, tentativa e o erro resumido.
// Igual o resto do produto, o RLS de ia_operacoes já restringe a linhas
// visíveis (cliente vinculado ou administrador) — aqui só decide o que
// mostrar de forma amigável, sem duplicar a regra de acesso.
export function ObservabilidadeIA() {
  const [operacoes, setOperacoes] = useState<IaOperacao[]>([]);
  const [nomesClientes, setNomesClientes] = useState<Record<string, string>>({});
  const [souAdministrador, setSouAdministrador] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'falhas'>('falhas');

  useEffect(() => {
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));
  }, []);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('ia_operacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filtroStatus === 'falhas') {
        query = query.in('status', ['falhou', 'resposta_invalida']);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as IaOperacao[];
      setOperacoes(rows);

      const clienteIds = [...new Set(rows.map((r) => r.cliente_id).filter((id): id is string => !!id))];
      if (clienteIds.length > 0) {
        const { data: clientes } = await supabase
          .from('clientes')
          .select('id, nome_empresa')
          .in('id', clienteIds);
        setNomesClientes(
          Object.fromEntries((clientes ?? []).map((c) => [c.id, c.nome_empresa as string])),
        );
      } else {
        setNomesClientes({});
      }

      setLoading(false);
    }

    carregar();
  }, [filtroStatus]);

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
          <h1>Observabilidade de IA</h1>
          <p className="field-hint">
            Últimas operações de IA do produto (geração de funil, regeneração de etapa, criação no
            Kommo) — pra diagnosticar rápido uma falha sem precisar entrar no banco.
          </p>
        </div>
      </div>

      <div className="notification-filtros-rapidos">
        <button
          type="button"
          className={`filtro-chip${filtroStatus === 'falhas' ? ' filtro-chip-ativo' : ''}`}
          onClick={() => setFiltroStatus('falhas')}
        >
          Só falhas
        </button>
        <button
          type="button"
          className={`filtro-chip${filtroStatus === 'todas' ? ' filtro-chip-ativo' : ''}`}
          onClick={() => setFiltroStatus('todas')}
        >
          Todas (últimas 100)
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="field-hint">Carregando…</p>
      ) : operacoes.length === 0 ? (
        <p className="field-hint">Nenhuma operação encontrada.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Operação</th>
              <th>Cliente</th>
              <th>Data</th>
              <th>Status</th>
              <th>Tentativa</th>
              <th>Duração</th>
              <th>Erro</th>
            </tr>
          </thead>
          <tbody>
            {operacoes.map((op) => (
              <tr key={op.id}>
                <td>{TIPO_LABELS[op.tipo_operacao]}</td>
                <td>{op.cliente_id ? nomesClientes[op.cliente_id] ?? '—' : '—'}</td>
                <td>{formatarData(op.created_at)}</td>
                <td>
                  <span className={`status-badge status-tone-${STATUS_TONE[op.status]}`}>
                    {STATUS_LABELS[op.status]}
                  </span>
                </td>
                <td>{op.tentativa}</td>
                <td>{formatarDuracao(op.duracao_ms)}</td>
                <td>{op.erro_mensagem_amigavel ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
