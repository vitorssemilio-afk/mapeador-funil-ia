// Painel de detalhes de uma atividade do checklist (redesign da tela) —
// tudo que saiu da linha principal mora aqui: prazo, responsável,
// dependência, dia/ciclo, agendamento, bloqueio pelo cliente, evidência e o
// histórico de alterações de data (auditoria já gravada pela RPC
// concluir_atividade_com_data, migration 0085 — só passa a ter um lugar pra
// aparecer). Nenhuma regra nova: as ações daqui chamam os mesmos handlers
// que a tabela antiga usava.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { AtividadeResolvida } from '../../lib/atividadesCronograma';
import type { AtividadeStatusRow } from '../../types/database';

type EventoAuditoria = {
  id: string;
  criado_em: string;
  user_email: string | null;
  acao: string;
  detalhes: { data_anterior?: string | null; data_nova?: string | null };
};

type AtividadeDetalhesDrawerProps = {
  atividade: AtividadeResolvida;
  statusRow: AtividadeStatusRow | null;
  requerEvidencia: boolean;
  descricaoTemplate: string | null;
  evidenciaValor: string;
  evidenciaFaltando: boolean;
  onFechar: () => void;
  onAlternarConcluido: (concluido: boolean) => void;
  onEditarData: () => void;
  onAgendar: (data: string) => void;
  onBloquearPeloCliente: (bloqueado: boolean) => void;
  onEvidenciaChange: (texto: string) => void;
  onEvidenciaBlur: () => void;
};

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function AtividadeDetalhesDrawer({
  atividade,
  statusRow,
  requerEvidencia,
  descricaoTemplate,
  evidenciaValor,
  evidenciaFaltando,
  onFechar,
  onAlternarConcluido,
  onEditarData,
  onAgendar,
  onBloquearPeloCliente,
  onEvidenciaChange,
  onEvidenciaBlur,
}: AtividadeDetalhesDrawerProps) {
  const [historico, setHistorico] = useState<EventoAuditoria[] | null>(null);

  useEffect(() => {
    if (!statusRow) {
      setHistorico([]);
      return;
    }
    let cancelado = false;
    supabase
      .from('auditoria_eventos')
      .select('id, criado_em, user_email, acao, detalhes')
      .eq('entidade', 'atividades_status')
      .eq('entidade_id', statusRow.id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setHistorico((data as EventoAuditoria[] | null) ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [statusRow]);

  const concluida = atividade.status === 'concluido';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${atividade.nome}`} onClick={onFechar}>
      <div className="card drawer-painel" onClick={(e) => e.stopPropagation()}>
        <div className="page-header">
          <h2 style={{ marginBottom: 0 }}>{atividade.nome}</h2>
          <button type="button" className="btn btn-ghost" onClick={onFechar} aria-label="Fechar">
            Fechar
          </button>
        </div>

        {descricaoTemplate && <p className="field-hint">{descricaoTemplate}</p>}

        <dl className="drawer-detalhes-lista">
          <div>
            <dt>Status</dt>
            <dd>
              {concluida
                ? atividade.dataReal
                  ? `Concluído · ${atividade.dataReal.toLocaleDateString('pt-BR')}`
                  : 'Concluído · Data não informada'
                : atividade.status === 'bloqueado_cliente'
                  ? 'Aguardando cliente'
                  : atividade.status === 'aguardando_etapa_anterior'
                    ? 'Aguardando etapa anterior'
                    : atividade.status === 'atrasado'
                      ? `Atrasada ${atividade.atrasoDias}d`
                      : 'Em andamento'}
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{atividade.responsavel ?? 'Não definido'}</dd>
          </div>
          <div>
            <dt>Dependência</dt>
            <dd>{atividade.dependenciaLabel ?? 'Nenhuma'}</dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{atividade.prazoDias != null ? `${atividade.prazoDias} dia(s) após a dependência liberar` : 'Sem prazo definido'}</dd>
          </div>
          <div>
            <dt>Data planejada</dt>
            <dd>{atividade.dataPlanejada?.toLocaleDateString('pt-BR') ?? 'Não calculada'}</dd>
          </div>
          <div>
            <dt>Dia do projeto</dt>
            <dd>{atividade.diaDesdeKickoff != null ? `Dia ${atividade.diaDesdeKickoff}` : 'Kickoff ainda não realizado'}</dd>
          </div>
        </dl>

        <div className="drawer-acoes">
          {concluida ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onEditarData}>
                Editar data de conclusão
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onAlternarConcluido(false)}>
                Desmarcar
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onAlternarConcluido(true)}>
              Concluir atividade
            </button>
          )}
        </div>

        <label className="field">
          <span>Agendar para (opcional)</span>
          <input type="date" value={statusRow?.agendado_para ?? ''} onChange={(e) => onAgendar(e.target.value)} />
        </label>

        <label className="option-checkbox">
          <input
            type="checkbox"
            checked={atividade.bloqueadoPeloCliente}
            onChange={(e) => onBloquearPeloCliente(e.target.checked)}
          />
          <span>Aguardando o cliente (bloqueia a conclusão até resolver)</span>
        </label>

        <label className="field">
          <span>{requerEvidencia ? 'Evidência (obrigatória pra concluir)' : 'Observação'}</span>
          <input
            type="text"
            className="option-livre-input"
            value={evidenciaValor}
            placeholder={requerEvidencia ? 'Link, print ou nota' : 'Observação livre sobre esta atividade'}
            onChange={(e) => onEvidenciaChange(e.target.value)}
            onBlur={onEvidenciaBlur}
          />
          {evidenciaFaltando && <p className="form-error">Escreva a evidência antes de marcar como concluída.</p>}
        </label>

        {historico && historico.length > 0 && (
          <div>
            <h3>Histórico de datas</h3>
            <ul className="drawer-historico-lista">
              {historico.map((evento) => (
                <li key={evento.id}>
                  <span className="field-hint">
                    {formatarDataHora(evento.criado_em)} · {evento.user_email ?? 'desconhecido'}
                  </span>
                  <br />
                  {evento.acao === 'atividade_desmarcada'
                    ? `Desmarcou a conclusão (estava ${evento.detalhes.data_anterior ? new Date(evento.detalhes.data_anterior).toLocaleDateString('pt-BR') : 'sem data'})`
                    : `Alterou a data de conclusão de ${evento.detalhes.data_anterior ? new Date(evento.detalhes.data_anterior).toLocaleDateString('pt-BR') : 'não informada'} para ${evento.detalhes.data_nova ? new Date(evento.detalhes.data_nova).toLocaleDateString('pt-BR') : 'não informada'}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
