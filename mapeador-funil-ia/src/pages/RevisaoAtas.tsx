import { useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { fonteAtaLabel, STATUS_ATA_LABELS, STATUS_ATA_TONE } from '../lib/atasIntegracao';
import { TIPO_REUNIAO_LABELS } from '../lib/reunioes';
import { supabase } from '../lib/supabaseClient';
import type { AtaReuniao, Cliente, ImplementacaoCrm, Reuniao, TipoReuniao } from '../types/database';

type Selecao = {
  clienteId: string;
  implementacaoId: string;
  reuniaoId: string;
};

function selecaoInicial(ata: AtaReuniao): Selecao {
  return {
    clienteId: ata.cliente_id ?? '',
    implementacaoId: ata.implementacao_id ?? '',
    reuniaoId: ata.reuniao_id ?? '',
  };
}

function tituloAta(ata: AtaReuniao): string {
  if (ata.titulo) return ata.titulo;
  const tipoLabel = ata.tipo_reuniao ? TIPO_REUNIAO_LABELS[ata.tipo_reuniao as TipoReuniao] : null;
  return tipoLabel ?? 'Reunião';
}

// Fila de revisão manual das atas que o App de Atas enviou mas o Mapeador
// não conseguiu vincular automaticamente a uma reunião (status
// requer_revisao/erro_vinculo — ver webhook-atas e migration 0080, seções
// 10/11/30). A RPC vincular_ata_manualmente já existia desde aquela
// migration; só faltava uma tela que a chamasse. RLS de atas_reuniao já
// decide o que cada um pode ver (administrador vê tudo, os demais só o que
// já tiverem acesso ao cliente/implementação atribuídos), então a tela não
// reaplica essa regra — só lista o que a consulta já devolveu.
export function RevisaoAtas() {
  const { mostrarToast } = useToast();
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [implementacoes, setImplementacoes] = useState<ImplementacaoCrm[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecoes, setSelecoes] = useState<Record<string, Selecao>>({});
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [
      { data: atasData, error: atasError },
      { data: clientesData },
      { data: implementacoesData },
      { data: reunioesData },
    ] = await Promise.all([
      supabase
        .from('atas_reuniao')
        .select('*')
        .in('status', ['requer_revisao', 'erro_vinculo'])
        .order('recebido_em', { ascending: false }),
      supabase.from('clientes').select('*').order('nome_empresa', { ascending: true }),
      supabase.from('implementacoes_crm').select('*'),
      supabase.from('reunioes').select('*'),
    ]);

    if (atasError) {
      setError(atasError.message);
      setLoading(false);
      return;
    }

    const atasRows = (atasData ?? []) as AtaReuniao[];
    setAtas(atasRows);
    setClientes((clientesData ?? []) as Cliente[]);
    setImplementacoes((implementacoesData ?? []) as ImplementacaoCrm[]);
    setReunioes((reunioesData ?? []) as Reuniao[]);
    setSelecoes((anterior) => {
      const novo = { ...anterior };
      for (const ata of atasRows) {
        if (!novo[ata.id]) novo[ata.id] = selecaoInicial(ata);
      }
      return novo;
    });
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function atualizarSelecao(ataId: string, campo: keyof Selecao, valor: string) {
    setSelecoes((anterior) => {
      const atual = anterior[ataId] ?? { clienteId: '', implementacaoId: '', reuniaoId: '' };
      const proxima = { ...atual, [campo]: valor };
      // Trocar cliente/implementação invalida a reunião escolhida antes —
      // a RPC também valida essa coerência, mas isso já evita escolher uma
      // combinação errada na própria tela.
      if (campo === 'clienteId') {
        proxima.implementacaoId = '';
        proxima.reuniaoId = '';
      } else if (campo === 'implementacaoId') {
        proxima.reuniaoId = '';
      }
      return { ...anterior, [ataId]: proxima };
    });
  }

  async function handleVincular(ata: AtaReuniao) {
    const selecao = selecoes[ata.id] ?? selecaoInicial(ata);
    if (!selecao.clienteId && !selecao.implementacaoId && !selecao.reuniaoId) {
      mostrarToast('Escolha ao menos um cliente, implementação ou reunião.', 'error');
      return;
    }

    setVinculandoId(ata.id);
    const { error: vincularError } = await supabase.rpc('vincular_ata_manualmente', {
      p_ata_id: ata.id,
      p_cliente_id: selecao.clienteId || null,
      p_implementacao_id: selecao.implementacaoId || null,
      p_reuniao_id: selecao.reuniaoId || null,
    });
    setVinculandoId(null);

    if (vincularError) {
      mostrarToast(`Não foi possível vincular: ${vincularError.message}`, 'error');
      return;
    }

    mostrarToast('Ata vinculada.');
    carregar();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Atas pendentes de revisão</h1>
          <p className="field-hint">
            Atas recebidas do App de Atas que não encontraram automaticamente a reunião certa no
            Mapeador — escolha o cliente/implementação/reunião corretos e vincule manualmente.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="field-hint">Carregando…</p>
      ) : atas.length === 0 ? (
        <p className="field-hint">Nenhuma ata pendente de revisão. 🎉</p>
      ) : (
        <div className="observacoes-lista">
          {atas.map((ata) => {
            const selecao = selecoes[ata.id] ?? selecaoInicial(ata);
            const implementacoesDoCliente = selecao.clienteId
              ? implementacoes.filter((i) => i.cliente_id === selecao.clienteId)
              : [];
            const reunioesDaImplementacao = selecao.implementacaoId
              ? reunioes.filter((r) => r.implementacao_id === selecao.implementacaoId)
              : selecao.clienteId
                ? reunioes.filter((r) => r.cliente_id === selecao.clienteId)
                : [];

            return (
              <div key={ata.id} className="card form-card">
                <div className="observacao-item-header">
                  <strong>{tituloAta(ata)}</strong>
                  <span className={`status-badge status-tone-${STATUS_ATA_TONE[ata.status]}`}>
                    {STATUS_ATA_LABELS[ata.status]}
                  </span>
                </div>
                <p className="field-hint">
                  {fonteAtaLabel(ata.integration_source)} ·{' '}
                  {new Date(ata.recebido_em).toLocaleString('pt-BR')}
                  {ata.data_reuniao && ` · reunião em ${new Date(ata.data_reuniao).toLocaleString('pt-BR')}`}
                </p>
                {ata.erro_mensagem && <p className="form-error">{ata.erro_mensagem}</p>}
                {ata.resumo && <p>{ata.resumo}</p>}

                <div className="form-grid">
                  <label className="field">
                    <span>Cliente</span>
                    <select
                      value={selecao.clienteId}
                      onChange={(e) => atualizarSelecao(ata.id, 'clienteId', e.target.value)}
                    >
                      <option value="">— selecione —</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome_empresa}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Implementação</span>
                    <select
                      value={selecao.implementacaoId}
                      disabled={!selecao.clienteId}
                      onChange={(e) => atualizarSelecao(ata.id, 'implementacaoId', e.target.value)}
                    >
                      <option value="">— nenhuma —</option>
                      {implementacoesDoCliente.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome_cliente}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Reunião</span>
                    <select
                      value={selecao.reuniaoId}
                      disabled={!selecao.clienteId}
                      onChange={(e) => atualizarSelecao(ata.id, 'reuniaoId', e.target.value)}
                    >
                      <option value="">— nenhuma —</option>
                      {reunioesDaImplementacao.map((r) => (
                        <option key={r.id} value={r.id}>
                          {TIPO_REUNIAO_LABELS[r.tipo]}
                          {r.data_hora ? ` · ${new Date(r.data_hora).toLocaleDateString('pt-BR')}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-auto"
                  disabled={vinculandoId === ata.id}
                  onClick={() => handleVincular(ata)}
                >
                  {vinculandoId === ata.id ? 'Vinculando…' : 'Vincular'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
